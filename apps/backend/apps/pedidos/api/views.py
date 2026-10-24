"""API REST de pedidos confirmados (AUD-07) y de su cumplimiento por renglón (AUD-12)."""

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsComprador, EsPropietario
from apps.operaciones.api import contrato as idempotencia
from apps.solicitudes.api.views import (
    ERROR_ENTRADA,
    ERRORES,
    NO_ENCONTRADO,
    PaginacionSolicitudes,
)
from apps.talleres.api.permissions import EsArtesanoAprobado

from .. import cumplimiento, selectors
from ..cumplimiento import CodigoConflictoCumplimiento as C
from .conflictos import errores_de_cumplimiento, respuesta_conflicto
from .serializers import (
    CumplimientoPedidoSerializer,
    EntregaEntradaSerializer,
    InicioLineaEntradaSerializer,
    PedidoArtesanoSerializer,
    PedidoCompradorSerializer,
    RecepcionEntradaSerializer,
    vista_cumplimiento,
)

TAG = "Pedidos"


class _LecturaPedidosMixin:
    recibidos = False

    def get_queryset(self):
        consultas = selectors.pedidos_con_detalle()
        if getattr(self, "swagger_fake_view", False):
            return consultas.none()
        if self.recibidos:
            return consultas.del_taller(self.request.user.taller)
        return consultas.del_comprador(self.request.user)


@method_decorator(never_cache, name="dispatch")
class MisPedidosView(_LecturaPedidosMixin, ListModelMixin, GenericAPIView):
    permission_classes = [EsComprador, EsPropietario]
    serializer_class = PedidoCompradorSerializer
    pagination_class = PaginacionSolicitudes

    @extend_schema(
        tags=[TAG],
        operation_id="listar_mis_pedidos",
        summary="Listar los pedidos confirmados propios",
        description="Pedidos confirmados del comprador autenticado, ordenados por "
        "`-confirmado_en, -id`. Todos los importes y datos de producto proceden del "
        "snapshot contractual congelado al confirmar (RN-011).",
        responses={200: PedidoCompradorSerializer(many=True), **ERRORES},
    )
    def get(self, request):
        return self.list(request)


@method_decorator(never_cache, name="dispatch")
class PedidosRecibidosView(_LecturaPedidosMixin, ListModelMixin, GenericAPIView):
    recibidos = True
    permission_classes = [EsArtesanoAprobado, EsPropietario]
    serializer_class = PedidoArtesanoSerializer
    pagination_class = PaginacionSolicitudes

    @extend_schema(
        tags=[TAG],
        operation_id="listar_pedidos_recibidos",
        summary="Listar pedidos confirmados del taller propio aprobado",
        description="Pedidos confirmados del taller del artesano autenticado y aprobado, "
        "con su snapshot contractual congelado.",
        responses={200: PedidoArtesanoSerializer(many=True), **ERRORES},
    )
    def get(self, request):
        return self.list(request)


class _DetallePedidoView(_LecturaPedidosMixin, GenericAPIView):
    def get(self, request, pedido_id: int):
        pedido = get_object_or_404(self.get_queryset(), pk=pedido_id)
        self.check_object_permissions(request, pedido)
        return Response(self.get_serializer(pedido).data)


@method_decorator(never_cache, name="dispatch")
class MiPedidoView(_DetallePedidoView):
    permission_classes = [EsComprador, EsPropietario]
    serializer_class = PedidoCompradorSerializer

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_mi_pedido",
        summary="Consultar un pedido confirmado propio",
        description="Detalle contractual del pedido confirmado del comprador autenticado. "
        "No consulta el precio ni los datos vivos del catálogo. 404 si no existe o es ajeno.",
        responses={200: PedidoCompradorSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        return super().get(request, pedido_id)


@method_decorator(never_cache, name="dispatch")
class PedidoRecibidoView(_DetallePedidoView):
    recibidos = True
    permission_classes = [EsArtesanoAprobado, EsPropietario]
    serializer_class = PedidoArtesanoSerializer

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_pedido_recibido",
        summary="Consultar un pedido confirmado del taller propio",
        description="Detalle contractual del pedido confirmado destinado al taller propio "
        "aprobado. 404 si no existe o pertenece a otro taller.",
        responses={200: PedidoArtesanoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        return super().get(request, pedido_id)


# --- Cumplimiento por renglón, entregas y recepción (AUD-12) ---

TAG_CUMPLIMIENTO = "Cumplimiento"
DESCRIPCION_CUMPLIMIENTO = (
    "Estado global del pedido, avance de cada renglón (estado derivado, inicio, cantidades "
    "entregada y pendiente procedentes del ledger) y el historial de entregas con la "
    "respuesta del comprador. Comprador y artesano reciben la misma representación, sin "
    "identificadores de inventario. 404 si el pedido no existe o es ajeno."
)
REQUIERE_PAGO = (
    "Exige `Pago.estado = confirmado`, comprobado en el servidor dentro de la transacción y "
    "después de bloquear el pedido (`409 pago_no_confirmado`). "
)


def _cumplimiento(pedido) -> dict:
    return CumplimientoPedidoSerializer(vista_cumplimiento(pedido)).data


@method_decorator(never_cache, name="dispatch")
class MiCumplimientoView(APIView):
    permission_classes = [EsComprador]

    @extend_schema(
        tags=[TAG_CUMPLIMIENTO],
        operation_id="consultar_cumplimiento_de_mi_pedido",
        summary="Consultar el cumplimiento y las entregas de un pedido propio",
        description=DESCRIPCION_CUMPLIMIENTO,
        responses={200: CumplimientoPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        pedido = selectors.cumplimiento_del_comprador(request.user, pedido_id)
        if pedido is None:
            raise Http404
        return Response(_cumplimiento(pedido))


@method_decorator(never_cache, name="dispatch")
class CumplimientoRecibidoView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG_CUMPLIMIENTO],
        operation_id="consultar_cumplimiento_de_pedido_recibido",
        summary="Consultar el cumplimiento y las entregas de un pedido del taller propio",
        description=DESCRIPCION_CUMPLIMIENTO,
        responses={200: CumplimientoPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        pedido = selectors.cumplimiento_del_taller(request.user, pedido_id)
        if pedido is None:
            raise Http404
        return Response(_cumplimiento(pedido))


@method_decorator(never_cache, name="dispatch")
class IniciarLineaView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_CUMPLIMIENTO],
        operation_id="iniciar_cumplimiento_de_linea",
        summary="Iniciar la preparación, producción o personalización de un renglón",
        description="Registra el inicio del trabajo de una línea del pedido. "
        + REQUIERE_PAGO
        + "`stock`, `produccion` y `personalizacion` desde cero no tocan inventario; "
        "`personalizacion` sobre `unidad_estandar` consume en el acto toda su reserva "
        "(movimiento `consumo`). El primer inicio lleva el pedido de `confirmado` a "
        "`en_cumplimiento`. Cuerpo `{}`. Protegida por `Idempotency-Key`: huella con "
        "`pedido_id` y `linea_id`. " + idempotencia.CLAVE_INVALIDA,
        request=InicioLineaEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.parametro_repetida(200)],
        responses={
            200: CumplimientoPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                C.PEDIDO_VENCIDO, C.PEDIDO_ENTREGADO, C.PAGO_NO_CONFIRMADO, C.LINEA_YA_INICIADA
            ),
        },
    )
    def post(self, request, pedido_id: int, linea_id: int):
        clave = idempotencia.clave_de_peticion(request)
        InicioLineaEntradaSerializer(data=request.data).is_valid(raise_exception=True)
        with errores_de_cumplimiento():
            resultado = cumplimiento.iniciar_linea_idempotente(
                artesano=request.user, clave=clave, pedido_id=pedido_id, linea_id=linea_id
            )
        pedido = selectors.cumplimiento_del_taller(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _cumplimiento(pedido))


@method_decorator(never_cache, name="dispatch")
class EntregasView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_CUMPLIMIENTO],
        operation_id="registrar_entrega_de_pedido",
        summary="Registrar una entrega con cantidades por renglón",
        description="Crea una entrega numerada con su fecha declarada (no futura) y las "
        "cantidades de uno o varios renglones ya iniciados, sin superar lo pendiente de "
        "ninguno. " + REQUIERE_PAGO + "Todo o nada: ante cualquier error no se crea la "
        "entrega ni se consume inventario. Cada línea `stock` consume de su reserva lo "
        "entregado (`consumo`); producción y personalización no vuelven a consumir. Cuando "
        "todos los renglones quedan completos el pedido pasa a `entregado`. Protegida por "
        "`Idempotency-Key`: huella con `pedido_id`, `fecha` y `lineas` ordenadas por línea. "
        + idempotencia.CLAVE_INVALIDA,
        request=EntregaEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: CumplimientoPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                C.PEDIDO_VENCIDO,
                C.PEDIDO_ENTREGADO,
                C.PAGO_NO_CONFIRMADO,
                C.LINEA_NO_INICIADA,
                C.CANTIDAD_ENTREGA_EXCEDE_PENDIENTE,
            ),
        },
    )
    def post(self, request, pedido_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = EntregaEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_cumplimiento():
            resultado = cumplimiento.registrar_entrega_idempotente(
                artesano=request.user,
                clave=clave,
                pedido_id=pedido_id,
                fecha=entrada.validated_data["fecha"],
                lineas=[dict(i) for i in entrada.validated_data["lineas"]],
            )
        pedido = selectors.cumplimiento_del_taller(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _cumplimiento(pedido))


@method_decorator(never_cache, name="dispatch")
class RecepcionEntregaView(APIView):
    permission_classes = [EsComprador]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_CUMPLIMIENTO],
        operation_id="registrar_recepcion_de_entrega",
        summary="Confirmar la recepción o registrar una discrepancia de una entrega",
        description="Evidencia del comprador, una sola por entrega (`409 "
        "recepcion_ya_registrada`). `confirmada` sin motivo; `discrepancia` con motivo "
        "obligatorio (1–1000 caracteres tras recortar). No revierte la entrega, no repone "
        "inventario ni cambia el estado del pedido, y se admite aunque el pedido ya esté "
        "`entregado`. Protegida por `Idempotency-Key`: huella con `pedido_id`, "
        "`entrega_id`, `resultado` y `motivo` recortado. " + idempotencia.CLAVE_INVALIDA,
        request=RecepcionEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: CumplimientoPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(C.PAGO_NO_CONFIRMADO, C.RECEPCION_YA_REGISTRADA),
        },
    )
    def post(self, request, pedido_id: int, entrega_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = RecepcionEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_cumplimiento():
            resultado = cumplimiento.registrar_recepcion_idempotente(
                comprador=request.user,
                clave=clave,
                pedido_id=pedido_id,
                entrega_id=entrega_id,
                resultado=entrada.validated_data["resultado"],
                motivo=entrada.validated_data.get("motivo", ""),
            )
        pedido = selectors.cumplimiento_del_comprador(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _cumplimiento(pedido))
