from django.urls import path

from .views import (
    CrearSolicitudView,
    MiSolicitudView,
    MisSolicitudesView,
    ResolverRenglonView,
    SolicitudesRecibidasView,
    SolicitudRecibidaView,
)

urlpatterns = [
    path("", CrearSolicitudView.as_view(), name="crear-solicitud"),
    path("mias/", MisSolicitudesView.as_view(), name="mis-solicitudes"),
    path("mias/<int:solicitud_id>/", MiSolicitudView.as_view(), name="mi-solicitud"),
    path("recibidas/", SolicitudesRecibidasView.as_view(), name="solicitudes-recibidas"),
    path(
        "recibidas/<int:solicitud_id>/", SolicitudRecibidaView.as_view(), name="solicitud-recibida"
    ),
    path(
        "recibidas/<int:solicitud_id>/renglones/<int:renglon_id>/resolver/",
        ResolverRenglonView.as_view(),
        name="resolver-renglon",
    ),
]
