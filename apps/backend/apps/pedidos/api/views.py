"""API REST de pedidos confirmados (AUD-07), su cumplimiento por renglón (AUD-12) y su
resolución: cancelación, cierre parcial, reembolso y clasificación (AUD-13)."""

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

from .. import clasificacion, cumplimiento, reembolsos, resolucion, selectors
from ..cumplimiento import CodigoConflictoCumplimiento as C
from ..errores import CodigoConflictoResolucion as R
from .conflictos import (
    errores_de_cumplimiento,
    errores_de_resolucion,
    respuesta_conflicto,
    respuesta_conflicto_resolucion,
)
from .serializers import (
    CancelacionEntradaSerializer,
    CierreEntradaSerializer,
    ClasificacionesEntradaSerializer,
    ClasificacionesPedidoSerializer,
    CumplimientoPedidoSerializer,
    DevolucionEntradaSerializer,
    EntregaEntradaSerializer,
    InicioLineaEntradaSerializer,
    PedidoArtesanoSerializer,
    PedidoCompradorSerializer,
    RecepcionEntradaSerializer,
    ResolucionPedidoSerializer,
    RespuestaCierreEntradaSerializer,
    vista_clasificaciones,
    vista_cumplimiento,
    vista_resolucion,
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
                C.PEDIDO_VENCIDO,
                C.PEDIDO_ENTREGADO,
                C.PEDIDO_FINALIZADO,
                C.PAGO_NO_CONFIRMADO,
                C.CIERRE_PARCIAL_PENDIENTE,
                C.LINEA_YA_INICIADA,
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
                C.PEDIDO_FINALIZADO,
                C.PAGO_NO_CONFIRMADO,
                C.CIERRE_PARCIAL_PENDIENTE,
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


# --- Resolución: cancelación, cierre parcial, reembolso y clasificación (AUD-13) ---

TAG_RESOLUCION = "Resolución de pedidos"
DESCRIPCION_RESOLUCION = (
    "Cancelación del taller, propuestas de cierre parcial con su snapshot congelado "
    "(cantidades e importes calculados por el servidor) y la obligación de reembolso con su "
    "estado derivado (`pendiente` o `realizado`). Comprador y artesano reciben la misma "
    "información comercial, sin datos internos de inventario. `acciones` y "
    "`estimacion_cierre` anuncian lo que el artesano puede hacer ahora con las mismas reglas "
    "del servidor. 404 si el pedido no existe o es ajeno."
)


def _resolucion(pedido) -> dict:
    return ResolucionPedidoSerializer(vista_resolucion(pedido)).data


@method_decorator(never_cache, name="dispatch")
class MiResolucionView(APIView):
    permission_classes = [EsComprador]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="consultar_resolucion_de_mi_pedido",
        summary="Consultar cancelación, cierres parciales y reembolso de un pedido propio",
        description=DESCRIPCION_RESOLUCION,
        responses={200: ResolucionPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        pedido = selectors.resolucion_del_comprador(request.user, pedido_id)
        if pedido is None:
            raise Http404
        return Response(_resolucion(pedido))


@method_decorator(never_cache, name="dispatch")
class ResolucionRecibidaView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="consultar_resolucion_de_pedido_recibido",
        summary="Consultar cancelación, cierres parciales y reembolso de un pedido del taller",
        description=DESCRIPCION_RESOLUCION,
        responses={200: ResolucionPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        pedido = selectors.resolucion_del_taller(request.user, pedido_id)
        if pedido is None:
            raise Http404
        return Response(_resolucion(pedido))


@method_decorator(never_cache, name="dispatch")
class CancelacionView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="cancelar_pedido_recibido",
        summary="Cancelar el pedido por imposibilidad justificada (antes de cualquier entrega)",
        description="Solo desde `confirmado` o `en_cumplimiento` y sin ninguna entrega "
        "(`409 cancelacion_requiere_sin_entregas`; la vía es el cierre parcial). Con un pago "
        "`registrado` u `observado` sin resolver responde `409 pago_pendiente_de_resolucion`. "
        "En una transacción: cancelación, liberación del remanente no manipulado de las "
        "reservas, obligaciones de clasificación por las unidades estándar consumidas, "
        "reembolso total (`Pedido.total`) si el pago está confirmado y estado "
        "`cancelado_artesano`. Protegida por `Idempotency-Key`: huella con `pedido_id` y "
        "`motivo` recortado. " + idempotencia.CLAVE_INVALIDA,
        request=CancelacionEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: ResolucionPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto_resolucion(
                R.PEDIDO_VENCIDO,
                R.PEDIDO_FINALIZADO,
                R.CANCELACION_REQUIERE_SIN_ENTREGAS,
                R.PAGO_PENDIENTE_DE_RESOLUCION,
            ),
        },
    )
    def post(self, request, pedido_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = CancelacionEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_resolucion():
            resultado = resolucion.cancelar_pedido_idempotente(
                artesano=request.user,
                clave=clave,
                pedido_id=pedido_id,
                motivo=entrada.validated_data["motivo"],
            )
        pedido = selectors.resolucion_del_taller(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _resolucion(pedido))


@method_decorator(never_cache, name="dispatch")
class CierresParcialesView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="proponer_cierre_parcial",
        summary="Proponer el cierre parcial de un pedido con entregas parciales",
        description="Requiere al menos una unidad entregada y otra pendiente "
        "(`409 cierre_requiere_entrega_parcial`) y ninguna propuesta pendiente "
        "(`409 cierre_parcial_pendiente`). El servidor congela, por renglón, las cantidades "
        "del ledger de entregas y el importe a reembolsar; el cliente solo envía el motivo. "
        "No toca inventario ni el estado del pedido: mientras espera la respuesta del "
        "comprador, iniciar y entregar responden `409 cierre_parcial_pendiente`. Protegida "
        "por `Idempotency-Key`: huella con `pedido_id` y `motivo` recortado. "
        + idempotencia.CLAVE_INVALIDA,
        request=CierreEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: ResolucionPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto_resolucion(
                R.PEDIDO_VENCIDO,
                R.PEDIDO_FINALIZADO,
                R.CIERRE_PARCIAL_PENDIENTE,
                R.CIERRE_REQUIERE_ENTREGA_PARCIAL,
            ),
        },
    )
    def post(self, request, pedido_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = CierreEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_resolucion():
            resultado = resolucion.proponer_cierre_parcial_idempotente(
                artesano=request.user,
                clave=clave,
                pedido_id=pedido_id,
                motivo=entrada.validated_data["motivo"],
            )
        pedido = selectors.resolucion_del_taller(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _resolucion(pedido))


@method_decorator(never_cache, name="dispatch")
class RespuestaCierreView(APIView):
    permission_classes = [EsComprador]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="responder_cierre_parcial",
        summary="Aceptar u objetar la propuesta de cierre parcial",
        description="Una sola respuesta por propuesta (`409 cierre_ya_resuelto`). "
        "`aceptado` (sin motivo) finaliza el pedido como `cerrado_parcial` en una "
        "transacción: libera el remanente no manipulado de las reservas, crea las "
        "obligaciones de clasificación y el reembolso parcial congelado. `objetado` (motivo "
        "obligatorio, 1–1000 caracteres) no tiene efectos laterales: el pedido sigue "
        "`en_cumplimiento` y el artesano puede seguir entregando o proponer otro cierre. "
        "Protegida por `Idempotency-Key`: huella con `pedido_id`, `cierre_id`, `decision` y "
        "`motivo` recortado. " + idempotencia.CLAVE_INVALIDA,
        request=RespuestaCierreEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: ResolucionPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto_resolucion(
                R.CIERRE_YA_RESUELTO, R.PEDIDO_VENCIDO, R.PEDIDO_FINALIZADO
            ),
        },
    )
    def post(self, request, pedido_id: int, cierre_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = RespuestaCierreEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_resolucion():
            resultado = resolucion.responder_cierre_parcial_idempotente(
                comprador=request.user,
                clave=clave,
                pedido_id=pedido_id,
                cierre_id=cierre_id,
                decision=entrada.validated_data["decision"],
                motivo=entrada.validated_data.get("motivo", ""),
            )
        pedido = selectors.resolucion_del_comprador(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _resolucion(pedido))


@method_decorator(never_cache, name="dispatch")
class RealizacionReembolsoView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="registrar_devolucion_de_reembolso",
        summary="Registrar la devolución externa del reembolso",
        description="El taller declara fecha (no futura) y referencia de la devolución hecha "
        "fuera de la plataforma; el importe se copia de la obligación (`monto`, `moneda` y "
        "`estado` en el cuerpo responden `400`). El reembolso pasa a `realizado`; no se "
        "edita ni se vuelve a registrar (`409 reembolso_ya_realizado`). 404 si el pedido no "
        "tiene reembolso. Protegida por `Idempotency-Key`: huella con `pedido_id`, "
        "`reembolso_id`, `fecha` y `referencia` recortada. " + idempotencia.CLAVE_INVALIDA,
        request=DevolucionEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: ResolucionPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto_resolucion(R.REEMBOLSO_YA_REALIZADO),
        },
    )
    def post(self, request, pedido_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = DevolucionEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_resolucion():
            resultado = reembolsos.registrar_devolucion_idempotente(
                artesano=request.user,
                clave=clave,
                pedido_id=pedido_id,
                fecha=entrada.validated_data["fecha"],
                referencia=entrada.validated_data["referencia"],
            )
        pedido = selectors.resolucion_del_taller(request.user, pedido_id)
        return idempotencia.respuesta_idempotente(resultado, _resolucion(pedido))


def _clasificaciones(artesano, pedido_id: int) -> dict:
    pedido, obligaciones = selectors.clasificaciones_del_taller(artesano, pedido_id)
    if pedido is None:
        raise Http404
    return ClasificacionesPedidoSerializer(vista_clasificaciones(pedido, obligaciones)).data


@method_decorator(never_cache, name="dispatch")
class ClasificacionesView(APIView):
    permission_classes = [EsArtesanoAprobado]
    parser_classes = [JSONParser]

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="consultar_clasificaciones_de_pedido",
        summary="Consultar las unidades por clasificar de un pedido finalizado",
        description="Obligaciones creadas al cancelar o cerrar parcialmente: unidades "
        "estándar consumidas y no entregadas, con lo ya clasificado y su historial. Solo "
        "para el taller propietario; el comprador no ve la clasificación interna.",
        responses={200: ClasificacionesPedidoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, pedido_id: int):
        return Response(_clasificaciones(request.user, pedido_id))

    @extend_schema(
        tags=[TAG_RESOLUCION],
        operation_id="clasificar_inventario_de_pedido",
        summary="Clasificar unidades manipuladas como reutilizables o baja",
        description="Todo o nada. `reutilizable` reincorpora a la existencia física "
        "(movimiento `reincorporacion`); `baja` registra la disposición final sin volver a "
        "descontar existencia (movimiento `baja`). Motivo obligatorio en ambos. La suma "
        "clasificada nunca supera la obligación (`409 clasificacion_excede_pendiente`, con "
        "`obligaciones`); obligación ajena o repetida en la petición: `400`. Protegida por "
        "`Idempotency-Key`: huella con `pedido_id` y `clasificaciones` ordenadas por "
        "`obligacion` y `resultado`. " + idempotencia.CLAVE_INVALIDA,
        request=ClasificacionesEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: ClasificacionesPedidoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto_resolucion(R.CLASIFICACION_EXCEDE_PENDIENTE),
        },
    )
    def post(self, request, pedido_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = ClasificacionesEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_resolucion():
            resultado = clasificacion.clasificar_inventario_idempotente(
                artesano=request.user,
                clave=clave,
                pedido_id=pedido_id,
                clasificaciones=[dict(c) for c in entrada.validated_data["clasificaciones"]],
            )
        return idempotencia.respuesta_idempotente(
            resultado, _clasificaciones(request.user, pedido_id)
        )
