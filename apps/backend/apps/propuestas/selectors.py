"""Lectura de la propuesta con ownership SQL: tres consultas sin importar líneas o cargos."""

from django.db.models import Prefetch

from .models import CargoPropuesta, LineaPropuesta, Propuesta


def propuestas_con_detalle():
    return Propuesta.objects.select_related("solicitud").prefetch_related(
        Prefetch(
            "lineas",
            queryset=LineaPropuesta.objects.select_related("renglon__producto__categoria"),
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
