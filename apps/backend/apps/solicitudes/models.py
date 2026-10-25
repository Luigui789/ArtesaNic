"""Solicitud, renglones y su revisión (AUD-05/06): todavía no son pedido confirmado."""

from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Rol
from apps.catalogo.models import Modalidad
from apps.talleres.models import PATRON_NO_EN_BLANCO

MAX_CARACTERISTICAS = 2000
MAX_MOTIVO_RECHAZO = 1000
MAX_DESCRIPCION_ENTREGA = 500


class EstadoSolicitud(models.TextChoices):
    # Hay renglones sin resolver.
    PENDIENTE_REVISION = "pendiente_revision", "Pendiente de revisión"
    # Todos resueltos y al menos uno aceptado: el artesano puede emitir la propuesta.
    LISTA_PROPUESTA = "lista_propuesta", "Lista para propuesta"
    # Propuesta final emitida (AUD-06); la decisión del comprador pertenece a AUD-07.
    PROPUESTA_EMITIDA = "propuesta_emitida", "Propuesta emitida"
    # DR-03: todos resueltos y ninguno aceptado. Terminal.
    RECHAZADA = "rechazada", "Rechazada"


class ModalidadEntrega(models.TextChoices):
    """Modalidades mínimas de RF-016; «otra» exige una descripción."""

    RETIRO_TALLER = "retiro_taller", "Retiro en taller"
    PUNTO_ENCUENTRO = "punto_encuentro", "Punto de encuentro"
    ENTREGA_ARTESANO = "entrega_artesano", "Entrega por el artesano"
    OTRA = "otra", "Otra"


def condicion_entrega(modalidad: str, descripcion: str, *, opcional: bool) -> Q:
    """CHECK compartido: «otra» exige descripción; sin modalidad no hay descripción."""
    otras = [m for m in ModalidadEntrega.values if m != ModalidadEntrega.OTRA]
    condicion = Q(
        **{modalidad: ModalidadEntrega.OTRA, f"{descripcion}__regex": PATRON_NO_EN_BLANCO}
    )
    condicion |= Q(**{f"{modalidad}__in": otras})
    if opcional:
        condicion |= Q(**{modalidad: "", descripcion: ""})
    return condicion


def errores_entrega(modalidad: str, descripcion: str, *, opcional: bool) -> dict[str, str]:
    """Misma regla que ``condicion_entrega``, con mensajes por campo para la API."""
    if not modalidad:
        if not opcional:
            return {"modalidad": "Selecciona la modalidad de entrega."}
        if descripcion:
            return {"descripcion": "Indica primero la modalidad de entrega."}
        return {}
    if modalidad not in ModalidadEntrega.values:
        return {"modalidad": "Modalidad de entrega no válida."}
    if modalidad == ModalidadEntrega.OTRA and not descripcion.strip():
        return {"descripcion": "Describe la modalidad de entrega «Otra»."}
    return {}


class ResolucionRenglon(models.TextChoices):
    PENDIENTE = "pendiente", "Pendiente"
    ACEPTADO = "aceptado", "Aceptado"
    RECHAZADO = "rechazado", "Rechazado"


class OrigenPersonalizacion(models.TextChoices):
    DESDE_CERO = "desde_cero", "Fabricación desde cero"
    UNIDAD_ESTANDAR = "unidad_estandar", "Unidad estándar como base"


class SolicitudQuerySet(models.QuerySet):
    def del_comprador(self, usuario):
        return self.filter(comprador=usuario)

    def del_taller(self, taller):
        return self.filter(taller=taller)


class Solicitud(models.Model):
    comprador = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="solicitudes"
    )
    taller = models.ForeignKey(
        "talleres.Taller", on_delete=models.PROTECT, related_name="solicitudes"
    )
    estado = models.CharField(
        max_length=20, choices=EstadoSolicitud.choices, default=EstadoSolicitud.PENDIENTE_REVISION
    )
    # RF-016: preferencia opcional del comprador; vacía si no indicó ninguna.
    modalidad_entrega_preferida = models.CharField(
        max_length=20, choices=ModalidadEntrega.choices, blank=True, default=""
    )
    descripcion_entrega_preferida = models.TextField(
        blank=True,
        default="",
        max_length=MAX_DESCRIPCION_ENTREGA,
        validators=[MaxLengthValidator(MAX_DESCRIPCION_ENTREGA)],
    )
    creado_en = models.DateTimeField(default=timezone.now, editable=False)
    actualizado_en = models.DateTimeField(auto_now=True)

    objects = SolicitudQuerySet.as_manager()

    class Meta:
        ordering = ["-creado_en", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(estado__in=EstadoSolicitud.values), name="solicitud_estado_valido"
            ),
            models.CheckConstraint(
                condition=condicion_entrega(
                    "modalidad_entrega_preferida", "descripcion_entrega_preferida", opcional=True
                ),
                name="solicitud_entrega_preferida_valida",
            ),
        ]
        indexes = [
            models.Index(fields=["comprador", "-creado_en", "-id"], name="solicitud_comprador_idx"),
            models.Index(fields=["taller", "-creado_en", "-id"], name="solicitud_taller_idx"),
        ]

    def __str__(self):
        return f"Solicitud #{self.pk}"

    @property
    def es_terminal(self) -> bool:
        return self.estado == EstadoSolicitud.RECHAZADA

    def pertenece_a(self, usuario) -> bool:
        if not usuario.is_authenticated:
            return False
        return (usuario.rol == Rol.COMPRADOR and self.comprador_id == usuario.pk) or (
            usuario.rol == Rol.ARTESANO and self.taller.propietario_id == usuario.pk
        )


class RenglonSolicitud(models.Model):
    # Sin borrado comercial: incluso los renglones rechazados conservan su referencia y motivo.
    solicitud = models.ForeignKey(Solicitud, on_delete=models.PROTECT, related_name="renglones")
    producto = models.ForeignKey(
        "catalogo.Producto", on_delete=models.PROTECT, related_name="renglones_solicitud"
    )
    posicion = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    modalidad = models.CharField(max_length=20, choices=Modalidad.choices)
    cantidad = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    fecha_solicitada = models.DateField(null=True, blank=True)
    caracteristicas = models.TextField(
        blank=True,
        max_length=MAX_CARACTERISTICAS,
        validators=[MaxLengthValidator(MAX_CARACTERISTICAS)],
    )
    origen_personalizacion = models.CharField(
        max_length=20, choices=OrigenPersonalizacion.choices, blank=True
    )
    resolucion = models.CharField(
        max_length=10, choices=ResolucionRenglon.choices, default=ResolucionRenglon.PENDIENTE
    )
    # Proyección operativa de la revisión; el registro auditable es RevisionRenglonSolicitud.
    motivo_rechazo = models.TextField(blank=True)

    class Meta:
        ordering = ["posicion", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["solicitud", "posicion"], name="renglon_posicion_unica"
            ),
            models.CheckConstraint(condition=Q(posicion__gt=0), name="renglon_posicion_positiva"),
            models.CheckConstraint(condition=Q(cantidad__gt=0), name="renglon_cantidad_positiva"),
            models.CheckConstraint(
                condition=Q(modalidad__in=Modalidad.values), name="renglon_modalidad_valida"
            ),
            models.CheckConstraint(
                condition=Q(resolucion__in=ResolucionRenglon.values),
                name="renglon_resolucion_valida",
            ),
            models.CheckConstraint(
                condition=(
                    Q(resolucion=ResolucionRenglon.RECHAZADO)
                    & Q(motivo_rechazo__regex=PATRON_NO_EN_BLANCO)
                )
                | (~Q(resolucion=ResolucionRenglon.RECHAZADO) & Q(motivo_rechazo="")),
                name="renglon_rechazo_con_motivo",
            ),
            models.CheckConstraint(
                condition=(
                    Q(modalidad=Modalidad.STOCK, fecha_solicitada__isnull=True)
                    & Q(caracteristicas="", origen_personalizacion="")
                )
                | (
                    Q(modalidad=Modalidad.PRODUCCION, fecha_solicitada__isnull=False)
                    & Q(caracteristicas="", origen_personalizacion="")
                )
                | (
                    Q(modalidad=Modalidad.PERSONALIZACION, fecha_solicitada__isnull=True)
                    & Q(caracteristicas__regex=PATRON_NO_EN_BLANCO)
                    & Q(origen_personalizacion__in=OrigenPersonalizacion.values)
                ),
                name="renglon_datos_modalidad",
            ),
        ]

    def __str__(self):
        return f"Solicitud #{self.solicitud_id}, renglón {self.posicion}"

    def clean(self):
        super().clean()
        errores = {}
        if self.producto_id:
            if self._state.adding and self.modalidad not in self.producto.modalidades:
                errores["modalidad"] = "El producto no admite esta modalidad."
            if self.solicitud_id and self.producto.taller_id != self.solicitud.taller_id:
                errores["producto"] = "Todos los renglones deben pertenecer al mismo taller."
        if self.modalidad == Modalidad.PRODUCCION:
            if not self.fecha_solicitada:
                errores["fecha_solicitada"] = "Indica la fecha solicitada de producción."
            elif (
                isinstance(self.fecha_solicitada, date)
                and self._state.adding
                and self.fecha_solicitada < timezone.localdate()
            ):
                errores["fecha_solicitada"] = "La fecha solicitada no puede ser anterior a hoy."
        elif self.fecha_solicitada is not None:
            errores["fecha_solicitada"] = "Este campo solo corresponde a producción."
        if self.modalidad == Modalidad.PERSONALIZACION:
            if not self.caracteristicas.strip():
                errores["caracteristicas"] = "Describe las características solicitadas."
            if self.origen_personalizacion not in OrigenPersonalizacion.values:
                errores["origen_personalizacion"] = "Selecciona el origen de la personalización."
        elif self.caracteristicas or self.origen_personalizacion:
            errores["caracteristicas"] = "Estos datos solo corresponden a personalización."
        if self.resolucion == ResolucionRenglon.RECHAZADO:
            if not self.motivo_rechazo.strip():
                errores["motivo_rechazo"] = "Un renglón rechazado debe conservar su motivo."
        elif self.motivo_rechazo:
            errores["motivo_rechazo"] = "Solo un renglón rechazado tiene motivo de rechazo."
        if errores:
            raise ValidationError(errores)


class RevisionRenglonSolicitud(models.Model):
    """Resolución final y auditable de un renglón (RF-005.4, RN-008).

    Append-only: una sola por renglón, porque V1 no define reabrir ni reconsiderar.
    Se crea en la misma transacción que actualiza la proyección del renglón.
    """

    renglon = models.OneToOneField(
        RenglonSolicitud, on_delete=models.PROTECT, related_name="revision"
    )
    resolucion = models.CharField(max_length=10, choices=ResolucionRenglon.choices)
    motivo_rechazo = models.TextField(
        blank=True,
        max_length=MAX_MOTIVO_RECHAZO,
        validators=[MaxLengthValidator(MAX_MOTIVO_RECHAZO)],
    )
    resuelto_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="revisiones_renglon"
    )
    resuelto_en = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        verbose_name = "revisión de renglón"
        verbose_name_plural = "revisiones de renglones"
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    resolucion__in=[ResolucionRenglon.ACEPTADO, ResolucionRenglon.RECHAZADO]
                ),
                name="revision_resolucion_final",
            ),
            models.CheckConstraint(
                condition=(
                    Q(resolucion=ResolucionRenglon.RECHAZADO)
                    & Q(motivo_rechazo__regex=PATRON_NO_EN_BLANCO)
                )
                | Q(resolucion=ResolucionRenglon.ACEPTADO, motivo_rechazo=""),
                name="revision_rechazo_con_motivo",
            ),
        ]

    def __str__(self):
        return f"Revisión del renglón {self.renglon_id}: {self.resolucion}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Una revisión registrada no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Una revisión registrada no se elimina.")
