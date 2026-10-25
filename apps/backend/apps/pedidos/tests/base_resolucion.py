"""Apoyo de las pruebas de AUD-13: pedidos reales (AUD-05/06/07) con cargos de línea y
globales, pago real (AUD-10), cumplimiento real (AUD-12) y las rutas de resolución escritas
a mano (contrato publicado)."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.utils import timezone

from apps.inventario.models import (
    ClasificacionInventario,
    MovimientoInventario,
    ObligacionClasificacionInventario,
    TipoMovimientoInventario,
)
from apps.pedidos import cumplimiento
from apps.pedidos.models import (
    CancelacionPedido,
    CierreParcialPedido,
    DecisionCierreParcial,
    DevolucionReembolso,
    LineaCierreParcial,
    Pedido,
    ReembolsoPedido,
)
from apps.propuestas import services as propuestas
from apps.solicitudes import services as solicitudes

from .base_cumplimiento import CumplimientoTestCase, foto_inventario

# --- Rutas ---


def url_resolucion(pedido_id, recibido=False):
    return f"/api/v1/pedidos/{'recibidos' if recibido else 'mios'}/{pedido_id}/resolucion/"


def url_cancelacion(pedido_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/cancelacion/"


def url_cierres(pedido_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/cierres-parciales/"


def url_respuesta(pedido_id, cierre_id):
    return f"/api/v1/pedidos/mios/{pedido_id}/cierres-parciales/{cierre_id}/respuesta/"


def url_devolucion(pedido_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/reembolso/realizacion/"


def url_clasificaciones(pedido_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/clasificaciones/"


def confirmar_con_cargos(
    *, comprador, artesano, renglones, costo_entrega="50.00", otros_cargos=(), cargos_pers=None
) -> Pedido:
    """Flujo real con cargos: ``otros_cargos`` como ``(monto, indice_renglon | None)``;
    ``cargos_pers`` asigna el cargo de personalización por índice (por defecto 50.00)."""
    solicitud = solicitudes.crear_solicitud(comprador=comprador, renglones=list(renglones))
    renglones_db = list(solicitud.renglones.order_by("posicion"))
    lineas = []
    for indice, renglon in enumerate(renglones_db):
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
            linea["cargo_personalizacion"] = Decimal((cargos_pers or {}).get(indice, "50.00"))
        lineas.append(linea)
    propuestas.finalizar_propuesta(
        artesano=artesano,
        solicitud_id=solicitud.pk,
        modalidad_entrega="entrega_artesano",
        costo_entrega=Decimal(costo_entrega),
        lineas=lineas,
        otros_cargos=[
            {
                "descripcion": f"Cargo {i + 1}",
                "monto": Decimal(monto),
                **({"renglon": renglones_db[indice].pk} if indice is not None else {}),
            }
            for i, (monto, indice) in enumerate(otros_cargos)
        ],
    )
    propuestas.decidir_propuesta(comprador=comprador, solicitud_id=solicitud.pk, decision="aceptar")
    return Pedido.objects.get(solicitud=solicitud)


def foto_resolucion(pedido) -> dict:
    """Inventario, cumplimiento y toda la evidencia de resolución, para comparar efectos."""
    return foto_inventario(pedido) | {
        "cancelaciones": CancelacionPedido.objects.filter(pedido=pedido).count(),
        "cierres": CierreParcialPedido.objects.filter(pedido=pedido).count(),
        "lineas_cierre": LineaCierreParcial.objects.filter(cierre__pedido=pedido).count(),
        "decisiones": DecisionCierreParcial.objects.filter(cierre__pedido=pedido).count(),
        "reembolsos": ReembolsoPedido.objects.filter(pedido=pedido).count(),
        "devoluciones": DevolucionReembolso.objects.filter(reembolso__pedido=pedido).count(),
        "obligaciones": ObligacionClasificacionInventario.objects.filter(pedido=pedido).count(),
        "clasificaciones": ClasificacionInventario.objects.filter(
            obligacion__pedido=pedido
        ).count(),
    }


def movimientos(pedido, tipo):
    return MovimientoInventario.objects.filter(pedido=pedido, tipo=tipo).order_by("id")


LIBERACION = TipoMovimientoInventario.LIBERACION
REINCORPORACION = TipoMovimientoInventario.REINCORPORACION
BAJA = TipoMovimientoInventario.BAJA


class ResolucionTestCase(CumplimientoTestCase):
    """Añade a la base de AUD-12 las acciones de resolución por HTTP y por servicio."""

    # --- Cumplimiento por servicio (preparación de escenarios) ---

    def iniciar_srv(self, pedido, linea):
        return cumplimiento.iniciar_linea(
            artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk
        )

    def entregar_srv(self, pedido, *cantidades):
        return cumplimiento.registrar_entrega(
            artesano=self.artesano,
            pedido_id=pedido.pk,
            fecha=timezone.localdate(),
            lineas=[{"linea": linea.pk, "cantidad": q} for linea, q in cantidades],
        )

    # --- Resolución por HTTP ---

    def cancelar(self, pedido, motivo="El horno se dañó y no puedo cumplir.", **kw):
        datos = ({"motivo": motivo} if motivo is not None else {}) | kw.pop("extra", {})
        como = kw.pop("como", self.artesano)
        return self._post(url_cancelacion(pedido.pk), datos, como=como, **kw)

    def proponer(self, pedido, motivo="No podré completar el resto del pedido.", **kw):
        como = kw.pop("como", self.artesano)
        return self._post(url_cierres(pedido.pk), {"motivo": motivo}, como=como, **kw)

    def responder(self, pedido, cierre_id, decision, motivo=None, **kw):
        datos = {"decision": decision} | ({"motivo": motivo} if motivo is not None else {})
        como = kw.pop("como", self.comprador)
        return self._post(url_respuesta(pedido.pk, cierre_id), datos, como=como, **kw)

    def devolver(self, pedido, fecha=None, referencia="Transferencia BAC 12345", **kw):
        datos = {
            "fecha": (fecha or timezone.localdate()).isoformat()
            if not isinstance(fecha, str)
            else fecha,
            "referencia": referencia,
        } | kw.pop("extra", {})
        como = kw.pop("como", self.artesano)
        return self._post(url_devolucion(pedido.pk), datos, como=como, **kw)

    def clasificar(self, pedido, *items, **kw):
        """``items``: ``(obligacion, cantidad, resultado, motivo)``."""
        datos = {
            "clasificaciones": [
                {"obligacion": o, "cantidad": q, "resultado": r, "motivo": m}
                for o, q, r, m in items
            ]
        }
        como = kw.pop("como", self.artesano)
        return self._post(url_clasificaciones(pedido.pk), datos, como=como, **kw)

    def leer_resolucion(self, pedido, *, recibido=False, como=None):
        self.autenticar(como or (self.artesano if recibido else self.comprador))
        respuesta = self.client.get(url_resolucion(pedido.pk, recibido))
        self.autenticar(self.comprador)
        return respuesta

    def leer_clasificaciones(self, pedido, *, como=None):
        self.autenticar(como or self.artesano)
        respuesta = self.client.get(url_clasificaciones(pedido.pk))
        self.autenticar(self.comprador)
        return respuesta

    def assertConflicto(self, respuesta, codigo):
        self.assertEqual(respuesta.status_code, 409, respuesta.data)
        self.assertEqual(respuesta.data["codigo"], codigo, respuesta.data)

    def obligaciones(self, pedido):
        return list(ObligacionClasificacionInventario.objects.filter(pedido=pedido).order_by("id"))

    @staticmethod
    def nueva_clave():
        return str(uuid4())
