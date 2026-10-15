from rest_framework import serializers

from apps.accounts.api.serializers import (
    RegistroSerializer,
    SinCamposDesconocidosMixin,
    TelefonoField,
)

from ..models import CAMPOS_PERFIL, Taller, validar_url_web


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


class RegistroArtesanoSerializer(RegistroSerializer):
    """Cuenta del artesano más los datos iniciales de su taller."""

    taller = PerfilTallerEntradaSerializer(
        help_text="Datos iniciales del taller. Obligatorios: nombre, rubro y "
        "direccion_completa. El taller se crea pendiente de aprobación."
    )


class TallerPublicoSerializer(serializers.ModelSerializer):
    """Perfil público del taller aprobado. Sin propietario, estado ni datos de la cuenta."""

    class Meta:
        model = Taller
        fields = ["id", *CAMPOS_PERFIL]
        read_only_fields = fields


class TallerPropioSerializer(serializers.ModelSerializer):
    """Taller del artesano autenticado: el perfil y el resultado de su revisión."""

    class Meta:
        model = Taller
        fields = [
            "id",
            *CAMPOS_PERFIL,
            "estado",
            "motivo_rechazo",
            "revisado_en",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = fields
