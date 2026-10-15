"""Taller del artesano y su aprobación administrativa (RF-008, RF-013, RN-002, RN-006)."""

from django.conf import settings
from django.core.validators import RegexValidator, URLValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Rol
from apps.accounts.phone import MENSAJE_FORMATO, PATRON_TELEFONO_NORMALIZADO


class EstadoTaller(models.TextChoices):
    """Ciclo de aprobación V1: solo un taller pendiente se aprueba o se rechaza."""

    PENDIENTE = "pendiente", "Pendiente de aprobación"
    APROBADO = "aprobado", "Aprobado"
    RECHAZADO = "rechazado", "Rechazado"


# Datos del perfil que el artesano captura al registrarse y mantiene después
# (RF-008). Todo lo demás —propietario, estado y revisión— lo fija el servidor.
CAMPOS_PERFIL = (
    "nombre",
    "historia",
    "rubro",
    "direccion_completa",
    "horario",
    "telefono_publico",
    "whatsapp_publico",
    "facebook_url",
    "instagram_url",
    "sitio_web",
)

# Contiene al menos un carácter que no es espacio. \S significa lo mismo en
# Python y en PostgreSQL.
PATRON_NO_EN_BLANCO = r"\S"

validar_url_web = URLValidator(schemes=["http", "https"])
_validar_telefono = RegexValidator(PATRON_TELEFONO_NORMALIZADO, MENSAJE_FORMATO)


class TallerQuerySet(models.QuerySet):
    def publicos(self):
        """Talleres visibles en la API pública: solo los aprobados (RN-002)."""
        return self.filter(estado=EstadoTaller.APROBADO)


class Taller(models.Model):
    propietario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="taller",
        limit_choices_to={"rol": Rol.ARTESANO},
        verbose_name="propietario",
        help_text="Cuenta de artesano dueña del taller. La fija el servidor al registrarla.",
    )
    nombre = models.CharField("nombre del taller", max_length=120)
    historia = models.TextField("historia", max_length=2000, blank=True)
    # Descripción propia del taller; no es la categoría de los productos (AUD-04).
    rubro = models.CharField("rubro", max_length=80)
    direccion_completa = models.CharField("dirección completa", max_length=255)
    horario = models.CharField("horario de atención", max_length=200, blank=True)
    # Contactos públicos: los decide el artesano. Nunca se copian del teléfono de
    # acceso de la cuenta, que es privado (RN-006, RNF-013).
    telefono_publico = models.CharField(
        "teléfono público", max_length=8, blank=True, validators=[_validar_telefono]
    )
    whatsapp_publico = models.CharField(
        "WhatsApp público", max_length=8, blank=True, validators=[_validar_telefono]
    )
    facebook_url = models.URLField("Facebook", blank=True, validators=[validar_url_web])
    instagram_url = models.URLField("Instagram", blank=True, validators=[validar_url_web])
    sitio_web = models.URLField("sitio web", blank=True, validators=[validar_url_web])

    estado = models.CharField(
        "estado", max_length=20, choices=EstadoTaller.choices, default=EstadoTaller.PENDIENTE
    )
    motivo_rechazo = models.TextField("motivo del rechazo", max_length=500, blank=True)
    revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="talleres_revisados",
        verbose_name="revisado por",
    )
    revisado_en = models.DateTimeField("revisado en", null=True, blank=True)
    creado_en = models.DateTimeField("creado en", default=timezone.now, editable=False)
    actualizado_en = models.DateTimeField("actualizado en", auto_now=True)

    objects = TallerQuerySet.as_manager()

    class Meta:
        verbose_name = "taller"
        verbose_name_plural = "talleres"
        permissions = [("revisar_taller", "Puede aprobar o rechazar talleres")]
        constraints = [
            models.CheckConstraint(
                condition=Q(estado__in=EstadoTaller.values),
                name="taller_estado_valido",
            ),
            models.CheckConstraint(
                condition=Q(nombre__regex=PATRON_NO_EN_BLANCO)
                & Q(rubro__regex=PATRON_NO_EN_BLANCO)
                & Q(direccion_completa__regex=PATRON_NO_EN_BLANCO),
                name="taller_datos_minimos",
                violation_error_message="El nombre, el rubro y la dirección son obligatorios.",
            ),
            models.CheckConstraint(
                condition=(
                    Q(telefono_publico="") | Q(telefono_publico__regex=PATRON_TELEFONO_NORMALIZADO)
                )
                & (Q(whatsapp_publico="") | Q(whatsapp_publico__regex=PATRON_TELEFONO_NORMALIZADO)),
                name="taller_contactos_normalizados",
                violation_error_message=MENSAJE_FORMATO,
            ),
            # Un taller pendiente no tiene revisión; uno resuelto conserva quién y cuándo.
            models.CheckConstraint(
                condition=(
                    Q(estado=EstadoTaller.PENDIENTE)
                    & Q(revisado_por__isnull=True)
                    & Q(revisado_en__isnull=True)
                )
                | (
                    ~Q(estado=EstadoTaller.PENDIENTE)
                    & Q(revisado_por__isnull=False)
                    & Q(revisado_en__isnull=False)
                ),
                name="taller_revision_coherente",
                violation_error_message="La revisión no corresponde al estado del taller.",
            ),
            models.CheckConstraint(
                condition=Q(motivo_rechazo="") | Q(estado=EstadoTaller.RECHAZADO),
                name="taller_motivo_solo_si_rechazado",
                violation_error_message="Solo un taller rechazado tiene motivo de rechazo.",
            ),
        ]

    def __str__(self):
        return self.nombre

    @property
    def es_publico(self) -> bool:
        return self.estado == EstadoTaller.APROBADO

    def pertenece_a(self, usuario) -> bool:
        """Contrato de ``EsPropietario``: solo el artesano dueño accede a su taller."""
        return usuario.is_authenticated and self.propietario_id == usuario.pk
