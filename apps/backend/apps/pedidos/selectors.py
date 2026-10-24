"""Selectores de pedidos confirmados con ownership SQL y sin depender del catálogo vivo."""

from django.db.models import Prefetch

from .models import CargoPedido, LineaPedido, Pedido


def pedidos_con_detalle():
    """Carga el pedido con su taller, comprador y el snapshot de líneas y cargos.

    No hace join con ``catalogo_producto`` ni ``catalogo_categoria``: la lectura usa
    exclusivamente el snapshot contractual persistido en ``LineaPedido``.
    """
    return Pedido.objects.select_related(
        "taller", "comprador", "estado_operativo"
    ).prefetch_related(
        Prefetch("lineas", queryset=LineaPedido.objects.order_by("posicion", "id")),
        Prefetch(
            "cargos",
            queryset=CargoPedido.objects.select_related("linea").order_by("posicion", "id"),
        ),
    )


def pedido_del_comprador(comprador, pedido_id: int) -> Pedido | None:
    return pedidos_con_detalle().del_comprador(comprador).filter(pk=pedido_id).first()


def pedido_del_taller(taller, pedido_id: int) -> Pedido | None:
    return pedidos_con_detalle().del_taller(taller).filter(pk=pedido_id).first()
