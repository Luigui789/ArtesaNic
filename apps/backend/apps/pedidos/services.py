"""Construcción del Pedido confirmado y su snapshot contractual (AUD-07)."""

import logging

from apps.propuestas.models import MONEDA, CargoPropuesta, LineaPropuesta, Propuesta

from .models import (
    CargoPedido,
    CumplimientoLineaPedido,
    DistribucionEconomicaLineaPedido,
    EstadoOperativoPedido,
    EstadoPedido,
    LineaPedido,
    Pedido,
)

logger = logging.getLogger(__name__)


class DistribucionAusente(Exception):
    """La propuesta aceptada no tiene su distribución congelada (D-AUD13-08)."""


def crear_pedido_desde_propuesta(
    *,
    propuesta: Propuesta,
    lineas_propuesta: list[LineaPropuesta],
    cargos_propuesta: list[CargoPropuesta],
    confirmado_en,
) -> tuple[Pedido, list[LineaPedido]]:
    """Copia el snapshot contractual completo desde la propuesta emitida y los renglones
    aceptados. Nunca lee ``Producto.precio`` actual ni recalcula importes."""
    solicitud = propuesta.solicitud
    pedido = Pedido.objects.create(
        propuesta=propuesta,
        solicitud=solicitud,
        comprador_id=solicitud.comprador_id,
        taller_id=solicitud.taller_id,
        confirmado_en=confirmado_en,
        moneda=MONEDA,
        modalidad_entrega=propuesta.modalidad_entrega,
        descripcion_entrega=propuesta.descripcion_entrega,
        costo_entrega=propuesta.costo_entrega,
        subtotal_productos=propuesta.subtotal_productos,
        total_personalizacion=propuesta.total_personalizacion,
        total_otros_cargos=propuesta.total_otros_cargos,
        total=propuesta.total,
    )
    lineas_pedido: list[LineaPedido] = []
    for lp in lineas_propuesta:
        renglon = lp.renglon
        producto = renglon.producto
        categoria = producto.categoria
        lineas_pedido.append(
            LineaPedido(
                pedido=pedido,
                linea_propuesta=lp,
                renglon=renglon,
                producto=producto,
                posicion=renglon.posicion,
                producto_nombre=producto.nombre,
                categoria_id_historico=categoria.pk,
                categoria_codigo=categoria.codigo,
                categoria_nombre=categoria.nombre,
                modalidad=lp.modalidad,
                cantidad=lp.cantidad,
                precio_unitario=lp.precio_unitario,
                subtotal=lp.subtotal,
                cargo_personalizacion=lp.cargo_personalizacion,
                fecha_solicitada=renglon.fecha_solicitada,
                fecha_comprometida=lp.fecha_comprometida,
                caracteristicas=renglon.caracteristicas,
                origen_personalizacion=renglon.origen_personalizacion,
            )
        )
    LineaPedido.objects.bulk_create(lineas_pedido)
    linea_por_lp_id = {lp.linea_propuesta_id: lp for lp in lineas_pedido}
    CargoPedido.objects.bulk_create(
        CargoPedido(
            pedido=pedido,
            cargo_propuesta=cargo,
            linea=linea_por_lp_id.get(cargo.linea_id),
            posicion=cargo.posicion,
            descripcion=cargo.descripcion,
            monto=cargo.monto,
        )
        for cargo in cargos_propuesta
    )
    # Distribución económica copiada exactamente desde la propuesta, sin recalcular
    # (AUD-13, D-AUD13-08): completa el desglose por renglón del snapshot.
    DistribucionEconomicaLineaPedido.objects.bulk_create(
        DistribucionEconomicaLineaPedido(
            linea_pedido=linea,
            otros_compartidos_asignados=_distribucion(
                linea.linea_propuesta
            ).otros_compartidos_asignados,
            entrega_asignada=_distribucion(linea.linea_propuesta).entrega_asignada,
        )
        for linea in lineas_pedido
    )
    # Estado operativo inicial en la misma transacción de confirmación (D-AUD11-02).
    EstadoOperativoPedido.objects.create(
        pedido=pedido, estado=EstadoPedido.CONFIRMADO, actualizado_en=confirmado_en
    )
    # Cumplimiento pendiente por renglón, también en la misma transacción (D-AUD12-04).
    CumplimientoLineaPedido.objects.bulk_create(
        CumplimientoLineaPedido(linea_pedido=linea, actualizado_en=confirmado_en)
        for linea in lineas_pedido
    )
    return pedido, lineas_pedido


def _distribucion(linea_propuesta: LineaPropuesta):
    distribucion = getattr(linea_propuesta, "distribucion", None)
    if distribucion is None:
        logger.critical(
            "Confirmación abortada: línea de propuesta sin distribución linea_propuesta_id=%s",
            linea_propuesta.pk,
        )
        raise DistribucionAusente(f"Línea de propuesta #{linea_propuesta.pk} sin distribución.")
    return distribucion


def completar_distribuciones_pedido(
    *, LineaPedido, DistribucionEconomicaLineaPedido, DistribucionEconomicaLineaPropuesta
) -> int:
    """Copia la distribución congelada de la propuesta a las líneas de pedidos previos a
    AUD-13 que no la tengan. Idempotente y sin tocar ningún importe del snapshot.

    Recibe las clases de modelo para servir a la migración de datos y a las pruebas.
    """
    pendientes = list(
        LineaPedido.objects.filter(distribucion__isnull=True)
        .order_by("pk")
        .values_list("pk", "linea_propuesta_id")
    )
    origen = {
        d.linea_propuesta_id: d
        for d in DistribucionEconomicaLineaPropuesta.objects.filter(
            linea_propuesta_id__in=[lp for _, lp in pendientes]
        )
    }
    nuevas = []
    for linea_id, linea_propuesta_id in pendientes:
        fuente = origen.get(linea_propuesta_id)
        if fuente is None:
            raise DistribucionAusente(f"Línea de propuesta #{linea_propuesta_id} sin distribución.")
        nuevas.append(
            DistribucionEconomicaLineaPedido(
                linea_pedido_id=linea_id,
                otros_compartidos_asignados=fuente.otros_compartidos_asignados,
                entrega_asignada=fuente.entrega_asignada,
            )
        )
    DistribucionEconomicaLineaPedido.objects.bulk_create(nuevas, batch_size=500)
    return len(nuevas)
