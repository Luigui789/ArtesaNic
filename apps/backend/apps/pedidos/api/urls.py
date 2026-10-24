"""Rutas bajo /api/v1/pedidos/ (lecturas AUD-07 y cumplimiento AUD-12)."""

from django.urls import path

from .views import (
    CumplimientoRecibidoView,
    EntregasView,
    IniciarLineaView,
    MiCumplimientoView,
    MiPedidoView,
    MisPedidosView,
    PedidoRecibidoView,
    PedidosRecibidosView,
    RecepcionEntregaView,
)

urlpatterns = [
    path("mios/", MisPedidosView.as_view(), name="mis-pedidos"),
    path("mios/<int:pedido_id>/", MiPedidoView.as_view(), name="mi-pedido"),
    path(
        "mios/<int:pedido_id>/cumplimiento/",
        MiCumplimientoView.as_view(),
        name="mi-cumplimiento",
    ),
    path(
        "mios/<int:pedido_id>/entregas/<int:entrega_id>/recepcion/",
        RecepcionEntregaView.as_view(),
        name="recepcion-entrega",
    ),
    path("recibidos/", PedidosRecibidosView.as_view(), name="pedidos-recibidos"),
    path("recibidos/<int:pedido_id>/", PedidoRecibidoView.as_view(), name="pedido-recibido"),
    path(
        "recibidos/<int:pedido_id>/cumplimiento/",
        CumplimientoRecibidoView.as_view(),
        name="cumplimiento-recibido",
    ),
    path(
        "recibidos/<int:pedido_id>/lineas/<int:linea_id>/iniciar/",
        IniciarLineaView.as_view(),
        name="iniciar-linea",
    ),
    path(
        "recibidos/<int:pedido_id>/entregas/",
        EntregasView.as_view(),
        name="registrar-entrega",
    ),
]
