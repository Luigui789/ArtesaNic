"""Endpoints del catálogo: categorías y catálogo público (RF-003) y productos propios del
artesano aprobado (RF-001, RF-017, RF-019). Contrato: docs/api/catalogo.md.

No hay PUT ni DELETE: la edición es parcial y despublicar conserva el producto (RN-003).
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.generics import GenericAPIView
from rest_framework.mixins import ListModelMixin
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsPropietario
from apps.accounts.api.serializers import ErrorSerializer
from apps.accounts.api.views import RESPUESTA_400
from apps.talleres.api.permissions import MENSAJE_TALLER_NO_APROBADO, EsArtesanoAprobado

from .. import services
from ..models import Categoria, Producto
from .serializers import (
    CategoriaSerializer,
    FiltrosCatalogoSerializer,
    ProductoEntradaSerializer,
    ProductoPropioSerializer,
    ProductoPublicoSerializer,
)

TAG_CATALOGO = "Catálogo"
TAG_GESTION = "Productos propios"

RESPUESTA_401 = OpenApiResponse(ErrorSerializer, description="Sin token o token no válido.")
RESPUESTA_403 = OpenApiResponse(
    ErrorSerializer,
    description="La cuenta no es de artesano o su taller no está aprobado (RN-002).",
)
RESPUESTA_404_PROPIO = OpenApiResponse(
    ErrorSerializer, description="No existe o pertenece a otro taller."
)


class PaginacionCatalogo(PageNumberPagination):
    """Paginación de los listados de productos: ``page`` y ``page_size`` (por defecto 12).

    Las vistas que la usan son ``ListModelMixin``: drf-spectacular documenta entonces la
    respuesta real de DRF (``count``, ``next``, ``previous`` y ``results``).
    """

    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48

    def get_paginated_response_schema(self, schema):
        """La respuesta siempre trae las cuatro claves; ``next`` y ``previous`` pueden ser null."""
        esquema = super().get_paginated_response_schema(schema)
        esquema["required"] = ["count", "next", "previous", "results"]
        propiedades = esquema["properties"]
        propiedades["count"]["example"] = 30
        propiedades["next"]["example"] = "https://host/api/v1/productos/?page=3&page_size=12"
        propiedades["previous"]["example"] = "https://host/api/v1/productos/?page=1&page_size=12"
        return esquema

    def get_schema_operation_parameters(self, view):
        parametros = super().get_schema_operation_parameters(view)
        for parametro in parametros:
            if parametro["name"] == self.page_query_param:
                parametro["description"] = (
                    "Número de página, desde 1. Una página inexistente responde 404."
                )
                parametro["schema"] |= {"minimum": 1, "default": 1}
            elif parametro["name"] == self.page_size_query_param:
                parametro["description"] = (
                    f"Resultados por página: {self.page_size} por defecto, "
                    f"{self.max_page_size} como máximo."
                )
                parametro["schema"] |= {
                    "minimum": 1,
                    "maximum": self.max_page_size,
                    "default": self.page_size,
                }
        return parametros


class _VistaPublica(APIView):
    # Lectura anónima: un token caducado en la petición no debe impedirla.
    authentication_classes = []
    permission_classes = [AllowAny]


def _a_error_de_validacion(exc: DjangoValidationError) -> exceptions.ValidationError:
    return exceptions.ValidationError(exc.message_dict)


def _sin_habilitacion() -> exceptions.PermissionDenied:
    return exceptions.PermissionDenied(MENSAJE_TALLER_NO_APROBADO)


class CategoriasView(_VistaPublica):
    @extend_schema(
        tags=[TAG_CATALOGO],
        operation_id="listar_categorias",
        summary="Listar las categorías",
        description="Colección completa, por nombre y sin paginar.",
        auth=[],
        responses={200: CategoriaSerializer(many=True)},
    )
    def get(self, request):
        return Response(CategoriaSerializer(Categoria.objects.all(), many=True).data)


class CatalogoView(ListModelMixin, GenericAPIView):
    # Lectura anónima: un token caducado en la petición no debe impedirla.
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = ProductoPublicoSerializer
    pagination_class = PaginacionCatalogo

    def get_queryset(self):
        """Filtros, búsqueda y orden en PostgreSQL; un parámetro inválido responde 400."""
        filtros = FiltrosCatalogoSerializer(data=self.request.query_params)
        filtros.is_valid(raise_exception=True)
        datos = filtros.validated_data
        productos = Producto.objects.catalogo().select_related("taller", "categoria", "inventario")
        if q := datos.get("q", "").strip():
            productos = productos.filter(nombre__icontains=q)
        if categoria := datos.get("categoria"):
            productos = productos.filter(categoria__codigo=categoria)
        if "precio_min" in datos:
            productos = productos.filter(precio__gte=datos["precio_min"])
        if "precio_max" in datos:
            productos = productos.filter(precio__lte=datos["precio_max"])
        if "taller" in datos:
            productos = productos.filter(taller_id=datos["taller"])
        return productos.order_by(*FiltrosCatalogoSerializer.ORDENES[datos["orden"]])

    @extend_schema(
        tags=[TAG_CATALOGO],
        operation_id="listar_catalogo",
        summary="Consultar el catálogo público",
        description="Productos publicados de talleres aprobados, paginados. Búsqueda por "
        "nombre; filtros por categoría, rango de precio y taller; orden por fecha, precio o "
        "nombre. Un parámetro con formato inválido responde 400.",
        auth=[],
        parameters=[FiltrosCatalogoSerializer],
        responses={200: ProductoPublicoSerializer(many=True), 400: RESPUESTA_400},
    )
    def get(self, request):
        return self.list(request)


class ProductoPublicoView(_VistaPublica):
    @extend_schema(
        tags=[TAG_CATALOGO],
        operation_id="consultar_producto",
        summary="Consultar un producto del catálogo",
        auth=[],
        responses={
            200: ProductoPublicoSerializer,
            404: OpenApiResponse(
                ErrorSerializer,
                description="No existe, no está publicado o su taller no está aprobado.",
            ),
        },
    )
    def get(self, request, producto_id: int):
        producto = get_object_or_404(
            Producto.objects.catalogo().select_related("taller", "categoria", "inventario"),
            pk=producto_id,
        )
        return Response(ProductoPublicoSerializer(producto).data)


class _GestionMixin:
    """Productos del taller del artesano autenticado y aprobado.

    El taller sale de la identidad: el queryset se limita a él y ``EsPropietario``
    lo comprueba de nuevo por objeto. Un producto ajeno responde 404, como uno inexistente.
    """

    permission_classes = [EsArtesanoAprobado, EsPropietario]
    parser_classes = [JSONParser, MultiPartParser]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            # drf-spectacular inspecciona la vista sin una petición autenticada.
            return Producto.objects.none()
        return Producto.objects.del_taller(self.request.user.taller).select_related(
            "taller", "categoria", "moderacion"
        )

    def get_object(self, producto_id: int) -> Producto:
        producto = get_object_or_404(self.get_queryset(), pk=producto_id)
        self.check_object_permissions(self.request, producto)
        return producto


class _GestionView(_GestionMixin, APIView):
    pass


@method_decorator(never_cache, name="dispatch")
class MisProductosView(_GestionMixin, ListModelMixin, GenericAPIView):
    serializer_class = ProductoPropioSerializer
    pagination_class = PaginacionCatalogo

    def filter_queryset(self, queryset):
        return queryset.order_by("-creado_en", "-id")

    @extend_schema(
        tags=[TAG_GESTION],
        operation_id="listar_mis_productos",
        summary="Listar los productos del taller propio",
        description="Publicados, despublicados y moderados, del más reciente al más antiguo, "
        "paginados. El taller se deriva del token.",
        responses={
            200: ProductoPropioSerializer(many=True),
            401: RESPUESTA_401,
            403: RESPUESTA_403,
        },
    )
    def get(self, request):
        return self.list(request)

    @extend_schema(
        tags=[TAG_GESTION],
        operation_id="crear_producto",
        summary="Registrar un producto en el taller propio",
        description="Crea el producto sin publicar; se publica con la acción publicar. Todos "
        "los campos son obligatorios. Taller, publicación y cualquier otro campo se rechazan "
        "con 400. Fotografía opcional JPEG/PNG/WebP de hasta 5 MiB; publicar la exige.",
        request=ProductoEntradaSerializer,
        responses={
            201: ProductoPropioSerializer,
            400: RESPUESTA_400,
            401: RESPUESTA_401,
            403: RESPUESTA_403,
        },
    )
    def post(self, request):
        entrada = ProductoEntradaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            producto = services.crear_producto(
                request.user.taller, **entrada.validated_data_del_modelo()
            )
        except services.TallerNoHabilitado:
            raise _sin_habilitacion() from None
        except DjangoValidationError as exc:
            raise _a_error_de_validacion(exc) from None
        return Response(ProductoPropioSerializer(producto).data, status=status.HTTP_201_CREATED)


@method_decorator(never_cache, name="dispatch")
class MiProductoView(_GestionView):
    @extend_schema(
        tags=[TAG_GESTION],
        operation_id="consultar_mi_producto",
        summary="Consultar un producto del taller propio",
        responses={
            200: ProductoPropioSerializer,
            401: RESPUESTA_401,
            403: RESPUESTA_403,
            404: RESPUESTA_404_PROPIO,
        },
    )
    def get(self, request, producto_id: int):
        return Response(ProductoPropioSerializer(self.get_object(producto_id)).data)

    @extend_schema(
        tags=[TAG_GESTION],
        operation_id="actualizar_mi_producto",
        summary="Editar un producto del taller propio",
        description="Modifica solo los campos enviados. `modalidades` reemplaza la lista "
        "completa. No cambia taller, publicación ni fecha de alta: enviarlos responde 400. "
        "Editar no altera pedidos confirmados, que conservarán sus propios datos (RN-003).",
        request=ProductoEntradaSerializer(partial=True),
        responses={
            200: ProductoPropioSerializer,
            400: RESPUESTA_400,
            401: RESPUESTA_401,
            403: RESPUESTA_403,
            404: RESPUESTA_404_PROPIO,
        },
    )
    def patch(self, request, producto_id: int):
        producto = self.get_object(producto_id)
        entrada = ProductoEntradaSerializer(data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        try:
            producto = services.actualizar_producto(producto, **entrada.validated_data_del_modelo())
        except services.TallerNoHabilitado:
            raise _sin_habilitacion() from None
        except DjangoValidationError as exc:
            raise _a_error_de_validacion(exc) from None
        return Response(ProductoPropioSerializer(producto).data)


class _PublicacionView(_GestionView):
    publicado: bool

    def post(self, request, producto_id: int):
        producto = self.get_object(producto_id)
        operacion = services.publicar_producto if self.publicado else services.despublicar_producto
        try:
            operacion(producto)
        except services.TallerNoHabilitado:
            raise _sin_habilitacion() from None
        except services.ProductoModerado:
            return Response(
                {
                    "codigo": "producto_moderado",
                    "detail": "Este producto fue retirado por moderación y no puede publicarse.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        except services.ProductoSinFotografia:
            return Response(
                {
                    "codigo": "producto_sin_fotografia",
                    "detail": "Agrega una fotografía principal válida antes de publicar.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(ProductoPropioSerializer(producto).data)


_RESPUESTAS_PUBLICACION = {
    409: OpenApiResponse(
        ErrorSerializer,
        description="producto_sin_fotografia: falta fotografía. producto_moderado: retirado "
        "por moderación administrativa, no puede volver a publicarse.",
    ),
    200: ProductoPropioSerializer,
    401: RESPUESTA_401,
    403: RESPUESTA_403,
    404: RESPUESTA_404_PROPIO,
}


@method_decorator(never_cache, name="dispatch")
class PublicarView(_PublicacionView):
    publicado = True

    @extend_schema(
        tags=[TAG_GESTION],
        operation_id="publicar_mi_producto",
        summary="Publicar un producto del taller propio",
        description="Lo muestra en el catálogo público. Idempotente: publicar un producto ya "
        "publicado responde 200 sin cambios. Un producto retirado por moderación responde "
        "409 producto_moderado y no cambia. Sin cuerpo.",
        request=None,
        responses=_RESPUESTAS_PUBLICACION,
    )
    def post(self, request, producto_id: int):
        return super().post(request, producto_id)


@method_decorator(never_cache, name="dispatch")
class DespublicarView(_PublicacionView):
    publicado = False

    @extend_schema(
        tags=[TAG_GESTION],
        operation_id="despublicar_mi_producto",
        summary="Despublicar un producto del taller propio",
        description="Lo retira del catálogo público y de nuevas solicitudes sin borrarlo "
        "(RF-019). Idempotente; también permitido si el producto está moderado, sin levantar "
        "la moderación. Sin cuerpo.",
        request=None,
        responses=_RESPUESTAS_PUBLICACION,
    )
    def post(self, request, producto_id: int):
        return super().post(request, producto_id)
