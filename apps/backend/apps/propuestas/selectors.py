"""Lectura de la propuesta y su decisión con ownership SQL en tres consultas."""

from django.db.models import Prefetch

from apps.pedidos.models import CargoPedido, LineaPedido

from .models import CargoPropuesta, DecisionPropuesta, LineaPropuesta, Propuesta


def propuestas_con_detalle():
    return Propuesta.objects.select_related("solicitud", "decision", "pedido").prefetch_related(
        Prefetch(
            "lineas",
            queryset=LineaPropuesta.objects.select_related(
                "renglon__producto__categoria", "distribucion"
            ),
        ),
        Prefetch("cargos", queryset=CargoPropuesta.objects.select_related("linea")),
    )


def propuesta_del_comprador(comprador, solicitud_id: int) -> Propuesta | None:
    return (
        propuestas_con_detalle()
        .filter(solicitud_id=solicitud_id, solicitud__comprador=comprador)
        .first()
    )


def propuesta_del_taller(taller, solicitud_id: int) -> Propuesta | None:
    return (
        propuestas_con_detalle().filter(solicitud_id=solicitud_id, solicitud__taller=taller).first()
    )


def decision_del_comprador(comprador, solicitud_id: int) -> DecisionPropuesta | None:
    return (
        DecisionPropuesta.objects.select_related(
            "propuesta__solicitud",
            "propuesta__pedido__taller",
            "propuesta__pedido__estado_operativo",
        )
        .prefetch_related(
            Prefetch(
                "propuesta__pedido__lineas",
                queryset=LineaPedido.objects.order_by("posicion", "id"),
            ),
            Prefetch(
                "propuesta__pedido__cargos",
                queryset=CargoPedido.objects.select_related("linea").order_by("posicion", "id"),
            ),
        )
        .filter(
            propuesta__solicitud_id=solicitud_id,
            propuesta__solicitud__comprador=comprador,
        )
        .first()
    )
