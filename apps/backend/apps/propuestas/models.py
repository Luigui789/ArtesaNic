"""Propuesta final del artesano y decisión del comprador (AUD-06/07; RF-005/006/016/018).

Solicitud ≠ Propuesta ≠ Pedido confirmado. La propuesta es la oferta comercial que el
comprador revisa antes de decidir: renglones aceptados, precio cotizado, cargos, plan
y costo de entrega, y total en córdobas. Una vez emitida es estable: no se edita, no se
regenera ni se recalcula con cambios posteriores del catálogo.

La decisión final del comprador (``DecisionPropuesta``) es única e inmutable: si rechaza,
queda como constancia histórica sin crear pedido ni reserva; si acepta, en la misma
transacción (AUD-07) se revalida el stock, se reserva y se congela el Pedido confirmado.

Los CHECK de una fila garantizan importes no negativos y aritmética por fila. Las sumas
entre tablas y la pertenencia de renglones/cargos a la misma solicitud se validan en el
servicio transaccional, que es la única vía de escritura.
"""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.catalogo.models import PRECIO_MINIMO, Modalidad
from apps.solicitudes.models import (
    MAX_DESCRIPCION_ENTREGA,
    ModalidadEntrega,
    RenglonSolicitud,
    Solicitud,
    condicion_entrega,
)
from apps.talleres.models import PATRON_NO_EN_BLANCO

CERO = Decimal("0.00")
# Importes que escribe el artesano: mismo rango que el precio del catálogo.
DIGITOS_CARGO = 10
# Importes calculados (precio × cantidad y sumas): hasta 16 dígitos enteros.
DIGITOS_IMPORTE = 18
DECIMALES = 2
MAX_DESCRIPCION_CARGO = 200
MAX_OTROS_CARGOS = 20
MONEDA = "NIO"


class _Inmutable(models.Model):
    """Una vez emitida, la oferta no se modifica ni se elimina desde el ORM."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Una propuesta emitida no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Una propuesta emitida no se elimina.")


def _importe(digitos: int, **kwargs):
    return models.DecimalField(
        max_digits=digitos,
        decimal_places=DECIMALES,
        validators=[MinValueValidator(CERO)],
        **kwargs,
    )


class Propuesta(_Inmutable):
    solicitud = models.OneToOneField(Solicitud, on_delete=models.PROTECT, related_name="propuesta")
    emitida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="propuestas_emitidas"
    )
    emitida_en = models.DateTimeField(default=timezone.now, editable=False)
    # Plan de entrega que el comprador conoce antes de decidir (RF-016.3/5).
    modalidad_entrega = models.CharField(max_length=20, choices=ModalidadEntrega.choices)
    descripcion_entrega = models.TextField(
        blank=True,
        max_length=MAX_DESCRIPCION_ENTREGA,
        validators=[MaxLengthValidator(MAX_DESCRIPCION_ENTREGA)],
    )
    costo_entrega = _importe(DIGITOS_CARGO)
    # Desglose calculado por el servidor; total = suma de las cuatro partidas.
    subtotal_productos = _importe(DIGITOS_IMPORTE)
    total_personalizacion = _importe(DIGITOS_IMPORTE)
    total_otros_cargos = _importe(DIGITOS_IMPORTE)
    total = _importe(DIGITOS_IMPORTE)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=condicion_entrega(
                    "modalidad_entrega", "descripcion_entrega", opcional=False
                ),
                name="propuesta_entrega_valida",
            ),
            models.CheckConstraint(
                condition=~Q(modalidad_entrega=ModalidadEntrega.RETIRO_TALLER)
                | Q(costo_entrega=CERO),
                name="propuesta_retiro_taller_sin_costo",
                violation_error_message="El retiro en el taller no tiene costo de entrega.",
            ),
            models.CheckConstraint(
                condition=Q(costo_entrega__gte=0)
                & Q(subtotal_productos__gt=0)
                & Q(total_personalizacion__gte=0)
                & Q(total_otros_cargos__gte=0),
                name="propuesta_importes_no_negativos",
            ),
            models.CheckConstraint(
                condition=Q(
                    total=F("subtotal_productos")
                    + F("total_personalizacion")
                    + F("total_otros_cargos")
                    + F("costo_entrega")
                ),
                name="propuesta_total_desglosado",
            ),
        ]

    def __str__(self):
        return f"Propuesta de la solicitud #{self.solicitud_id}"

    def pertenece_a(self, usuario) -> bool:
        return self.solicitud.pertenece_a(usuario)


class LineaPropuesta(_Inmutable):
    """Un renglón aceptado, cotizado. Un renglón aparece como máximo en una línea.

    ``modalidad`` y ``cantidad`` repiten las del renglón (inmutables desde AUD-05) para
    que PostgreSQL compruebe en la misma fila el subtotal y la fecha comprometida.
    """

    propuesta = models.ForeignKey(Propuesta, on_delete=models.PROTECT, related_name="lineas")
    renglon = models.OneToOneField(
        RenglonSolicitud, on_delete=models.PROTECT, related_name="linea_propuesta"
    )
    modalidad = models.CharField(max_length=20, choices=Modalidad.choices)
    cantidad = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    # Precio vigente del producto al emitir, tomado por el servidor (RF-006.1).
    precio_unitario = models.DecimalField(
        max_digits=DIGITOS_CARGO,
        decimal_places=DECIMALES,
        validators=[MinValueValidator(PRECIO_MINIMO)],
    )
    subtotal = _importe(DIGITOS_IMPORTE)
    # RF-006.2: solo en renglones de personalización; cero en las demás modalidades.
    cargo_personalizacion = _importe(DIGITOS_CARGO, default=CERO)
    # RF-016.4: fecha que compromete el artesano para producción por cantidad.
    fecha_comprometida = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["renglon__posicion", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(modalidad__in=Modalidad.values), name="linea_modalidad_valida"
            ),
            models.CheckConstraint(condition=Q(cantidad__gt=0), name="linea_cantidad_positiva"),
            models.CheckConstraint(
                condition=Q(precio_unitario__gte=PRECIO_MINIMO), name="linea_precio_positivo"
            ),
            models.CheckConstraint(
                condition=Q(subtotal=F("precio_unitario") * F("cantidad")),
                name="linea_subtotal_calculado",
            ),
            models.CheckConstraint(
                condition=Q(cargo_personalizacion__gte=0)
                & (Q(modalidad=Modalidad.PERSONALIZACION) | Q(cargo_personalizacion=0)),
                name="linea_cargo_personalizacion",
            ),
            models.CheckConstraint(
                condition=Q(modalidad=Modalidad.PRODUCCION, fecha_comprometida__isnull=False)
                | (~Q(modalidad=Modalidad.PRODUCCION) & Q(fecha_comprometida__isnull=True)),
                name="linea_fecha_comprometida",
            ),
        ]

    def __str__(self):
        return f"Línea del renglón {self.renglon_id}"


class CargoPropuesta(_Inmutable):
    """Otro servicio cobrado (RF-006.2), global o atribuido a una línea.

    Personalización y entrega tienen su propio campo: así cada tipo de cargo se
    distingue sin interpretar textos, y el desglose permite calcular reembolsos.
    """

    propuesta = models.ForeignKey(Propuesta, on_delete=models.PROTECT, related_name="cargos")
    linea = models.ForeignKey(
        LineaPropuesta,
        on_delete=models.PROTECT,
        related_name="cargos",
        null=True,
        blank=True,
    )
    posicion = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    descripcion = models.CharField(max_length=MAX_DESCRIPCION_CARGO)
    monto = _importe(DIGITOS_CARGO)

    class Meta:
        ordering = ["posicion", "id"]
        constraints = [
            models.UniqueConstraint(fields=["propuesta", "posicion"], name="cargo_posicion_unica"),
            models.CheckConstraint(condition=Q(posicion__gt=0), name="cargo_posicion_positiva"),
            models.CheckConstraint(condition=Q(monto__gte=0), name="cargo_monto_no_negativo"),
            models.CheckConstraint(
                condition=Q(descripcion__regex=PATRON_NO_EN_BLANCO),
                name="cargo_con_descripcion",
            ),
        ]

    def __str__(self):
        return f"Cargo {self.posicion} de la propuesta {self.propuesta_id}"


class AccionDecisionPropuesta(models.TextChoices):
    """Acción enviada por el comprador al decidir sobre la propuesta emitida."""

    ACEPTAR = "aceptar", "Aceptar propuesta"
    RECHAZAR = "rechazar", "Rechazar propuesta"


class ResultadoDecisionPropuesta(models.TextChoices):
    """Resultado persistido en ``DecisionPropuesta``."""

    ACEPTADA = "aceptada", "Aceptada"
    RECHAZADA = "rechazada", "Rechazada"


class EstadoDecisionPropuesta(models.TextChoices):
    """Estado de decisión expuesto en la lectura de ``Propuesta``."""

    PENDIENTE = "pendiente", "Pendiente"
    ACEPTADA = "aceptada", "Aceptada"
    RECHAZADA = "rechazada", "Rechazada"


class DecisionPropuesta(_Inmutable):
    """Decisión final e inmutable del comprador propietario sobre la propuesta (RN-009, RN-011)."""

    propuesta = models.OneToOneField(
        Propuesta,
        on_delete=models.PROTECT,
        related_name="decision",
    )
    comprador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="decisiones_propuesta",
    )
    decision = models.CharField(
        max_length=10,
        choices=ResultadoDecisionPropuesta.choices,
    )
    decidida_en = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "decisión de propuesta"
        verbose_name_plural = "decisiones de propuestas"
        constraints = [
            models.CheckConstraint(
                condition=Q(decision__in=ResultadoDecisionPropuesta.values),
                name="decision_propuesta_valor_valido",
            ),
        ]

    def __str__(self):
        return f"Decisión {self.decision} de la propuesta #{self.propuesta_id}"
