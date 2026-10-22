from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response

from apps.accounts.api.permissions import EsComprador, EsPropietario
from apps.solicitudes.api.views import ERRORES, NO_ENCONTRADO, PaginacionSolicitudes
from apps.talleres.api.permissions import EsArtesanoAprobado

from .. import selectors
from .serializers import PedidoArtesanoSerializer, PedidoCompradorSerializer

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
