from django.core.validators import MaxLengthValidator, MinLengthValidator
from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.catalogo.api.serializers import CategoriaSerializer, TallerResumenSerializer
from apps.catalogo.models import Modalidad, Producto

from ..models import (
    MAX_CARACTERISTICAS,
    MAX_DESCRIPCION_ENTREGA,
    MAX_MOTIVO_RECHAZO,
    ModalidadEntrega,
    OrigenPersonalizacion,
    RenglonSolicitud,
    ResolucionRenglon,
    Solicitud,
    errores_entrega,
)
from ..services import MAX_RENGLONES


class CantidadEnteraField(serializers.IntegerField):
    def to_internal_value(self, data):
        if isinstance(data, (bool, float)):
            self.fail("invalid")
        return super().to_internal_value(data)


class RenglonesEntradaSerializer(serializers.ListSerializer):
    def get_validators(self):
        # ListSerializer no añade validators por min/max_length; OpenAPI sí los necesita.
        return [
            *super().get_validators(),
            MinLengthValidator(1),
            MaxLengthValidator(MAX_RENGLONES),
        ]


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
        required=False,
        max_length=MAX_CARACTERISTICAS,
        help_text="Texto libre obligatorio solo en personalización.",
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
        max_length=MAX_RENGLONES,
        help_text="Uno o varios renglones de un único taller; se conservan orden y repeticiones.",
    )
    modalidad_entrega_preferida = serializers.ChoiceField(
        choices=ModalidadEntrega.choices,
        required=False,
        help_text="Opcional (RF-016). Sin este campo, el comprador no indicó preferencia.",
    )
    descripcion_entrega_preferida = serializers.CharField(
        required=False,
        max_length=MAX_DESCRIPCION_ENTREGA,
        help_text="Obligatoria con «otra», opcional con las demás y no admitida sin modalidad.",
    )

    def validate(self, attrs):
        errores = errores_entrega(
            attrs.get("modalidad_entrega_preferida", ""),
            attrs.get("descripcion_entrega_preferida", ""),
            opcional=True,
        )
        if errores:
            raise serializers.ValidationError(
                {f"{campo}_entrega_preferida": [m] for campo, m in errores.items()}
            )
        return attrs


RESOLUCIONES_FINALES = [
    (ResolucionRenglon.ACEPTADO.value, ResolucionRenglon.ACEPTADO.label),
    (ResolucionRenglon.RECHAZADO.value, ResolucionRenglon.RECHAZADO.label),
]


class ResolucionEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Resolución final de un renglón. Sin cantidad, producto, modalidad ni precio:
    en V1 no existen contraofertas (RN-008)."""

    resolucion = serializers.ChoiceField(choices=RESOLUCIONES_FINALES)
    motivo_rechazo = serializers.CharField(
        required=False,
        max_length=MAX_MOTIVO_RECHAZO,
        help_text="Obligatorio y no vacío al rechazar; no se admite al aceptar.",
    )

    def validate(self, attrs):
        if attrs["resolucion"] == ResolucionRenglon.RECHAZADO:
            if not attrs.get("motivo_rechazo"):
                raise serializers.ValidationError(
                    {"motivo_rechazo": ["Indica el motivo del rechazo."]}
                )
        elif "motivo_rechazo" in attrs:
            raise serializers.ValidationError(
                {"motivo_rechazo": ["Un renglón aceptado no lleva motivo."]}
            )
        return attrs


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
    resuelto_en = serializers.DateTimeField(
        source="revision.resuelto_en",
        read_only=True,
        allow_null=True,
        help_text="Momento de la resolución final; null mientras está pendiente.",
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
            "resuelto_en",
        ]
        read_only_fields = fields


class CompradorSolicitudSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)


class RevisorSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)


class RenglonSolicitudArtesanoSerializer(RenglonSolicitudSerializer):
    """El taller ve además qué cuenta registró la resolución (historial auditable)."""

    resuelto_por = RevisorSerializer(
        source="revision.resuelto_por", read_only=True, allow_null=True
    )

    class Meta(RenglonSolicitudSerializer.Meta):
        fields = [*RenglonSolicitudSerializer.Meta.fields, "resuelto_por"]
        read_only_fields = fields


class SolicitudCompradorSerializer(serializers.ModelSerializer):
    taller = TallerResumenSerializer(read_only=True)
    modalidad_entrega_preferida = serializers.ChoiceField(
        choices=ModalidadEntrega.choices,
        allow_blank=True,
        read_only=True,
        help_text="Vacía si el comprador no indicó preferencia (RF-016).",
    )
    renglones = RenglonSolicitudSerializer(many=True, read_only=True)

    class Meta:
        model = Solicitud
        fields = [
            "id",
            "taller",
            "estado",
            "modalidad_entrega_preferida",
            "descripcion_entrega_preferida",
            "creado_en",
            "actualizado_en",
            "renglones",
        ]
        read_only_fields = fields


class SolicitudArtesanoSerializer(SolicitudCompradorSerializer):
    # Para identificar a la contraparte; no publica su teléfono privado de autenticación.
    comprador = CompradorSolicitudSerializer(read_only=True)
    renglones = RenglonSolicitudArtesanoSerializer(many=True, read_only=True)

    class Meta(SolicitudCompradorSerializer.Meta):
        fields = [*SolicitudCompradorSerializer.Meta.fields, "comprador"]
        read_only_fields = fields
