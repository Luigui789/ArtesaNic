"""Carreras reales de AUD-13 en PostgreSQL: dos hilos, dos conexiones, claves distintas.

AUD-08 no protege aquí (las claves difieren): el árbitro es el ``SELECT … FOR UPDATE`` del
``Pedido``. La primera transacción se detiene dentro del lock, después de escribir; la prueba
espera a ver en ``pg_stat_activity`` que la segunda espera ese lock y solo entonces deja
continuar a la primera. La segunda revalida y termina en ``409`` (o «no elegible») sin efectos.
"""

from uuid import uuid4

from django.utils import timezone

from apps.catalogo.tests.base import crear_producto
from apps.inventario import services as inventario
from apps.inventario.models import (
    ClasificacionInventario,
    InventarioProducto,
    MovimientoInventario,
    ObligacionClasificacionInventario,
)
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.models import PLAZO, Pago
from apps.pagos.tests.base import imagen, reloj
from apps.pedidos import clasificacion, cumplimiento, reembolsos, resolucion, vencimiento
from apps.pedidos.errores import ConflictoResolucion
from apps.pedidos.models import (
    CancelacionPedido,
    CierreParcialPedido,
    DecisionCierreParcial,
    DevolucionReembolso,
    EntregaPedido,
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    LineaCierreParcial,
    ReembolsoPedido,
)
from apps.propuestas.tests.test_concurrencia import CarreraTestCase, _Hilo
from apps.solicitudes.tests.base import inicializar_stock

from .base_cumplimiento import confirmar_pedido_mixto, llevar_pago_a, personalizacion, stock

MOTIVO = "Imposible terminar el pedido."


class CarrerasDeResolucionTests(CarreraTestCase):
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

    def iniciar_y_entregar(self, pedido, linea, cantidad):
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk)
        if cantidad:
            cumplimiento.registrar_entrega(
                artesano=self.artesano,
                pedido_id=pedido.pk,
                fecha=timezone.localdate(),
                lineas=[{"linea": linea.pk, "cantidad": cantidad}],
            )

    # --- Hilos ---

    def cancelar(self, pedido):
        return _Hilo(
            resolucion.cancelar_pedido_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            pedido_id=pedido.pk,
            motivo=MOTIVO,
        )

    def proponer(self, pedido):
        return _Hilo(
            resolucion.proponer_cierre_parcial_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            pedido_id=pedido.pk,
            motivo=MOTIVO,
        )

    def responder(self, pedido, cierre, decision, motivo=""):
        return _Hilo(
            resolucion.responder_cierre_parcial_idempotente,
            comprador=self.comprador,
            clave=str(uuid4()),
            pedido_id=pedido.pk,
            cierre_id=cierre.pk,
            decision=decision,
            motivo=motivo,
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

    def assertCodigo(self, hilo, codigo):
        self.assertIsNotNone(hilo.error, "la segunda transacción debía fallar")
        self.assertEqual(getattr(hilo.error, "codigo", None), codigo, hilo.error)

    def liberaciones(self, pedido):
        return MovimientoInventario.objects.filter(pedido=pedido, tipo="liberacion").count()

    # --- 111. Cierre vs entrega ---

    def test_entrega_gana_y_el_cierre_incluye_la_nueva_entrega(self):
        pedido = self.pedido(stock(self.base, 5))
        linea = pedido.lineas.get()
        self.iniciar_y_entregar(pedido, linea, 1)
        self.pausar_en(inventario, "consumir_reserva")
        primera, segunda = self.carrera(self.entregar(pedido, linea, 2), self.proponer(pedido))
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error, segunda.error)
        fila = LineaCierreParcial.objects.get(cierre__pedido=pedido)
        self.assertEqual((fila.cantidad_entregada, fila.cantidad_no_entregada), (3, 2))

    def test_cierre_gana_y_la_entrega_ve_el_cierre_pendiente(self):
        pedido = self.pedido(stock(self.base, 5))
        linea = pedido.lineas.get()
        self.iniciar_y_entregar(pedido, linea, 1)
        self.pausar_en(reembolsos, "calcular_cierre")
        primera, segunda = self.carrera(self.proponer(pedido), self.entregar(pedido, linea, 2))
        self.assertIsNone(primera.error)
        self.assertCodigo(segunda, "cierre_parcial_pendiente")
        self.assertEqual(EntregaPedido.objects.filter(pedido=pedido).count(), 1)
        fila = LineaCierreParcial.objects.get(cierre__pedido=pedido)
        self.assertEqual((fila.cantidad_entregada, fila.cantidad_no_entregada), (1, 4))
        inv = InventarioProducto.objects.get(producto=self.base)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (9, 4))

    # --- 112. Dos cancelaciones ---

    def test_dos_cancelaciones_solo_una_finaliza(self):
        pedido = self.pedido(stock(self.base, 2), personalizacion(self.base, 1))
        st, pe = pedido.lineas.order_by("posicion")
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=pedido.pk, linea_id=pe.pk)
        self.pausar_en(inventario, "liberar_remanentes_por_finalizacion")
        primera, segunda = self.carrera(self.cancelar(pedido), self.cancelar(pedido))
        self.assertIsNone(primera.error)
        self.assertCodigo(segunda, "pedido_finalizado")
        self.assertEqual(CancelacionPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(
            EventoEstadoPedido.objects.filter(
                pedido=pedido, estado_nuevo=EstadoPedido.CANCELADO_ARTESANO
            ).count(),
            1,
        )
        self.assertEqual(ReembolsoPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(self.liberaciones(pedido), 1)
        self.assertEqual(ObligacionClasificacionInventario.objects.filter(pedido=pedido).count(), 1)
        inv = InventarioProducto.objects.get(producto=self.base)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (9, 0))

    # --- 113. Aceptar y objetar a la vez ---

    def test_aceptar_y_objetar_simultaneos_una_sola_decision(self):
        pedido = self.pedido(stock(self.base, 3))
        linea = pedido.lineas.get()
        self.iniciar_y_entregar(pedido, linea, 1)
        resolucion.proponer_cierre_parcial(
            artesano=self.artesano, pedido_id=pedido.pk, motivo=MOTIVO
        )
        cierre = CierreParcialPedido.objects.get(pedido=pedido)
        self.pausar_en(inventario, "liberar_remanentes_por_finalizacion")
        primera, segunda = self.carrera(
            self.responder(pedido, cierre, "aceptado"),
            self.responder(pedido, cierre, "objetado", "No acepto."),
        )
        self.assertIsNone(primera.error)
        self.assertCodigo(segunda, "cierre_ya_resuelto")
        self.assertEqual(DecisionCierreParcial.objects.get(cierre=cierre).decision, "aceptado")
        self.assertEqual(
            EstadoOperativoPedido.objects.get(pedido=pedido).estado, EstadoPedido.CERRADO_PARCIAL
        )
        self.assertEqual(ReembolsoPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(self.liberaciones(pedido), 1)

    # --- 114. Clasificar el último remanente dos veces ---

    def test_dos_clasificaciones_del_ultimo_remanente_no_exceden(self):
        pedido = self.pedido(personalizacion(self.base, 3))
        linea = pedido.lineas.get()
        self.iniciar_y_entregar(pedido, linea, 0)
        resolucion.cancelar_pedido(artesano=self.artesano, pedido_id=pedido.pk, motivo=MOTIVO)
        obligacion = ObligacionClasificacionInventario.objects.get(pedido=pedido)
        self.assertEqual(obligacion.cantidad, 3)

        def clasificar():
            return _Hilo(
                clasificacion.clasificar_inventario_idempotente,
                artesano=self.artesano,
                clave=str(uuid4()),
                pedido_id=pedido.pk,
                clasificaciones=[
                    {
                        "obligacion": obligacion.pk,
                        "cantidad": 2,
                        "resultado": "reutilizable",
                        "motivo": "Intacta",
                    }
                ],
            )

        self.pausar_en(inventario, "registrar_movimiento_clasificacion")
        primera, segunda = self.carrera(clasificar(), clasificar())
        self.assertIsNone(primera.error)
        self.assertCodigo(segunda, "clasificacion_excede_pendiente")
        self.assertEqual(ClasificacionInventario.objects.filter(obligacion=obligacion).count(), 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(pedido=pedido, tipo="reincorporacion").count(), 1
        )
        inv = InventarioProducto.objects.get(producto=self.base)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (9, 0))

    # --- 115. Dos devoluciones del mismo reembolso ---

    def test_dos_devoluciones_simultaneas_una_sola(self):
        pedido = self.pedido(stock(self.base, 1))
        resolucion.cancelar_pedido(artesano=self.artesano, pedido_id=pedido.pk, motivo=MOTIVO)

        def devolver(referencia):
            return _Hilo(
                reembolsos.registrar_devolucion_idempotente,
                artesano=self.artesano,
                clave=str(uuid4()),
                pedido_id=pedido.pk,
                fecha=timezone.localdate(),
                referencia=referencia,
            )

        self.pausar_en(DevolucionReembolso.objects, "create")
        primera, segunda = self.carrera(devolver("TRX-1"), devolver("TRX-2"))
        self.assertIsNone(primera.error)
        self.assertCodigo(segunda, "reembolso_ya_realizado")
        self.assertEqual(DevolucionReembolso.objects.get().referencia, "TRX-1")

    # --- 61. Cancelación vs vencimiento ---

    def test_vencimiento_gana_y_la_cancelacion_ve_pedido_vencido(self):
        pedido = self.pedido(stock(self.base, 2), pago=None)
        self.pausar_en(inventario, "liberar_reservas_de_pedido")
        with reloj(pedido.confirmado_en + PLAZO):
            worker = _Hilo(vencimiento.vencer_pedido, pedido_id=pedido.pk)
            primera, segunda = self.carrera(worker, self.cancelar(pedido))
        self.assertTrue(primera.resultado)
        self.assertCodigo(segunda, "pedido_vencido")
        self.assertFalse(CancelacionPedido.objects.filter(pedido=pedido).exists())
        self.assertEqual(self.liberaciones(pedido), 1)

    def test_cancelacion_gana_y_el_proceso_no_vence(self):
        pedido = self.pedido(stock(self.base, 2), pago=None)
        self.pausar_en(inventario, "liberar_remanentes_por_finalizacion")
        with reloj(pedido.confirmado_en + PLAZO):
            worker = _Hilo(vencimiento.vencer_pedido, pedido_id=pedido.pk)
            primera, segunda = self.carrera(self.cancelar(pedido), worker)
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        self.assertFalse(segunda.resultado, "el proceso revalida y no vence")
        self.assertEqual(
            EstadoOperativoPedido.objects.get(pedido=pedido).estado,
            EstadoPedido.CANCELADO_ARTESANO,
        )
        self.assertEqual(self.liberaciones(pedido), 1)

    # --- 62. Registro de pago vs cancelación ---

    def registrar_pago(self, pedido):
        return _Hilo(
            pagos.registrar_intento,
            comprador=self.comprador,
            pedido_id=pedido.pk,
            metodo="transferencia",
            referencia="TRX-CARRERA",
            comprobante=validar_comprobante(imagen()),
        )

    def test_registro_de_pago_gana_y_la_cancelacion_espera_su_resolucion(self):
        pedido = self.pedido(stock(self.base, 1), pago=None)
        self.pausar_en(pagos, "_crear_intento")
        primera, segunda = self.carrera(self.registrar_pago(pedido), self.cancelar(pedido))
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, ConflictoResolucion)
        self.assertCodigo(segunda, "pago_pendiente_de_resolucion")
        self.assertEqual(Pago.objects.get(pedido=pedido).estado, "registrado")
        self.assertEqual(
            EstadoOperativoPedido.objects.get(pedido=pedido).estado, EstadoPedido.CONFIRMADO
        )

    def test_cancelacion_gana_y_el_registro_de_pago_ve_pedido_finalizado(self):
        pedido = self.pedido(stock(self.base, 1), pago=None)
        self.pausar_en(inventario, "liberar_remanentes_por_finalizacion")
        primera, segunda = self.carrera(self.cancelar(pedido), self.registrar_pago(pedido))
        self.assertIsNone(primera.error)
        self.assertCodigo(segunda, "pedido_finalizado")
        self.assertFalse(Pago.objects.filter(pedido=pedido).exists())
