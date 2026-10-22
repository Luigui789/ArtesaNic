"""Lecturas con ownership SQL y número de consultas independiente de los renglones."""

from django.db.models import Prefetch

from .models import RenglonSolicitud, Solicitud


def solicitudes_con_renglones():
    # La revisión (OneToOne inversa) se une en la misma consulta de los renglones.
    return Solicitud.objects.select_related("taller", "comprador").prefetch_related(
        Prefetch(
            "renglones",
            queryset=RenglonSolicitud.objects.select_related(
                "producto__categoria", "revision__resuelto_por"
            ),
        )
    )
