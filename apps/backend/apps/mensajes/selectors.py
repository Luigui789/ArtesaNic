"""Lecturas de la conversación del pedido (AUD-16; RF-014, RNF-010, RNF-013).

Ownership en SQL: el comprador ve solo sus pedidos y el artesano los de su taller aprobado.
Un pedido ajeno o inexistente se trata igual (404). El historial completo se devuelve en la
primera lectura; el polling pide solo los ids posteriores al cursor (D-AUD16-07/08).
"""

from dataclasses import dataclass

from apps.accounts.models import Rol
from apps.pedidos.models import ESTADOS_TERMINALES, Pedido
from apps.solicitudes import services as solicitudes

from .models import MensajePedido


class ParteNoValida(Exception):
    """La cuenta no es un comprador activo ni un artesano con taller aprobado (403)."""


class PedidoNoEncontrado(Exception):
    """El pedido no existe o no pertenece a esta parte (404, sin revelar existencia)."""


@dataclass(frozen=True)
class Conversacion:
    mensajes: list[MensajePedido]
    cursor: int
    solo_lectura: bool


def filtro_de_parte(actor) -> dict:
    """Condición SQL de pertenencia del pedido; equivale a ``Pedido.pertenece_a``."""
    try:
        if actor.rol == Rol.COMPRADOR:
            solicitudes.verificar_comprador_activo(actor)
            return {"comprador": actor}
        if actor.rol == Rol.ARTESANO:
            solicitudes.verificar_artesano_habilitado(actor)
            return {"taller__propietario": actor}
    except (solicitudes.CompradorNoValido, solicitudes.ArtesanoNoHabilitado):
        raise ParteNoValida from None
    # La administración de plataforma no lee conversaciones (RN-006, D-AUD16-09).
    raise ParteNoValida


def conversacion(*, actor, pedido_id: int, despues_de: int = 0) -> Conversacion:
    """Mensajes con ``id > despues_de`` en orden de ``id``; el cursor nunca retrocede."""
    pedido = (
        Pedido.objects.filter(pk=pedido_id, **filtro_de_parte(actor))
        .select_related("estado_operativo")
        .only("id", "estado_operativo__estado")
        .first()
    )
    if pedido is None:
        raise PedidoNoEncontrado
    mensajes = list(
        MensajePedido.objects.filter(pedido=pedido, pk__gt=despues_de)
        .select_related("autor")
        .only("id", "texto", "creado_en", "autor__id", "autor__nombre")
        .order_by("pk")
    )
    return Conversacion(
        mensajes=mensajes,
        cursor=max(despues_de, mensajes[-1].pk) if mensajes else despues_de,
        solo_lectura=pedido.estado_operativo.estado in ESTADOS_TERMINALES,
    )
