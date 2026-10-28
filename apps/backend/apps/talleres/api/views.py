"""Endpoints de talleres: perfil público (RF-008) y taller propio del artesano.

La aprobación no tiene endpoint: es exclusiva de Django Admin (RF-013).
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import EsArtesano, EsPropietario
from apps.accounts.api.serializers import ErrorSerializer
from apps.accounts.api.views import RESPUESTA_400

from .. import services
from ..models import Taller
from .serializers import (
    ActualizarPerfilTallerSerializer,
    TallerPropioSerializer,
    TallerPublicoSerializer,
)

TAG = "Talleres"
MENSAJE_SIN_TALLER = "Esta cuenta no tiene un taller registrado."
RESPUESTA_404_PUBLICO = OpenApiResponse(
    ErrorSerializer,
    description="No existe, o está pendiente o rechazado: solo se publican los talleres aprobados.",
)


class _VistaPublica(APIView):
    # Lectura anónima: un token caducado en la petición no debe impedirla.
    authentication_classes = []
    permission_classes = [AllowAny]


class TalleresView(_VistaPublica):
    @extend_schema(
        tags=[TAG],
        operation_id="listar_talleres",
        summary="Listar los talleres aprobados",
        description="Perfiles públicos de los talleres aprobados, por nombre. Los pendientes "
        "y los rechazados no aparecen. `ubicacion_mapa` trae la posición solo si el artesano "
        "autorizó publicarla; si no, es null.",
        auth=[],
        responses={200: TallerPublicoSerializer(many=True)},
    )
    def get(self, request):
        talleres = Taller.objects.publicos().order_by("nombre", "id")
        return Response(TallerPublicoSerializer(talleres, many=True).data)


class TallerView(_VistaPublica):
    @extend_schema(
        tags=[TAG],
        operation_id="consultar_taller",
        summary="Consultar el perfil público de un taller",
        auth=[],
        responses={200: TallerPublicoSerializer, 404: RESPUESTA_404_PUBLICO},
    )
    def get(self, request, taller_id: int):
        taller = get_object_or_404(Taller.objects.publicos(), pk=taller_id)
        return Response(TallerPublicoSerializer(taller).data)


@method_decorator(never_cache, name="dispatch")
class MiTallerView(APIView):
    permission_classes = [EsArtesano, EsPropietario]
    parser_classes = [JSONParser, MultiPartParser]

    def get_object(self) -> Taller:
        # El taller sale de la identidad autenticada; la petición no lo identifica.
        try:
            taller = Taller.objects.get(propietario=self.request.user)
        except Taller.DoesNotExist:
            raise exceptions.NotFound(MENSAJE_SIN_TALLER) from None
        self.check_object_permissions(self.request, taller)
        return taller

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_mi_taller",
        summary="Consultar el taller propio",
        description="Taller del artesano autenticado, en cualquier estado, con el resultado "
        "de su revisión. Incluye `latitud`, `longitud` y `ubicacion_publica` aunque la "
        "ubicación sea privada.",
        responses={
            200: TallerPropioSerializer,
            401: OpenApiResponse(ErrorSerializer, description="Sin token o token no válido."),
            403: OpenApiResponse(ErrorSerializer, description="La cuenta no es de artesano."),
            404: OpenApiResponse(ErrorSerializer, description=MENSAJE_SIN_TALLER),
        },
    )
    def get(self, request):
        return Response(TallerPropioSerializer(self.get_object()).data)

    @extend_schema(
        tags=[TAG],
        operation_id="actualizar_mi_taller",
        summary="Actualizar el perfil del taller propio",
        description="Modifica solo los campos enviados del perfil público (RF-008). Estado, "
        "propietario y revisión no son modificables: enviarlos responde 400. Editar el perfil "
        "no cambia el estado de aprobación. `latitud` y `longitud` van juntas: para quitar la "
        "ubicación se envían ambas en null con `ubicacion_publica` en false; no se puede "
        "publicar sin coordenadas.",
        request=ActualizarPerfilTallerSerializer(partial=True),
        responses={
            200: TallerPropioSerializer,
            400: RESPUESTA_400,
            401: OpenApiResponse(ErrorSerializer, description="Sin token o token no válido."),
            403: OpenApiResponse(ErrorSerializer, description="La cuenta no es de artesano."),
            404: OpenApiResponse(ErrorSerializer, description=MENSAJE_SIN_TALLER),
        },
    )
    def patch(self, request):
        taller = self.get_object()
        entrada = ActualizarPerfilTallerSerializer(taller, data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        try:
            taller = services.actualizar_perfil(taller, **entrada.validated_data)
        except DjangoValidationError as exc:
            raise exceptions.ValidationError(exc.message_dict) from None
        return Response(TallerPropioSerializer(taller).data)
