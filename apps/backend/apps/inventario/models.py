"""Existencia física, reservas y ledger de movimientos de inventario (AUD-07; RF-022, RF-023).

Reglas centrales (RN-011, RN-021, RN-022, RN-023, RN-024):
- Existencia física y cantidad reservada se mantienen separadas; ``disponible`` es su
  diferencia y nunca persiste como columna redundante susceptible de desincronizarse.
- Reservar reduce disponibilidad (incrementa ``reservada``), nunca reduce ``existencia_fisica``.
- PostgreSQL garantiza ``existencia_fisica >= 0``, ``reservada >= 0`` y
  ``reservada <= existencia_fisica``.
- Los movimientos son append-only: cualquier corrección crea un movimiento nuevo.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.talleres.models import PATRON_NO_EN_BLANCO

MAX_MOTIVO_MOVIMIENTO = 500
MAX_CANTIDAD = 2147483647


class _Inmutable(models.Model):
    """El historial de inventario es append-only: no admite edición ni borrado ordinario."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Un movimiento de inventario registrado no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Un movimiento de inventario registrado no se elimina.")


class TipoMovimientoInventario(models.TextChoices):
    """Tipos de movimiento previstos en V1 (RF-022, RF-023, RN-021..RN-024)."""

    EXISTENCIA_INICIAL = "existencia_inicial", "Existencia inicial"
    ENTRADA = "entrada", "Entrada"
    AJUSTE_POSITIVO = "ajuste_positivo", "Ajuste positivo"
    AJUSTE_NEGATIVO = "ajuste_negativo", "Ajuste negativo"
    RESERVA = "reserva", "Reserva"
    LIBERACION = "liberacion", "Liberación"
    CONSUMO = "consumo", "Consumo"
    REINCORPORACION = "reincorporacion", "Reincorporación"
    BAJA = "baja", "Baja"


class EstadoReserva(models.TextChoices):
    """Ciclo de vida de una reserva (AUD-07 crea ``activa``; AUD-11/12 transicionan)."""

    ACTIVA = "activa", "Activa"
    LIBERADA = "liberada", "Liberada"
    CONSUMIDA = "consumida", "Consumida"


class InventarioProductoQuerySet(models.QuerySet):
    def del_taller(self, taller):
        return self.filter(producto__taller=taller)


class InventarioProducto(models.Model):
    """Estado de existencias estándar de un producto (RF-022, RN-021)."""

    producto = models.OneToOneField(
        "catalogo.Producto",
        on_delete=models.PROTECT,
        related_name="inventario",
    )
    existencia_fisica = models.PositiveIntegerField(default=0)
    reservada = models.PositiveIntegerField(default=0)
    inicializado_en = models.DateTimeField(default=timezone.now, editable=False)
    actualizado_en = models.DateTimeField(auto_now=True)

    objects = InventarioProductoQuerySet.as_manager()

    class Meta:
        verbose_name = "inventario de producto"
        verbose_name_plural = "inventarios de productos"
        ordering = ["-producto__creado_en", "-producto_id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(existencia_fisica__gte=0),
                name="inventario_existencia_no_negativa",
            ),
            models.CheckConstraint(
                condition=Q(reservada__gte=0),
                name="inventario_reservada_no_negativa",
            ),
            models.CheckConstraint(
                condition=Q(reservada__lte=F("existencia_fisica")),
                name="inventario_reservada_no_supera_existencia",
            ),
        ]

    def __str__(self):
        return (
            f"Inventario producto #{self.producto_id} "
            f"(física={self.existencia_fisica}, reservada={self.reservada})"
        )

    @property
    def disponible(self) -> int:
        return self.existencia_fisica - self.reservada

    def pertenece_a(self, usuario) -> bool:
        return self.producto.pertenece_a(usuario)


class ReservaInventario(models.Model):
    """Reserva de unidades estándar vinculada a una línea de pedido confirmado (RN-011)."""

    pedido = models.ForeignKey(
        "pedidos.Pedido",
        on_delete=models.PROTECT,
        related_name="reservas",
    )
    linea_pedido = models.OneToOneField(
        "pedidos.LineaPedido",
        on_delete=models.PROTECT,
        related_name="reserva",
    )
    # cubierto por el índice compuesto (producto, estado)
    producto = models.ForeignKey(
        "catalogo.Producto",
        on_delete=models.PROTECT,
        related_name="reservas_inventario",
        db_index=False,
    )
    cantidad = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    estado = models.CharField(
        max_length=20,
        choices=EstadoReserva.choices,
        default=EstadoReserva.ACTIVA,
    )
    creada_en = models.DateTimeField(default=timezone.now, editable=False)
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "reserva de inventario"
        verbose_name_plural = "reservas de inventario"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(cantidad__gt=0),
                name="reserva_cantidad_positiva",
            ),
            models.CheckConstraint(
                condition=Q(estado__in=EstadoReserva.values),
                name="reserva_estado_valido",
            ),
        ]
        indexes = [
            models.Index(
                fields=["producto", "estado"],
                name="reserva_producto_estado_idx",
            ),
        ]

    def __str__(self):
        return f"Reserva #{self.pk} (pedido #{self.pedido_id}, producto #{self.producto_id})"


class MovimientoInventario(_Inmutable):
    """Registro histórico e inmutable de un movimiento de inventario (RF-023, RN-021)."""

    # cubierto por el índice compuesto (producto, -creado_en, -id)
    producto = models.ForeignKey(
        "catalogo.Producto",
        on_delete=models.PROTECT,
        related_name="movimientos_inventario",
        db_index=False,
    )
    tipo = models.CharField(max_length=30, choices=TipoMovimientoInventario.choices)
    cantidad = models.PositiveIntegerField()
    existencia_antes = models.PositiveIntegerField()
    existencia_despues = models.PositiveIntegerField()
    reservada_antes = models.PositiveIntegerField()
    reservada_despues = models.PositiveIntegerField()
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="movimientos_inventario",
        null=True,
        blank=True,
    )
    pedido = models.ForeignKey(
        "pedidos.Pedido",
        on_delete=models.PROTECT,
        related_name="movimientos_inventario",
        null=True,
        blank=True,
    )
    linea_pedido = models.ForeignKey(
        "pedidos.LineaPedido",
        on_delete=models.PROTECT,
        related_name="movimientos_inventario",
        null=True,
        blank=True,
    )
    reserva = models.ForeignKey(
        ReservaInventario,
        on_delete=models.PROTECT,
        related_name="movimientos",
        null=True,
        blank=True,
    )
    motivo = models.CharField(
        max_length=MAX_MOTIVO_MOVIMIENTO,
        blank=True,
        default="",
        validators=[MaxLengthValidator(MAX_MOTIVO_MOVIMIENTO)],
    )
    creado_en = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "movimiento de inventario"
        verbose_name_plural = "movimientos de inventario"
        ordering = ["-creado_en", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(tipo__in=TipoMovimientoInventario.values),
                name="movimiento_tipo_valido",
            ),
            models.CheckConstraint(
                condition=(
                    Q(tipo=TipoMovimientoInventario.EXISTENCIA_INICIAL, cantidad__gte=0)
                    | (~Q(tipo=TipoMovimientoInventario.EXISTENCIA_INICIAL) & Q(cantidad__gt=0))
                ),
                name="movimiento_cantidad_valida",
            ),
            models.CheckConstraint(
                condition=(
                    Q(existencia_antes__gte=0)
                    & Q(existencia_despues__gte=0)
                    & Q(reservada_antes__gte=0)
                    & Q(reservada_despues__gte=0)
                    & Q(reservada_antes__lte=F("existencia_antes"))
                    & Q(reservada_despues__lte=F("existencia_despues"))
                ),
                name="movimiento_saldos_validos",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(
                        tipo__in=[
                            TipoMovimientoInventario.AJUSTE_POSITIVO,
                            TipoMovimientoInventario.AJUSTE_NEGATIVO,
                            TipoMovimientoInventario.BAJA,
                        ]
                    )
                    | Q(motivo__regex=PATRON_NO_EN_BLANCO)
                ),
                name="movimiento_motivo_obligatorio_en_ajuste",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(tipo=TipoMovimientoInventario.RESERVA)
                    | (
                        Q(pedido__isnull=False)
                        & Q(linea_pedido__isnull=False)
                        & Q(reserva__isnull=False)
                        & Q(existencia_despues=F("existencia_antes"))
                        & Q(reservada_despues=F("reservada_antes") + F("cantidad"))
                    )
                ),
                name="movimiento_reserva_coherente",
            ),
        ]
        indexes = [
            models.Index(
                fields=["producto", "-creado_en", "-id"],
                name="movimiento_producto_fecha_idx",
            ),
        ]

    def __str__(self):
        return f"Movimiento {self.tipo} ({self.cantidad}) en producto #{self.producto_id}"
