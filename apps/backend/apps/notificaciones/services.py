import logging

from django.db import transaction
from django.utils import timezone

from .models import Notificacion, TipoNotificacion

logger = logging.getLogger(__name__)


class ColisionNotificacion(RuntimeError):
    pass


def emitir(*, destinatario_id, tipo, clave_evento, solicitud_id=None, pedido_id=None):
    if tipo not in TipoNotificacion.values or bool(solicitud_id) == bool(pedido_id):
        raise ValueError("Tipo o referencia de notificación inválida.")
    if not clave_evento or len(clave_evento) > 160:
        raise ValueError("Clave de evento inválida.")
    with transaction.atomic():
        aviso, creado = Notificacion.objects.get_or_create(
            destinatario_id=destinatario_id,
            clave_evento=clave_evento,
            defaults={"tipo": tipo, "solicitud_id": solicitud_id, "pedido_id": pedido_id},
        )
        if not creado and (aviso.tipo, aviso.solicitud_id, aviso.pedido_id) != (
            tipo,
            solicitud_id,
            pedido_id,
        ):
            logger.critical(
                "Colisión de evento de notificación destinatario_id=%s", destinatario_id
            )
            raise ColisionNotificacion("Colisión inconsistente de notificación.")
        return aviso


def marcar_leida(*, destinatario_id, notificacion_id):
    Notificacion._base_manager.filter(
        destinatario_id=destinatario_id, pk=notificacion_id, leida_en__isnull=True
    ).update(leida_en=timezone.now())
    return Notificacion._base_manager.filter(
        destinatario_id=destinatario_id, pk=notificacion_id
    ).first()


def marcar_todas(*, destinatario_id):
    return Notificacion._base_manager.filter(
        destinatario_id=destinatario_id, leida_en__isnull=True
    ).update(leida_en=timezone.now())
