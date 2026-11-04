"""Ajustes de producción para Render; nunca se usan con Docker Compose local."""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import env_bool

if env_bool("DJANGO_DEBUG", False):
    raise ImproperlyConfigured("DJANGO_DEBUG debe estar desactivado en producción.")

DEBUG = False

render_hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "").strip()
if not render_hostname:
    raise ImproperlyConfigured("Se requiere RENDER_EXTERNAL_HOSTNAME en Render.")

ALLOWED_HOSTS = [render_hostname]
FRONTEND_ORIGINS = [f"https://{render_hostname}"]
CORS_ALLOWED_ORIGINS = FRONTEND_ORIGINS
CSRF_TRUSTED_ORIGINS = FRONTEND_ORIGINS

SECURE_COOKIES = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
REFRESH_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
REFRESH_COOKIE_SAMESITE = "Lax"

# Render termina TLS y comunica el esquema original al proxy Nginx.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "DENY"

STATIC_URL = "/static/"
STATIC_ROOT = "/workspace/staticfiles"
