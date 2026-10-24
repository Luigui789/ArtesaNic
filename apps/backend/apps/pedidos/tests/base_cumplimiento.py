"""Apoyo de las pruebas de AUD-12: pedidos reales (AUD-05/06/07) con modalidades mixtas,
pago real (AUD-10) y las rutas de cumplimiento escritas a mano (contrato publicado)."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.utils import timezone

from apps.catalogo.tests.base import crear_producto
from apps.inventario import services as inventario
from apps.inventario.models import (
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.tests.base import imagen
from apps.pedidos.models import (
    EntregaPedido,
    EstadoOperativoPedido,
    EventoEstadoPedido,
    LineaEntrega,
    Pedido,
    RecepcionEntrega,
)
from apps.propuestas import services as propuestas
from apps.solicitudes import services as solicitudes
from apps.solicitudes.tests.base import SolicitudesAPITestCase

# --- Rutas ---


def url_cumplimiento(pedido_id, recibido=False):
    return f"/api/v1/pedidos/{'recibidos' if recibido else 'mios'}/{pedido_id}/cumplimiento/"


def url_iniciar(pedido_id, linea_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/lineas/{linea_id}/iniciar/"


def url_entregas(pedido_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/entregas/"


def url_recepcion(pedido_id, entrega_id):
    return f"/api/v1/pedidos/mios/{pedido_id}/entregas/{entrega_id}/recepcion/"


# --- Renglones de cada modalidad ---


def stock(producto, cantidad=1):
    return {"producto": producto.pk, "modalidad": "stock", "cantidad": cantidad}


def produccion(producto, cantidad=1):
    fecha = timezone.localdate() + timedelta(days=7)
    return {
        "producto": producto.pk,
        "modalidad": "produccion",
        "cantidad": cantidad,
        "fecha_solicitada": fecha,
    }


def personalizacion(producto, cantidad=1, origen="unidad_estandar"):
    return {
        "producto": producto.pk,
        "modalidad": "personalizacion",
        "cantidad": cantidad,
        "caracteristicas": "Nombre grabado en azul",
        "origen_personalizacion": origen,
    }


def confirmar_pedido_mixto(*, comprador, artesano, renglones) -> Pedido:
    """Flujo real: solicitud → todos los renglones aceptados → propuesta → aceptación."""
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
        if renglon.modalidad == "produccion":
            linea["fecha_comprometida"] = timezone.localdate() + timedelta(days=20)
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


def llevar_pago_a(pedido, estado, *, comprador, artesano):
    """Pago real de AUD-10: ``None`` (sin pago), ``registrado``, ``observado``,
    ``no_recibido`` o ``confirmado``."""
    if estado is None:
        return
    intento = pagos.registrar_intento(
        comprador=comprador,
        pedido_id=pedido.pk,
        metodo="transferencia",
        referencia="TRX-AUD12",
        comprobante=validar_comprobante(imagen()),
    )
    if estado != "registrado":
        pagos.resolver_intento(
            artesano=artesano,
            pedido_id=pedido.pk,
            intento_id=intento.pk,
            resultado=estado,
            motivo="" if estado == "confirmado" else "Motivo de prueba",
        )


def foto_inventario(pedido) -> dict:
    """Estado completo de inventario, reservas, entregas y eventos para comparar efectos."""
    productos = {linea.producto_id for linea in pedido.lineas.all()}
    return {
        "inventarios": sorted(
            InventarioProducto.objects.filter(producto_id__in=productos).values_list(
                "producto_id", "existencia_fisica", "reservada"
            )
        ),
        "reservas": sorted(
            ReservaInventario.objects.filter(pedido=pedido).values_list(
                "pk", "cantidad", "cantidad_consumida", "estado"
            )
        ),
        "movimientos": sorted(
            MovimientoInventario.objects.filter(producto_id__in=productos).values_list(
                "pk", flat=True
            )
        ),
        "entregas": EntregaPedido.objects.filter(pedido=pedido).count(),
        "lineas_entrega": LineaEntrega.objects.filter(entrega__pedido=pedido).count(),
        "estado": EstadoOperativoPedido.objects.get(pedido=pedido).estado,
        "eventos": EventoEstadoPedido.objects.filter(pedido=pedido).count(),
    }


def consumos(pedido):
    return MovimientoInventario.objects.filter(
        pedido=pedido, tipo=TipoMovimientoInventario.CONSUMO
    ).order_by("id")


class CumplimientoTestCase(SolicitudesAPITestCase):
    """Taller aprobado con productos de inventario conocido; ``self.base`` admite las tres
    modalidades. Los pedidos y el pago se crean con los servicios reales."""

    def setUp(self):
        super().setUp()
        self.base = self.producto_con_stock(
            10, nombre="Jarrón base", permite_produccion=True, permite_personalizacion=True
        )

    def producto_con_stock(self, existencia, **cambios):
        producto = crear_producto(self.taller, self.categoria, publicado=True, **cambios)
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=producto.pk, cantidad=existencia
        )
        return producto

    def pedido(self, *renglones, pago="confirmado", comprador=None, artesano=None):
        comprador = comprador or self.comprador
        artesano = artesano or self.artesano
        pedido = confirmar_pedido_mixto(
            comprador=comprador, artesano=artesano, renglones=list(renglones)
        )
        llevar_pago_a(pedido, pago, comprador=comprador, artesano=artesano)
        return pedido

    def lineas(self, pedido):
        return list(pedido.lineas.order_by("posicion"))

    def inventario_de(self, producto):
        inv = InventarioProducto.objects.get(producto=producto)
        return inv.existencia_fisica, inv.reservada

    def estado(self, pedido):
        return EstadoOperativoPedido.objects.get(pedido=pedido).estado

    # --- Peticiones HTTP ---

    def _post(self, url, datos, *, como, clave=None):
        self.autenticar(como)
        respuesta = self.client.post(
            url, datos, format="json", HTTP_IDEMPOTENCY_KEY=clave or str(uuid4())
        )
        self.autenticar(self.comprador)
        return respuesta

    def iniciar(self, pedido, linea, *, clave=None, como=None):
        linea_id = linea if isinstance(linea, int) else linea.pk
        return self._post(
            url_iniciar(pedido.pk, linea_id), {}, como=como or self.artesano, clave=clave
        )

    def entregar(self, pedido, *cantidades, fecha=None, clave=None, como=None, extra=None):
        """``cantidades``: pares ``(linea, cantidad)``."""
        datos = {
            "fecha": (fecha or timezone.localdate()).isoformat()
            if not isinstance(fecha, str)
            else fecha,
            "lineas": [
                {"linea": linea if isinstance(linea, int) else linea.pk, "cantidad": cantidad}
                for linea, cantidad in cantidades
            ],
        } | (extra or {})
        return self._post(url_entregas(pedido.pk), datos, como=como or self.artesano, clave=clave)

    def recibir(self, pedido, entrega_id, resultado, motivo=None, *, clave=None, como=None):
        datos = {"resultado": resultado} | ({"motivo": motivo} if motivo is not None else {})
        return self._post(
            url_recepcion(pedido.pk, entrega_id), datos, como=como or self.comprador, clave=clave
        )

    def leer(self, pedido, *, recibido=False, como=None):
        self.autenticar(como or (self.artesano if recibido else self.comprador))
        respuesta = self.client.get(url_cumplimiento(pedido.pk, recibido))
        self.autenticar(self.comprador)
        return respuesta

    def recepciones(self, pedido):
        return RecepcionEntrega.objects.filter(entrega__pedido=pedido).count()
