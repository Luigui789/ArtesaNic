from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.api.serializers import (
    RegistroSerializer,
    SinCamposDesconocidosMixin,
    TelefonoField,
)
from apps.catalogo.imagenes import validar_fotografia

from ..models import CAMPOS_ACTUALIZABLES_PERFIL, CAMPOS_PERFIL, Taller, validar_url_web


class TelefonoPublicoField(TelefonoField):
    """Contacto público opcional; se guarda normalizado como el teléfono de acceso."""

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_blank", True)
        super().__init__(**kwargs)


class PerfilTallerEntradaSerializer(SinCamposDesconocidosMixin, serializers.ModelSerializer):
    """Datos del perfil que escribe el artesano (RF-008).

    Propietario, estado y revisión no son campos de entrada: enviarlos responde 400.
    """

    telefono_publico = TelefonoPublicoField(
        help_text="Teléfono de contacto público, opcional. No es el teléfono de acceso: "
        "este nunca se publica si el artesano no lo escribe aquí."
    )
    whatsapp_publico = TelefonoPublicoField(help_text="WhatsApp de contacto público, opcional.")

    class Meta:
        model = Taller
        fields = list(CAMPOS_PERFIL)
        # DRF descarta los URLValidator del modelo y aplica el suyo, que admite ftp://.
        extra_kwargs = {
            campo: {"validators": [validar_url_web]}
            for campo in ("facebook_url", "instagram_url", "sitio_web")
        }


class ActualizarPerfilTallerSerializer(PerfilTallerEntradaSerializer):
    """Edición del perfil del taller propio, incluyendo imagen de perfil e imagen de portada."""

    imagen_perfil = serializers.FileField(
        required=False,
        allow_null=True,
        validators=[validar_fotografia],
        help_text="Imagen estática JPEG, PNG o WebP del logo/perfil del taller, máximo 5 MiB.",
    )
    imagen_portada = serializers.FileField(
        required=False,
        allow_null=True,
        validators=[validar_fotografia],
        help_text="Imagen estática JPEG, PNG o WebP de portada del taller, máximo 5 MiB.",
    )

    class Meta(PerfilTallerEntradaSerializer.Meta):
        fields = list(CAMPOS_ACTUALIZABLES_PERFIL)


class RegistroArtesanoSerializer(RegistroSerializer):
    """Cuenta del artesano más los datos iniciales de su taller."""

    taller = PerfilTallerEntradaSerializer(
        help_text="Datos iniciales del taller. Obligatorios: nombre, rubro y "
        "direccion_completa. El taller se crea pendiente de aprobación."
    )


class _TallerLecturaSerializer(serializers.ModelSerializer):
    imagen_perfil_url = serializers.SerializerMethodField()
    imagen_portada_url = serializers.SerializerMethodField()

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_imagen_perfil_url(self, obj):
        return obj.imagen_perfil.url if obj.imagen_perfil else None

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_imagen_portada_url(self, obj):
        return obj.imagen_portada.url if obj.imagen_portada else None


class TallerPublicoSerializer(_TallerLecturaSerializer):
    """Perfil público del taller aprobado. Sin propietario, estado ni datos de la cuenta."""

    class Meta:
        model = Taller
        fields = ["id", *CAMPOS_PERFIL, "imagen_perfil_url", "imagen_portada_url"]
        read_only_fields = fields


class TallerPropioSerializer(_TallerLecturaSerializer):
    """Taller del artesano autenticado: el perfil y el resultado de su revisión."""

    class Meta:
        model = Taller
        fields = [
            "id",
            *CAMPOS_PERFIL,
            "imagen_perfil_url",
            "imagen_portada_url",
            "estado",
            "motivo_rechazo",
            "revisado_en",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = fields
