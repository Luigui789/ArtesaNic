"""Configuración común de ArtesaNic.

Los valores por defecto son los seguros (DEBUG desactivado, cookies ``Secure``,
ningún origen externo admitido): un entorno desplegado parte de aquí y declara
el resto por variables de entorno. El desarrollo local usa ``config.settings.local``.
Referencia de variables: ``docs/arquitectura/desarrollo-local-backend.md``.
"""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Las variables del entorno real tienen prioridad sobre las del archivo .env.
REPO_ROOT = BASE_DIR.parent.parent
DOCS_DIR = REPO_ROOT / "docs"
load_dotenv(BASE_DIR / ".env")
load_dotenv(REPO_ROOT / ".env")


def env(nombre: str, default: str | None = None) -> str:
    valor = os.environ.get(nombre, default)
    if valor is None:
        raise ImproperlyConfigured(f"Falta la variable de entorno {nombre}.")
    return valor


def env_bool(nombre: str, default: bool) -> bool:
    valor = os.environ.get(nombre)
    if valor is None:
        return default
    normalizado = valor.strip().lower()
    if normalizado in {"1", "true", "yes"}:
        return True
    if normalizado in {"0", "false", "no"}:
        return False
    raise ImproperlyConfigured(f"{nombre} debe ser true o false; se recibió {valor!r}.")


def env_list(nombre: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(nombre, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env_bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    # Antes que apps.accounts: su admin se registra primero y accounts lo retira.
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "apps.accounts",
    "apps.talleres",
    "apps.catalogo",
    "apps.solicitudes",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Cuentas y contraseñas ---

AUTH_USER_MODEL = "accounts.Usuario"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("telefono", "nombre")},
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Internacionalización ---

LANGUAGE_CODE = "es"
TIME_ZONE = "America/Managua"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

# --- Frontend (SPA), CORS, CSRF y cookies (ADR-003, ADR-007) ---

# Orígenes exactos del frontend. Nunca se admite cualquier origen con credenciales.
FRONTEND_ORIGINS = env_list("DJANGO_FRONTEND_ORIGINS")
CORS_ALLOWED_ORIGINS = FRONTEND_ORIGINS
CORS_ALLOW_CREDENTIALS = True
CORS_URLS_REGEX = r"^/api/.*$"
CSRF_TRUSTED_ORIGINS = FRONTEND_ORIGINS

# Secure exige HTTPS; solo el perfil local lo desactiva.
SECURE_COOKIES = env_bool("DJANGO_SECURE_COOKIES", default=True)
SESSION_COOKIE_SECURE = SECURE_COOKIES
CSRF_COOKIE_SECURE = SECURE_COOKIES

# SameSite de las cookies que usa la SPA. Lax exige que frontend y API compartan sitio.
SPA_COOKIE_SAMESITE = env("DJANGO_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = SPA_COOKIE_SAMESITE

# Cookie del token de renovación: HttpOnly siempre, limitada a las rutas de autenticación.
REFRESH_COOKIE_NAME = "refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = SECURE_COOKIES
REFRESH_COOKIE_SAMESITE = SPA_COOKIE_SAMESITE

# --- Django REST Framework ---

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.api.authentication.JWTAuthentication",
    ],
    # Cerrado por defecto: cada vista pública lo declara de forma explícita.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Limitación de intentos (docs/api/autenticacion.md). Los contadores viven en CACHES.
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "login_telefono": "20/hour",
        "registro": "10/hour",
    },
    # Sin proxies de confianza la IP es REMOTE_ADDR y se ignora X-Forwarded-For,
    # que el cliente podría falsificar para eludir la limitación.
    "NUM_PROXIES": int(env("DJANGO_NUM_PROXIES", "0")),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# Memoria del proceso: suficiente para un único proceso de desarrollo. Con varios
# procesos o servidores, los contadores de intentos no se comparten (pendiente de despliegue).
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
}

# --- Tokens (ADR-003; duraciones y revocación según ADR-007) ---

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_AUTHENTICATION_RULE": "apps.accounts.api.authentication.puede_autenticarse",
}

# --- OpenAPI (docs/api/openapi.yaml se genera desde el código) ---

SPECTACULAR_SETTINGS = {
    "TITLE": "API de ArtesaNic",
    "DESCRIPTION": (
        "Contrato implementado por el backend. Requisitos y diseño de los demás "
        "módulos: monorepo (docs/requisitos, docs/api)."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v[0-9]+",
    "COMPONENT_SPLIT_REQUEST": True,
    # Nombre estable: otros dominios tendrán también un campo «estado».
    "ENUM_NAME_OVERRIDES": {
        "EstadoTallerEnum": "apps.talleres.models.EstadoTaller",
        "ModalidadEnum": "apps.catalogo.models.Modalidad",
        "EstadoSolicitudEnum": "apps.solicitudes.models.EstadoSolicitud",
        "ResolucionRenglonEnum": "apps.solicitudes.models.ResolucionRenglon",
        "OrigenPersonalizacionEnum": "apps.solicitudes.models.OrigenPersonalizacion",
    },
}
