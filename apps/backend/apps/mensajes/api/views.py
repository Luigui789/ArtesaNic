"""API de la conversación privada del pedido confirmado (AUD-16; RF-014, RNF-010).

Una sola ruta para ambas partes: el comprador y el artesano del taller del pedido. Sin
endpoints por mensaje: no hay edición ni borrado (D-AUD16-03).
"""

from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.solicitudes.api.views import ERRORES, NO_ENCONTRADO

from .. import selectors, services
from .permissions import EsParteOperativa
from .serializers import (
    ConflictoConversacionSerializer,
    ConversacionPedidoSerializer,
    CursorSerializer,
    MensajeEntradaSerializer,
    MensajePedidoSerializer,
)

TAG = "Mensajes"
ERROR_ENTRADA = OpenApiResponse(
    response={"type": "object", "additionalProperties": {}},
    description="Errores por campo: texto vacío o mayor de 500 caracteres, campo no permitido "
    "(«Campo no permitido.») o cursor `despues_de` no entero o negativo.",
)
CONFLICTO = OpenApiResponse(
    ConflictoConversacionSerializer,
    description="El pedido alcanzó un estado terminal; nada se escribe. `codigo` estable: "
    f"`{services.CODIGO_CONVERSACION_CERRADA}`. El historial sigue disponible por GET.",
)


class ConversacionCerrada(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto"

    def __init__(self):
        super().__init__(
            {
                "detail": services.MENSAJE_CONVERSACION_CERRADA,
                "codigo": services.CODIGO_CONVERSACION_CERRADA,
            }
        )


def _traducir(fn):
    try:
        return fn()
    except selectors.ParteNoValida:
        raise exceptions.PermissionDenied() from None
    except selectors.PedidoNoEncontrado:
        raise exceptions.NotFound() from None
    except services.TextoInvalido as exc:
        raise exceptions.ValidationError(exc.errores) from None
    except services.ConversacionCerrada:
        raise ConversacionCerrada() from None


@method_decorator(never_cache, name="dispatch")
class MensajesPedidoView(APIView):
    permission_classes = [EsParteOperativa]

    @extend_schema(
        tags=[TAG],
        operation_id="listar_mensajes_pedido",
        summary="Leer la conversación del pedido (historial o novedades)",
        description="Solo el comprador del pedido o el artesano de su taller aprobado. Sin "
        "`despues_de` devuelve el historial completo; con `despues_de=N`, solo los mensajes "
        "con `id > N`, en orden de `id` (cursor del polling de 15 s, RNF-010). Un pedido "
        "terminal sigue legible con `solo_lectura: true`. 404 si no existe o es ajeno.",
        parameters=[CursorSerializer],
        responses={
            200: ConversacionPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
        },
    )
    def get(self, request, pedido_id: int):
        consulta = CursorSerializer(data=request.query_params)
        consulta.is_valid(raise_exception=True)
        conversacion = _traducir(
            lambda: selectors.conversacion(
                actor=request.user,
                pedido_id=pedido_id,
                despues_de=consulta.validated_data["despues_de"],
            )
        )
        return Response(ConversacionPedidoSerializer(conversacion).data)

    @extend_schema(
        tags=[TAG],
        operation_id="enviar_mensaje_pedido",
        summary="Enviar un mensaje de texto al pedido",
        description="El autor es la cuenta del token; solo se acepta `texto`. Se admite "
        "mientras el pedido está `confirmado` o `en_cumplimiento`; en un estado terminal "
        "responde 409 `conversacion_cerrada`. Sin adjuntos, edición ni borrado.",
        request=MensajeEntradaSerializer,
        responses={
            201: MensajePedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: CONFLICTO,
        },
    )
    def post(self, request, pedido_id: int):
        entrada = MensajeEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        mensaje = _traducir(
            lambda: services.enviar_mensaje(
                actor=request.user,
                pedido_id=pedido_id,
                texto=entrada.validated_data["texto"],
            )
        )
        return Response(MensajePedidoSerializer(mensaje).data, status=status.HTTP_201_CREATED)
