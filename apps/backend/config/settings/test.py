"""Suite de pruebas. Usa el PostgreSQL de .env: Django crea y destruye su base test_*."""

import atexit
import os
from tempfile import TemporaryDirectory

# Clave ficticia para que las pruebas no dependan de la clave real del entorno.
os.environ.setdefault("DJANGO_SECRET_KEY", "clave-exclusiva-de-pruebas-sin-uso-real")

from .base import *  # noqa: E402, F403

# Las pruebas crean muchas cuentas; el hash real (PBKDF2, de base) haría la suite muy lenta.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

_MEDIA_TEMPORAL = TemporaryDirectory(prefix="artesanic-tests-media-")
MEDIA_ROOT = _MEDIA_TEMPORAL.name
atexit.register(_MEDIA_TEMPORAL.cleanup)

_PRIVADO_TEMPORAL = TemporaryDirectory(prefix="artesanic-tests-private-")
PRIVATE_MEDIA_ROOT = _PRIVADO_TEMPORAL.name
atexit.register(_PRIVADO_TEMPORAL.cleanup)
