"""Rutas bajo /api/v1/solicitudes/: la propuesta se consulta desde su solicitud."""

from django.urls import path

from .views import DecisionPropuestaView, MiPropuestaView, PropuestaRecibidaView

urlpatterns = [
    path("mias/<int:solicitud_id>/propuesta/", MiPropuestaView.as_view(), name="mi-propuesta"),
    path(
        "mias/<int:solicitud_id>/propuesta/decision/",
        DecisionPropuestaView.as_view(),
        name="decidir-propuesta",
    ),
    path(
        "recibidas/<int:solicitud_id>/propuesta/",
        PropuestaRecibidaView.as_view(),
        name="propuesta-recibida",
    ),
]
