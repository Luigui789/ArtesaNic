from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin
from apps.catalogo.api.serializers import TallerResumenSerializer
from apps.catalogo.models import Modalidad
from apps.inventario.models import MAX_MOTIVO_MOVIMIENTO, ResultadoClasificacion
from apps.propuestas.models import DECIMALES, DIGITOS_IMPORTE
from apps.solicitudes.api.serializers import CompradorSolicitudSerializer
from apps.solicitudes.models import OrigenPersonalizacion

from .. import cumplimiento, reembolsos, resolucion
from ..clasificacion import MAX_CLASIFICACIONES
from ..cumplimiento import MAX_CANTIDAD
from ..models import (
    MAX_MOTIVO_CANCELACION,
    MAX_MOTIVO_CIERRE,
    MAX_MOTIVO_DISCREPANCIA,
    MAX_MOTIVO_OBJECION,
    MAX_REFERENCIA_DEVOLUCION,
    CargoPedido,
    EstadoCierreParcial,
    EstadoLineaCumplimiento,
    EstadoPedido,
    EstadoReembolso,
    LineaPedido,
    Pedido,
    ResultadoCierreParcial,
    ResultadoRecepcion,
    TipoReembolso,
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


# --- Resolución: cancelación, cierre parcial y reembolso (AUD-13) ---

# Origen de un reembolso o de una obligación de clasificación.
ORIGENES = [("cancelacion", "Cancelación del taller"), ("cierre_parcial", "Cierre parcial")]


class CancelacionEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    motivo = serializers.CharField(
        allow_blank=True,
        max_length=MAX_MOTIVO_CANCELACION,
        help_text="Imposibilidad justificada; obligatorio, 1–"
        f"{MAX_MOTIVO_CANCELACION} caracteres tras recortar.",
    )


class CierreEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    motivo = serializers.CharField(
        allow_blank=True,
        max_length=MAX_MOTIVO_CIERRE,
        help_text=f"Obligatorio, 1–{MAX_MOTIVO_CIERRE} caracteres tras recortar. Cantidades e "
        "importes no se envían: los deriva el servidor del ledger de entregas.",
    )


class RespuestaCierreEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    decision = serializers.ChoiceField(choices=ResultadoCierreParcial.choices)
    motivo = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_MOTIVO_OBJECION,
        help_text="Obligatorio y no vacío (tras recortar) en `objetado`, hasta "
        f"{MAX_MOTIVO_OBJECION} caracteres; no se admite en `aceptado`.",
    )


class DevolucionEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Solo fecha y referencia: monto, moneda y estado proceden del servidor (`400`)."""

    fecha = serializers.DateField(
        help_text="Fecha de la devolución externa (`AAAA-MM-DD`); no posterior a la fecha "
        "actual de America/Managua según el servidor."
    )
    referencia = serializers.CharField(
        allow_blank=True,
        max_length=MAX_REFERENCIA_DEVOLUCION,
        help_text=f"Obligatoria, 1–{MAX_REFERENCIA_DEVOLUCION} caracteres tras recortar.",
    )


class LineaCierreSerializer(serializers.Serializer):
    linea = serializers.IntegerField(help_text="Id de la `LineaPedido`.")
    posicion = serializers.IntegerField()
    cantidad_acordada = serializers.IntegerField()
    cantidad_entregada = serializers.IntegerField()
    cantidad_no_entregada = serializers.IntegerField()
    importe_reembolso = serializers.DecimalField(
        max_digits=DIGITOS_IMPORTE, decimal_places=DECIMALES
    )


class DecisionCierreSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=ResultadoCierreParcial.choices)
    motivo = serializers.CharField(allow_blank=True)
    registrado_en = serializers.DateTimeField()


class CierreParcialSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    numero = serializers.IntegerField()
    estado = serializers.ChoiceField(choices=EstadoCierreParcial.choices)
    motivo = serializers.CharField()
    propuesto_en = serializers.DateTimeField()
    lineas = LineaCierreSerializer(many=True, help_text="Snapshot congelado al proponer.")
    monto_reembolso = serializers.DecimalField(
        max_digits=DIGITOS_IMPORTE,
        decimal_places=DECIMALES,
        help_text="Σ `importe_reembolso`, calculado por el servidor.",
    )
    decision = DecisionCierreSerializer(
        allow_null=True, help_text="Respuesta del comprador; null mientras esté pendiente."
    )


class EstimacionCierreSerializer(serializers.Serializer):
    lineas = LineaCierreSerializer(many=True)
    monto_reembolso = serializers.DecimalField(max_digits=DIGITOS_IMPORTE, decimal_places=DECIMALES)


class CancelacionSerializer(serializers.Serializer):
    motivo = serializers.CharField()
    registrado_en = serializers.DateTimeField()


class DevolucionSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    monto = serializers.DecimalField(max_digits=DIGITOS_IMPORTE, decimal_places=DECIMALES)
    referencia = serializers.CharField()
    registrado_en = serializers.DateTimeField()


class ReembolsoSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    tipo = serializers.ChoiceField(choices=TipoReembolso.choices)
    monto = serializers.DecimalField(max_digits=DIGITOS_IMPORTE, decimal_places=DECIMALES)
    moneda = serializers.CharField()
    estado = serializers.ChoiceField(
        choices=EstadoReembolso.choices,
        help_text="Derivado: `realizado` cuando existe la devolución registrada.",
    )
    origen = serializers.ChoiceField(choices=ORIGENES)
    cierre = serializers.IntegerField(
        allow_null=True, help_text="Id de la propuesta de cierre aceptada (si es parcial)."
    )
    creado_en = serializers.DateTimeField()
    devolucion = DevolucionSerializer(allow_null=True)


class AccionSerializer(serializers.Serializer):
    disponible = serializers.BooleanField()
    codigo = serializers.CharField(
        allow_null=True, help_text="Código `409` que respondería la acción ahora, si no procede."
    )


class AccionesResolucionSerializer(serializers.Serializer):
    cancelar = AccionSerializer()
    proponer_cierre = AccionSerializer()


class ResolucionPedidoSerializer(serializers.Serializer):
    """Misma información comercial para comprador y artesano (sin datos de inventario)."""

    pedido = serializers.IntegerField()
    estado = serializers.ChoiceField(choices=EstadoPedido.choices)
    cancelacion = CancelacionSerializer(allow_null=True)
    cierres_parciales = CierreParcialSerializer(many=True)
    reembolso = ReembolsoSerializer(allow_null=True)
    acciones = AccionesResolucionSerializer(
        help_text="Acciones del artesano según las mismas reglas del servidor; orientativo, "
        "la mutación vuelve a validar dentro de su transacción."
    )
    estimacion_cierre = EstimacionCierreSerializer(
        allow_null=True,
        help_text="Cantidades e importe que congelaría un cierre propuesto ahora; null si "
        "no procede.",
    )


def _lineas_cierre(lineas) -> list[dict]:
    return [
        {
            "linea": c.linea_pedido_id,
            "posicion": c.posicion,
            "cantidad_acordada": c.cantidad_acordada,
            "cantidad_entregada": c.cantidad_entregada,
            "cantidad_no_entregada": c.cantidad_no_entregada,
            "importe_reembolso": c.importe_reembolso,
        }
        for c in lineas
    ]


def vista_resolucion(pedido: Pedido) -> dict:
    """Lectura desde un pedido cargado con ``selectors.pedido_con_resolucion``."""
    estado = pedido.estado_operativo.estado
    pago = getattr(pedido, "pago", None)
    lineas = list(pedido.lineas.all())
    entregadas = cumplimiento.cantidades_entregadas(pedido)
    cierres = []
    for cierre in pedido.cierres_parciales.all():
        decision = getattr(cierre, "decision", None)
        filas = [
            reembolsos.LineaCalculada(
                linea_pedido_id=lc.linea_pedido_id,
                posicion=lc.linea_pedido.posicion,
                cantidad_acordada=lc.cantidad_acordada,
                cantidad_entregada=lc.cantidad_entregada,
                cantidad_no_entregada=lc.cantidad_no_entregada,
                importe_reembolso=lc.importe_reembolso,
            )
            for lc in cierre.lineas.all()
        ]
        cierres.append(
            {
                "id": cierre.pk,
                "numero": cierre.numero,
                "estado": decision.decision if decision else EstadoCierreParcial.PENDIENTE,
                "motivo": cierre.motivo,
                "propuesto_en": cierre.propuesto_en,
                "lineas": _lineas_cierre(filas),
                "monto_reembolso": reembolsos.monto_total(filas),
                "decision": None
                if decision is None
                else {
                    "decision": decision.decision,
                    "motivo": decision.motivo,
                    "registrado_en": decision.registrado_en,
                },
            }
        )
    pendiente = any(c["estado"] == EstadoCierreParcial.PENDIENTE for c in cierres)
    hay_entregas = sum(entregadas.values()) > 0
    cancelar = resolucion.conflicto_cancelacion(estado, pago, hay_entregas)
    acordadas = {linea.pk: linea.cantidad for linea in lineas}
    proponer = resolucion.conflicto_cierre(estado, pendiente, acordadas, entregadas)
    estimacion = None
    if proponer is None:
        calculadas = reembolsos.calcular_cierre(pedido, lineas, entregadas)
        estimacion = {
            "lineas": _lineas_cierre(calculadas),
            "monto_reembolso": reembolsos.monto_total(calculadas),
        }
    reembolso = getattr(pedido, "reembolso", None)
    cancelacion = getattr(pedido, "cancelacion", None)
    return {
        "pedido": pedido.pk,
        "estado": estado,
        "cancelacion": None
        if cancelacion is None
        else {"motivo": cancelacion.motivo, "registrado_en": cancelacion.registrado_en},
        "cierres_parciales": cierres,
        "reembolso": None if reembolso is None else _reembolso(reembolso),
        "acciones": {
            "cancelar": {"disponible": cancelar is None, "codigo": cancelar},
            "proponer_cierre": {"disponible": proponer is None, "codigo": proponer},
        },
        "estimacion_cierre": estimacion,
    }


def _reembolso(reembolso) -> dict:
    devolucion = getattr(reembolso, "devolucion", None)
    return {
        "id": reembolso.pk,
        "tipo": reembolso.tipo,
        "monto": reembolso.monto,
        "moneda": reembolso.moneda,
        "estado": reembolsos.estado_reembolso(reembolso),
        "origen": "cancelacion" if reembolso.cancelacion_id else "cierre_parcial",
        "cierre": reembolso.cierre_parcial_id,
        "creado_en": reembolso.creado_en,
        "devolucion": None
        if devolucion is None
        else {
            "fecha": devolucion.fecha,
            "monto": devolucion.monto,
            "referencia": devolucion.referencia,
            "registrado_en": devolucion.registrado_en,
        },
    }


# --- Clasificación de unidades manipuladas (AUD-13, solo artesano) ---


class ClasificacionEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    obligacion = serializers.IntegerField(min_value=1, help_text="Id de la obligación.")
    cantidad = serializers.IntegerField(min_value=1, max_value=MAX_CANTIDAD)
    resultado = serializers.ChoiceField(choices=ResultadoClasificacion.choices)
    motivo = serializers.CharField(
        allow_blank=True,
        max_length=MAX_MOTIVO_MOVIMIENTO,
        help_text=f"Obligatorio en ambos resultados, 1–{MAX_MOTIVO_MOVIMIENTO} caracteres.",
    )


class ClasificacionesEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    clasificaciones = ClasificacionEntradaSerializer(
        many=True,
        allow_empty=False,
        max_length=MAX_CLASIFICACIONES,
        help_text="Cada obligación una sola vez por petición; el orden no importa.",
    )


class ClasificacionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    cantidad = serializers.IntegerField()
    resultado = serializers.ChoiceField(choices=ResultadoClasificacion.choices)
    motivo = serializers.CharField()
    registrado_en = serializers.DateTimeField()


class ObligacionClasificacionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    linea = serializers.IntegerField(help_text="Id de la `LineaPedido`.")
    posicion = serializers.IntegerField()
    producto = ProductoSnapshotSerializer()
    origen = serializers.ChoiceField(choices=ORIGENES)
    cantidad = serializers.IntegerField(help_text="Unidades consumidas y no entregadas.")
    cantidad_clasificada = serializers.IntegerField()
    cantidad_pendiente = serializers.IntegerField()
    creado_en = serializers.DateTimeField()
    clasificaciones = ClasificacionSerializer(many=True)


class ClasificacionesPedidoSerializer(serializers.Serializer):
    pedido = serializers.IntegerField()
    obligaciones = ObligacionClasificacionSerializer(many=True)


def vista_clasificaciones(pedido: Pedido, obligaciones) -> dict:
    filas = []
    for o in obligaciones:
        clasificaciones = list(o.clasificaciones.all())
        clasificada = sum(c.cantidad for c in clasificaciones)
        linea = o.linea_pedido
        filas.append(
            {
                "id": o.pk,
                "linea": linea.pk,
                "posicion": linea.posicion,
                "producto": {
                    "id": linea.producto_id,
                    "nombre": linea.producto_nombre,
                    "categoria": {
                        "id": linea.categoria_id_historico,
                        "codigo": linea.categoria_codigo,
                        "nombre": linea.categoria_nombre,
                    },
                },
                "origen": "cancelacion" if o.cancelacion_id else "cierre_parcial",
                "cantidad": o.cantidad,
                "cantidad_clasificada": clasificada,
                "cantidad_pendiente": o.cantidad - clasificada,
                "creado_en": o.creado_en,
                "clasificaciones": [
                    {
                        "id": c.pk,
                        "cantidad": c.cantidad,
                        "resultado": c.resultado,
                        "motivo": c.motivo,
                        "registrado_en": c.registrado_en,
                    }
                    for c in clasificaciones
                ],
            }
        )
    return {"pedido": pedido.pk, "obligaciones": filas}
