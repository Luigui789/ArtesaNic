from dataclasses import dataclass

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.pedidos.models import Pedido

from ..comprobantes import MIME_PERMITIDOS, ComprobanteValidado, validar_comprobante
from ..models import (
    MAX_MOTIVO,
    MAX_REFERENCIA,
    EstadoPago,
    IntentoPago,
    MetodoPago,
    OrigenIntento,
    Pago,
    ResultadoRevision,
)
from ..services import SituacionPago, situacion_pago

# --- Entrada ---


class ComprobanteField(serializers.FileField):
    """Archivo multipart validado por contenido; entrega un ``ComprobanteValidado``."""

    def __init__(self, **kwargs):
        kwargs.setdefault("allow_empty_file", True)  # el vacío lo rechaza la política propia
        kwargs.setdefault("use_url", False)
        super().__init__(**kwargs)

    def to_internal_value(self, data) -> ComprobanteValidado:
        archivo = super().to_internal_value(data)
        try:
            return validar_comprobante(archivo)
        except Exception as exc:  # ValidationError de Django con código estable
            mensajes = getattr(exc, "messages", None)
            if mensajes is None:
                raise
            raise serializers.ValidationError(mensajes, code=getattr(exc, "code", None)) from None


class IntentoPagoEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Registro, nuevo intento o corrección: el cliente nunca envía monto, moneda,
    comprador, taller, estado ni intento previo (este último viene de la URL)."""

    metodo = serializers.ChoiceField(
        choices=MetodoPago.choices,
        error_messages={"invalid_choice": "Elige transferencia u otro método."},
    )
    referencia = serializers.CharField(
        max_length=MAX_REFERENCIA,
        help_text="Referencia del pago externo; se recorta y no puede quedar vacía.",
    )
    comprobante = ComprobanteField(
        help_text="Un único archivo JPG, JPEG, PNG, WebP o PDF de hasta 10 MiB (10 485 760 "
        "bytes), validado por contenido.",
        error_messages={"required": "Adjunta el comprobante del pago."},
    )


class ResolucionPagoEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    estado = serializers.ChoiceField(choices=ResultadoRevision.choices)
    motivo = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_MOTIVO,
        help_text="Obligatorio y no vacío en observado y no_recibido; no se admite al confirmar.",
    )

    def validate(self, attrs):
        motivo = (attrs.get("motivo") or "").strip()
        if attrs["estado"] == ResultadoRevision.CONFIRMADO:
            if motivo:
                raise serializers.ValidationError(
                    {"motivo": ["Confirmar el pago no lleva motivo."]}
                )
        elif not motivo:
            raise serializers.ValidationError({"motivo": ["Indica el motivo."]})
        attrs["motivo"] = motivo
        return attrs


# --- Lectura ---


@dataclass(frozen=True)
class VistaPago:
    pedido: Pedido
    pago: Pago | None
    situacion: SituacionPago

    @classmethod
    def de(cls, pedido: Pedido, pago: Pago | None):
        return cls(pedido, pago, situacion_pago(pedido, pago))


class ComprobanteSerializer(serializers.Serializer):
    nombre = serializers.CharField(help_text="Nombre original saneado; solo para mostrar.")
    tipo = serializers.ChoiceField(choices=MIME_PERMITIDOS, help_text="MIME detectado.")
    tamano = serializers.IntegerField(help_text="Bytes.")
    url = serializers.CharField(
        help_text="Endpoint autenticado relativo a la raíz de la API; no es una URL pública."
    )


class ResolucionIntentoSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=ResultadoRevision.choices, source="resultado")
    motivo = serializers.CharField()
    revisado_en = serializers.DateTimeField()
    plazo_hasta = serializers.DateTimeField(allow_null=True)


class IntentoPagoSerializer(serializers.ModelSerializer):
    origen = serializers.ChoiceField(choices=OrigenIntento.choices)
    metodo = serializers.ChoiceField(choices=MetodoPago.choices)
    intento_previo = serializers.IntegerField(source="intento_previo_id", allow_null=True)
    comprobante = serializers.SerializerMethodField()
    resolucion = serializers.SerializerMethodField()

    class Meta:
        model = IntentoPago
        fields = [
            "id",
            "numero",
            "origen",
            "intento_previo",
            "metodo",
            "referencia",
            "registrado_en",
            "comprobante",
            "resolucion",
        ]
        read_only_fields = fields

    @extend_schema_field(ComprobanteSerializer)
    def get_comprobante(self, obj: IntentoPago):
        lado = self.context["lado"]
        return {
            "nombre": obj.comprobante_nombre,
            "tipo": obj.comprobante_tipo,
            "tamano": obj.comprobante_tamano,
            "url": f"/pedidos/{lado}/{obj.pago.pedido_id}/pago/intentos/{obj.pk}/comprobante/",
        }

    @extend_schema_field(ResolucionIntentoSerializer(allow_null=True))
    def get_resolucion(self, obj: IntentoPago):
        revision = getattr(obj, "revision", None)
        return ResolucionIntentoSerializer(revision).data if revision else None


class PagoPedidoSerializer(serializers.Serializer):
    pedido = serializers.IntegerField(source="pedido.pk")
    estado = serializers.ChoiceField(choices=EstadoPago.choices, source="situacion.estado")
    moneda = serializers.CharField(source="pedido.moneda")
    total = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        source="pedido.total",
        help_text="100 % del total congelado del pedido; el cliente nunca lo envía.",
    )
    registrable_hasta = serializers.DateTimeField(
        source="situacion.registrable_hasta",
        allow_null=True,
        help_text="Límite (reloj del servidor) para registrar, corregir o volver a intentar; "
        "el instante exacto ya está vencido. null en registrado y confirmado.",
    )
    plazo_vencido = serializers.BooleanField(source="situacion.plazo_vencido")
    revision_pendiente = serializers.BooleanField(
        source="situacion.revision_pendiente",
        help_text="Hay un intento registrado esperando la revisión del taller.",
    )
    confirmado_en = serializers.DateTimeField(source="pago.confirmado_en", allow_null=True)
    intentos = serializers.SerializerMethodField()

    @extend_schema_field(IntentoPagoSerializer(many=True))
    def get_intentos(self, obj: VistaPago):
        if obj.pago is None:
            return []
        return IntentoPagoSerializer(obj.pago.intentos.all(), many=True, context=self.context).data

    def to_representation(self, instance: VistaPago):
        datos = super().to_representation(instance)
        if instance.pago is None:
            datos["confirmado_en"] = None
        return datos
