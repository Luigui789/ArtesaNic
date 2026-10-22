"""Traducción HTTP de excepciones de dominio de inventario (AUD-07)."""

from contextlib import contextmanager

from drf_spectacular.utils import OpenApiResponse
from rest_framework import exceptions, serializers, status

from apps.operaciones import services as operaciones
from apps.operaciones.api import contrato as idempotencia
from apps.operaciones.services import CODIGO_CLAVE_REUTILIZADA
from apps.solicitudes.services import ArtesanoNoHabilitado

from .. import services
from ..services import CodigoConflictoInventario

CODIGOS_CONFLICTO = [
    *CodigoConflictoInventario.MENSAJES.items(),
    (CODIGO_CLAVE_REUTILIZADA, "Clave reutilizada con otra petición"),
]


class ConflictoInventarioSerializer(serializers.Serializer):
    detail = serializers.CharField()
    codigo = serializers.ChoiceField(choices=CODIGOS_CONFLICTO)


class Conflicto(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto_inventario"

    def __init__(self, error: services.ConflictoInventario):
        super().__init__({"detail": error.mensaje, "codigo": error.codigo})


def respuesta_conflicto(*codigos: str) -> OpenApiResponse:
    lista = ", ".join(f"`{c}`" for c in (*codigos, CODIGO_CLAVE_REUTILIZADA))
    return OpenApiResponse(
        ConflictoInventarioSerializer,
        description=f"Conflicto sin efectos; `codigo` estable: {lista}.",
    )


@contextmanager
def errores_de_dominio():
    try:
        yield
    except services.EntradaInventarioInvalida as exc:
        raise exceptions.ValidationError(exc.errores) from None
    except services.ProductoInventarioNoEncontrado:
        raise exceptions.NotFound() from None
    except ArtesanoNoHabilitado:
        raise exceptions.PermissionDenied() from None
    except services.ConflictoInventario as exc:
        raise Conflicto(exc) from None
    except operaciones.ClaveIdempotenciaReutilizada:
        raise idempotencia.ClaveReutilizada() from None
