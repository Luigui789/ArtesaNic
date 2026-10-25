"""Rutas bajo /api/v1/pedidos/ (lecturas AUD-07, cumplimiento AUD-12 y resolución AUD-13)."""

from django.urls import path

from .views import (
    CancelacionView,
    CierresParcialesView,
    ClasificacionesView,
    CumplimientoRecibidoView,
    EntregasView,
    IniciarLineaView,
    MiCumplimientoView,
    MiPedidoView,
    MiResolucionView,
    MisPedidosView,
    PedidoRecibidoView,
    PedidosRecibidosView,
    RealizacionReembolsoView,
    RecepcionEntregaView,
    ResolucionRecibidaView,
    RespuestaCierreView,
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
    # --- Resolución (AUD-13) ---
    path("mios/<int:pedido_id>/resolucion/", MiResolucionView.as_view(), name="mi-resolucion"),
    path(
        "mios/<int:pedido_id>/cierres-parciales/<int:cierre_id>/respuesta/",
        RespuestaCierreView.as_view(),
        name="responder-cierre-parcial",
    ),
    path(
        "recibidos/<int:pedido_id>/resolucion/",
        ResolucionRecibidaView.as_view(),
        name="resolucion-recibida",
    ),
    path(
        "recibidos/<int:pedido_id>/cancelacion/",
        CancelacionView.as_view(),
        name="cancelar-pedido",
    ),
    path(
        "recibidos/<int:pedido_id>/cierres-parciales/",
        CierresParcialesView.as_view(),
        name="proponer-cierre-parcial",
    ),
    path(
        "recibidos/<int:pedido_id>/reembolso/realizacion/",
        RealizacionReembolsoView.as_view(),
        name="registrar-devolucion-reembolso",
    ),
    path(
        "recibidos/<int:pedido_id>/clasificaciones/",
        ClasificacionesView.as_view(),
        name="clasificaciones-pedido",
    ),
]
