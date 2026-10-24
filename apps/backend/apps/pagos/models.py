"""Pago externo del pedido confirmado (AUD-10; RF-011, RN-006/012/014/015).

ArtesaNic no procesa fondos: registra lo que el comprador declara haber pagado fuera de la
plataforma y la verificación manual del artesano.

    Pedido 1 ── 0..1 Pago 1 ── 1..N IntentoPago 1 ── 0..1 RevisionIntentoPago

- ``Pago`` es la proyección operativa del estado económico actual. Se crea con el primer
  intento; un pedido sin ``Pago`` está «Pendiente de pago» (D-AUD10-01). No se escribe en
  el snapshot contractual del ``Pedido`` (AUD-07), que sigue inmutable.
- ``IntentoPago`` es cada declaración del comprador (registro inicial, corrección de un
  intento observado o nuevo intento tras «no recibido»), con exactamente un comprobante.
- ``RevisionIntentoPago`` es la resolución única del artesano sobre un intento.

Intentos y revisiones son append-only: no se editan ni se eliminan, y sus comprobantes se
conservan como evidencia (D-AUD10-07/17). Las transiciones viven en ``services``; los CHECK
cubren solo invariantes de una fila.
"""

from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.pedidos.models import Pedido
from apps.propuestas.models import CERO, DECIMALES, DIGITOS_IMPORTE, MONEDA
from apps.talleres.models import PATRON_NO_EN_BLANCO

from .comprobantes import (
    MAX_BYTES,
    MAX_NOMBRE,
    MIME_PERMITIDOS,
    almacenamiento_privado,
    ruta_comprobante,
)

# Plazo independiente para registrar el pago, corregir un intento observado o registrar un
# nuevo intento tras «no recibido» (RF-011.7, RN-013/014; D-AUD10-10/13/19).
PLAZO = timedelta(hours=48)
MAX_REFERENCIA = 120
MAX_MOTIVO = 1000


class EstadoPago(models.TextChoices):
    PENDIENTE = "pendiente", "Pendiente de pago"
    REGISTRADO = "registrado", "Pago registrado"
    OBSERVADO = "observado", "Pago observado"
    CONFIRMADO = "confirmado", "Pago confirmado"
    NO_RECIBIDO = "no_recibido", "Pago no recibido"


# «pendiente» se representa por la ausencia de Pago: una fila existe desde el primer intento.
ESTADOS_PERSISTIDOS = [
    EstadoPago.REGISTRADO,
    EstadoPago.OBSERVADO,
    EstadoPago.CONFIRMADO,
    EstadoPago.NO_RECIBIDO,
]
# Resoluciones que abren un plazo de 48 h para que el comprador vuelva a actuar.
ESTADOS_CON_PLAZO = [EstadoPago.OBSERVADO, EstadoPago.NO_RECIBIDO]


class MetodoPago(models.TextChoices):
    TRANSFERENCIA = "transferencia", "Transferencia"
    OTRO = "otro", "Otro método"


class OrigenIntento(models.TextChoices):
    INICIAL = "inicial", "Registro inicial"
    CORRECCION = "correccion", "Corrección de un intento observado"
    NUEVO_TRAS_NO_RECIBIDO = "nuevo_tras_no_recibido", "Nuevo intento tras pago no recibido"


class ResultadoRevision(models.TextChoices):
    CONFIRMADO = "confirmado", "Pago confirmado"
    OBSERVADO = "observado", "Pago observado"
    NO_RECIBIDO = "no_recibido", "Pago no recibido"


class _AppendOnly(models.Model):
    """Historial de pagos: se inserta una vez; no se edita ni se elimina desde el ORM."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("El historial de pagos no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("El historial de pagos no se elimina.")


class Pago(models.Model):
    """Estado económico actual del pedido confirmado (un pago por pedido)."""

    pedido = models.OneToOneField(Pedido, on_delete=models.PROTECT, related_name="pago")
    estado = models.CharField(max_length=20, choices=EstadoPago.choices)
    moneda = models.CharField(max_length=3, default=MONEDA, editable=False)
    # Copia de ``Pedido.total`` al crear el pago: 100 % del total congelado, nunca del cliente.
    total = models.DecimalField(
        max_digits=DIGITOS_IMPORTE, decimal_places=DECIMALES, validators=[MinValueValidator(CERO)]
    )
    # Plazo vigente para que el comprador vuelva a actuar (observado / no recibido).
    plazo_hasta = models.DateTimeField(null=True, blank=True)
    confirmado_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(default=timezone.now, editable=False)
    actualizado_en = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "pago"
        verbose_name_plural = "pagos"
        constraints = [
            models.CheckConstraint(
                condition=Q(estado__in=ESTADOS_PERSISTIDOS), name="pago_estado_valido"
            ),
            models.CheckConstraint(condition=Q(moneda=MONEDA), name="pago_moneda_nio"),
            models.CheckConstraint(condition=Q(total__gte=0), name="pago_total_no_negativo"),
            models.CheckConstraint(
                condition=(Q(estado__in=ESTADOS_CON_PLAZO) & Q(plazo_hasta__isnull=False))
                | (~Q(estado__in=ESTADOS_CON_PLAZO) & Q(plazo_hasta__isnull=True)),
                name="pago_plazo_coherente",
            ),
            models.CheckConstraint(
                condition=(Q(estado=EstadoPago.CONFIRMADO) & Q(confirmado_en__isnull=False))
                | (~Q(estado=EstadoPago.CONFIRMADO) & Q(confirmado_en__isnull=True)),
                name="pago_confirmacion_coherente",
            ),
        ]

    def __str__(self):
        return f"Pago del pedido #{self.pedido_id} ({self.estado})"

    def delete(self, *args, **kwargs):
        raise ValidationError("Un pago no se elimina.")


class IntentoPago(_AppendOnly):
    """Declaración del comprador: método, referencia y exactamente un comprobante."""

    pago = models.ForeignKey(Pago, on_delete=models.PROTECT, related_name="intentos")
    numero = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    origen = models.CharField(max_length=30, choices=OrigenIntento.choices)
    # Intento al que corrige o sucede; uno como máximo por intento (OneToOne).
    intento_previo = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="siguiente"
    )
    metodo = models.CharField(max_length=20, choices=MetodoPago.choices)
    referencia = models.CharField(max_length=MAX_REFERENCIA)
    comprobante = models.FileField(
        storage=almacenamiento_privado, upload_to=ruta_comprobante, max_length=255
    )
    # Metadatos detectados por el servidor; el nombre es solo para mostrar (sanitizado).
    comprobante_nombre = models.CharField(max_length=MAX_NOMBRE)
    comprobante_tipo = models.CharField(max_length=30)
    comprobante_tamano = models.PositiveIntegerField()
    comprobante_sha256 = models.CharField(max_length=64)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="intentos_pago"
    )
    registrado_en = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "intento de pago"
        verbose_name_plural = "intentos de pago"
        ordering = ["numero"]
        constraints = [
            models.UniqueConstraint(fields=["pago", "numero"], name="intento_pago_numero_unico"),
            models.CheckConstraint(condition=Q(numero__gt=0), name="intento_pago_numero_positivo"),
            models.CheckConstraint(
                condition=Q(origen__in=OrigenIntento.values), name="intento_pago_origen_valido"
            ),
            models.CheckConstraint(
                condition=Q(metodo__in=MetodoPago.values), name="intento_pago_metodo_valido"
            ),
            models.CheckConstraint(
                condition=Q(referencia__regex=PATRON_NO_EN_BLANCO),
                name="intento_pago_referencia_no_vacia",
            ),
            models.CheckConstraint(
                condition=(
                    Q(origen=OrigenIntento.INICIAL, numero=1, intento_previo__isnull=True)
                    | (
                        ~Q(origen=OrigenIntento.INICIAL)
                        & Q(numero__gt=1, intento_previo__isnull=False)
                    )
                ),
                name="intento_pago_origen_coherente",
            ),
            models.CheckConstraint(
                condition=~Q(comprobante="")
                & Q(comprobante_nombre__regex=PATRON_NO_EN_BLANCO)
                & Q(comprobante_tipo__in=MIME_PERMITIDOS)
                & Q(comprobante_tamano__gt=0, comprobante_tamano__lte=MAX_BYTES)
                & Q(comprobante_sha256__regex=r"^[0-9a-f]{64}$"),
                name="intento_pago_comprobante_valido",
            ),
        ]

    def __str__(self):
        return f"Intento {self.numero} del pago #{self.pago_id}"


class RevisionIntentoPago(_AppendOnly):
    """Resolución única e inmutable del artesano sobre un intento registrado."""

    intento = models.OneToOneField(IntentoPago, on_delete=models.PROTECT, related_name="revision")
    resultado = models.CharField(max_length=20, choices=ResultadoRevision.choices)
    motivo = models.TextField(
        blank=True,
        default="",
        max_length=MAX_MOTIVO,
        validators=[MaxLengthValidator(MAX_MOTIVO)],
    )
    revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="revisiones_pago"
    )
    revisado_en = models.DateTimeField(default=timezone.now, editable=False)
    plazo_hasta = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "revisión de intento de pago"
        verbose_name_plural = "revisiones de intentos de pago"
        constraints = [
            models.CheckConstraint(
                condition=Q(resultado__in=ResultadoRevision.values),
                name="revision_pago_resultado_valido",
            ),
            models.CheckConstraint(
                condition=Q(
                    resultado=ResultadoRevision.CONFIRMADO, motivo="", plazo_hasta__isnull=True
                )
                | (
                    Q(resultado__in=ESTADOS_CON_PLAZO)
                    & Q(motivo__regex=PATRON_NO_EN_BLANCO)
                    # Explícito: en SQL, «NULL = valor» no viola un CHECK.
                    & Q(plazo_hasta__isnull=False)
                    & Q(plazo_hasta=F("revisado_en") + PLAZO)
                ),
                name="revision_pago_motivo_y_plazo",
            ),
        ]

    def __str__(self):
        return f"Revisión {self.resultado} del intento #{self.intento_id}"
