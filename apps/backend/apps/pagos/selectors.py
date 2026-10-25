"""Lecturas de pagos con ownership en SQL. Cada consulta filtra por la parte autenticada:
un pedido o intento ajeno es indistinguible de uno inexistente (404)."""

from django.db.models import Prefetch

from apps.pedidos.models import Pedido

from .models import IntentoPago, Pago


def pedido_del_comprador(comprador, pedido_id: int) -> Pedido | None:
    return Pedido.objects.del_comprador(comprador).filter(pk=pedido_id).first()


def pedido_del_taller(artesano, pedido_id: int) -> Pedido | None:
    return Pedido.objects.filter(pk=pedido_id, taller__propietario=artesano).first()


def pago_con_historial(pedido: Pedido) -> Pago | None:
    """Pago con sus intentos en orden cronológico (``numero``) y su revisión, sin N+1."""
    return (
        Pago.objects.filter(pedido=pedido)
        .prefetch_related(
            Prefetch(
                "intentos",
                queryset=IntentoPago.objects.select_related("revision").order_by("numero"),
            )
        )
        .first()
    )


def intento_del_comprador(comprador, pedido_id: int, intento_id: int) -> IntentoPago | None:
    return IntentoPago.objects.filter(
        pk=intento_id, pago__pedido_id=pedido_id, pago__pedido__comprador=comprador
    ).first()


def intento_del_taller(artesano, pedido_id: int, intento_id: int) -> IntentoPago | None:
    return IntentoPago.objects.filter(
        pk=intento_id, pago__pedido_id=pedido_id, pago__pedido__taller__propietario=artesano
    ).first()
