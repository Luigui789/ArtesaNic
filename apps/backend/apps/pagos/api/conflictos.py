"""Traducción HTTP de las excepciones de pagos (AUD-10).

400 entrada o comprobante inválidos · 403 rol o taller no habilitado · 404 inexistente o
ajeno · 409 transición incompatible (código de negocio) o clave idempotente reutilizada.
"""

from contextlib import contextmanager

from drf_spectacular.utils import OpenApiResponse
from rest_framework import exceptions, serializers, status

from apps.operaciones import services as operaciones
from apps.operaciones.api import contrato as idempotencia
from apps.operaciones.services import CODIGO_CLAVE_REUTILIZADA
from apps.solicitudes import services as solicitudes

from .. import services
from ..services import CodigoConflictoPago

CODIGOS_CONFLICTO = [
    *CodigoConflictoPago.MENSAJES.items(),
    (CODIGO_CLAVE_REUTILIZADA, "Clave reutilizada con otra petición"),
]


class ConflictoPagoSerializer(serializers.Serializer):
    detail = serializers.CharField()
    codigo = serializers.ChoiceField(choices=CODIGOS_CONFLICTO)


class Conflicto(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto"

    def __init__(self, error: services.ConflictoPago):
        super().__init__({"detail": error.mensaje, "codigo": error.codigo})


def respuesta_conflicto(*codigos: str) -> OpenApiResponse:
    lista = ", ".join(f"`{c}`" for c in (*codigos, CODIGO_CLAVE_REUTILIZADA))
    return OpenApiResponse(
        ConflictoPagoSerializer,
        description=f"Conflicto sin efectos; `codigo` estable: {lista}. Nunca modifica ni "
        "elimina intentos, revisiones o comprobantes anteriores.",
    )


@contextmanager
def errores_de_dominio():
    try:
        yield
    except services.EntradaInvalida as exc:
        raise exceptions.ValidationError(exc.errores) from None
    except (services.PedidoNoEncontrado, services.IntentoNoEncontrado):
        raise exceptions.NotFound() from None
    except (solicitudes.ArtesanoNoHabilitado, solicitudes.CompradorNoValido):
        raise exceptions.PermissionDenied() from None
    except services.ConflictoPago as exc:
        raise Conflicto(exc) from None
    except operaciones.ClaveIdempotenciaReutilizada:
        raise idempotencia.ClaveReutilizada() from None
