"""Pedido confirmado y snapshot contractual congelado (AUD-07; RF-005/006/018, RN-003/010/011).

Solicitud ≠ Propuesta ≠ Pedido confirmado.
El Pedido se crea únicamente cuando el comprador acepta la propuesta final dentro de la
transacción atómica de AUD-07. Congela precios, importes, cargos, entrega, fechas y
datos descriptivos del producto/categoría para que modificaciones posteriores del
catálogo (precio, nombre, categoría o despublicación) no alteren el contrato histórico.
"""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.accounts.models import Rol
from apps.catalogo.models import PATRON_CODIGO_CATEGORIA, PRECIO_MINIMO, Modalidad
from apps.propuestas.models import (
    CERO,
    DECIMALES,
    DIGITOS_CARGO,
    DIGITOS_IMPORTE,
    MAX_DESCRIPCION_CARGO,
    MONEDA,
    CargoPropuesta,
    LineaPropuesta,
    Propuesta,
)
from apps.solicitudes.models import (
    MAX_CARACTERISTICAS,
    MAX_DESCRIPCION_ENTREGA,
    ModalidadEntrega,
    OrigenPersonalizacion,
    RenglonSolicitud,
    Solicitud,
    condicion_entrega,
)
from apps.talleres.models import PATRON_NO_EN_BLANCO


class _Inmutable(models.Model):
    """El snapshot contractual del pedido confirmado no se edita ni se elimina."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Un pedido confirmado no modifica su snapshot contractual.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Un pedido confirmado no se elimina.")


def _importe(digitos: int, **kwargs):
    return models.DecimalField(
        max_digits=digitos,
        decimal_places=DECIMALES,
        validators=[MinValueValidator(CERO)],
        **kwargs,
    )


class PedidoQuerySet(models.QuerySet):
    def del_comprador(self, usuario):
        return self.filter(comprador=usuario)

    def del_taller(self, taller):
        return self.filter(taller=taller)


class Pedido(_Inmutable):
    """Contrato confirmado al aceptar el comprador la propuesta final (RN-009, RN-011)."""

    propuesta = models.OneToOneField(
        Propuesta,
        on_delete=models.PROTECT,
        related_name="pedido",
    )
    solicitud = models.OneToOneField(
        Solicitud,
        on_delete=models.PROTECT,
        related_name="pedido",
    )
    # cubiertos por los índices (comprador, -confirmado_en, -id) y (taller, -confirmado_en, -id)
    comprador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pedidos",
        db_index=False,
    )
    taller = models.ForeignKey(
        "talleres.Taller",
        on_delete=models.PROTECT,
        related_name="pedidos",
        db_index=False,
    )
    confirmado_en = models.DateTimeField(default=timezone.now, editable=False)
    moneda = models.CharField(max_length=3, default=MONEDA, editable=False)
    modalidad_entrega = models.CharField(max_length=20, choices=ModalidadEntrega.choices)
    descripcion_entrega = models.TextField(
        blank=True,
        max_length=MAX_DESCRIPCION_ENTREGA,
        validators=[MaxLengthValidator(MAX_DESCRIPCION_ENTREGA)],
    )
    costo_entrega = _importe(DIGITOS_CARGO)
    subtotal_productos = _importe(DIGITOS_IMPORTE)
    total_personalizacion = _importe(DIGITOS_IMPORTE)
    total_otros_cargos = _importe(DIGITOS_IMPORTE)
    total = _importe(DIGITOS_IMPORTE)

    objects = PedidoQuerySet.as_manager()

    class Meta:
        verbose_name = "pedido"
        verbose_name_plural = "pedidos"
        ordering = ["-confirmado_en", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(moneda=MONEDA),
                name="pedido_moneda_nio",
            ),
            models.CheckConstraint(
                condition=condicion_entrega(
                    "modalidad_entrega", "descripcion_entrega", opcional=False
                ),
                name="pedido_entrega_valida",
            ),
            models.CheckConstraint(
                condition=~Q(modalidad_entrega=ModalidadEntrega.RETIRO_TALLER)
                | Q(costo_entrega=CERO),
                name="pedido_retiro_taller_sin_costo",
                violation_error_message="El retiro en el taller no tiene costo de entrega.",
            ),
            models.CheckConstraint(
                condition=Q(costo_entrega__gte=0)
                & Q(subtotal_productos__gt=0)
                & Q(total_personalizacion__gte=0)
                & Q(total_otros_cargos__gte=0),
                name="pedido_importes_no_negativos",
            ),
            models.CheckConstraint(
                condition=Q(
                    total=F("subtotal_productos")
                    + F("total_personalizacion")
                    + F("total_otros_cargos")
                    + F("costo_entrega")
                ),
                name="pedido_total_desglosado",
            ),
        ]
        indexes = [
            models.Index(
                fields=["comprador", "-confirmado_en", "-id"],
                name="pedido_comprador_fecha_idx",
            ),
            models.Index(
                fields=["taller", "-confirmado_en", "-id"],
                name="pedido_taller_fecha_idx",
            ),
        ]

    def __str__(self):
        return f"Pedido #{self.pk} (solicitud #{self.solicitud_id})"

    def pertenece_a(self, usuario) -> bool:
        if not usuario.is_authenticated:
            return False
        return (usuario.rol == Rol.COMPRADOR and self.comprador_id == usuario.pk) or (
            usuario.rol == Rol.ARTESANO and self.taller.propietario_id == usuario.pk
        )


class LineaPedido(_Inmutable):
    """Snapshot contractual de un renglón aceptado y cotizado en el pedido confirmado."""

    pedido = models.ForeignKey(
        Pedido,
        on_delete=models.PROTECT,
        related_name="lineas",
    )
    linea_propuesta = models.OneToOneField(
        LineaPropuesta,
        on_delete=models.PROTECT,
        related_name="linea_pedido",
    )
    renglon = models.OneToOneField(
        RenglonSolicitud,
        on_delete=models.PROTECT,
        related_name="linea_pedido",
    )
    producto = models.ForeignKey(
        "catalogo.Producto",
        on_delete=models.PROTECT,
        related_name="lineas_pedido",
    )
    posicion = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    # Snapshot descriptivo del producto y su categoría en el momento de confirmar (RN-003).
    producto_nombre = models.CharField(max_length=120)
    categoria_id_historico = models.PositiveBigIntegerField()
    categoria_codigo = models.CharField(max_length=50)
    categoria_nombre = models.CharField(max_length=80)
    # Condiciones operativas y comerciales congeladas desde el renglón y la propuesta.
    modalidad = models.CharField(max_length=20, choices=Modalidad.choices)
    cantidad = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    precio_unitario = models.DecimalField(
        max_digits=DIGITOS_CARGO,
        decimal_places=DECIMALES,
        validators=[MinValueValidator(PRECIO_MINIMO)],
    )
    subtotal = _importe(DIGITOS_IMPORTE)
    cargo_personalizacion = _importe(DIGITOS_CARGO, default=CERO)
    fecha_solicitada = models.DateField(null=True, blank=True)
    fecha_comprometida = models.DateField(null=True, blank=True)
    caracteristicas = models.TextField(
        blank=True,
        default="",
        max_length=MAX_CARACTERISTICAS,
        validators=[MaxLengthValidator(MAX_CARACTERISTICAS)],
    )
    origen_personalizacion = models.CharField(
        max_length=20,
        choices=OrigenPersonalizacion.choices,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = "línea de pedido"
        verbose_name_plural = "líneas de pedido"
        ordering = ["posicion", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["pedido", "posicion"],
                name="linea_pedido_posicion_unica",
            ),
            models.CheckConstraint(
                condition=Q(posicion__gt=0),
                name="linea_pedido_posicion_positiva",
            ),
            models.CheckConstraint(
                condition=Q(modalidad__in=Modalidad.values),
                name="linea_pedido_modalidad_valida",
            ),
            models.CheckConstraint(
                condition=Q(cantidad__gt=0),
                name="linea_pedido_cantidad_positiva",
            ),
            models.CheckConstraint(
                condition=Q(precio_unitario__gte=PRECIO_MINIMO),
                name="linea_pedido_precio_positivo",
            ),
            models.CheckConstraint(
                condition=Q(subtotal=F("precio_unitario") * F("cantidad")),
                name="linea_pedido_subtotal_calculado",
            ),
            models.CheckConstraint(
                condition=Q(cargo_personalizacion__gte=0)
                & (
                    Q(modalidad=Modalidad.PERSONALIZACION)
                    | Q(cargo_personalizacion=Decimal("0.00"))
                ),
                name="linea_pedido_cargo_personalizacion",
            ),
            models.CheckConstraint(
                condition=Q(producto_nombre__regex=PATRON_NO_EN_BLANCO)
                & Q(categoria_id_historico__gt=0)
                & Q(categoria_codigo__regex=PATRON_CODIGO_CATEGORIA)
                & Q(categoria_nombre__regex=PATRON_NO_EN_BLANCO),
                name="linea_pedido_snapshot_producto_valido",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        modalidad=Modalidad.STOCK,
                        fecha_solicitada__isnull=True,
                        fecha_comprometida__isnull=True,
                    )
                    & Q(caracteristicas="", origen_personalizacion="")
                )
                | (
                    Q(
                        modalidad=Modalidad.PRODUCCION,
                        fecha_solicitada__isnull=False,
                        fecha_comprometida__isnull=False,
                    )
                    & Q(caracteristicas="", origen_personalizacion="")
                )
                | (
                    Q(
                        modalidad=Modalidad.PERSONALIZACION,
                        fecha_solicitada__isnull=True,
                        fecha_comprometida__isnull=True,
                    )
                    & Q(caracteristicas__regex=PATRON_NO_EN_BLANCO)
                    & Q(origen_personalizacion__in=OrigenPersonalizacion.values)
                ),
                name="linea_pedido_datos_modalidad",
            ),
        ]

    def __str__(self):
        return f"Línea {self.posicion} del pedido #{self.pedido_id}"


class CargoPedido(_Inmutable):
    """Snapshot contractual de un cargo adicional de la propuesta aceptada."""

    pedido = models.ForeignKey(
        Pedido,
        on_delete=models.PROTECT,
        related_name="cargos",
    )
    cargo_propuesta = models.OneToOneField(
        CargoPropuesta,
        on_delete=models.PROTECT,
        related_name="cargo_pedido",
    )
    linea = models.ForeignKey(
        LineaPedido,
        on_delete=models.PROTECT,
        related_name="cargos",
        null=True,
        blank=True,
    )
    posicion = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    descripcion = models.CharField(max_length=MAX_DESCRIPCION_CARGO)
    monto = _importe(DIGITOS_CARGO)

    class Meta:
        verbose_name = "cargo de pedido"
        verbose_name_plural = "cargos de pedido"
        ordering = ["posicion", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["pedido", "posicion"],
                name="cargo_pedido_posicion_unica",
            ),
            models.CheckConstraint(
                condition=Q(posicion__gt=0),
                name="cargo_pedido_posicion_positiva",
            ),
            models.CheckConstraint(
                condition=Q(monto__gte=0),
                name="cargo_pedido_monto_no_negativo",
            ),
            models.CheckConstraint(
                condition=Q(descripcion__regex=PATRON_NO_EN_BLANCO),
                name="cargo_pedido_con_descripcion",
            ),
        ]

    def __str__(self):
        return f"Cargo {self.posicion} del pedido #{self.pedido_id}"
