"""Construcción del Pedido confirmado y su snapshot contractual (AUD-07)."""

from apps.propuestas.models import MONEDA, CargoPropuesta, LineaPropuesta, Propuesta

from .models import CargoPedido, LineaPedido, Pedido


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
    return pedido, lineas_pedido
