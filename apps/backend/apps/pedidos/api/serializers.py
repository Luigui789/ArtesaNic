from rest_framework import serializers

from apps.catalogo.api.serializers import TallerResumenSerializer
from apps.solicitudes.api.serializers import CompradorSolicitudSerializer
from apps.solicitudes.models import OrigenPersonalizacion

from ..models import CargoPedido, EstadoPedido, LineaPedido, Pedido


class CategoriaSnapshotSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    codigo = serializers.CharField(read_only=True)
    nombre = serializers.CharField(read_only=True)


class ProductoSnapshotSerializer(serializers.Serializer):
    """Representación contractual del producto congelada al confirmar el pedido (RN-003)."""

    id = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    categoria = CategoriaSnapshotSerializer(read_only=True)


class LineaPedidoSerializer(serializers.ModelSerializer):
    renglon = serializers.IntegerField(source="renglon_id", read_only=True)
    linea_propuesta = serializers.IntegerField(source="linea_propuesta_id", read_only=True)
    producto = serializers.SerializerMethodField()
    origen_personalizacion = serializers.ChoiceField(
        choices=OrigenPersonalizacion.choices, allow_blank=True, read_only=True
    )

    class Meta:
        model = LineaPedido
        fields = [
            "id",
            "renglon",
            "linea_propuesta",
            "posicion",
            "producto",
            "modalidad",
            "cantidad",
            "precio_unitario",
            "subtotal",
            "cargo_personalizacion",
            "fecha_solicitada",
            "fecha_comprometida",
            "caracteristicas",
            "origen_personalizacion",
        ]
        read_only_fields = fields

    def get_producto(self, obj: LineaPedido) -> ProductoSnapshotSerializer:
        return {
            "id": obj.producto_id,
            "nombre": obj.producto_nombre,
            "categoria": {
                "id": obj.categoria_id_historico,
                "codigo": obj.categoria_codigo,
                "nombre": obj.categoria_nombre,
            },
        }


class CargoPedidoSerializer(serializers.ModelSerializer):
    renglon = serializers.IntegerField(
        source="linea.renglon_id",
        read_only=True,
        allow_null=True,
        help_text="Renglón aceptado al que se atribuye; null si es un cargo global.",
    )

    class Meta:
        model = CargoPedido
        fields = ["posicion", "descripcion", "monto", "renglon"]
        read_only_fields = fields


class PedidoCompradorSerializer(serializers.ModelSerializer):
    """Snapshot contractual del pedido confirmado para el comprador propietario."""

    solicitud = serializers.IntegerField(source="solicitud_id", read_only=True)
    propuesta = serializers.IntegerField(source="propuesta_id", read_only=True)
    taller = TallerResumenSerializer(read_only=True)
    lineas = LineaPedidoSerializer(many=True, read_only=True)
    otros_cargos = CargoPedidoSerializer(source="cargos", many=True, read_only=True)
    estado = serializers.ChoiceField(
        source="estado_operativo.estado",
        choices=EstadoPedido.choices,
        read_only=True,
        help_text="Estado operativo del pedido (AUD-11); independiente del estado del pago.",
    )
    vencido_en = serializers.DateTimeField(
        source="estado_operativo.vencido_en",
        read_only=True,
        allow_null=True,
        help_text="Instante del vencimiento por falta de pago; null si no venció.",
    )

    class Meta:
        model = Pedido
        fields = [
            "id",
            "solicitud",
            "propuesta",
            "taller",
            "estado",
            "vencido_en",
            "confirmado_en",
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


class PedidoArtesanoSerializer(PedidoCompradorSerializer):
    """Snapshot contractual del pedido confirmado para el taller destinatario."""

    comprador = CompradorSolicitudSerializer(read_only=True)

    class Meta(PedidoCompradorSerializer.Meta):
        fields = [*PedidoCompradorSerializer.Meta.fields, "comprador"]
        read_only_fields = fields
