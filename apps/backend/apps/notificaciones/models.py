from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


class TipoNotificacion(models.TextChoices):
    SOLICITUD_RECIBIDA = "solicitud_recibida", "Solicitud recibida"
    SOLICITUD_RECHAZADA = "solicitud_rechazada", "Solicitud rechazada"
    PROPUESTA_LISTA = "propuesta_lista", "Propuesta lista"
    PROPUESTA_ACEPTADA = "propuesta_aceptada", "Propuesta aceptada"
    PROPUESTA_RECHAZADA = "propuesta_rechazada", "Propuesta rechazada"
    PAGO_REGISTRADO = "pago_registrado", "Pago registrado"
    PAGO_CORREGIDO = "pago_corregido", "Pago corregido"
    PAGO_CONFIRMADO = "pago_confirmado", "Pago confirmado"
    PAGO_OBSERVADO = "pago_observado", "Pago observado"
    PAGO_NO_RECIBIDO = "pago_no_recibido", "Pago no recibido"
    PEDIDO_EN_CUMPLIMIENTO = "pedido_en_cumplimiento", "Pedido en cumplimiento"
    ENTREGA_REGISTRADA = "entrega_registrada", "Entrega registrada"
    PEDIDO_ENTREGADO = "pedido_entregado", "Pedido entregado"
    RECEPCION_CONFIRMADA = "recepcion_confirmada", "Recepcion confirmada"
    DISCREPANCIA_ENTREGA = "discrepancia_entrega", "Discrepancia entrega"
    PEDIDO_VENCIDO_FALTA_PAGO = "pedido_vencido_falta_pago", "Pedido vencido falta pago"
    PEDIDO_CANCELADO_ARTESANO = "pedido_cancelado_artesano", "Pedido cancelado artesano"
    CIERRE_PARCIAL_PROPUESTO = "cierre_parcial_propuesto", "Cierre parcial propuesto"
    CIERRE_PARCIAL_OBJETADO = "cierre_parcial_objetado", "Cierre parcial objetado"
    PEDIDO_CERRADO_PARCIAL = "pedido_cerrado_parcial", "Pedido cerrado parcial"
    REEMBOLSO_CREADO = "reembolso_creado", "Reembolso creado"
    REEMBOLSO_REALIZADO = "reembolso_realizado", "Reembolso realizado"


class NotificacionesQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("La notificación solo se modifica mediante el servicio de lectura.")

    def delete(self):
        raise ValidationError("Una notificación no se elimina.")


class Notificacion(models.Model):
    destinatario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="notificaciones"
    )
    tipo = models.CharField(max_length=40, choices=TipoNotificacion.choices)
    solicitud = models.ForeignKey(
        "solicitudes.Solicitud", on_delete=models.PROTECT, null=True, blank=True
    )
    pedido = models.ForeignKey("pedidos.Pedido", on_delete=models.PROTECT, null=True, blank=True)
    clave_evento = models.CharField(max_length=160)
    creada_en = models.DateTimeField(default=timezone.now, editable=False)
    leida_en = models.DateTimeField(null=True, blank=True)

    objects = NotificacionesQuerySet.as_manager()

    class Meta:
        ordering = ["-creada_en", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["destinatario", "clave_evento"], name="notificacion_evento_unico"
            ),
            models.CheckConstraint(
                condition=(
                    Q(solicitud__isnull=False, pedido__isnull=True)
                    | Q(solicitud__isnull=True, pedido__isnull=False)
                ),
                name="notificacion_referencia_xor",
            ),
            models.CheckConstraint(
                condition=Q(tipo__in=TipoNotificacion.values), name="notificacion_tipo_valido"
            ),
        ]
        indexes = [
            models.Index(fields=["destinatario", "leida_en"], name="notificacion_lectura_idx"),
            models.Index(
                fields=["destinatario", "-creada_en", "-id"], name="notificacion_bandeja_idx"
            ),
        ]

    def __str__(self):
        return f"Notificación #{self.pk}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError(
                "La notificación solo se modifica mediante el servicio de lectura."
            )
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Una notificación no se elimina.")
