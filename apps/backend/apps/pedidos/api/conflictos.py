"""Traducción HTTP de las excepciones de cumplimiento (AUD-12) y resolución (AUD-13).

400 entrada mal formada · 403 rol o taller no habilitado · 404 pedido, línea o entrega
inexistente o ajeno · 409 acción incompatible (código de negocio) o clave reutilizada.
"""

from contextlib import contextmanager

from drf_spectacular.utils import OpenApiResponse
from rest_framework import exceptions, serializers, status

from apps.operaciones import services as operaciones
from apps.operaciones.api import contrato as idempotencia
from apps.operaciones.services import CODIGO_CLAVE_REUTILIZADA
from apps.solicitudes import services as solicitudes

from .. import cumplimiento, errores
from ..cumplimiento import CodigoConflictoCumplimiento
from ..errores import CodigoConflictoResolucion

CODIGOS_CONFLICTO = [
    *CodigoConflictoCumplimiento.MENSAJES.items(),
    (CODIGO_CLAVE_REUTILIZADA, "Clave reutilizada con otra petición"),
]


class ConflictoCumplimientoSerializer(serializers.Serializer):
    detail = serializers.CharField()
    codigo = serializers.ChoiceField(choices=CODIGOS_CONFLICTO)
    lineas = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="Líneas del pedido afectadas, cuando el conflicto se refiere a renglones.",
    )


class Conflicto(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto"

    def __init__(self, error: cumplimiento.ConflictoCumplimiento):
        super().__init__({"detail": error.mensaje, "codigo": error.codigo})
        if error.lineas:
            # Ids enteros, no texto: APIException convertiría cada valor en ErrorDetail.
            self.detail = {**self.detail, "lineas": list(error.lineas)}


def respuesta_conflicto(*codigos: str) -> OpenApiResponse:
    lista = ", ".join(f"`{c}`" for c in (*codigos, CODIGO_CLAVE_REUTILIZADA))
    return OpenApiResponse(
        ConflictoCumplimientoSerializer,
        description=f"Conflicto sin efectos (nada se escribe); `codigo` estable: {lista}.",
    )


@contextmanager
def errores_de_cumplimiento():
    try:
        yield
    except cumplimiento.EntradaInvalida as exc:
        raise exceptions.ValidationError(exc.errores) from None
    except (
        cumplimiento.PedidoNoEncontrado,
        cumplimiento.LineaNoEncontrada,
        cumplimiento.EntregaNoEncontrada,
    ):
        raise exceptions.NotFound() from None
    except (solicitudes.ArtesanoNoHabilitado, solicitudes.CompradorNoValido):
        raise exceptions.PermissionDenied() from None
    except cumplimiento.ConflictoCumplimiento as exc:
        raise Conflicto(exc) from None
    except operaciones.ClaveIdempotenciaReutilizada:
        raise idempotencia.ClaveReutilizada() from None


# --- Resolución, reembolsos y clasificación (AUD-13) ---

CODIGOS_CONFLICTO_RESOLUCION = [
    *CodigoConflictoResolucion.MENSAJES.items(),
    (CODIGO_CLAVE_REUTILIZADA, "Clave reutilizada con otra petición"),
]


class ConflictoResolucionSerializer(serializers.Serializer):
    detail = serializers.CharField()
    codigo = serializers.ChoiceField(choices=CODIGOS_CONFLICTO_RESOLUCION)
    obligaciones = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="Obligaciones afectadas, cuando el conflicto se refiere a ellas.",
    )


class ConflictoDeResolucion(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto"

    def __init__(self, error: errores.ConflictoResolucion):
        super().__init__({"detail": error.mensaje, "codigo": error.codigo})
        if error.obligaciones:
            self.detail = {**self.detail, "obligaciones": list(error.obligaciones)}


def respuesta_conflicto_resolucion(*codigos: str) -> OpenApiResponse:
    lista = ", ".join(f"`{c}`" for c in (*codigos, CODIGO_CLAVE_REUTILIZADA))
    return OpenApiResponse(
        ConflictoResolucionSerializer,
        description=f"Conflicto sin efectos (nada se escribe); `codigo` estable: {lista}.",
    )


@contextmanager
def errores_de_resolucion():
    try:
        yield
    except cumplimiento.EntradaInvalida as exc:
        raise exceptions.ValidationError(exc.errores) from None
    except (
        cumplimiento.PedidoNoEncontrado,
        errores.CierreNoEncontrado,
        errores.ReembolsoNoEncontrado,
    ):
        raise exceptions.NotFound() from None
    except (solicitudes.ArtesanoNoHabilitado, solicitudes.CompradorNoValido):
        raise exceptions.PermissionDenied() from None
    except errores.ConflictoResolucion as exc:
        raise ConflictoDeResolucion(exc) from None
    except operaciones.ClaveIdempotenciaReutilizada:
        raise idempotencia.ClaveReutilizada() from None
