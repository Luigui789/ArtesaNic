from collections.abc import Mapping

from django.core.exceptions import ValidationError
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle

from ..phone import normalizar_telefono


class LoginPorTelefonoThrottle(SimpleRateThrottle):
    """Limita los intentos de acceso a una misma cuenta aunque lleguen desde varias IP.

    Complementa el límite por IP (``ScopedRateThrottle``, alcance ``login``).
    """

    scope = "login_telefono"

    def get_cache_key(self, request, view):
        datos = request.data
        if not isinstance(datos, Mapping):
            return None
        try:
            telefono = normalizar_telefono(datos.get("telefono"))
        except ValidationError:
            return None
        return self.cache_format % {"scope": self.scope, "ident": telefono}


class ReautenticacionThrottle(UserRateThrottle):
    """Limita las confirmaciones de contraseña de una cuenta al cambiar su teléfono.

    Sin este límite, quien tuviera un token de acceso podría probar contraseñas por
    ``PATCH /auth/perfil/`` eludiendo la limitación del login. Solo cuentan las
    peticiones que envían ``password_actual``; editar el nombre no se limita.
    """

    scope = "reautenticacion"

    def get_cache_key(self, request, view):
        datos = request.data
        if request.method != "PATCH" or not isinstance(datos, Mapping):
            return None
        if "password_actual" not in datos:
            return None
        return super().get_cache_key(request, view)
