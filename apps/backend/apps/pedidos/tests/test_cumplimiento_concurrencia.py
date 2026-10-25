"""Carreras reales de AUD-12 en PostgreSQL: dos hilos, dos conexiones, claves distintas.

AUD-08 no protege aquí (las claves difieren): el árbitro es el ``SELECT … FOR UPDATE`` del
``Pedido``. La primera transacción se detiene dentro del lock, después de escribir; la prueba
espera a ver en ``pg_stat_activity`` que la segunda espera ese lock y solo entonces deja
continuar a la primera. La segunda revalida y termina en ``409`` sin efectos.
"""

from uuid import uuid4

from django.utils import timezone

from apps.catalogo.tests.base import crear_producto
from apps.inventario import services as inventario
from apps.inventario.models import (
    EstadoReserva,
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)
from apps.pagos import services as pagos
from apps.pagos.models import PLAZO
from apps.pagos.tests.base import reloj
from apps.pedidos import cumplimiento, vencimiento
from apps.pedidos.models import (
    EntregaPedido,
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    LineaEntrega,
)
from apps.propuestas.tests.test_concurrencia import CarreraTestCase, _Hilo
from apps.solicitudes.tests.base import inicializar_stock

from .base_cumplimiento import (
    confirmar_pedido_mixto,
    llevar_pago_a,
    personalizacion,
    stock,
)


class CarrerasDeCumplimientoTests(CarreraTestCase):
    def setUp(self):
        super().setUp()
        self.base = crear_producto(
            self.artesano.taller,
            self.producto.categoria,
            publicado=True,
            nombre="Base",
            permite_personalizacion=True,
        )
        inicializar_stock(self.artesano, self.base, cantidad=10)

    def pedido(self, *renglones, pago="confirmado"):
        pedido = confirmar_pedido_mixto(
            comprador=self.comprador, artesano=self.artesano, renglones=list(renglones)
        )
        llevar_pago_a(pedido, pago, comprador=self.comprador, artesano=self.artesano)
        return pedido

    def iniciar(self, pedido, linea):
        return _Hilo(
            cumplimiento.iniciar_linea_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            pedido_id=pedido.pk,
            linea_id=linea.pk,
        )

    def entregar(self, pedido, linea, cantidad):
        return _Hilo(
            cumplimiento.registrar_entrega_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            pedido_id=pedido.pk,
            fecha=timezone.localdate(),
            lineas=[{"linea": linea.pk, "cantidad": cantidad}],
        )

    def consumos(self, pedido):
        return MovimientoInventario.objects.filter(
            pedido=pedido, tipo=TipoMovimientoInventario.CONSUMO
        ).count()

    def assertConflicto(self, hilo, codigo):
        self.assertIsInstance(hilo.error, cumplimiento.ConflictoCumplimiento, hilo.error)
        self.assertEqual(hilo.error.codigo, codigo)

    def test_dos_inicios_de_la_misma_transformacion_consumen_una_vez(self):
        pedido = self.pedido(personalizacion(self.base, 2))
        linea = pedido.lineas.get()
        self.pausar_en(inventario, "consumir_reserva")
        primera, segunda = self.carrera(self.iniciar(pedido, linea), self.iniciar(pedido, linea))
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "linea_ya_iniciada")
        self.assertEqual(self.consumos(pedido), 1)
        reserva = ReservaInventario.objects.get(linea_pedido=linea)
        self.assertEqual((reserva.cantidad_consumida, reserva.estado), (2, EstadoReserva.CONSUMIDA))
        inv = InventarioProducto.objects.get(producto=self.base)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (8, 0))
        self.assertEqual(
            EventoEstadoPedido.objects.filter(
                pedido=pedido, estado_nuevo=EstadoPedido.EN_CUMPLIMIENTO
            ).count(),
            1,
        )

    def test_dos_entregas_parciales_simultaneas_no_sobreentregan(self):
        pedido = self.pedido(stock(self.base, 3))
        linea = pedido.lineas.get()
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk)
        self.pausar_en(inventario, "consumir_reserva")
        primera, segunda = self.carrera(
            self.entregar(pedido, linea, 2), self.entregar(pedido, linea, 2)
        )
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "cantidad_entrega_excede_pendiente")
        self.assertEqual(EntregaPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(sum(LineaEntrega.objects.values_list("cantidad", flat=True)), 2)
        self.assertEqual(self.consumos(pedido), 1)
        inv = InventarioProducto.objects.get(producto=self.base)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (8, 1))
        reserva = ReservaInventario.objects.get(linea_pedido=linea)
        self.assertEqual((reserva.cantidad_consumida, reserva.estado), (2, EstadoReserva.ACTIVA))

    def test_dos_entregas_finales_simultaneas_un_solo_evento(self):
        pedido = self.pedido(stock(self.base, 2))
        linea = pedido.lineas.get()
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk)
        cumplimiento.registrar_entrega(
            artesano=self.artesano,
            pedido_id=pedido.pk,
            fecha=timezone.localdate(),
            lineas=[{"linea": linea.pk, "cantidad": 1}],
        )
        self.pausar_en(inventario, "consumir_reserva")
        primera, segunda = self.carrera(
            self.entregar(pedido, linea, 1), self.entregar(pedido, linea, 1)
        )
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "pedido_entregado")
        self.assertEqual(EntregaPedido.objects.filter(pedido=pedido).count(), 2)
        self.assertEqual(self.consumos(pedido), 2)
        self.assertEqual(
            EventoEstadoPedido.objects.filter(
                pedido=pedido, estado_nuevo=EstadoPedido.ENTREGADO
            ).count(),
            1,
        )
        inv = InventarioProducto.objects.get(producto=self.base)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (8, 0))

    def test_vencimiento_gana_el_lock_y_el_inicio_ve_pedido_vencido(self):
        pedido = self.pedido(stock(self.base, 2), pago=None)
        linea = pedido.lineas.get()
        momento = pedido.confirmado_en + PLAZO
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        with reloj(momento):
            worker = _Hilo(vencimiento.vencer_pedido, pedido_id=pedido.pk)
            primera, segunda = self.carrera(worker, self.iniciar(pedido, linea))
        self.assertIsNone(primera.error)
        self.assertTrue(primera.resultado)
        self.assertConflicto(segunda, "pedido_vencido")
        self.assertEqual(
            EstadoOperativoPedido.objects.get(pedido=pedido).estado,
            EstadoPedido.VENCIDO_FALTA_PAGO,
        )
        self.assertIsNone(linea.cumplimiento.iniciado_en)
        self.assertEqual(self.consumos(pedido), 0)

    def test_pago_confirmado_en_cumplimiento_nunca_vence(self):
        pedido = self.pedido(stock(self.base, 1))
        linea = pedido.lineas.get()
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk)
        with reloj(pedido.confirmado_en + PLAZO * 100):
            self.assertFalse(vencimiento.vencer_pedido(pedido.pk))
            self.assertEqual(vencimiento.procesar_vencimientos().vencidos, 0)
        self.assertEqual(
            EstadoOperativoPedido.objects.get(pedido=pedido).estado, EstadoPedido.EN_CUMPLIMIENTO
        )
        self.assertTrue(pagos.situacion_pago(pedido, pedido.pago).estado == "confirmado")
