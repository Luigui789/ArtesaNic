from django.core.validators import MinLengthValidator
from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.catalogo.api.serializers import CategoriaSerializer, TallerResumenSerializer
from apps.catalogo.models import Modalidad, Producto

from ..models import OrigenPersonalizacion, RenglonSolicitud, Solicitud


class CantidadEnteraField(serializers.IntegerField):
    def to_internal_value(self, data):
        if isinstance(data, (bool, float)):
            self.fail("invalid")
        return super().to_internal_value(data)


class RenglonesEntradaSerializer(serializers.ListSerializer):
    def get_validators(self):
        # ListSerializer no añade un validator por min_length; OpenAPI sí lo necesita.
        return [*super().get_validators(), MinLengthValidator(1)]


class RenglonSolicitudEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    class Meta:
        list_serializer_class = RenglonesEntradaSerializer

    producto = serializers.IntegerField(min_value=1, max_value=9223372036854775807)
    modalidad = serializers.ChoiceField(choices=Modalidad.choices)
    cantidad = CantidadEnteraField(min_value=1, max_value=2147483647)
    fecha_solicitada = serializers.DateField(
        required=False, help_text="Obligatoria solo en producción; hoy o una fecha futura."
    )
    caracteristicas = serializers.CharField(
        required=False, help_text="Texto libre obligatorio solo en personalización."
    )
    origen_personalizacion = serializers.ChoiceField(
        choices=OrigenPersonalizacion.choices,
        required=False,
        help_text="Obligatorio solo en personalización; no reserva una unidad estándar.",
    )

    def validate(self, attrs):
        permitidos = {"producto", "modalidad", "cantidad"}
        if attrs["modalidad"] == Modalidad.PRODUCCION:
            permitidos.add("fecha_solicitada")
        elif attrs["modalidad"] == Modalidad.PERSONALIZACION:
            permitidos |= {"caracteristicas", "origen_personalizacion"}
        ajenos = set(attrs) - permitidos
        if ajenos:
            raise serializers.ValidationError(
                {k: ["Este campo no corresponde a la modalidad elegida."] for k in sorted(ajenos)}
            )
        return attrs


class SolicitudEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    renglones = RenglonSolicitudEntradaSerializer(
        many=True,
        allow_empty=False,
        min_length=1,
        help_text="Uno o varios renglones de un único taller; se conservan orden y repeticiones.",
    )


class ProductoSolicitudSerializer(serializers.ModelSerializer):
    """Referencia al catálogo vigente, sin precio ni snapshot contractual."""

    categoria = CategoriaSerializer(read_only=True)

    class Meta:
        model = Producto
        fields = ["id", "nombre", "categoria"]
        read_only_fields = fields


class RenglonSolicitudSerializer(serializers.ModelSerializer):
    producto = ProductoSolicitudSerializer(read_only=True)
    origen_personalizacion = serializers.ChoiceField(
        choices=OrigenPersonalizacion.choices, allow_blank=True, read_only=True
    )

    class Meta:
        model = RenglonSolicitud
        fields = [
            "id",
            "posicion",
            "producto",
            "modalidad",
            "cantidad",
            "fecha_solicitada",
            "caracteristicas",
            "origen_personalizacion",
            "resolucion",
            "motivo_rechazo",
        ]
        read_only_fields = fields


class SolicitudCompradorSerializer(serializers.ModelSerializer):
    taller = TallerResumenSerializer(read_only=True)
    renglones = RenglonSolicitudSerializer(many=True, read_only=True)

    class Meta:
        model = Solicitud
        fields = ["id", "taller", "estado", "creado_en", "actualizado_en", "renglones"]
        read_only_fields = fields


class CompradorSolicitudSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)


class SolicitudArtesanoSerializer(SolicitudCompradorSerializer):
    # Para identificar a la contraparte; no publica su teléfono privado de autenticación.
    comprador = CompradorSolicitudSerializer(read_only=True)

    class Meta(SolicitudCompradorSerializer.Meta):
        fields = [*SolicitudCompradorSerializer.Meta.fields, "comprador"]
        read_only_fields = fields
