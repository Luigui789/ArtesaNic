from django.http import Http404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsPropietario
from apps.operaciones.api import contrato as idempotencia
from apps.solicitudes.api.views import (
    ERROR_ENTRADA,
    ERRORES,
    NO_ENCONTRADO,
    PaginacionSolicitudes,
)
from apps.talleres.api.permissions import EsArtesanoAprobado

from .. import selectors, services
from ..services import CodigoConflictoInventario
from .conflictos import errores_de_dominio, respuesta_conflicto
from .serializers import (
    AjusteInventarioSerializer,
    EntradaInventarioSerializer,
    ExistenciaInicialEntradaSerializer,
    InventarioProductoSerializer,
    MovimientoInventarioSerializer,
)

TAG = "Inventario"


@method_decorator(never_cache, name="dispatch")
class MiInventarioListaView(ListModelMixin, GenericAPIView):
    permission_classes = [EsArtesanoAprobado, EsPropietario]
    serializer_class = InventarioProductoSerializer
    pagination_class = PaginacionSolicitudes

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return selectors.inventarios_del_taller(None).none()
        return selectors.inventarios_del_taller(self.request.user.taller)

    @extend_schema(
        tags=[TAG],
        operation_id="listar_mi_inventario",
        summary="Listar el inventario inicializado del taller propio",
        description="Existencia física, reservada y disponible de los productos con inventario "
        "inicializado del taller propio aprobado (RF-022, RN-021).",
        responses={200: InventarioProductoSerializer(many=True), **ERRORES},
    )
    def get(self, request):
        return self.list(request)


@method_decorator(never_cache, name="dispatch")
class InventarioProductoView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_inventario_de_producto",
        summary="Consultar existencias y disponibilidad de un producto propio",
        description="Devuelve existencia física, cantidad reservada y disponibilidad de un "
        "producto del taller propio aprobado. 404 si el producto es ajeno, no existe o aún "
        "no tiene existencia inicial registrada.",
        responses={200: InventarioProductoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, producto_id: int):
        inventario = selectors.inventario_de_producto_del_taller(request.user.taller, producto_id)
        if inventario is None:
            raise Http404
        return Response(InventarioProductoSerializer(inventario).data)


@method_decorator(never_cache, name="dispatch")
class ExistenciaInicialView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG],
        operation_id="establecer_inventario_inicial",
        summary="Registrar la existencia inicial de un producto propio",
        description="Inicializa por única vez el inventario del producto (cantidad ≥ 0) y "
        "registra el movimiento `existencia_inicial` en la misma transacción. Una segunda "
        "inicialización con otra clave responde `409 inventario_ya_inicializado`. Protegida "
        "por `Idempotency-Key` (AUD-08). " + idempotencia.CLAVE_INVALIDA,
        request=ExistenciaInicialEntradaSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.PARAMETRO_REPETIDA],
        responses={
            201: InventarioProductoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(CodigoConflictoInventario.INVENTARIO_YA_INICIALIZADO),
        },
    )
    def post(self, request, producto_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = ExistenciaInicialEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.establecer_inventario_inicial_idempotente(
                artesano=request.user,
                clave=clave,
                producto_id=producto_id,
                **entrada.validated_data,
            )
        inventario = selectors.inventario_de_producto_del_taller(request.user.taller, producto_id)
        return idempotencia.respuesta_idempotente(
            resultado, InventarioProductoSerializer(inventario).data
        )


@method_decorator(never_cache, name="dispatch")
class EntradaInventarioView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG],
        operation_id="registrar_entrada_inventario",
        summary="Registrar una entrada de inventario en un producto propio",
        description="Incrementa la existencia física (cantidad ≥ 1) y registra el movimiento "
        "`entrada` en la misma transacción. Exige inventario previamente inicializado "
        "(`409 inventario_no_inicializado`). Protegida por `Idempotency-Key` (AUD-08). "
        + idempotencia.CLAVE_INVALIDA,
        request=EntradaInventarioSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.parametro_repetida(200)],
        responses={
            200: InventarioProductoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(CodigoConflictoInventario.INVENTARIO_NO_INICIALIZADO),
        },
    )
    def post(self, request, producto_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = EntradaInventarioSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.registrar_entrada_idempotente(
                artesano=request.user,
                clave=clave,
                producto_id=producto_id,
                **entrada.validated_data,
            )
        inventario = selectors.inventario_de_producto_del_taller(request.user.taller, producto_id)
        return idempotencia.respuesta_idempotente(
            resultado, InventarioProductoSerializer(inventario).data
        )


@method_decorator(never_cache, name="dispatch")
class AjusteInventarioView(APIView):
    permission_classes = [EsArtesanoAprobado]

    @extend_schema(
        tags=[TAG],
        operation_id="ajustar_inventario",
        summary="Ajustar la existencia física de un producto propio con motivo",
        description="Registra un ajuste positivo (`delta > 0`) o negativo (`delta < 0`) con "
        "motivo obligatorio (RF-022, RN-021). Nunca reduce la existencia física por debajo "
        "de la cantidad reservada ni de cero (`409 ajuste_bajo_comprometido`). Exige "
        "inventario inicializado (`409 inventario_no_inicializado`). Protegida por "
        "`Idempotency-Key` (AUD-08). " + idempotencia.CLAVE_INVALIDA,
        request=AjusteInventarioSerializer,
        parameters=[idempotencia.PARAMETRO_CLAVE, idempotencia.parametro_repetida(200)],
        responses={
            200: InventarioProductoSerializer,
            400: ERROR_ENTRADA,
            **ERRORES,
            404: NO_ENCONTRADO,
            409: respuesta_conflicto(
                CodigoConflictoInventario.INVENTARIO_NO_INICIALIZADO,
                CodigoConflictoInventario.AJUSTE_BAJO_COMPROMETIDO,
            ),
        },
    )
    def post(self, request, producto_id: int):
        clave = idempotencia.clave_de_peticion(request)
        entrada = AjusteInventarioSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        with errores_de_dominio():
            resultado = services.ajustar_inventario_idempotente(
                artesano=request.user,
                clave=clave,
                producto_id=producto_id,
                **entrada.validated_data,
            )
        inventario = selectors.inventario_de_producto_del_taller(request.user.taller, producto_id)
        return idempotencia.respuesta_idempotente(
            resultado, InventarioProductoSerializer(inventario).data
        )


@method_decorator(never_cache, name="dispatch")
class MovimientosProductoView(ListModelMixin, GenericAPIView):
    permission_classes = [EsArtesanoAprobado]
    serializer_class = MovimientoInventarioSerializer
    pagination_class = PaginacionSolicitudes

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return selectors.movimientos_de_producto_del_taller(None, 0).none()
        taller = self.request.user.taller
        producto_id = self.kwargs["producto_id"]
        if not selectors.producto_pertenece_al_taller(taller, producto_id):
            raise Http404
        return selectors.movimientos_de_producto_del_taller(taller, producto_id)

    @extend_schema(
        tags=[TAG],
        operation_id="listar_movimientos_de_producto",
        summary="Consultar el historial de movimientos de un producto propio",
        description="Historial append-only de movimientos del producto del taller propio "
        "(RF-023, RN-021), del más reciente al más antiguo (`-creado_en, -id`). 404 si el "
        "producto es ajeno o no existe.",
        responses={200: MovimientoInventarioSerializer(many=True), **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, producto_id: int):
        return self.list(request)
