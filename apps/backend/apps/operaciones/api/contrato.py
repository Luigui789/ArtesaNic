"""Contrato HTTP de idempotencia que reutilizan las vistas de mutaciones protegidas.

La vista solo traduce cabeceras y errores; la ejecución idempotente vive en
``apps.operaciones.services`` y la mutación, en el servicio de su dominio.
"""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse
from rest_framework import exceptions, status
from rest_framework.response import Response

from ..models import MAX_CLAVE, MIN_CLAVE, PATRON_CLAVE
from ..services import (
    CODIGO_CLAVE_REUTILIZADA,
    ClaveIdempotenciaInvalida,
    ResultadoIdempotente,
    validar_clave,
)
from .serializers import ConflictoIdempotenciaSerializer

CABECERA_CLAVE = "Idempotency-Key"
CABECERA_REPETIDA = "Idempotency-Replayed"
MENSAJE_CLAVE = (
    f"Envía un {CABECERA_CLAVE} de {MIN_CLAVE} a {MAX_CLAVE} caracteres "
    "(letras, dígitos, «.», «_», «:», «~» o «-»), por ejemplo un UUID."
)
MENSAJE_REUTILIZADA = (
    "Esta clave de idempotencia ya se usó para otra petición con datos distintos. "
    "Genera una clave nueva para una operación nueva."
)

PARAMETRO_CLAVE = OpenApiParameter(
    CABECERA_CLAVE,
    OpenApiTypes.STR,
    OpenApiParameter.HEADER,
    required=True,
    pattern=PATRON_CLAVE,
    description=(
        "Clave generada por el cliente para este intento lógico (se recomienda un UUID v4). "
        "Reenviar la misma clave con la misma petición devuelve el mismo recurso sin "
        "repetir la operación; con otra petición responde 409. Claves distintas son "
        "operaciones distintas aunque el contenido coincida. Ámbito: actor autenticado y "
        f"tipo de operación. {MIN_CLAVE}–{MAX_CLAVE} caracteres."
    ),
)


def parametro_repetida(codigo: int) -> OpenApiParameter:
    return OpenApiParameter(
        CABECERA_REPETIDA,
        OpenApiTypes.STR,
        OpenApiParameter.HEADER,
        enum=["true"],
        response=[codigo],
        description="Presente con «true» cuando la respuesta repite una ejecución anterior. "
        "Informativo: mismo recurso y código registrado; el cuerpo refleja el estado actual "
        "del recurso, no un snapshot de la primera respuesta.",
    )


PARAMETRO_REPETIDA = parametro_repetida(201)
CONFLICTO = OpenApiResponse(
    ConflictoIdempotenciaSerializer,
    description=f"`{CODIGO_CLAVE_REUTILIZADA}`: la clave ya identifica otra petición de "
    "este actor. No se ejecuta la operación.",
)
CLAVE_INVALIDA = (
    f"`{CABECERA_CLAVE}` ausente o con formato inválido responde "
    f'`{{"{CABECERA_CLAVE}": ["..."]}}`, antes de validar el cuerpo.'
)


class ClaveReutilizada(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = CODIGO_CLAVE_REUTILIZADA

    def __init__(self):
        super().__init__({"detail": MENSAJE_REUTILIZADA, "codigo": CODIGO_CLAVE_REUTILIZADA})


def clave_de_peticion(request) -> str:
    try:
        return validar_clave(request.headers.get(CABECERA_CLAVE))
    except ClaveIdempotenciaInvalida:
        raise exceptions.ValidationError({CABECERA_CLAVE: [MENSAJE_CLAVE]}) from None


def respuesta_idempotente(resultado: ResultadoIdempotente, datos) -> Response:
    """Código registrado de la operación; la repetición se marca en una cabecera.

    ``datos`` es la representación actual del recurso: no se guarda el cuerpo original.
    """
    respuesta = Response(datos, status=resultado.operacion.codigo_http)
    if resultado.repetida:
        respuesta[CABECERA_REPETIDA] = "true"
    return respuesta
