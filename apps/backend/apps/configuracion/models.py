"""Configuración administrada de la plataforma: tasa de cambio informativa (RF-007, RN-010).

Los importes contractuales están siempre en córdobas (NIO). La tasa US$ → C$ solo sirve
para mostrar una conversión informativa: ningún pedido, pago, reembolso ni propuesta la
guarda (D-AUD14-08). La administra el administrador de plataforma en Django Admin
(RF-013.4) y cada cambio deja un ``CambioTasaCambio`` append-only (D-AUD14-09).

``ConfiguracionPlataforma`` es un singleton (``id = 1``) que nace por migración sin tasa:
la cifra de la antigua simulación del frontend no es una decisión administrativa
(D-AUD14-05). Sin tasa, la interfaz muestra solo córdobas (D-AUD14-06).
"""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

ID_CONFIGURACION = 1
DIGITOS_TASA = 10
DECIMALES_TASA = 4
TASA_MINIMA = Decimal("0.0001")


def _tasa(nombre: str, **kwargs):
    return models.DecimalField(
        nombre,
        max_digits=DIGITOS_TASA,
        decimal_places=DECIMALES_TASA,
        validators=[MinValueValidator(TASA_MINIMA)],
        **kwargs,
    )


class ConfiguracionPlataforma(models.Model):
    """Proyección vigente de la configuración. Solo ``services`` la modifica."""

    id = models.PositiveSmallIntegerField(
        primary_key=True, default=ID_CONFIGURACION, editable=False
    )
    tasa_cambio_usd_nio = _tasa(
        "tasa de cambio (C$ por US$)",
        null=True,
        blank=True,
        help_text="Córdobas por un dólar, con hasta cuatro decimales. Solo informativa: "
        "los importes contractuales se conservan en córdobas.",
    )
    actualizada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="actualizada por",
    )
    actualizada_en = models.DateTimeField("actualizada en", null=True, blank=True)

    class Meta:
        verbose_name = "configuración de la plataforma"
        verbose_name_plural = "configuración de la plataforma"
        constraints = [
            # Una sola fila, también en la base de datos (no solo en Django Admin).
            models.CheckConstraint(
                condition=Q(id=ID_CONFIGURACION),
                name="configuracion_singleton",
            ),
            models.CheckConstraint(
                condition=Q(tasa_cambio_usd_nio__isnull=True)
                | Q(tasa_cambio_usd_nio__gte=TASA_MINIMA),
                name="configuracion_tasa_positiva",
                violation_error_message="La tasa de cambio debe ser mayor que cero.",
            ),
            # Sin tasa no hay actor ni fecha; con tasa, ambos son obligatorios.
            models.CheckConstraint(
                condition=(
                    Q(tasa_cambio_usd_nio__isnull=True)
                    & Q(actualizada_por__isnull=True)
                    & Q(actualizada_en__isnull=True)
                )
                | (
                    Q(tasa_cambio_usd_nio__isnull=False)
                    & Q(actualizada_por__isnull=False)
                    & Q(actualizada_en__isnull=False)
                ),
                name="configuracion_actualizacion_coherente",
            ),
        ]

    def __str__(self):
        return "Configuración de la plataforma"

    def delete(self, *args, **kwargs):
        raise ValidationError("La configuración de la plataforma no se elimina.")


class CambioTasaCambio(models.Model):
    """Historial append-only de los cambios de tasa, con actor y fecha (RNF-008)."""

    configuracion = models.ForeignKey(
        ConfiguracionPlataforma,
        on_delete=models.PROTECT,
        related_name="cambios_tasa",
    )
    tasa_anterior = _tasa("tasa anterior", null=True, blank=True)
    tasa_nueva = _tasa("tasa nueva")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cambios_tasa_cambio",
        verbose_name="actor",
    )
    creado_en = models.DateTimeField("registrado en", default=timezone.now, editable=False)

    class Meta:
        verbose_name = "cambio de tasa de cambio"
        verbose_name_plural = "cambios de tasa de cambio"
        ordering = ["-creado_en", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(tasa_nueva__gte=TASA_MINIMA)
                & (Q(tasa_anterior__isnull=True) | Q(tasa_anterior__gte=TASA_MINIMA)),
                name="cambio_tasa_positiva",
            ),
            # Repetir la tasa vigente no es un cambio y no deja evento.
            models.CheckConstraint(
                condition=Q(tasa_anterior__isnull=True) | ~Q(tasa_anterior=models.F("tasa_nueva")),
                name="cambio_tasa_distinta",
            ),
        ]

    def __str__(self):
        return f"{self.tasa_anterior or '—'} → {self.tasa_nueva}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("El historial de la tasa de cambio no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("El historial de la tasa de cambio no se elimina.")
