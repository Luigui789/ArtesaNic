"""Consultas de inventario e historial con ownership SQL del taller."""

from apps.catalogo.models import Producto

from .models import InventarioProducto, MovimientoInventario


def inventarios_del_taller(taller):
    return (
        InventarioProducto.objects.del_taller(taller)
        .select_related("producto__categoria")
        .order_by("-producto__creado_en", "-producto_id")
    )


def inventario_de_producto_del_taller(taller, producto_id: int) -> InventarioProducto | None:
    return (
        InventarioProducto.objects.del_taller(taller)
        .select_related("producto__categoria")
        .filter(producto_id=producto_id)
        .first()
    )


def producto_pertenece_al_taller(taller, producto_id: int) -> bool:
    return Producto.objects.filter(pk=producto_id, taller=taller).exists()


def movimientos_de_producto_del_taller(taller, producto_id: int):
    return (
        MovimientoInventario.objects.filter(producto_id=producto_id, producto__taller=taller)
        .select_related("producto__categoria", "actor")
        .order_by("-creado_en", "-id")
    )
