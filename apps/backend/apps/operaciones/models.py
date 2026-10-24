"""Registro de mutaciones comerciales idempotentes (AUD-08, RF-009.7, RNF-011, RNF-014).

Solo guarda la identidad lógica de un intento y la referencia a su resultado. No
contiene reglas comerciales: cada dominio ejecuta su propia mutación en su servicio.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

# Caracteres no reservados de URL (RFC 3986) y «:». Admite UUID y ULID; excluye espacios,
# controles, «/» y cualquier carácter que exija codificarse en la ruta de recuperación.
PATRON_CLAVE = r"^[A-Za-z0-9._:~-]{16,128}$"
MIN_CLAVE = 16
MAX_CLAVE = 128


class TipoOperacion(models.TextChoices):
    """Mutaciones protegidas. AUD-10+ añaden aquí las suyas al implementarlas."""

    CREAR_SOLICITUD = "crear_solicitud", "Crear solicitud"
    RESOLVER_RENGLON = "resolver_renglon", "Resolver renglón de solicitud"
    FINALIZAR_PROPUESTA = "finalizar_propuesta", "Emitir propuesta final"
    DECIDIR_PROPUESTA = "decidir_propuesta", "Decidir propuesta final"
    ESTABLECER_INVENTARIO_INICIAL = (
        "establecer_inventario_inicial",
        "Registrar existencia inicial",
    )
    REGISTRAR_ENTRADA_INVENTARIO = (
        "registrar_entrada_inventario",
        "Registrar entrada de inventario",
    )
    AJUSTAR_INVENTARIO = "ajustar_inventario", "Ajustar inventario"
    REGISTRAR_INTENTO_PAGO = "registrar_intento_pago", "Registrar intento de pago"
    CORREGIR_INTENTO_PAGO = "corregir_intento_pago", "Corregir intento de pago observado"
    RESOLVER_INTENTO_PAGO = "resolver_intento_pago", "Resolver intento de pago"


class EstadoOperacion(models.TextChoices):
    # Solo existe dentro de la transacción que ejecuta la mutación: se confirma ya
    # completada o se revierte junto con ella. Nunca es visible para otra transacción.
    EN_PROGRESO = "en_progreso", "En progreso"
    COMPLETADA = "completada", "Completada"


class OperacionIdempotenteQuerySet(models.QuerySet):
    def del_actor(self, actor):
        return self.filter(actor=actor)

    def completadas(self):
        return self.filter(estado=EstadoOperacion.COMPLETADA)


class OperacionIdempotente(models.Model):
    # Sin índice propio: el único (actor, tipo, clave) ya lo cubre como prefijo.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="operaciones",
        db_index=False,
    )
    tipo = models.CharField(max_length=40, choices=TipoOperacion.choices)
    clave = models.CharField(max_length=MAX_CLAVE)
    # SHA-256 hexadecimal del contrato de entrada normalizado; nunca se expone.
    huella = models.CharField(max_length=64)
    estado = models.CharField(
        max_length=20, choices=EstadoOperacion.choices, default=EstadoOperacion.EN_PROGRESO
    )
    # Referencia al recurso resultante (``app_label.model``); el recurso es la fuente de verdad.
    recurso_tipo = models.CharField(max_length=100, blank=True)
    recurso_id = models.PositiveBigIntegerField(null=True, blank=True)
    codigo_http = models.PositiveSmallIntegerField(null=True, blank=True)
    creado_en = models.DateTimeField(default=timezone.now, editable=False)
    completado_en = models.DateTimeField(null=True, blank=True)

    objects = OperacionIdempotenteQuerySet.as_manager()

    class Meta:
        verbose_name = "operación idempotente"
        verbose_name_plural = "operaciones idempotentes"
        constraints = [
            # Árbitro de concurrencia: un segundo INSERT espera a la transacción del
            # primero y falla si este confirma. Su índice resuelve también la búsqueda.
            models.UniqueConstraint(
                fields=["actor", "tipo", "clave"], name="operacion_clave_unica_por_actor"
            ),
            models.CheckConstraint(
                condition=Q(tipo__in=TipoOperacion.values), name="operacion_tipo_valido"
            ),
            models.CheckConstraint(
                condition=Q(clave__regex=PATRON_CLAVE), name="operacion_clave_formato"
            ),
            models.CheckConstraint(
                condition=Q(huella__regex=r"^[0-9a-f]{64}$"), name="operacion_huella_sha256"
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        estado=EstadoOperacion.EN_PROGRESO,
                        recurso_tipo="",
                        recurso_id__isnull=True,
                        codigo_http__isnull=True,
                        completado_en__isnull=True,
                    )
                    | Q(
                        estado=EstadoOperacion.COMPLETADA,
                        recurso_id__isnull=False,
                        codigo_http__isnull=False,
                        completado_en__isnull=False,
                    )
                    & ~Q(recurso_tipo="")
                ),
                name="operacion_resultado_coherente",
            ),
        ]

    def __str__(self):
        return f"{self.tipo} de {self.actor_id} ({self.estado})"
