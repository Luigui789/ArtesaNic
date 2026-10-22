"""Rutas bajo /api/v1/pedidos/."""

from django.urls import path

from .views import (
    MiPedidoView,
    MisPedidosView,
    PedidoRecibidoView,
    PedidosRecibidosView,
)

urlpatterns = [
    path("mios/", MisPedidosView.as_view(), name="mis-pedidos"),
    path("mios/<int:pedido_id>/", MiPedidoView.as_view(), name="mi-pedido"),
    path("recibidos/", PedidosRecibidosView.as_view(), name="pedidos-recibidos"),
    path("recibidos/<int:pedido_id>/", PedidoRecibidoView.as_view(), name="pedido-recibido"),
]
