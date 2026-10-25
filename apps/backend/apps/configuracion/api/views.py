"""Lectura pública de la configuración (RF-007). Contrato: docs/api/configuracion.md.

Solo GET: la tasa se escribe exclusivamente en Django Admin (D-AUD14-12). Actor y
historial no se exponen aquí.
"""

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from .serializers import ConfiguracionPublicaSerializer


class ConfiguracionView(APIView):
    # Lectura anónima: un token caducado en la petición no debe impedirla.
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Configuración"],
        operation_id="consultar_configuracion",
        summary="Consultar la configuración pública de la plataforma",
        description="Tasa de cambio informativa C$ por US$ que configura la administración. "
        "Sin tasa configurada responde 200 con `tasa_cambio` y `actualizada_en` en null: "
        "no existe una tasa por defecto. Los importes contractuales se conservan en córdobas.",
        auth=[],
        responses={200: ConfiguracionPublicaSerializer},
    )
    def get(self, request):
        configuracion = services.obtener_configuracion()
        datos = {
            "tasa_cambio": configuracion.tasa_cambio_usd_nio if configuracion else None,
            "actualizada_en": configuracion.actualizada_en if configuracion else None,
        }
        return Response(ConfiguracionPublicaSerializer(datos).data)
