"""Habilitación operativa del artesano (RF-004, RN-002).

La autenticación y el rol no bastan: un artesano con su taller pendiente o
rechazado inicia sesión y gestiona su solicitud (``EsArtesano``), pero no opera.
Las funciones operativas exigen ``EsArtesanoAprobado``.
"""

from django.core.exceptions import ObjectDoesNotExist

from apps.accounts.api.permissions import EsArtesano

MENSAJE_TALLER_NO_APROBADO = (
    "Tu taller todavía no está aprobado: esta operación requiere la aprobación de la "
    "administración."
)


class EsArtesanoAprobado(EsArtesano):
    """Artesano autenticado cuyo taller está aprobado.

    Una petición anónima recibe 401; un comprador o un artesano no habilitado, 403.
    Solo consulta el taller propio, a través de ``request.user.taller``: Django lo
    deja en la caché del usuario, de modo que la vista lo reutiliza sin otra consulta.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False  # 401 si es anónima; 403 con el mensaje de EsArtesano
        try:
            habilitado = request.user.taller.habilita_operacion
        except ObjectDoesNotExist:
            # Cuenta de artesano sin taller (anterior a AUD-02): no está habilitada.
            habilitado = False
        if not habilitado:
            # DRF crea los permisos en cada petición: el mensaje no se comparte entre ellas.
            self.message = MENSAJE_TALLER_NO_APROBADO
        return habilitado
