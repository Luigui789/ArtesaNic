"""Traducción HTTP de las excepciones de revisión y propuesta (AUD-06).

400 entrada inválida · 403 artesano no habilitado · 404 inexistente o ajena ·
409 transición incompatible (código de negocio) o clave idempotente reutilizada (AUD-08).
"""

from contextlib import contextmanager

from drf_spectacular.utils import OpenApiResponse
from rest_framework import exceptions, serializers, status

from apps.operaciones import services as operaciones
from apps.operaciones.api import contrato as idempotencia
from apps.operaciones.services import CODIGO_CLAVE_REUTILIZADA

from .. import services
from ..services import CodigoConflicto

CODIGOS_CONFLICTO = [
    *CodigoConflicto.MENSAJES.items(),
    (CODIGO_CLAVE_REUTILIZADA, "Clave reutilizada con otra petición"),
]


class ConflictoSolicitudSerializer(serializers.Serializer):
    detail = serializers.CharField()
    codigo = serializers.ChoiceField(choices=CODIGOS_CONFLICTO)


class Conflicto(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto"

    def __init__(self, error: services.ConflictoSolicitud):
        super().__init__({"detail": error.mensaje, "codigo": error.codigo})


def respuesta_conflicto(*codigos: str) -> OpenApiResponse:
    lista = ", ".join(f"`{c}`" for c in (*codigos, CODIGO_CLAVE_REUTILIZADA))
    return OpenApiResponse(
        ConflictoSolicitudSerializer,
        description=f"Conflicto sin efectos; `codigo` estable: {lista}. Nunca sobrescribe "
        "una resolución ni una propuesta ya registrada.",
    )


@contextmanager
def errores_de_dominio():
    try:
        yield
    except (services.EntradaInvalida, services.SolicitudInvalida) as exc:
        raise exceptions.ValidationError(exc.errores) from None
    except services.SolicitudNoEncontrada:
        raise exceptions.NotFound() from None
    except (services.ArtesanoNoHabilitado, services.CompradorNoValido):
        raise exceptions.PermissionDenied() from None
    except services.ConflictoSolicitud as exc:
        raise Conflicto(exc) from None
    except operaciones.ClaveIdempotenciaReutilizada:
        raise idempotencia.ClaveReutilizada() from None
