from django.core.validators import MaxLengthValidator, MinLengthValidator
from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.solicitudes.api.serializers import ProductoSolicitudSerializer
from apps.solicitudes.models import MAX_DESCRIPCION_ENTREGA, ModalidadEntrega
from apps.solicitudes.services import MAX_RENGLONES

from ..models import (
    CERO,
    DECIMALES,
    DIGITOS_CARGO,
    MAX_DESCRIPCION_CARGO,
    MAX_OTROS_CARGOS,
    MONEDA,
    CargoPropuesta,
    LineaPropuesta,
    Propuesta,
)


def _importe_entrada(**kwargs):
    return serializers.DecimalField(
        max_digits=DIGITOS_CARGO, decimal_places=DECIMALES, min_value=CERO, **kwargs
    )


class _ListaAcotada(serializers.ListSerializer):
    """Expone min/max_length en OpenAPI, como los renglones de la solicitud."""

    def get_validators(self):
        validadores = [*super().get_validators()]
        if self.min_length is not None:
            validadores.append(MinLengthValidator(self.min_length))
        if self.max_length is not None:
            validadores.append(MaxLengthValidator(self.max_length))
        return validadores


class LineaPropuestaEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Datos que el artesano añade a un renglón aceptado. No admite precio, cantidad,
    modalidad ni subtotal: los toma o calcula el servidor."""

    class Meta:
        list_serializer_class = _ListaAcotada

    renglon = serializers.IntegerField(min_value=1, help_text="ID de un renglón aceptado.")
    fecha_comprometida = serializers.DateField(
        required=False, help_text="Obligatoria solo en producción; hoy o posterior."
    )
    cargo_personalizacion = _importe_entrada(
        required=False, help_text="Solo en personalización; C$ con dos decimales, ≥ 0."
    )


class CargoEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    class Meta:
        list_serializer_class = _ListaAcotada

    descripcion = serializers.CharField(max_length=MAX_DESCRIPCION_CARGO)
    monto = _importe_entrada(help_text="C$ con dos decimales, ≥ 0.")
    renglon = serializers.IntegerField(
        min_value=1,
        required=False,
        help_text="Opcional: renglón aceptado al que se atribuye; sin él, cargo global.",
    )


class PropuestaEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    modalidad_entrega = serializers.ChoiceField(choices=ModalidadEntrega.choices)
    descripcion_entrega = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_DESCRIPCION_ENTREGA,
        help_text="Obligatoria con «otra»; opcional con las demás.",
    )
    costo_entrega = _importe_entrada(
        help_text="Costo de entrega definido manualmente por el artesano (RF-016.3)."
    )
    lineas = LineaPropuestaEntradaSerializer(
        many=True,
        allow_empty=False,
        min_length=1,
        max_length=MAX_RENGLONES,
        help_text="Exactamente los renglones aceptados, una vez cada uno.",
    )
    otros_cargos = CargoEntradaSerializer(
        many=True, required=False, max_length=MAX_OTROS_CARGOS, help_text="Otros servicios."
    )


class LineaPropuestaSerializer(serializers.ModelSerializer):
    renglon = serializers.IntegerField(source="renglon_id", read_only=True)
    posicion = serializers.IntegerField(source="renglon.posicion", read_only=True)
    producto = ProductoSolicitudSerializer(source="renglon.producto", read_only=True)
    fecha_solicitada = serializers.DateField(
        source="renglon.fecha_solicitada", read_only=True, allow_null=True
    )

    class Meta:
        model = LineaPropuesta
        fields = [
            "id",
            "renglon",
            "posicion",
            "producto",
            "modalidad",
            "cantidad",
            "precio_unitario",
            "subtotal",
            "cargo_personalizacion",
            "fecha_solicitada",
            "fecha_comprometida",
        ]
        read_only_fields = fields


class CargoPropuestaSerializer(serializers.ModelSerializer):
    renglon = serializers.IntegerField(
        source="linea.renglon_id",
        read_only=True,
        allow_null=True,
        help_text="Renglón al que se atribuye; null si es un cargo global.",
    )

    class Meta:
        model = CargoPropuesta
        fields = ["posicion", "descripcion", "monto", "renglon"]
        read_only_fields = fields


class PropuestaSerializer(serializers.ModelSerializer):
    """Oferta del artesano antes de la decisión del comprador. No es pedido confirmado."""

    solicitud = serializers.IntegerField(source="solicitud_id", read_only=True)
    moneda = serializers.SerializerMethodField(help_text="Importes en córdobas (RN-010).")
    lineas = LineaPropuestaSerializer(many=True, read_only=True)
    otros_cargos = CargoPropuestaSerializer(source="cargos", many=True, read_only=True)

    class Meta:
        model = Propuesta
        fields = [
            "id",
            "solicitud",
            "emitida_en",
            "moneda",
            "modalidad_entrega",
            "descripcion_entrega",
            "lineas",
            "otros_cargos",
            "costo_entrega",
            "subtotal_productos",
            "total_personalizacion",
            "total_otros_cargos",
            "total",
        ]
        read_only_fields = fields

    def get_moneda(self, obj) -> str:
        return MONEDA
