"""Rutas de mensajería bajo /api/v1/pedidos/ (se añaden a las de apps.pedidos)."""

from django.urls import path

from .views import MensajesPedidoView

urlpatterns = [
    path("<int:pedido_id>/mensajes/", MensajesPedidoView.as_view(), name="mensajes-pedido"),
]
