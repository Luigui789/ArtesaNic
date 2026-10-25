from django.core.exceptions import ObjectDoesNotExist
from django.core.validators import MaxLengthValidator, MinLengthValidator
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.pedidos.api.serializers import PedidoCompradorSerializer
from apps.solicitudes.api.serializers import ProductoSolicitudSerializer
from apps.solicitudes.models import MAX_DESCRIPCION_ENTREGA, ModalidadEntrega
from apps.solicitudes.services import MAX_RENGLONES

from ..models import (
    CERO,
    DECIMALES,
    DIGITOS_CARGO,
    DIGITOS_IMPORTE,
    MAX_DESCRIPCION_CARGO,
    MAX_OTROS_CARGOS,
    MONEDA,
    AccionDecisionPropuesta,
    CargoPropuesta,
    DecisionPropuesta,
    EstadoDecisionPropuesta,
    LineaPropuesta,
    Propuesta,
    ResultadoDecisionPropuesta,
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
    modalidad_entrega = serializers.ChoiceField(
        choices=ModalidadEntrega.choices,
        required=False,
        help_text=(
            "Si el comprador eligió modalidad, la propuesta adopta la suya y enviar otra "
            "responde 400. Si dejó «Sin preferencia», es obligatoria: el artesano define el "
            "plan y la ausencia de preferencia no equivale a retiro_taller."
        ),
    )
    descripcion_entrega = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_DESCRIPCION_ENTREGA,
        help_text=(
            "Obligatoria con «otra»; opcional con las demás. Si el comprador eligió "
            "modalidad, la descripción es la suya y enviar otra responde 400."
        ),
    )
    costo_entrega = _importe_entrada(
        help_text=(
            "Costo de entrega definido manualmente por el artesano (RF-016.3). Con "
            "retiro_taller debe ser 0.00 (400 en otro caso)."
        )
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
    # Reparto congelado al emitir (AUD-13, D-AUD13-08/09); base de reembolsos parciales.
    otros_compartidos_asignados = serializers.DecimalField(
        source="distribucion.otros_compartidos_asignados",
        max_digits=DIGITOS_IMPORTE,
        decimal_places=DECIMALES,
        read_only=True,
        help_text="Parte de los cargos globales atribuida a esta línea (mayor residuo).",
    )
    entrega_asignada = serializers.DecimalField(
        source="distribucion.entrega_asignada",
        max_digits=DIGITOS_IMPORTE,
        decimal_places=DECIMALES,
        read_only=True,
        help_text="Parte del costo de entrega atribuida a esta línea (mayor residuo).",
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
            "otros_compartidos_asignados",
            "entrega_asignada",
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
    """Oferta comercial del artesano y estado de decisión del comprador (AUD-06/07)."""

    solicitud = serializers.IntegerField(source="solicitud_id", read_only=True)
    moneda = serializers.SerializerMethodField(help_text="Importes en córdobas (RN-010).")
    decision = serializers.SerializerMethodField(
        help_text="Estado de decisión del comprador: pendiente, aceptada o rechazada."
    )
    decidida_en = serializers.DateTimeField(
        source="decision.decidida_en",
        read_only=True,
        allow_null=True,
        help_text="Momento de la decisión final del comprador; null si está pendiente.",
    )
    pedido_id = serializers.IntegerField(
        source="pedido.id",
        read_only=True,
        allow_null=True,
        help_text="ID del pedido confirmado cuando fue aceptada; null en otro caso.",
    )
    lineas = LineaPropuestaSerializer(many=True, read_only=True)
    otros_cargos = CargoPropuestaSerializer(source="cargos", many=True, read_only=True)

    class Meta:
        model = Propuesta
        fields = [
            "id",
            "solicitud",
            "emitida_en",
            "decision",
            "decidida_en",
            "pedido_id",
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

    @extend_schema_field(serializers.ChoiceField(choices=EstadoDecisionPropuesta.choices))
    def get_decision(self, obj) -> str:
        try:
            return obj.decision.decision
        except ObjectDoesNotExist:
            return EstadoDecisionPropuesta.PENDIENTE


class DecisionPropuestaEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Decisión del comprador sobre la propuesta final completa (RN-009, RN-011)."""

    decision = serializers.ChoiceField(
        choices=AccionDecisionPropuesta.choices,
        help_text="«aceptar» confirma el pedido y reserva stock; «rechazar» registra el rechazo.",
    )


class DecisionPropuestaSerializer(serializers.ModelSerializer):
    """Resultado de la decisión final del comprador sobre la propuesta (AUD-07)."""

    solicitud = serializers.IntegerField(source="propuesta.solicitud_id", read_only=True)
    propuesta = serializers.IntegerField(source="propuesta_id", read_only=True)
    decision = serializers.ChoiceField(choices=ResultadoDecisionPropuesta.choices, read_only=True)
    pedido = PedidoCompradorSerializer(
        source="propuesta.pedido",
        read_only=True,
        allow_null=True,
        help_text="Snapshot contractual del pedido confirmado al aceptar; null al rechazar.",
    )

    class Meta:
        model = DecisionPropuesta
        fields = [
            "id",
            "solicitud",
            "propuesta",
            "decision",
            "decidida_en",
            "pedido",
        ]
        read_only_fields = fields
