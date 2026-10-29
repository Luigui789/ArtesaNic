"""Mensaje de texto de la conversación privada de un pedido confirmado (AUD-16).

El ``Pedido`` es la identidad de la conversación (D-AUD16-01): no existe una entidad
``Conversacion`` ni chat de ``Solicitud`` o ``Propuesta``. Solo se guardan el pedido, el autor
(FK a la cuenta), el texto y el instante; nombre, rol y teléfono no se duplican. El mensaje es
append-only (D-AUD16-03) y el orden contractual de la conversación es ``id`` ascendente.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.talleres.models import PATRON_NO_EN_BLANCO

MAX_TEXTO = 500


class MensajePedido(models.Model):
    pedido = models.ForeignKey(
        "pedidos.Pedido",
        on_delete=models.PROTECT,
        related_name="mensajes",
        # cubierto por el índice (pedido, id)
        db_index=False,
    )
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="mensajes_pedido",
    )
    # varchar(500) limita la longitud en la base; el servicio recorta antes de validar.
    texto = models.CharField(max_length=MAX_TEXTO)
    creado_en = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "mensaje de pedido"
        verbose_name_plural = "mensajes de pedido"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(texto__regex=PATRON_NO_EN_BLANCO),
                name="mensaje_pedido_texto_no_vacio",
            ),
        ]
        # Cursor del polling: WHERE pedido_id = %s AND id > %s ORDER BY id (D-AUD16-07).
        indexes = [
            models.Index(fields=["pedido", "id"], name="mensaje_pedido_cursor_idx"),
        ]

    def __str__(self):
        return f"Mensaje #{self.pk} del pedido #{self.pedido_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Un mensaje del pedido no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Un mensaje del pedido no se elimina.")
