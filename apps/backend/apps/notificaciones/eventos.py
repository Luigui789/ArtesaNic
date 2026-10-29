"""Catálogo cerrado de eventos y claves internas; sin dependencias de otros servicios."""

from .services import emitir

# (referencia comercial, identidad del evento). El destinatario lo determina el servicio dueño.
EVENTOS = {
    "solicitud_recibida": ("solicitud", "solicitud"),
    "solicitud_rechazada": ("solicitud", "solicitud"),
    "propuesta_lista": ("solicitud", "propuesta"),
    "propuesta_aceptada": ("pedido", "decision"),
    "propuesta_rechazada": ("solicitud", "decision"),
    "pago_registrado": ("pedido", "intento"),
    "pago_corregido": ("pedido", "intento"),
    "pago_confirmado": ("pedido", "revision"),
    "pago_observado": ("pedido", "revision"),
    "pago_no_recibido": ("pedido", "revision"),
    "pedido_en_cumplimiento": ("pedido", "pedido"),
    "entrega_registrada": ("pedido", "entrega"),
    "pedido_entregado": ("pedido", "pedido"),
    "recepcion_confirmada": ("pedido", "recepcion"),
    "discrepancia_entrega": ("pedido", "recepcion"),
    "pedido_vencido_falta_pago": ("pedido", "pedido"),
    "pedido_cancelado_artesano": ("pedido", "cancelacion"),
    "cierre_parcial_propuesto": ("pedido", "cierre"),
    "cierre_parcial_objetado": ("pedido", "decision"),
    "pedido_cerrado_parcial": ("pedido", "decision"),
    "reembolso_creado": ("pedido", "reembolso"),
    "reembolso_realizado": ("pedido", "devolucion"),
}


def avisar(*, tipo, destinatario_id, evento_id, solicitud_id=None, pedido_id=None):
    referencia, recurso = EVENTOS[tipo]
    if (referencia == "solicitud") != bool(solicitud_id) or (referencia == "pedido") != bool(
        pedido_id
    ):
        raise ValueError("La referencia no corresponde al evento.")
    return emitir(
        destinatario_id=destinatario_id,
        tipo=tipo,
        clave_evento=f"{tipo}:{recurso}:{evento_id}",
        solicitud_id=solicitud_id,
        pedido_id=pedido_id,
    )
