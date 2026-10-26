"""Carreras reales de AUD-16 en PostgreSQL: hilos, conexiones propias y locks verdaderos.

El árbitro es el ``SELECT … FOR UPDATE`` del ``Pedido`` (D-AUD16-06/07). La primera
transacción se detiene dentro del lock después de escribir; la prueba espera a ver en
``pg_stat_activity`` que la segunda espera ese lock y solo entonces deja continuar a la
primera. Nada se simula salvo el punto de pausa y el reloj del vencimiento.
"""

from apps.inventario import services as inventario
from apps.mensajes import selectors, services
from apps.mensajes.models import MensajePedido
from apps.pagos.models import PLAZO
from apps.pagos.tests.base import confirmar_pedido, reloj
from apps.pedidos import vencimiento
from apps.pedidos.models import EstadoOperativoPedido, EstadoPedido
from apps.propuestas.tests.test_concurrencia import ESPERA, CarreraTestCase, _Hilo


class CarrerasDeMensajesTests(CarreraTestCase):
    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )

    def enviar(self, actor, texto):
        return _Hilo(services.enviar_mensaje, actor=actor, pedido_id=self.pedido.pk, texto=texto)

    def leer(self, despues_de=0):
        return selectors.conversacion(
            actor=self.comprador, pedido_id=self.pedido.pk, despues_de=despues_de
        )

    def vencer(self):
        return _Hilo(vencimiento.vencer_pedido, pedido_id=self.pedido.pk)

    # --- A. Dos mensajes simultáneos del mismo pedido ---

    def test_dos_mensajes_se_serializan_y_el_cursor_recupera_ambos(self):
        self.pausar_en(services, "_crear_mensaje")
        primera, segunda = self.carrera(
            self.enviar(self.comprador, "A"), self.enviar(self.artesano, "B")
        )
        self.assertIsNone(primera.error, primera.error)
        self.assertIsNone(segunda.error, segunda.error)
        a, b = primera.resultado, segunda.resultado
        self.assertNotEqual(a.pk, b.pk)
        # B obtuvo su id después del commit de A: orden de id = orden de commit.
        self.assertLess(a.pk, b.pk)
        conversacion = self.leer()
        self.assertEqual([m.texto for m in conversacion.mensajes], ["A", "B"])
        # Un cliente que ya vio A recupera B con su cursor: sin omisión.
        delta = self.leer(despues_de=a.pk)
        self.assertEqual([m.pk for m in delta.mensajes], [b.pk])
        self.assertEqual(delta.cursor, b.pk)

    # --- B. Polling durante un mensaje aún sin commit ---

    def test_polling_no_ve_ni_avanza_por_un_mensaje_sin_commit(self):
        self.pausar_en(services, "_crear_mensaje")
        hilo = self.enviar(self.artesano, "Pendiente de commit")
        hilo.start()
        self.assertTrue(self.dentro.wait(ESPERA), "El envío no llegó al punto de pausa.")
        try:
            # La fila existe dentro de la transacción del hilo, pero no está confirmada.
            durante = self.leer()
            self.assertEqual(durante.mensajes, [])
            self.assertEqual(durante.cursor, 0)
        finally:
            self.continuar.set()
            hilo.join(ESPERA)
        self.assertFalse(hilo.is_alive())
        self.assertIsNone(hilo.error, hilo.error)
        despues = self.leer(despues_de=durante.cursor)
        self.assertEqual([m.pk for m in despues.mensajes], [hilo.resultado.pk])
        self.assertEqual(despues.cursor, hilo.resultado.pk)

    # --- C. Mensaje contra cierre del pedido (vencimiento real) ---

    def test_mensaje_gana_y_queda_antes_del_cierre(self):
        self.pausar_en(services, "_crear_mensaje")
        with reloj(self.pedido.confirmado_en + PLAZO):
            primera, segunda = self.carrera(self.enviar(self.comprador, "Último"), self.vencer())
        self.assertIsNone(primera.error, primera.error)
        self.assertIsNone(segunda.error, segunda.error)
        self.assertTrue(segunda.resultado)
        self.assertEqual(
            EstadoOperativoPedido.objects.get(pedido=self.pedido).estado,
            EstadoPedido.VENCIDO_FALTA_PAGO,
        )
        conversacion = self.leer()
        self.assertEqual([m.texto for m in conversacion.mensajes], ["Último"])
        self.assertTrue(conversacion.solo_lectura)
        # Después del cierre ya no entra nada.
        with self.assertRaises(services.ConversacionCerrada):
            services.enviar_mensaje(actor=self.artesano, pedido_id=self.pedido.pk, texto="Tarde")

    def test_cierre_gana_y_el_envio_se_rechaza(self):
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        with reloj(self.pedido.confirmado_en + PLAZO):
            primera, segunda = self.carrera(self.vencer(), self.enviar(self.comprador, "Tarde"))
        self.assertIsNone(primera.error, primera.error)
        self.assertTrue(primera.resultado)
        self.assertIsInstance(segunda.error, services.ConversacionCerrada)
        self.assertFalse(MensajePedido.objects.filter(pedido=self.pedido).exists())
        self.assertTrue(self.leer().solo_lectura)
