from django.http import Http404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.serializers import ErrorSerializer

from .. import services
from ..models import TipoOperacion
from .serializers import OperacionIdempotenteSerializer


@method_decorator(never_cache, name="dispatch")
class OperacionView(APIView):
    """Solo lectura: responde «¿se ejecutó mi operación?» tras una respuesta perdida."""

    @extend_schema(
        tags=["Operaciones"],
        operation_id="consultar_operacion",
        summary="Consultar el resultado de una operación propia",
        description="Busca por actor autenticado, tipo y clave. Solo existen operaciones "
        "completadas: una que falló o se revirtió no deja registro y responde 404, igual "
        "que una ajena o inexistente. Una operación aún en curso en otra conexión tampoco "
        "es visible: repetir la petición con la misma clave espera su resultado.",
        parameters=[
            OpenApiParameter(
                "tipo", OpenApiTypes.STR, OpenApiParameter.PATH, enum=TipoOperacion.values
            ),
            OpenApiParameter(
                "clave",
                OpenApiTypes.STR,
                OpenApiParameter.PATH,
                description="El mismo valor enviado en Idempotency-Key.",
            ),
        ],
        responses={
            200: OperacionIdempotenteSerializer,
            401: OpenApiResponse(ErrorSerializer, description="Sin token o sesión no válida."),
            404: OpenApiResponse(
                ErrorSerializer, description="No existe, no se completó o pertenece a otro actor."
            ),
        },
    )
    def get(self, request, tipo: str, clave: str):
        operacion = services.consultar_operacion(request.user, tipo, clave)
        if operacion is None:
            raise Http404
        return Response(OperacionIdempotenteSerializer(operacion).data)
