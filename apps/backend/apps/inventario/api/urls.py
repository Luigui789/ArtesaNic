"""Rutas bajo /api/v1/inventario/."""

from django.urls import path

from .views import (
    AjusteInventarioView,
    EntradaInventarioView,
    ExistenciaInicialView,
    InventarioProductoView,
    MiInventarioListaView,
    MovimientosProductoView,
)

urlpatterns = [
    path("", MiInventarioListaView.as_view(), name="mi-inventario"),
    path(
        "productos/<int:producto_id>/",
        InventarioProductoView.as_view(),
        name="inventario-producto",
    ),
    path(
        "productos/<int:producto_id>/inicial/",
        ExistenciaInicialView.as_view(),
        name="inventario-inicial",
    ),
    path(
        "productos/<int:producto_id>/entradas/",
        EntradaInventarioView.as_view(),
        name="inventario-entradas",
    ),
    path(
        "productos/<int:producto_id>/ajustes/",
        AjusteInventarioView.as_view(),
        name="inventario-ajustes",
    ),
    path(
        "productos/<int:producto_id>/movimientos/",
        MovimientosProductoView.as_view(),
        name="inventario-movimientos",
    ),
]
