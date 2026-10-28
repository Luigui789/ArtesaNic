"""Taller del artesano y su aprobación administrativa (RF-008, RF-013, RN-002, RN-006)."""

from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import (
    MaxValueValidator,
    MinValueValidator,
    RegexValidator,
    URLValidator,
)
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Rol
from apps.accounts.phone import MENSAJE_FORMATO, PATRON_TELEFONO_NORMALIZADO
from apps.catalogo.imagenes import EXTENSIONES, validar_fotografia


def _ruta_imagen_taller(archivo, subcarpeta: str) -> str:
    formato = getattr(archivo, "formato_validado", None)
    if formato is None:
        validar_fotografia(archivo)
        formato = archivo.formato_validado
    return f"talleres/{uuid4().hex}/{subcarpeta}/{uuid4().hex}.{EXTENSIONES[formato]}"


def ruta_imagen_perfil(instance, filename):
    # No usa PK ni filename del cliente. Solo un archivo validado puede obtener ruta.
    return _ruta_imagen_taller(instance.imagen_perfil, "perfil")


def ruta_imagen_portada(instance, filename):
    # No usa PK ni filename del cliente. Solo un archivo validado puede obtener ruta.
    return _ruta_imagen_taller(instance.imagen_portada, "portada")


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

# Posición del taller en el mapa (FEAT-GEO-01). El artesano la edita, pero no forma
# parte del perfil público: la API pública la entrega solo como ``ubicacion_mapa``
# cuando el artesano autoriza publicarla.
CAMPOS_UBICACION = (
    "latitud",
    "longitud",
    "ubicacion_publica",
)

CAMPOS_IMAGENES = (
    "imagen_perfil",
    "imagen_portada",
)

CAMPOS_ACTUALIZABLES_PERFIL = (*CAMPOS_PERFIL, *CAMPOS_UBICACION, *CAMPOS_IMAGENES)

# Contiene al menos un carácter que no es espacio. \S significa lo mismo en
# Python y en PostgreSQL.
PATRON_NO_EN_BLANCO = r"\S"

validar_url_web = URLValidator(schemes=["http", "https"])
_validar_telefono = RegexValidator(PATRON_TELEFONO_NORMALIZADO, MENSAJE_FORMATO)

# Posición del taller en el mapa (FEAT-GEO-01). Grados decimales WGS 84; seis
# decimales equivalen a unos 11 cm, más que suficiente para ubicar un taller.
LATITUD_MAXIMA = Decimal("90")
LONGITUD_MAXIMA = Decimal("180")
DECIMALES_COORDENADA = 6

MENSAJE_FALTA_LATITUD = "Indica también la latitud: las coordenadas van juntas."
MENSAJE_FALTA_LONGITUD = "Indica también la longitud: las coordenadas van juntas."
MENSAJE_PUBLICA_SIN_COORDENADAS = "No se puede publicar la ubicación sin coordenadas."


def errores_ubicacion(latitud, longitud, ubicacion_publica) -> dict[str, list[str]]:
    """Coherencia de la ubicación final: coordenadas en pareja y publicables solo si existen.

    La comparten el modelo y los serializers, que la aplican al estado resultante
    (valores enviados más los actuales en una edición parcial).
    """
    errores = {}
    if latitud is None and longitud is not None:
        errores["latitud"] = [MENSAJE_FALTA_LATITUD]
    elif longitud is None and latitud is not None:
        errores["longitud"] = [MENSAJE_FALTA_LONGITUD]
    elif ubicacion_publica and latitud is None:
        errores["ubicacion_publica"] = [MENSAJE_PUBLICA_SIN_COORDENADAS]
    return errores


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
    imagen_perfil = models.ImageField(
        "imagen de perfil",
        upload_to=ruta_imagen_perfil,
        null=True,
        blank=True,
        max_length=200,
        validators=[validar_fotografia],
    )
    imagen_portada = models.ImageField(
        "imagen de portada",
        upload_to=ruta_imagen_portada,
        null=True,
        blank=True,
        max_length=200,
        validators=[validar_fotografia],
    )

    # Sin coordenadas el taller no aparece en el mapa. Publicarlas es decisión
    # expresa del artesano: nunca ocurre por defecto.
    latitud = models.DecimalField(
        "latitud",
        max_digits=9,
        decimal_places=DECIMALES_COORDENADA,
        null=True,
        blank=True,
        validators=[MinValueValidator(-LATITUD_MAXIMA), MaxValueValidator(LATITUD_MAXIMA)],
    )
    longitud = models.DecimalField(
        "longitud",
        max_digits=10,
        decimal_places=DECIMALES_COORDENADA,
        null=True,
        blank=True,
        validators=[MinValueValidator(-LONGITUD_MAXIMA), MaxValueValidator(LONGITUD_MAXIMA)],
    )
    ubicacion_publica = models.BooleanField(
        "ubicación pública",
        default=False,
        help_text="Si el artesano autoriza mostrar la posición del taller en el mapa público.",
    )

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
            models.CheckConstraint(
                condition=Q(latitud__isnull=True)
                | Q(latitud__gte=-LATITUD_MAXIMA, latitud__lte=LATITUD_MAXIMA),
                name="taller_latitud_en_rango",
                violation_error_message="La latitud debe estar entre -90 y 90.",
            ),
            models.CheckConstraint(
                condition=Q(longitud__isnull=True)
                | Q(longitud__gte=-LONGITUD_MAXIMA, longitud__lte=LONGITUD_MAXIMA),
                name="taller_longitud_en_rango",
                violation_error_message="La longitud debe estar entre -180 y 180.",
            ),
            models.CheckConstraint(
                condition=Q(latitud__isnull=True, longitud__isnull=True)
                | Q(latitud__isnull=False, longitud__isnull=False),
                name="taller_coordenadas_completas",
                violation_error_message="La latitud y la longitud se guardan juntas.",
            ),
            models.CheckConstraint(
                condition=Q(ubicacion_publica=False)
                | Q(latitud__isnull=False, longitud__isnull=False),
                name="taller_ubicacion_publica_con_coordenadas",
                violation_error_message=MENSAJE_PUBLICA_SIN_COORDENADAS,
            ),
        ]

    def __str__(self):
        return self.nombre

    def clean(self):
        # Errores por campo; full_clean() omite entonces las restricciones equivalentes.
        errores = errores_ubicacion(self.latitud, self.longitud, self.ubicacion_publica)
        if errores:
            raise ValidationError(errores)

    @property
    def es_publico(self) -> bool:
        return self.estado == EstadoTaller.APROBADO

    @property
    def publica_ubicacion(self) -> bool:
        """La posición sale en el mapa público solo si el taller es público, el
        artesano lo autorizó y existen ambas coordenadas."""
        return (
            self.es_publico
            and self.ubicacion_publica
            and self.latitud is not None
            and self.longitud is not None
        )

    @property
    def habilita_operacion(self) -> bool:
        """RN-002: solo un taller aprobado habilita las funciones operativas del artesano."""
        return self.estado == EstadoTaller.APROBADO

    def pertenece_a(self, usuario) -> bool:
        """Contrato de ``EsPropietario``: solo el artesano dueño accede a su taller."""
        return usuario.is_authenticated and self.propietario_id == usuario.pk
