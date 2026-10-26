from collections.abc import Mapping

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from ..models import ROLES_PUBLICOS, Usuario
from ..phone import normalizar_telefono


class SinCamposDesconocidosMixin:
    """Rechaza los campos no declarados en lugar de ignorarlos.

    Así una petición no puede colar ``rol``, ``is_staff``, ``is_superuser``,
    ``groups`` ni ``user_permissions``: el intento falla con 400 y no pasa inadvertido.
    """

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            desconocidos = sorted(set(data) - set(self.fields))
            if desconocidos:
                raise serializers.ValidationError(
                    {campo: ["Campo no permitido."] for campo in desconocidos}
                )
        return super().to_internal_value(data)


class TelefonoField(serializers.CharField):
    """Teléfono de acceso en cualquier formato admitido; entrega la forma normalizada."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 32)
        kwargs.setdefault(
            "help_text",
            "Teléfono de Nicaragua: 8 dígitos, con o sin separadores y con o sin prefijo +505.",
        )
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        valor = super().to_internal_value(data)
        try:
            return normalizar_telefono(valor)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from None


class PasswordField(serializers.CharField):
    def __init__(self, **kwargs):
        kwargs.update(write_only=True, trim_whitespace=False, style={"input_type": "password"})
        super().__init__(**kwargs)


class RegistroSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Datos para crear una cuenta. Cualquier otro campo se rechaza con 400."""

    nombre = serializers.CharField(max_length=150, help_text="Nombre completo.")
    telefono = TelefonoField()
    password = PasswordField(
        help_text="Mínimo 8 caracteres; no puede ser común, solo numérica ni parecida al "
        "nombre o al teléfono."
    )

    def validate(self, attrs):
        # Los validadores de AUTH_PASSWORD_VALIDATORS comparan la contraseña con el
        # nombre y el teléfono, así que necesitan una cuenta provisional (sin guardar).
        provisional = Usuario(telefono=attrs["telefono"], nombre=attrs["nombre"])
        try:
            validate_password(attrs["password"], user=provisional)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from None
        return attrs


class LoginSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Credenciales de acceso. El rol no se envía; cualquier otro campo se rechaza con 400."""

    telefono = TelefonoField()
    password = PasswordField()


class ActualizarPerfilSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Datos personales propios editables (RF-004): solo nombre y teléfono.

    Actualización parcial. Rol, estado, privilegios y contraseña no son editables:
    cualquier otro campo se rechaza con 400 (D-AUD15-01, D-AUD15-04).
    """

    nombre = serializers.CharField(max_length=150, required=False, help_text="Nombre completo.")
    telefono = TelefonoField(
        required=False,
        help_text="Nuevo teléfono de acceso, en cualquier formato admitido. Si cambia de "
        "forma efectiva exige `password_actual`.",
    )
    password_actual = PasswordField(
        required=False,
        allow_blank=True,
        help_text="Contraseña actual. Obligatoria solo para cambiar el teléfono; no se "
        "guarda ni se devuelve.",
    )


class UsuarioSerializer(serializers.ModelSerializer):
    """Identidad autenticada. Sin contraseña, hash ni privilegios internos."""

    # La API solo autentica cuentas de comprador y artesano (ADR-007).
    rol = serializers.ChoiceField(
        choices=[(rol.value, rol.label) for rol in ROLES_PUBLICOS], read_only=True
    )

    class Meta:
        model = Usuario
        fields = ["id", "nombre", "telefono", "rol"]
        read_only_fields = fields


class SesionSerializer(serializers.Serializer):
    access = serializers.CharField(
        help_text="Token de acceso. Guardarlo solo en memoria y enviarlo como Bearer."
    )
    usuario = UsuarioSerializer()


class TokenAccesoSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="Nuevo token de acceso.")


class TokenCSRFSerializer(serializers.Serializer):
    csrf_token = serializers.CharField(help_text="Valor para la cabecera X-CSRFToken.")


class ErrorSerializer(serializers.Serializer):
    """Forma de los errores que no son de validación de campos."""

    detail = serializers.CharField()
