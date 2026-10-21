from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsComprador, EsPropietario
from apps.accounts.api.serializers import ErrorSerializer
from apps.talleres.api.permissions import EsArtesanoAprobado

from .. import selectors, services
from .serializers import (
    SolicitudArtesanoSerializer,
    SolicitudCompradorSerializer,
    SolicitudEntradaSerializer,
)

TAG = "Solicitudes"
NO_AUTENTICADO = OpenApiResponse(ErrorSerializer, description="Sin token o sesión no válida.")
NO_PERMITIDO = OpenApiResponse(
    ErrorSerializer, description="Rol incorrecto, o taller del artesano no aprobado."
)
NO_ENCONTRADO = OpenApiResponse(
    ErrorSerializer, description="No existe o no pertenece a esta parte."
)
ERROR_ENTRADA = OpenApiResponse(
    response={"type": "object", "additionalProperties": {}},
    description="Errores por campo; renglones contiene errores por posición, en orden. "
    "La solicitud completa se rechaza sin persistencia parcial.",
)
ERRORES = {401: NO_AUTENTICADO, 403: NO_PERMITIDO}


class PaginacionSolicitudes(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48

    def get_paginated_response_schema(self, schema):
        esquema = super().get_paginated_response_schema(schema)
        esquema["required"] = ["count", "next", "previous", "results"]
        return esquema


@method_decorator(never_cache, name="dispatch")
class CrearSolicitudView(APIView):
    permission_classes = [EsComprador]

    @extend_schema(
        tags=[TAG],
        operation_id="crear_solicitud",
        summary="Enviar una solicitud de un taller",
        description="Comprador derivado del token; taller derivado de los productos publicados "
        "de un taller aprobado. Stock requiere cantidad; producción también fecha solicitada; "
        "personalización también características y origen. No confirma pedido, congela precio "
        "ni reserva inventario. La protección servidor ante reintentos queda para AUD-08.",
        request=SolicitudEntradaSerializer,
        responses={201: SolicitudCompradorSerializer, 400: ERROR_ENTRADA, **ERRORES},
    )
    def post(self, request):
        entrada = SolicitudEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            solicitud = services.crear_solicitud(comprador=request.user, **entrada.validated_data)
        except services.SolicitudInvalida as exc:
            raise exceptions.ValidationError(exc.errores) from None
        except services.CompradorNoValido:
            raise exceptions.PermissionDenied() from None
        solicitud = selectors.solicitudes_con_renglones().get(pk=solicitud.pk)
        return Response(
            SolicitudCompradorSerializer(solicitud).data, status=status.HTTP_201_CREATED
        )


class _LecturaMixin:
    recibidas = False

    def get_queryset(self):
        consultas = selectors.solicitudes_con_renglones()
        if getattr(self, "swagger_fake_view", False):
            return consultas.none()
        if self.recibidas:
            return consultas.del_taller(self.request.user.taller)
        return consultas.del_comprador(self.request.user)


@method_decorator(never_cache, name="dispatch")
class MisSolicitudesView(_LecturaMixin, ListModelMixin, GenericAPIView):
    permission_classes = [EsComprador, EsPropietario]
    serializer_class = SolicitudCompradorSerializer
    pagination_class = PaginacionSolicitudes

    @extend_schema(
        tags=[TAG],
        operation_id="listar_mis_solicitudes",
        summary="Listar las solicitudes propias",
        responses={200: SolicitudCompradorSerializer(many=True), **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request):
        return self.list(request)


@method_decorator(never_cache, name="dispatch")
class SolicitudesRecibidasView(_LecturaMixin, ListModelMixin, GenericAPIView):
    recibidas = True
    permission_classes = [EsArtesanoAprobado, EsPropietario]
    serializer_class = SolicitudArtesanoSerializer
    pagination_class = PaginacionSolicitudes

    @extend_schema(
        tags=[TAG],
        operation_id="listar_solicitudes_recibidas",
        summary="Listar solicitudes del taller propio aprobado",
        responses={200: SolicitudArtesanoSerializer(many=True), **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request):
        return self.list(request)


class _DetalleView(_LecturaMixin, GenericAPIView):
    def get(self, request, solicitud_id: int):
        solicitud = get_object_or_404(self.get_queryset(), pk=solicitud_id)
        self.check_object_permissions(request, solicitud)
        return Response(self.get_serializer(solicitud).data)


@method_decorator(never_cache, name="dispatch")
class MiSolicitudView(_DetalleView):
    permission_classes = [EsComprador, EsPropietario]
    serializer_class = SolicitudCompradorSerializer

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_mi_solicitud",
        summary="Consultar una solicitud propia",
        responses={200: SolicitudCompradorSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, solicitud_id: int):
        return super().get(request, solicitud_id)


@method_decorator(never_cache, name="dispatch")
class SolicitudRecibidaView(_DetalleView):
    recibidas = True
    permission_classes = [EsArtesanoAprobado, EsPropietario]
    serializer_class = SolicitudArtesanoSerializer

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_solicitud_recibida",
        summary="Consultar una solicitud destinada al taller propio",
        responses={200: SolicitudArtesanoSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def get(self, request, solicitud_id: int):
        return super().get(request, solicitud_id)
