"""Rutas bajo /api/v1/solicitudes/: la propuesta se consulta desde su solicitud."""

from django.urls import path

from .views import MiPropuestaView, PropuestaRecibidaView

urlpatterns = [
    path("mias/<int:solicitud_id>/propuesta/", MiPropuestaView.as_view(), name="mi-propuesta"),
    path(
        "recibidas/<int:solicitud_id>/propuesta/",
        PropuestaRecibidaView.as_view(),
        name="propuesta-recibida",
    ),
]
