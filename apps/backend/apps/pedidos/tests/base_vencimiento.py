"""Apoyo de las pruebas de AUD-11: pedidos reales (AUD-05/06/07) con varios renglones."""

from datetime import timedelta
from decimal import Decimal

from apps.catalogo.tests.base import crear_producto
from apps.inventario import services as inventario
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.models import PLAZO
from apps.pagos.tests.base import PagosAPITestCase, imagen, reloj
from apps.pedidos import vencimiento
from apps.pedidos.models import Pedido
from apps.propuestas import services as propuestas
from apps.solicitudes import services as solicitudes

UN_SEGUNDO = timedelta(seconds=1)


def confirmar_pedido_con(*, comprador, artesano, renglones) -> Pedido:
    """Recorre el flujo real con varios renglones aceptados (stock o personalización)."""
    solicitud = solicitudes.crear_solicitud(comprador=comprador, renglones=renglones)
    lineas = []
    for renglon in solicitud.renglones.order_by("posicion"):
        solicitudes.resolver_renglon(
            artesano=artesano,
            solicitud_id=solicitud.pk,
            renglon_id=renglon.pk,
            resolucion="aceptado",
            motivo_rechazo="",
        )
        linea = {"renglon": renglon.pk}
        if renglon.modalidad == "personalizacion":
            linea["cargo_personalizacion"] = Decimal("50.00")
        lineas.append(linea)
    propuestas.finalizar_propuesta(
        artesano=artesano,
        solicitud_id=solicitud.pk,
        modalidad_entrega="entrega_artesano",
        costo_entrega=Decimal("50.00"),
        lineas=lineas,
    )
    propuestas.decidir_propuesta(comprador=comprador, solicitud_id=solicitud.pk, decision="aceptar")
    return Pedido.objects.get(solicitud=solicitud)


class VencimientoTestCase(PagosAPITestCase):
    """``self.pedido`` reserva 2 unidades de ``self.producto``; ``limite`` es su plazo inicial."""

    def setUp(self):
        super().setUp()
        self.limite = self.pedido.confirmado_en + PLAZO
        # Los pedidos de ownership quedan con pago registrado: nunca vencen y no alteran
        # los conteos (también comprueban en cada prueba que «registrado» no vence).
        for comprador, pedido in (
            (self.otro_comprador, self.pedido_otro_comprador),
            (self.comprador, self.pedido_taller_ajeno),
        ):
            pagos.registrar_intento(
                comprador=comprador,
                pedido_id=pedido.pk,
                metodo="transferencia",
                referencia="TRX-AJENO",
                comprobante=validar_comprobante(imagen()),
            )

    def producto_con_stock(self, existencia, **cambios):
        producto = crear_producto(self.taller, self.categoria, publicado=True, **cambios)
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=producto.pk, cantidad=existencia
        )
        return producto

    def procesar(self, momento, **kwargs) -> vencimiento.ResultadoCiclo:
        with reloj(momento):
            return vencimiento.procesar_vencimientos(**kwargs)

    def estado(self, pedido=None) -> str:
        (pedido or self.pedido).estado_operativo.refresh_from_db()
        return (pedido or self.pedido).estado_operativo.estado

    def registrar_en(self, momento, pedido=None, **kwargs):
        with reloj(momento):
            return self.registrar(pedido, **kwargs)

    def resolver_en(self, momento, intento_id, estado, motivo=None, **kwargs):
        with reloj(momento):
            return self.resolver(intento_id, estado, motivo, **kwargs)

    def corregir_en(self, momento, intento_id, **kwargs):
        with reloj(momento):
            return self.corregir(intento_id, **kwargs)

    def con_resolucion(self, estado, momento):
        """Registra un intento en ``momento - 1 h`` y lo resuelve en ``momento``."""
        r = self.registrar_en(momento - timedelta(hours=1))
        self.assertEqual(r.status_code, 201, r.data)
        intento = self.intento_vigente(r)
        r = self.resolver_en(momento, intento, estado, "Motivo de prueba")
        self.assertEqual(r.status_code, 200, r.data)
        return intento
