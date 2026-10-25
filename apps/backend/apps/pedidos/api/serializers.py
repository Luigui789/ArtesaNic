from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.catalogo.api.serializers import TallerResumenSerializer
from apps.catalogo.models import Modalidad
from apps.solicitudes.api.serializers import CompradorSolicitudSerializer
from apps.solicitudes.models import OrigenPersonalizacion

from ..cumplimiento import MAX_CANTIDAD
from ..models import (
    MAX_MOTIVO_DISCREPANCIA,
    CargoPedido,
    EstadoLineaCumplimiento,
    EstadoPedido,
    LineaPedido,
    Pedido,
    ResultadoRecepcion,
)


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


# --- Cumplimiento por renglón y entregas (AUD-12) ---


class LineaEntregaEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    linea = serializers.IntegerField(min_value=1, help_text="Id de la `LineaPedido`.")
    cantidad = serializers.IntegerField(
        min_value=1, max_value=MAX_CANTIDAD, help_text="Unidades entregadas (> 0)."
    )


class EntregaEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    fecha = serializers.DateField(
        help_text="Fecha declarada de la entrega efectiva (`AAAA-MM-DD`); no puede ser "
        "posterior a la fecha actual de America/Managua según el servidor."
    )
    lineas = LineaEntregaEntradaSerializer(
        many=True,
        allow_empty=False,
        help_text="Renglones entregados, cada uno una sola vez; el orden no importa.",
    )


class InicioLineaEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Cuerpo vacío `{}`: pedido y línea vienen de la URL; el actor, de la autenticación."""


class RecepcionEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    resultado = serializers.ChoiceField(choices=ResultadoRecepcion.choices)
    motivo = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_MOTIVO_DISCREPANCIA,
        help_text="Obligatorio y no vacío (tras recortar) en `discrepancia`, hasta "
        f"{MAX_MOTIVO_DISCREPANCIA} caracteres; no se admite en `confirmada`.",
    )

    def validate(self, attrs):
        motivo = (attrs.get("motivo") or "").strip()
        if attrs["resultado"] == ResultadoRecepcion.CONFIRMADA:
            if motivo:
                raise serializers.ValidationError(
                    {"motivo": ["Confirmar la recepción no lleva motivo."]}
                )
        elif not motivo:
            raise serializers.ValidationError({"motivo": ["Describe la discrepancia."]})
        attrs["motivo"] = motivo
        return attrs


class CumplimientoLineaSerializer(serializers.Serializer):
    linea = serializers.IntegerField(help_text="Id de la `LineaPedido`.")
    posicion = serializers.IntegerField()
    modalidad = serializers.ChoiceField(choices=Modalidad.choices)
    cantidad = serializers.IntegerField(help_text="Cantidad acordada (snapshot).")
    estado = serializers.ChoiceField(
        choices=EstadoLineaCumplimiento.choices,
        help_text="Derivado: `pendiente` sin inicio; `en_cumplimiento` iniciado con "
        "cantidad pendiente; `entregado` cuando lo entregado alcanza lo acordado.",
    )
    iniciado_en = serializers.DateTimeField(allow_null=True)
    cantidad_entregada = serializers.IntegerField(help_text="Suma del ledger de entregas.")
    cantidad_pendiente = serializers.IntegerField()


class CantidadEntregadaSerializer(serializers.Serializer):
    linea = serializers.IntegerField()
    cantidad = serializers.IntegerField()


class RecepcionSerializer(serializers.Serializer):
    resultado = serializers.ChoiceField(choices=ResultadoRecepcion.choices)
    motivo = serializers.CharField(allow_blank=True)
    registrado_en = serializers.DateTimeField()


class EntregaSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    numero = serializers.IntegerField()
    fecha = serializers.DateField(help_text="Fecha declarada de la entrega.")
    registrado_en = serializers.DateTimeField(help_text="Instante real del registro (servidor).")
    lineas = CantidadEntregadaSerializer(many=True)
    recepcion = RecepcionSerializer(
        allow_null=True, help_text="Respuesta del comprador; null mientras no responda."
    )


class CumplimientoPedidoSerializer(serializers.Serializer):
    """Representación equivalente para comprador y artesano (sin ids de inventario)."""

    pedido = serializers.IntegerField()
    estado = serializers.ChoiceField(choices=EstadoPedido.choices)
    lineas = CumplimientoLineaSerializer(many=True)
    entregas = EntregaSerializer(many=True)


def vista_cumplimiento(pedido: Pedido) -> dict:
    """Construye la lectura desde un pedido cargado con ``selectors.pedido_con_cumplimiento``."""
    entregadas: dict[int, int] = {}
    entregas = []
    for entrega in pedido.entregas.all():
        lineas = []
        for le in entrega.lineas.all():
            entregadas[le.linea_pedido_id] = entregadas.get(le.linea_pedido_id, 0) + le.cantidad
            lineas.append({"linea": le.linea_pedido_id, "cantidad": le.cantidad})
        recepcion = getattr(entrega, "recepcion", None)
        entregas.append(
            {
                "id": entrega.pk,
                "numero": entrega.numero,
                "fecha": entrega.fecha,
                "registrado_en": entrega.registrado_en,
                "lineas": lineas,
                "recepcion": None
                if recepcion is None
                else {
                    "resultado": recepcion.resultado,
                    "motivo": recepcion.motivo,
                    "registrado_en": recepcion.registrado_en,
                },
            }
        )
    lineas = []
    for linea in pedido.lineas.all():
        iniciado_en = linea.cumplimiento.iniciado_en
        entregada = entregadas.get(linea.pk, 0)
        if entregada == linea.cantidad:
            estado = EstadoLineaCumplimiento.ENTREGADO
        elif iniciado_en is not None:
            estado = EstadoLineaCumplimiento.EN_CUMPLIMIENTO
        else:
            estado = EstadoLineaCumplimiento.PENDIENTE
        lineas.append(
            {
                "linea": linea.pk,
                "posicion": linea.posicion,
                "modalidad": linea.modalidad,
                "cantidad": linea.cantidad,
                "estado": estado,
                "iniciado_en": iniciado_en,
                "cantidad_entregada": entregada,
                "cantidad_pendiente": linea.cantidad - entregada,
            }
        )
    return {
        "pedido": pedido.pk,
        "estado": pedido.estado_operativo.estado,
        "lineas": lineas,
        "entregas": entregas,
    }
