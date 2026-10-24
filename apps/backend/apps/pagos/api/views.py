"""API de pagos externos del pedido confirmado (AUD-10; RF-011, RN-006/012/014/015).

Rutas bajo el pedido de cada parte, como las lecturas de AUD-07: el comprador opera en
``/pedidos/mios/{id}/pago/`` y el artesano en ``/pedidos/recibidos/{id}/pago/``. Cada
petición —incluida la descarga del comprobante— repite el control de ownership en SQL.
"""

import logging

from django.http import FileResponse, Http404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsComprador
from apps.operaciones.api import contrato as idempotencia
from apps.solicitudes.api.views import ERROR_ENTRADA, ERRORES, NO_ENCONTRADO
from apps.talleres.api.permissions import EsArtesanoAprobado

from .. import selectors, services
from ..comprobantes import MENSAJES as MENSAJES_COMPROBANTE
from ..comprobantes import MIME_PERMITIDOS
from ..services import CodigoConflictoPago as C
from .conflictos import errores_de_dominio, respuesta_conflicto
from .serializers import (
    IntentoPagoEntradaSerializer,
    PagoPedidoSerializer,
    ResolucionPagoEntradaSerializer,
    VistaPago,
)

logger = logging.getLogger(__name__)

TAG = "Pagos"
MIOS, RECIBIDOS = "mios", "recibidos"
DESCRIPCION_LECTURA = (
    "Estado actual del pago y su historial completo de intentos y revisiones, en orden "
    "cronológico. Sin pago registrado, `estado` es `pendiente` y `registrable_hasta` es "
    "`confirmado_en + 48 h`. Total y moneda proceden del pedido confirmado. Los comprobantes "
    "se describen por nombre, tipo, tamaño y un endpoint autenticado; nunca por ruta física "
    "ni URL pública. 404 si el pedido no existe o es ajeno."
)
ENTRADA_MULTIPART = (
    "`multipart/form-data` con `metodo` (`transferencia` | `otro`), `referencia` (1–120 "
    "caracteres tras recortar) y exactamente un `comprobante` (JPG, JPEG, PNG, WebP o PDF, "
    "máximo 10 MiB, validado por contenido: extensión, MIME declarado y firma deben "
    "coincidir). Cualquier otro campo —incluidos monto, moneda o estado— responde 400. "
)


def _vista(pedido, lado) -> dict:
    return PagoPedidoSerializer(
        VistaPago.de(pedido, selectors.pago_con_historial(pedido)), context={"lado": lado}
    ).data


def _un_solo_comprobante(request) -> None:
    if len(request.FILES.getlist("comprobante")) > 1:
        raise exceptions.ValidationError(
            {"comprobante": [MENSAJES_COMPROBANTE["comprobante_multiple"]]}
        )


class _SinNegociacion(BaseContentNegotiation):
    """La descarga entrega el archivo con su tipo; los errores siguen siendo JSON."""

    def select_parser(self, request, parsers):
        return parsers[0] if parsers else None

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def _respuesta_comprobante(intento) -> FileResponse:
    try:
        archivo = intento.comprobante.open("rb")
    except (FileNotFoundError, OSError):
        logger.error("Comprobante sin archivo en el storage privado: intento %s", intento.pk)
        raise Http404 from None
    extension = intento.comprobante.name.rpartition(".")[2]
    respuesta = FileResponse(
        archivo,
        as_attachment=True,
        filename=f"comprobante-pedido-{intento.pago.pedido_id}-intento-{intento.numero}"
        f".{extension}",
        content_type=intento.comprobante_tipo,
    )
    respuesta["X-Content-Type-Options"] = "nosniff"
    respuesta["Content-Security-Policy"] = "default-src 'none'; sandbox"
    respuesta["Cache-Control"] = "private, no-store"
    return respuesta


DESCARGA = {
    (200, mime): OpenApiResponse(OpenApiTypes.BINARY, description="Contenido del comprobante.")
    for mime in MIME_PERMITIDOS
}
DESCRIPCION_DESCARGA = (
    "Descarga autenticada del comprobante de un intento. Repite el control de ownership "
    "(no basta haber listado el pago): solo el comprador del pedido o el artesano de su "
    "taller. Ajeno o inexistente: 404; anónimo: 401; otros roles (incluida la "
    "administración): 403. Responde el archivo con su MIME detectado, `Content-Disposition: "
    "attachment` con nombre generado, `X-Content-Type-Options: nosniff` y `Cache-Control: "
    "private, no-store`."
)


# --- Comprador ---


@method_decorator(never_cache, name="dispatch")
class MiPagoView(APIView):
    permission_classes = [EsComprador]

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_pago_de_mi_pedido",
        summary="Consultar el pago de un pedido propio",
        description=DESCRIPCION_LECTURA,
        responses={200: PagoPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        pedido = selectors.pedido_del_comprador(request.user, pedido_id)
        if pedido is None:
            raise Http404
        return Response(_vista(pedido, MIOS))


@method_decorator(never_cache, name="dispatch")
class IntentosPagoView(APIView):
    permission_classes = [EsComprador]
    parser_classes = [MultiPartParser]

    @extend_schema(
        tags=[TAG],
        operation_id="registrar_intento_de_pago",
        summary="Registrar el pago externo o un nuevo intento tras «no recibido»",
        description="Registro inicial mientras el pago está pendiente y dentro de "
        "`confirmado_en + 48 h`, o nuevo intento completo tras `no_recibido` dentro de su "
        "plazo de 48 h (vinculado al intento anterior). El pago pasa a `registrado`. "
        + ENTRADA_MULTIPART
        + "Protegida por `Idempotency-Key` (AUD-08): la huella incluye el pedido, método, "
        "referencia recortada y SHA-256 del contenido del comprobante. "
        + idempotencia.CLAVE_INVALIDA,
        request={"multipart/form-data": IntentoPagoEntradaSerializer},
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: PagoPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                C.PAGO_YA_CONFIRMADO,
                C.PAGO_EN_REVISION,
                C.CORRECCION_PENDIENTE,
                C.PLAZO_PAGO_VENCIDO,
                C.NUEVO_INTENTO_FUERA_PLAZO,
            ),
        },
    )
    def post(self, request, pedido_id: int):
        clave = idempotencia.clave_de_peticion(request)
        _un_solo_comprobante(request)
        entrada = IntentoPagoEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.registrar_intento_idempotente(
                comprador=request.user, clave=clave, pedido_id=pedido_id, **entrada.validated_data
            )
        pedido = selectors.pedido_del_comprador(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _vista(pedido, MIOS))


@method_decorator(never_cache, name="dispatch")
class CorregirIntentoPagoView(APIView):
    permission_classes = [EsComprador]
    parser_classes = [MultiPartParser]

    @extend_schema(
        tags=[TAG],
        operation_id="corregir_intento_de_pago",
        summary="Corregir el intento de pago observado",
        description="Crea un intento nuevo de origen `correccion` vinculado al intento "
        "observado de la URL (debe ser el más reciente y estar `observado`), dentro de las "
        "48 h abiertas por la observación. El intento observado y su comprobante se "
        "conservan. El pago vuelve a `registrado`. "
        + ENTRADA_MULTIPART
        + "Huella idempotente: pedido, intento observado, método, referencia y SHA-256 del "
        "comprobante. " + idempotencia.CLAVE_INVALIDA,
        request={"multipart/form-data": IntentoPagoEntradaSerializer},
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: PagoPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                C.PAGO_YA_CONFIRMADO,
                C.PAGO_EN_REVISION,
                C.CORRECCION_NO_PERMITIDA,
                C.CORRECCION_FUERA_PLAZO,
            ),
        },
    )
    def post(self, request, pedido_id: int, intento_id: int):
        clave = idempotencia.clave_de_peticion(request)
        _un_solo_comprobante(request)
        entrada = IntentoPagoEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.corregir_intento_idempotente(
                comprador=request.user,
                clave=clave,
                pedido_id=pedido_id,
                intento_id=intento_id,
                **entrada.validated_data,
            )
        pedido = selectors.pedido_del_comprador(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _vista(pedido, MIOS))


@method_decorator(never_cache, name="dispatch")
class MiComprobanteView(APIView):
    permission_classes = [EsComprador]
    content_negotiation_class = _SinNegociacion

    @extend_schema(
        tags=[TAG],
        operation_id="descargar_comprobante_de_mi_pedido",
        summary="Descargar un comprobante de un pedido propio",
        description=DESCRIPCION_DESCARGA,
        responses={**DESCARGA, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int, intento_id: int):
        intento = selectors.intento_del_comprador(request.user, pedido_id, intento_id)
        if intento is None:
            raise Http404
        return _respuesta_comprobante(intento)


# --- Artesano del taller del pedido ---


@method_decorator(never_cache, name="dispatch")
class PagoRecibidoView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_pago_de_pedido_recibido",
        summary="Consultar el pago de un pedido del taller propio",
        description=DESCRIPCION_LECTURA,
        responses={200: PagoPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        pedido = selectors.pedido_del_taller(request.user, pedido_id)
        if pedido is None:
            raise Http404
        return Response(_vista(pedido, RECIBIDOS))


@method_decorator(never_cache, name="dispatch")
class ResolverIntentoPagoView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG],
        operation_id="resolver_intento_de_pago",
        summary="Confirmar, observar o marcar como no recibido un intento de pago",
        description="Resolución única del artesano sobre el intento registrado. "
        "`confirmado`: fondos verificados; sin motivo; terminal (no admite nuevos intentos "
        "ni otra resolución). `observado`: problema con la evidencia o los datos "
        "(ilegible, incompleta, referencia incorrecta); motivo obligatorio (1–1000 "
        "caracteres tras recortar); abre 48 h para corregir. `no_recibido`: los fondos no "
        "aparecen acreditados en el medio externo; motivo obligatorio; abre 48 h para un "
        "nuevo intento. No modifica inventario ni el estado del pedido. Protegida por "
        "`Idempotency-Key`: huella con pedido, intento, estado y motivo recortado. "
        + idempotencia.CLAVE_INVALIDA,
        request=ResolucionPagoEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.parametro_repetida(200)],
        responses={
            200: PagoPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(C.PAGO_YA_CONFIRMADO, C.INTENTO_YA_RESUELTO),
        },
    )
    def post(self, request, pedido_id: int, intento_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = ResolucionPagoEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.resolver_intento_idempotente(
                artesano=request.user,
                clave=clave,
                pedido_id=pedido_id,
                intento_id=intento_id,
                resultado=entrada.validated_data["estado"],
                motivo=entrada.validated_data["motivo"],
            )
        pedido = selectors.pedido_del_taller(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _vista(pedido, RECIBIDOS))


@method_decorator(never_cache, name="dispatch")
class ComprobanteRecibidoView(APIView):
    permission_classes = [EsArtesanoAprobado]
    content_negotiation_class = _SinNegociacion

    @extend_schema(
        tags=[TAG],
        operation_id="descargar_comprobante_de_pedido_recibido",
        summary="Descargar un comprobante de un pedido del taller propio",
        description=DESCRIPCION_DESCARGA,
        responses={**DESCARGA, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int, intento_id: int):
        intento = selectors.intento_del_taller(request.user, pedido_id, intento_id)
        if intento is None:
            raise Http404
        return _respuesta_comprobante(intento)
