from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ROLES_PUBLICOS
from apps.solicitudes.api.views import ERRORES, NO_ENCONTRADO

from ..models import Notificacion
from ..services import marcar_leida, marcar_todas
from .serializers import NotificacionSerializer, ResultadoMarcarTodasSerializer, ResumenSerializer


class EsCuentaPublica(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.rol in ROLES_PUBLICOS
        )


class Paginacion(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


@extend_schema_view(
    get=extend_schema(
        tags=["Notificaciones"], responses={200: NotificacionSerializer(many=True), **ERRORES}
    )
)
@method_decorator(never_cache, name="dispatch")
class Lista(generics.ListAPIView):
    permission_classes = [EsCuentaPublica]
    serializer_class = NotificacionSerializer
    pagination_class = Paginacion

    def get_queryset(self):
        return Notificacion.objects.filter(destinatario=self.request.user)


@method_decorator(never_cache, name="dispatch")
class Resumen(APIView):
    permission_classes = [EsCuentaPublica]

    @extend_schema(tags=["Notificaciones"], responses={200: ResumenSerializer, **ERRORES})
    def get(self, request):
        return Response(
            {
                "no_leidas": Notificacion.objects.filter(
                    destinatario=request.user, leida_en__isnull=True
                ).count()
            }
        )


@method_decorator(never_cache, name="dispatch")
class Leer(APIView):
    permission_classes = [EsCuentaPublica]

    @extend_schema(
        tags=["Notificaciones"],
        request=None,
        responses={200: NotificacionSerializer, **ERRORES, 404: NO_ENCONTRADO},
    )
    def post(self, request, notificacion_id):
        aviso = marcar_leida(destinatario_id=request.user.pk, notificacion_id=notificacion_id)
        if aviso is None:
            raise NotFound()
        return Response(NotificacionSerializer(aviso).data)


@method_decorator(never_cache, name="dispatch")
class LeerTodas(APIView):
    permission_classes = [EsCuentaPublica]

    @extend_schema(
        tags=["Notificaciones"],
        request=None,
        responses={200: ResultadoMarcarTodasSerializer, **ERRORES},
    )
    def post(self, request):
        actualizadas = marcar_todas(destinatario_id=request.user.pk)
        no_leidas = Notificacion.objects.filter(
            destinatario=request.user, leida_en__isnull=True
        ).count()
        return Response({"actualizadas": actualizadas, "no_leidas": no_leidas})
