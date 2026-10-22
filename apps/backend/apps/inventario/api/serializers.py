from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.solicitudes.api.serializers import (
    CantidadEnteraField,
    ProductoSolicitudSerializer,
    RevisorSerializer,
)
from apps.talleres.models import PATRON_NO_EN_BLANCO

from ..models import (
    MAX_CANTIDAD,
    MAX_MOTIVO_MOVIMIENTO,
    InventarioProducto,
    MovimientoInventario,
    TipoMovimientoInventario,
)


class ExistenciaInicialEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    cantidad = CantidadEnteraField(
        min_value=0,
        max_value=MAX_CANTIDAD,
        help_text="Existencia física inicial del producto (entero ≥ 0).",
    )


class EntradaInventarioSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    cantidad = CantidadEnteraField(
        min_value=1,
        max_value=MAX_CANTIDAD,
        help_text="Cantidad física positiva a incorporar (entero ≥ 1).",
    )
    motivo = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_MOTIVO_MOVIMIENTO,
        help_text="Observación opcional de la entrada.",
    )


class AjusteInventarioSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    delta = CantidadEnteraField(
        min_value=-MAX_CANTIDAD,
        max_value=MAX_CANTIDAD,
        help_text="Variación entera distinta de cero (> 0 ajuste positivo, < 0 ajuste negativo).",
    )
    motivo = serializers.RegexField(
        PATRON_NO_EN_BLANCO,
        max_length=MAX_MOTIVO_MOVIMIENTO,
        error_messages={"invalid": "Indica el motivo del ajuste."},
        help_text="Motivo obligatorio del ajuste (RF-022, RN-021).",
    )

    def validate_delta(self, value: int) -> int:
        if value == 0:
            raise serializers.ValidationError("El ajuste debe ser distinto de cero.")
        return value


class InventarioProductoSerializer(serializers.ModelSerializer):
    producto = ProductoSolicitudSerializer(read_only=True)
    disponible = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventarioProducto
        fields = [
            "id",
            "producto",
            "existencia_fisica",
            "reservada",
            "disponible",
            "inicializado_en",
            "actualizado_en",
        ]
        read_only_fields = fields


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    producto = ProductoSolicitudSerializer(read_only=True)
    tipo = serializers.ChoiceField(choices=TipoMovimientoInventario.choices, read_only=True)
    actor = RevisorSerializer(read_only=True, allow_null=True)
    pedido = serializers.IntegerField(source="pedido_id", read_only=True, allow_null=True)
    linea_pedido = serializers.IntegerField(
        source="linea_pedido_id", read_only=True, allow_null=True
    )
    reserva = serializers.IntegerField(source="reserva_id", read_only=True, allow_null=True)

    class Meta:
        model = MovimientoInventario
        fields = [
            "id",
            "producto",
            "tipo",
            "cantidad",
            "existencia_antes",
            "existencia_despues",
            "reservada_antes",
            "reservada_despues",
            "actor",
            "pedido",
            "linea_pedido",
            "reserva",
            "motivo",
            "creado_en",
        ]
        read_only_fields = fields
