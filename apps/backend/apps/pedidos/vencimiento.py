"""Vencimiento automático por falta de pago (AUD-11; RN-013/014/015, RN-021, RN-024).

Un pedido ``confirmado`` vence cuando ``situacion_pago()`` (AUD-10) indica plazo vencido:

- sin ``Pago`` y ``ahora >= confirmado_en + 48 h``;
- ``observado`` o ``no_recibido`` y ``ahora >= plazo_hasta``.

``registrado`` (revisión pendiente) y ``confirmado`` nunca vencen. El instante límite ya
está vencido (D-AUD11-08). La consulta de candidatos es solo un filtro barato: la decisión
final se revalida dentro del lock con la misma ``situacion_pago()`` que usan los servicios
de pago, de modo que comprador y proceso compiten por el lock del ``Pedido`` y el segundo
ve el resultado del primero.

Orden de locks (compatible con AUD-10 y AUD-07):
``Pedido → Pago → EstadoOperativoPedido → ReservaInventario → InventarioProducto``
(los inventarios por ``producto_id`` ascendente). Una transacción por pedido.
"""

import logging
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q

from apps.inventario import services as inventario
from apps.notificaciones import eventos as notificaciones
from apps.pagos import services as pagos
from apps.pagos.models import ESTADOS_CON_PLAZO, PLAZO, Pago

from .models import (
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    Pedido,
    TipoEventoPedido,
)

logger = logging.getLogger(__name__)

TAMANO_LOTE = 100
# Nombre estable para el registro técnico posterior al commit.
EVENTO_VENCIDO = "pedido_vencido_falta_pago"


def candidatos(momento, *, despues_de: int = 0, limite: int = TAMANO_LOTE) -> list[int]:
    """Ids de pedidos posiblemente vencidos, ascendentes y por lote (sin cargar objetos)."""
    return list(
        EstadoOperativoPedido.objects.filter(
            estado=EstadoPedido.CONFIRMADO, pedido_id__gt=despues_de
        )
        .filter(
            Q(pedido__pago__isnull=True, pedido__confirmado_en__lte=momento - PLAZO)
            | Q(
                pedido__pago__estado__in=ESTADOS_CON_PLAZO,
                pedido__pago__plazo_hasta__lte=momento,
            )
        )
        .order_by("pedido_id")
        .values_list("pedido_id", flat=True)[:limite]
    )


def _notificar_vencimiento(pedido_id: int, momento, liberadas: int) -> None:
    """Registro técnico tras el commit; el aviso persistente se escribe en la transacción."""
    logger.info(
        "%s pedido_id=%s vencido_en=%s reservas_liberadas=%s",
        EVENTO_VENCIDO,
        pedido_id,
        momento.isoformat(),
        liberadas,
    )


@transaction.atomic
def vencer_pedido(pedido_id: int) -> bool:
    """Vence el pedido y libera sus reservas activas si sigue siendo elegible.

    Devuelve ``True`` si realizó la transición y ``False`` si ya no corresponde (ya vencido,
    pago registrado o confirmado, plazo vigente). Si encuentra una reserva no activa lanza
    ``inventario.ReservaInconsistente`` y la transacción completa se revierte.
    """
    pedido = Pedido.objects.select_for_update(of=("self",)).filter(pk=pedido_id).first()
    if pedido is None:
        return False
    pago = Pago.objects.select_for_update().filter(pedido=pedido).first()
    momento = pagos.ahora()
    situacion = pagos.situacion_pago(pedido, pago, momento)
    estado = EstadoOperativoPedido.objects.select_for_update().get(pedido=pedido)
    if (
        estado.estado != EstadoPedido.CONFIRMADO
        or situacion.revision_pendiente
        or not situacion.plazo_vencido
    ):
        return False
    try:
        liberadas = inventario.liberar_reservas_de_pedido(
            pedido=pedido, motivo=inventario.MOTIVO_LIBERACION_VENCIMIENTO
        )
    except inventario.ReservaInconsistente as exc:
        logger.critical(
            "Vencimiento abortado: reserva inconsistente pedido_id=%s reserva_id=%s estado=%s",
            pedido.pk,
            exc.reserva_id,
            exc.estado,
        )
        raise
    estado.estado = EstadoPedido.VENCIDO_FALTA_PAGO
    estado.vencido_en = momento
    estado.actualizado_en = momento
    estado.save(update_fields=["estado", "vencido_en", "actualizado_en"])
    EventoEstadoPedido.objects.create(
        pedido=pedido,
        estado_anterior=EstadoPedido.CONFIRMADO,
        estado_nuevo=EstadoPedido.VENCIDO_FALTA_PAGO,
        tipo=TipoEventoPedido.AUTOMATICO,
        actor=None,
        creado_en=momento,
    )
    for destinatario_id in (pedido.comprador_id, pedido.taller.propietario_id):
        notificaciones.avisar(
            tipo="pedido_vencido_falta_pago",
            destinatario_id=destinatario_id,
            evento_id=pedido.pk,
            pedido_id=pedido.pk,
        )
    transaction.on_commit(lambda: _notificar_vencimiento(pedido.pk, momento, len(liberadas)))
    return True


@dataclass
class ResultadoCiclo:
    vencidos: int = 0
    no_elegibles: int = 0
    errores: int = 0


def procesar_vencimientos(*, tamano_lote: int = TAMANO_LOTE) -> ResultadoCiclo:
    """Una iteración completa: recorre todos los candidatos actuales por lotes.

    Avanza con un cursor por ``pedido_id`` para visitar cada candidato una vez por ciclo:
    un pedido que falla (inconsistencia) no bloquea a los demás ni provoca un bucle.
    """
    resultado = ResultadoCiclo()
    ultimo = 0
    while lote := candidatos(pagos.ahora(), despues_de=ultimo, limite=tamano_lote):
        for pedido_id in lote:
            try:
                if vencer_pedido(pedido_id):
                    resultado.vencidos += 1
                else:
                    resultado.no_elegibles += 1
            except inventario.ReservaInconsistente:
                resultado.errores += 1
            except Exception:
                logger.exception("Error al procesar el vencimiento del pedido_id=%s", pedido_id)
                resultado.errores += 1
        ultimo = lote[-1]
    return resultado
