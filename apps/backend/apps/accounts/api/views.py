"""Endpoints de cuentas y sesión. Contrato: docs/api/autenticacion.md."""

from django.contrib.auth import user_logged_in
from django.core.exceptions import ValidationError as DjangoValidationError
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import exceptions, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.talleres.api.serializers import RegistroArtesanoSerializer

from .. import services
from . import tokens
from .authentication import MENSAJE_SESION_INVALIDA
from .csrf import CSRFRequerido
from .serializers import (
    ActualizarPerfilSerializer,
    ErrorSerializer,
    LoginSerializer,
    RegistroSerializer,
    SesionSerializer,
    TokenAccesoSerializer,
    TokenCSRFSerializer,
    UsuarioSerializer,
)
from .throttles import LoginPorTelefonoThrottle, ReautenticacionThrottle

MENSAJE_TELEFONO_REGISTRADO = "Ya existe una cuenta con este teléfono."
MENSAJE_CREDENCIALES = "Teléfono o contraseña incorrectos."
MENSAJE_PASSWORD_ACTUAL_REQUERIDO = "Confirma tu contraseña actual para cambiar el teléfono."
MENSAJE_PASSWORD_ACTUAL_INCORRECTO = "La contraseña actual no es correcta."
MENSAJE_CUENTA_ADMINISTRACION = (
    "Las cuentas de administración ingresan por Django Admin, no por esta aplicación."
)

TAG = "Autenticación"
CABECERA_CSRF = OpenApiParameter(
    "X-CSRFToken",
    str,
    OpenApiParameter.HEADER,
    required=True,
    description="Token de GET /api/v1/auth/csrf/. La petición debe llevar también la "
    "cookie csrftoken (credentials: 'include').",
)
COOKIE_RENOVACION = OpenApiParameter(
    "refresh",
    str,
    OpenApiParameter.COOKIE,
    description="Cookie HttpOnly emitida por el backend. El navegador la envía sola.",
)
RESPUESTA_400 = OpenApiResponse(
    response={
        "type": "object",
        "additionalProperties": {"type": "array", "items": {"type": "string"}},
    },
    description="Errores de validación: cada campo con su lista de mensajes.",
    examples=[
        OpenApiExample(
            "Validación",
            value={"telefono": ["Ya existe una cuenta con este teléfono."]},
            response_only=True,
        )
    ],
)
RESPUESTA_400_PERFIL = OpenApiResponse(
    response=RESPUESTA_400.response,
    description="Errores de validación: cada campo con su lista de mensajes. Los campos no "
    "editables responden «Campo no permitido.».",
    examples=[
        OpenApiExample(nombre, value=valor, response_only=True)
        for nombre, valor in [
            ("Teléfono ya registrado", {"telefono": [MENSAJE_TELEFONO_REGISTRADO]}),
            (
                "Falta la contraseña actual",
                {"password_actual": [MENSAJE_PASSWORD_ACTUAL_REQUERIDO]},
            ),
            (
                "Contraseña actual incorrecta",
                {"password_actual": [MENSAJE_PASSWORD_ACTUAL_INCORRECTO]},
            ),
            ("Campo no permitido", {"rol": ["Campo no permitido."]}),
        ]
    ],
)
RESPUESTA_403_CSRF = OpenApiResponse(ErrorSerializer, description="Token CSRF ausente o inválido.")
RESPUESTA_429 = OpenApiResponse(
    ErrorSerializer, description="Demasiados intentos. La cabecera Retry-After indica la espera."
)
EJEMPLO_REGISTRO = OpenApiExample(
    "Registro",
    value={"nombre": "Ana Lucía Delgado", "telefono": "8555 1234", "password": "…"},
    request_only=True,
)
EJEMPLO_REGISTRO_ARTESANO = OpenApiExample(
    "Registro de artesano",
    value={
        "nombre": "Ana Lucía Delgado",
        "telefono": "8555 1234",
        "password": "…",
        "taller": {
            "nombre": "Cerámica López",
            "rubro": "Cerámica artesanal",
            "direccion_completa": "Barrio San Juan, de la iglesia 2 c. al sur, Masaya",
            "historia": "Taller familiar fundado en 1985.",
            "horario": "Lunes a sábado, 8:00 a 17:00",
            "whatsapp_publico": "8777 6655",
            "instagram_url": "https://instagram.com/ceramicalopez",
        },
    },
    request_only=True,
)


def _ejemplo_de_sesion(rol: str) -> OpenApiExample:
    return OpenApiExample(
        "Sesión iniciada",
        value={
            "access": "eyJhbGciOi…",
            "usuario": {"id": 4, "nombre": "Ana Lucía Delgado", "telefono": "85551234", "rol": rol},
        },
        response_only=True,
    )


def _respuesta_de_sesion(request, usuario, codigo_http: int) -> Response:
    """Inicia la sesión (login o registro): tokens, cookie de renovación y last_login."""
    acceso, renovacion = tokens.emitir_tokens(usuario)
    # Mismo aviso que emite django.contrib.auth.login(): actualiza last_login.
    user_logged_in.send(sender=usuario.__class__, request=request, user=usuario)
    respuesta = Response(
        SesionSerializer({"access": acceso, "usuario": usuario}).data, status=codigo_http
    )
    tokens.guardar_cookie_renovacion(respuesta, renovacion)
    return respuesta


class _VistaDeSesion(APIView):
    """Base de los endpoints que emiten, leen o borran la cookie de renovación.

    No usan el token Bearer y exigen CSRF, porque el navegador adjunta la cookie solo.
    """

    authentication_classes = []
    permission_classes = [CSRFRequerido]

    def get_authenticate_header(self, request):
        # Sin clases de autenticación, DRF convertiría las respuestas 401 en 403.
        return 'Bearer realm="api"'


@method_decorator(never_cache, name="dispatch")
class CSRFView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=[TAG],
        operation_id="obtener_token_csrf",
        summary="Obtener el token CSRF",
        description="Fija la cookie csrftoken y devuelve el valor que debe enviarse en la "
        "cabecera X-CSRFToken de registro, login, refrescar y logout.",
        auth=[],
        responses={200: TokenCSRFSerializer},
    )
    def get(self, request):
        return Response(TokenCSRFSerializer({"csrf_token": get_token(request)}).data)


class _RegistroView(_VistaDeSesion):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registro"
    entrada_serializer = RegistroSerializer

    def registrar(self, **datos):
        raise NotImplementedError

    def post(self, request):
        entrada = self.entrada_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            usuario = self.registrar(**entrada.validated_data)
        except services.TelefonoYaRegistrado:
            raise exceptions.ValidationError({"telefono": [MENSAJE_TELEFONO_REGISTRADO]}) from None
        except DjangoValidationError as exc:
            # El taller no superó la validación del modelo: la transacción ya deshizo la cuenta.
            raise exceptions.ValidationError({"taller": exc.message_dict}) from None
        return _respuesta_de_sesion(request, usuario, status.HTTP_201_CREATED)


def _documentar_registro(
    rol: str,
    operation_id: str,
    descripcion: str,
    entrada=RegistroSerializer,
    ejemplo=EJEMPLO_REGISTRO,
):
    return extend_schema_view(
        post=extend_schema(
            tags=[TAG],
            operation_id=operation_id,
            summary=f"Registrar una cuenta de {rol}",
            description=descripcion
            + " El rol lo asigna el servidor; los campos no declarados se rechazan. Inicia la "
            "sesión: devuelve el token de acceso y fija la cookie de renovación.",
            auth=[],
            parameters=[CABECERA_CSRF],
            request=entrada,
            responses={
                201: SesionSerializer,
                400: RESPUESTA_400,
                403: RESPUESTA_403_CSRF,
                429: RESPUESTA_429,
            },
            examples=[ejemplo, _ejemplo_de_sesion(rol)],
        )
    )


@_documentar_registro("comprador", "registrar_comprador", "Crea una cuenta de comprador.")
class RegistroCompradorView(_RegistroView):
    def registrar(self, **datos):
        return services.registrar_comprador(**datos)


@_documentar_registro(
    "artesano",
    "registrar_artesano",
    "Crea la cuenta de artesano y, en la misma operación, su taller en estado pendiente "
    "con los datos iniciales de `taller`. Si el taller no es válido no se crea ninguno de "
    "los dos. El teléfono de la cuenta es privado: los contactos públicos del taller son "
    "solo los que se envían en `taller`. La aprobación es exclusiva de la administración.",
    entrada=RegistroArtesanoSerializer,
    ejemplo=EJEMPLO_REGISTRO_ARTESANO,
)
class RegistroArtesanoView(_RegistroView):
    entrada_serializer = RegistroArtesanoSerializer

    def registrar(self, **datos):
        return services.registrar_artesano(**datos)


class LoginView(_VistaDeSesion):
    throttle_classes = [ScopedRateThrottle, LoginPorTelefonoThrottle]
    throttle_scope = "login"

    @extend_schema(
        tags=[TAG],
        operation_id="iniciar_sesion",
        summary="Iniciar sesión con teléfono y contraseña",
        description="El rol no se envía: lo determina la cuenta. Devuelve el token de acceso "
        "y fija la cookie de renovación.",
        auth=[],
        parameters=[CABECERA_CSRF],
        request=LoginSerializer,
        responses={
            200: SesionSerializer,
            400: RESPUESTA_400,
            401: OpenApiResponse(
                ErrorSerializer,
                description="Credenciales incorrectas o cuenta inactiva (mensaje único, "
                "no revela si el teléfono existe).",
            ),
            403: OpenApiResponse(
                ErrorSerializer,
                description="Token CSRF ausente o inválido, o cuenta de administración.",
            ),
            429: RESPUESTA_429,
        },
        examples=[
            OpenApiExample(
                "Login", value={"telefono": "85551234", "password": "…"}, request_only=True
            ),
            _ejemplo_de_sesion("comprador"),
        ],
    )
    def post(self, request):
        entrada = LoginSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            usuario = services.autenticar(request, **entrada.validated_data)
        except services.CredencialesInvalidas:
            raise exceptions.AuthenticationFailed(
                MENSAJE_CREDENCIALES, code="credenciales_invalidas"
            ) from None
        except services.CuentaDeAdministracion:
            raise exceptions.PermissionDenied(
                MENSAJE_CUENTA_ADMINISTRACION, code="cuenta_de_administracion"
            ) from None
        return _respuesta_de_sesion(request, usuario, status.HTTP_200_OK)


class RefrescarView(_VistaDeSesion):
    @extend_schema(
        tags=[TAG],
        operation_id="renovar_sesion",
        summary="Renovar el token de acceso",
        description="Usa la cookie de renovación, la rota (la anterior queda revocada) y "
        "devuelve un token de acceso nuevo. Sin cuerpo.",
        auth=[],
        parameters=[CABECERA_CSRF, COOKIE_RENOVACION],
        request=None,
        responses={
            200: TokenAccesoSerializer,
            401: OpenApiResponse(
                ErrorSerializer,
                description="Sin cookie, o caducada, revocada o de una cuenta sin acceso.",
            ),
            403: RESPUESTA_403_CSRF,
        },
    )
    def post(self, request):
        token = tokens.leer_cookie_renovacion(request)
        if token is None:
            raise exceptions.AuthenticationFailed(MENSAJE_SESION_INVALIDA, code="sesion_invalida")
        try:
            acceso, renovacion = tokens.renovar_tokens(token)
        except tokens.SesionInvalida:
            raise exceptions.AuthenticationFailed(
                MENSAJE_SESION_INVALIDA, code="sesion_invalida"
            ) from None
        respuesta = Response(TokenAccesoSerializer({"access": acceso}).data)
        tokens.guardar_cookie_renovacion(respuesta, renovacion)
        return respuesta


class LogoutView(_VistaDeSesion):
    @extend_schema(
        tags=[TAG],
        operation_id="cerrar_sesion",
        summary="Cerrar sesión",
        description="Revoca el token de renovación de la cookie y la borra. No exige el token "
        "de acceso, para poder cerrar aunque haya caducado; es idempotente.",
        auth=[],
        parameters=[CABECERA_CSRF, COOKIE_RENOVACION],
        request=None,
        responses={204: None, 403: RESPUESTA_403_CSRF},
    )
    def post(self, request):
        token = tokens.leer_cookie_renovacion(request)
        if token is not None:
            tokens.revocar_renovacion(token)
        respuesta = Response(status=status.HTTP_204_NO_CONTENT)
        tokens.eliminar_cookie_renovacion(respuesta)
        return respuesta


@method_decorator(never_cache, name="dispatch")
class PerfilView(APIView):
    # Identidad propia: siempre request.user, nunca un identificador en la ruta.

    throttle_classes = [ReautenticacionThrottle]

    @extend_schema(
        tags=[TAG],
        operation_id="consultar_perfil",
        summary="Consultar la identidad autenticada",
        responses={
            200: UsuarioSerializer,
            401: OpenApiResponse(ErrorSerializer, description="Sin token o token no válido."),
        },
    )
    def get(self, request):
        return Response(UsuarioSerializer(request.user).data)

    @extend_schema(
        tags=[TAG],
        operation_id="actualizar_perfil",
        summary="Actualizar los datos personales propios",
        description="Actualización parcial de la cuenta autenticada: solo `nombre` y "
        "`telefono`. Cambiar de forma efectiva el teléfono de acceso exige `password_actual`; "
        "un teléfono que normaliza al actual no es un cambio. Rol, estado, privilegios y "
        "contraseña no son editables: cualquier otro campo responde 400. No exige CSRF "
        "(usa el token Bearer), no emite tokens nuevos y la sesión actual sigue válida. "
        "No modifica los contactos públicos del taller.",
        request=ActualizarPerfilSerializer,
        responses={
            200: UsuarioSerializer,
            400: RESPUESTA_400_PERFIL,
            401: OpenApiResponse(ErrorSerializer, description="Sin token o token no válido."),
            429: RESPUESTA_429,
        },
        examples=[
            OpenApiExample(
                "Cambiar el nombre", value={"nombre": "Ana Lucía López"}, request_only=True
            ),
            OpenApiExample(
                "Cambiar el teléfono",
                value={"telefono": "8777 1234", "password_actual": "…"},
                request_only=True,
            ),
            OpenApiExample(
                "Cuenta actualizada",
                value={
                    "id": 4,
                    "nombre": "Ana Lucía López",
                    "telefono": "87771234",
                    "rol": "artesano",
                },
                response_only=True,
            ),
        ],
    )
    def patch(self, request):
        entrada = ActualizarPerfilSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            usuario = services.actualizar_datos_personales(request.user, **entrada.validated_data)
        except services.TelefonoYaRegistrado:
            raise exceptions.ValidationError({"telefono": [MENSAJE_TELEFONO_REGISTRADO]}) from None
        except services.PasswordActualRequerido:
            raise exceptions.ValidationError(
                {"password_actual": [MENSAJE_PASSWORD_ACTUAL_REQUERIDO]}
            ) from None
        except services.PasswordActualIncorrecto:
            raise exceptions.ValidationError(
                {"password_actual": [MENSAJE_PASSWORD_ACTUAL_INCORRECTO]}
            ) from None
        except DjangoValidationError as exc:
            raise exceptions.ValidationError(exc.message_dict) from None
        return Response(UsuarioSerializer(usuario).data)
