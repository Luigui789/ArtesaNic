"""Selectores de pedidos confirmados con ownership SQL y sin depender del catálogo vivo."""

from django.db.models import Prefetch

from .models import CargoPedido, EntregaPedido, LineaEntrega, LineaPedido, Pedido


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


# --- Cumplimiento (AUD-12) ---


def pedido_con_cumplimiento():
    """Pedido con estado, renglones con su cumplimiento y entregas con líneas y recepción.

    Cuatro consultas fijas, sin N+1: ``Pedido`` + ``estado_operativo``, líneas con
    ``cumplimiento``, entregas con ``recepcion`` y líneas de entrega. Las cantidades
    entregadas se derivan del ledger cargado, no de contadores persistidos.
    """
    return Pedido.objects.select_related("estado_operativo").prefetch_related(
        Prefetch(
            "lineas",
            queryset=LineaPedido.objects.select_related("cumplimiento").order_by("posicion", "id"),
        ),
        Prefetch(
            "entregas",
            queryset=EntregaPedido.objects.select_related("recepcion")
            .prefetch_related(
                Prefetch("lineas", queryset=LineaEntrega.objects.order_by("linea_pedido_id"))
            )
            .order_by("numero", "id"),
        ),
    )


def cumplimiento_del_comprador(comprador, pedido_id: int) -> Pedido | None:
    return pedido_con_cumplimiento().del_comprador(comprador).filter(pk=pedido_id).first()


def cumplimiento_del_taller(artesano, pedido_id: int) -> Pedido | None:
    return pedido_con_cumplimiento().filter(pk=pedido_id, taller__propietario=artesano).first()
