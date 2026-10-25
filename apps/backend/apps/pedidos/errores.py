"""Errores de dominio de la resolución del pedido (AUD-13): cancelación, cierre parcial,
reembolsos y clasificación de inventario.

Pedido ajeno y entrada mal formada reutilizan ``cumplimiento.PedidoNoEncontrado`` y
``cumplimiento.EntradaInvalida`` (AUD-12); los ``409`` usan códigos estables propios.
``pedido_vencido`` coincide con el de pagos y cumplimiento, y cumplimiento reutiliza
``pedido_finalizado`` y ``cierre_parcial_pendiente``: es el mismo hecho, no un código nuevo.
Este módulo no importa otros del paquete para que cualquiera pueda usarlo.
"""


class CierreNoEncontrado(Exception):
    """La propuesta de cierre no pertenece al pedido de la URL (404)."""


class ReembolsoNoEncontrado(Exception):
    """El pedido no tiene obligación de reembolso (404)."""


class CodigoConflictoResolucion:
    """Códigos estables de los ``409`` de AUD-13."""

    PEDIDO_FINALIZADO = "pedido_finalizado"
    PEDIDO_VENCIDO = "pedido_vencido"
    CANCELACION_REQUIERE_SIN_ENTREGAS = "cancelacion_requiere_sin_entregas"
    PAGO_PENDIENTE_DE_RESOLUCION = "pago_pendiente_de_resolucion"
    CIERRE_REQUIERE_ENTREGA_PARCIAL = "cierre_requiere_entrega_parcial"
    CIERRE_PARCIAL_PENDIENTE = "cierre_parcial_pendiente"
    CIERRE_YA_RESUELTO = "cierre_ya_resuelto"
    REEMBOLSO_YA_REALIZADO = "reembolso_ya_realizado"
    CLASIFICACION_EXCEDE_PENDIENTE = "clasificacion_excede_pendiente"

    MENSAJES = {
        PEDIDO_FINALIZADO: "El pedido ya finalizó y no admite esta acción.",
        PEDIDO_VENCIDO: "El pedido venció por falta de pago y no admite esta acción.",
        CANCELACION_REQUIERE_SIN_ENTREGAS: (
            "El pedido ya tiene entregas: en lugar de cancelarlo, propón un cierre parcial."
        ),
        PAGO_PENDIENTE_DE_RESOLUCION: (
            "Hay un pago registrado u observado sin resolver. Resuélvelo antes de cancelar."
        ),
        CIERRE_REQUIERE_ENTREGA_PARCIAL: (
            "El cierre parcial requiere al menos una unidad entregada y otra pendiente."
        ),
        CIERRE_PARCIAL_PENDIENTE: (
            "Hay una propuesta de cierre parcial esperando la respuesta del comprador."
        ),
        CIERRE_YA_RESUELTO: "Esta propuesta de cierre ya fue respondida.",
        REEMBOLSO_YA_REALIZADO: "La devolución de este reembolso ya fue registrada.",
        CLASIFICACION_EXCEDE_PENDIENTE: (
            "La cantidad indicada supera las unidades pendientes de clasificar."
        ),
    }


class ConflictoResolucion(Exception):
    """Acción incompatible con el estado actual; no produce ningún efecto."""

    def __init__(self, codigo: str, obligaciones: list[int] | None = None):
        self.codigo = codigo
        self.mensaje = CodigoConflictoResolucion.MENSAJES[codigo]
        # Obligaciones afectadas (clasificación): ayudan a la interfaz a señalarlas.
        self.obligaciones = obligaciones or []
        super().__init__(self.mensaje)


class ResolucionInconsistente(Exception):
    """Una invariante previa no se cumple (reserva liberada antes de finalizar, snapshot que
    no coincide con el ledger, desglose que no suma el total). Se registra ``CRITICAL`` y la
    transacción completa se revierte; no se repara automáticamente."""
