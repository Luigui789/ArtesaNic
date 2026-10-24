"""Rutas de pagos bajo /api/v1/pedidos/ (se añaden a las de apps.pedidos)."""

from django.urls import path

from .views import (
    ComprobanteRecibidoView,
    CorregirIntentoPagoView,
    IntentosPagoView,
    MiComprobanteView,
    MiPagoView,
    PagoRecibidoView,
    ResolverIntentoPagoView,
)

urlpatterns = [
    path("mios/<int:pedido_id>/pago/", MiPagoView.as_view(), name="mi-pago"),
    path(
        "mios/<int:pedido_id>/pago/intentos/",
        IntentosPagoView.as_view(),
        name="mis-intentos-pago",
    ),
    path(
        "mios/<int:pedido_id>/pago/intentos/<int:intento_id>/corregir/",
        CorregirIntentoPagoView.as_view(),
        name="corregir-intento-pago",
    ),
    path(
        "mios/<int:pedido_id>/pago/intentos/<int:intento_id>/comprobante/",
        MiComprobanteView.as_view(),
        name="mi-comprobante-pago",
    ),
    path("recibidos/<int:pedido_id>/pago/", PagoRecibidoView.as_view(), name="pago-recibido"),
    path(
        "recibidos/<int:pedido_id>/pago/intentos/<int:intento_id>/resolver/",
        ResolverIntentoPagoView.as_view(),
        name="resolver-intento-pago",
    ),
    path(
        "recibidos/<int:pedido_id>/pago/intentos/<int:intento_id>/comprobante/",
        ComprobanteRecibidoView.as_view(),
        name="comprobante-pago-recibido",
    ),
]
