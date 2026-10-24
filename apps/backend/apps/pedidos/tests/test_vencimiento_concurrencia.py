"""Carreras reales de AUD-11 en PostgreSQL: dos hilos, dos conexiones.

Comprador y proceso de vencimientos compiten por el lock del ``Pedido``. La primera
transacción se detiene dentro del lock; la prueba espera a ver en ``pg_stat_activity`` que
la segunda espera ese ``FOR UPDATE`` y solo entonces deja continuar a la primera. Cada hilo
tiene su propio reloj: el comprador actúa antes del límite o después, según el caso.
"""

import threading
from datetime import timedelta
from unittest import mock

from apps.inventario import services as inventario
from apps.inventario.models import (
    EstadoReserva,
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.models import PLAZO, IntentoPago, Pago
from apps.pagos.tests.base import confirmar_pedido, imagen
from apps.pagos.tests.test_concurrencia import comprobante
from apps.pedidos import vencimiento
from apps.pedidos.models import EstadoOperativoPedido, EstadoPedido, EventoEstadoPedido
from apps.propuestas.tests.test_concurrencia import CarreraTestCase, _Hilo

UN_SEGUNDO = timedelta(seconds=1)
ANTES, DESPUES = "antes", "despues"


class CarrerasDeVencimientoTests(CarreraTestCase):
    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        self.limite = self.pedido.confirmado_en + PLAZO
        self.relojes = {}

    def reloj_por_hilo(self, defecto):
        """``pagos.ahora`` devuelve el instante asignado al hilo (por nombre) o ``defecto``."""

        def ahora():
            return self.relojes.get(threading.current_thread().name, defecto)

        parche = mock.patch.object(pagos, "ahora", side_effect=ahora)
        parche.start()
        self.addCleanup(parche.stop)

    def hilo(self, nombre, momento, funcion, **kwargs):
        hilo = _Hilo(funcion, **kwargs)
        hilo.name = nombre
        self.relojes[nombre] = momento
        return hilo

    def worker(self, momento, nombre="worker"):
        return self.hilo(nombre, momento, vencimiento.vencer_pedido, pedido_id=self.pedido.pk)

    def registrar(self, momento):
        return self.hilo(
            "comprador",
            momento,
            pagos.registrar_intento,
            comprador=self.comprador,
            pedido_id=self.pedido.pk,
            metodo="transferencia",
            referencia="TRX-CARRERA",
            comprobante=comprobante(7),
        )

    def corregir(self, momento, intento_id):
        return self.hilo(
            "comprador",
            momento,
            pagos.corregir_intento,
            comprador=self.comprador,
            pedido_id=self.pedido.pk,
            intento_id=intento_id,
            metodo="transferencia",
            referencia="TRX-CORREGIDA",
            comprobante=comprobante(9),
        )

    def resolucion(self, resultado, momento):
        """Intento registrado y resuelto en ``momento``: devuelve (intento, plazo_hasta)."""
        with mock.patch.object(pagos, "ahora", return_value=momento - timedelta(hours=1)):
            intento = pagos.registrar_intento(
                comprador=self.comprador,
                pedido_id=self.pedido.pk,
                metodo="transferencia",
                referencia="TRX-0",
                comprobante=validar_comprobante(imagen()),
            )
        with mock.patch.object(pagos, "ahora", return_value=momento):
            revision = pagos.resolver_intento(
                artesano=self.artesano,
                pedido_id=self.pedido.pk,
                intento_id=intento.pk,
                resultado=resultado,
                motivo="Motivo",
            )
        return intento, revision.plazo_hasta

    def assertNoVencido(self):
        estado = EstadoOperativoPedido.objects.get(pedido=self.pedido)
        self.assertEqual(estado.estado, EstadoPedido.CONFIRMADO)
        self.assertEqual(ReservaInventario.objects.get(pedido=self.pedido).estado, "activa")
        self.assertFalse(EventoEstadoPedido.objects.exists())

    def assertVencidoUnaVez(self):
        estado = EstadoOperativoPedido.objects.get(pedido=self.pedido)
        self.assertEqual(estado.estado, EstadoPedido.VENCIDO_FALTA_PAGO)
        self.assertEqual(EventoEstadoPedido.objects.filter(pedido=self.pedido).count(), 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.LIBERACION).count(),
            1,
        )
        self.assertEqual(
            ReservaInventario.objects.get(pedido=self.pedido).estado, EstadoReserva.LIBERADA
        )
        self.assertEqual(InventarioProducto.objects.get(producto=self.producto).reservada, 0)

    def assertConflicto(self, hilo, *codigos):
        self.assertIsInstance(hilo.error, pagos.ConflictoPago)
        self.assertIn(hilo.error.codigo, codigos)

    # --- Registro inicial contra el proceso ---

    def test_registro_valido_gana_y_el_worker_no_vence(self):
        self.reloj_por_hilo(self.limite)
        self.pausar_en(pagos, "_bloquear_pago")
        comprador, worker = self.carrera(
            self.registrar(self.limite - UN_SEGUNDO), self.worker(self.limite + UN_SEGUNDO)
        )
        self.assertIsNone(comprador.error)
        self.assertIsNone(worker.error)
        self.assertFalse(worker.resultado, "El worker revalida y ve el pago registrado")
        self.assertEqual(Pago.objects.get(pedido=self.pedido).estado, "registrado")
        self.assertNoVencido()

    def test_worker_gana_y_el_registro_tardio_recibe_409(self):
        self.reloj_por_hilo(self.limite)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        worker, comprador = self.carrera(
            self.worker(self.limite), self.registrar(self.limite + UN_SEGUNDO)
        )
        self.assertIsNone(worker.error)
        self.assertTrue(worker.resultado)
        self.assertConflicto(comprador, "pedido_vencido", "plazo_pago_vencido")
        self.assertFalse(Pago.objects.exists())
        self.assertVencidoUnaVez()

    # --- Corrección de un observado contra el proceso ---

    def test_correccion_valida_gana_y_el_worker_no_vence(self):
        intento, plazo = self.resolucion("observado", self.limite - timedelta(hours=2))
        self.reloj_por_hilo(plazo)
        self.pausar_en(pagos, "_bloquear_pago")
        comprador, worker = self.carrera(
            self.corregir(plazo - UN_SEGUNDO, intento.pk), self.worker(plazo + UN_SEGUNDO)
        )
        self.assertIsNone(comprador.error)
        self.assertFalse(worker.resultado)
        self.assertEqual(Pago.objects.get().estado, "registrado")
        self.assertNoVencido()

    def test_worker_gana_y_la_correccion_tardia_recibe_409(self):
        intento, plazo = self.resolucion("observado", self.limite - timedelta(hours=2))
        self.reloj_por_hilo(plazo)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        worker, comprador = self.carrera(
            self.worker(plazo), self.corregir(plazo + UN_SEGUNDO, intento.pk)
        )
        self.assertTrue(worker.resultado)
        self.assertConflicto(comprador, "pedido_vencido", "correccion_fuera_plazo")
        self.assertEqual(IntentoPago.objects.count(), 1)
        self.assertEqual(Pago.objects.get().estado, "observado")
        self.assertVencidoUnaVez()

    # --- Nuevo intento tras no recibido contra el proceso ---

    def test_nuevo_intento_valido_gana_y_el_worker_no_vence(self):
        _, plazo = self.resolucion("no_recibido", self.limite - timedelta(hours=2))
        self.reloj_por_hilo(plazo)
        self.pausar_en(pagos, "_bloquear_pago")
        comprador, worker = self.carrera(
            self.registrar(plazo - UN_SEGUNDO), self.worker(plazo + UN_SEGUNDO)
        )
        self.assertIsNone(comprador.error)
        self.assertFalse(worker.resultado)
        self.assertEqual(Pago.objects.get().estado, "registrado")
        self.assertNoVencido()

    def test_worker_gana_y_el_nuevo_intento_tardio_recibe_409(self):
        _, plazo = self.resolucion("no_recibido", self.limite - timedelta(hours=2))
        self.reloj_por_hilo(plazo)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        worker, comprador = self.carrera(self.worker(plazo), self.registrar(plazo + UN_SEGUNDO))
        self.assertTrue(worker.resultado)
        self.assertConflicto(comprador, "pedido_vencido", "nuevo_intento_fuera_plazo")
        self.assertEqual(IntentoPago.objects.count(), 1)
        self.assertVencidoUnaVez()

    # --- Dos procesos sobre el mismo pedido ---

    def test_dos_workers_una_sola_transicion(self):
        self.reloj_por_hilo(self.limite)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        primero, segundo = self.carrera(
            self.worker(self.limite, "worker-1"), self.worker(self.limite, "worker-2")
        )
        self.assertIsNone(primero.error)
        self.assertIsNone(segundo.error, "El segundo termina sin error comercial")
        self.assertEqual((primero.resultado, segundo.resultado), (True, False))
        self.assertVencidoUnaVez()

    def test_dos_ciclos_completos_en_paralelo(self):
        self.reloj_por_hilo(self.limite)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        primero, segundo = self.carrera(
            self.hilo("ciclo-1", self.limite, vencimiento.procesar_vencimientos),
            self.hilo("ciclo-2", self.limite, vencimiento.procesar_vencimientos),
        )
        resultados = sorted(
            (h.resultado.vencidos, h.resultado.no_elegibles, h.resultado.errores)
            for h in (primero, segundo)
        )
        self.assertEqual(resultados, [(0, 1, 0), (1, 0, 0)])
        self.assertVencidoUnaVez()

    def test_rollback_del_primer_worker_deja_vencer_al_segundo(self):
        self.fallar_primera = True
        self.reloj_por_hilo(self.limite)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        primero, segundo = self.carrera(
            self.worker(self.limite, "worker-1"), self.worker(self.limite, "worker-2")
        )
        self.assertIsInstance(primero.error, RuntimeError)
        self.assertTrue(segundo.resultado)
        self.assertVencidoUnaVez()
