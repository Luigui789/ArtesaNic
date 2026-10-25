"""Actualización transaccional de la tasa de cambio (RF-007.3, RF-013.4; D-AUD14-09).

Única vía de escritura: Django Admin la invoca desde ``save_model`` y no existe escritura
por la API pública (D-AUD14-12). La proyección (``ConfiguracionPlataforma``) y su evento
(``CambioTasaCambio``) se escriben en la misma transacción, bajo el lock del singleton:
dos administradores simultáneos se serializan y ninguna actualización se pierde en
silencio. Cambiar la tasa nunca toca pedidos, pagos ni reembolsos (RF-007.4).
"""

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import DecimalValidator
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Rol

from .models import (
    DECIMALES_TASA,
    DIGITOS_TASA,
    ID_CONFIGURACION,
    TASA_MINIMA,
    CambioTasaCambio,
    ConfiguracionPlataforma,
)

PERMISO_TASA = "configuracion.change_configuracionplataforma"


class ActorNoAutorizado(Exception):
    """Solo un administrador de plataforma activo, con el permiso concreto, cambia la tasa."""


def obtener_configuracion() -> ConfiguracionPlataforma | None:
    """Singleton vigente; ``None`` solo si la migración inicial no se aplicó."""
    return ConfiguracionPlataforma.objects.filter(pk=ID_CONFIGURACION).first()


def _exigir_actor(actor) -> None:
    # El permiso no basta: rol de negocio e is_staff son condiciones propias (RNF-004).
    if not (
        actor is not None
        and actor.is_authenticated
        and actor.is_active
        and actor.rol == Rol.ADMINISTRADOR
        and actor.is_staff
        and actor.has_perm(PERMISO_TASA)
    ):
        raise ActorNoAutorizado


def _validar_tasa(valor) -> Decimal:
    """Decimal positivo con hasta 10 dígitos y 4 decimales. No redondea en silencio."""
    try:
        tasa = Decimal(str(valor)) if valor is not None else None
    except InvalidOperation:
        tasa = None
    if tasa is None or not tasa.is_finite():
        raise ValidationError({"tasa_cambio_usd_nio": "Indica una tasa de cambio numérica."})
    if tasa < TASA_MINIMA:
        raise ValidationError({"tasa_cambio_usd_nio": "La tasa de cambio debe ser mayor que cero."})
    try:
        DecimalValidator(DIGITOS_TASA, DECIMALES_TASA)(tasa)
    except ValidationError as exc:
        raise ValidationError({"tasa_cambio_usd_nio": exc.messages}) from None
    return tasa


def _bloquear_configuracion() -> ConfiguracionPlataforma:
    """Lock del singleton: serializa los cambios de tasa simultáneos."""
    return ConfiguracionPlataforma.objects.select_for_update().get(pk=ID_CONFIGURACION)


def actualizar_tasa_cambio(*, actor, nueva_tasa) -> bool:
    """Fija la tasa vigente y registra el cambio. ``False`` si ya era la misma (sin evento)."""
    _exigir_actor(actor)
    tasa = _validar_tasa(nueva_tasa)
    with transaction.atomic():
        configuracion = _bloquear_configuracion()
        anterior = configuracion.tasa_cambio_usd_nio
        if anterior is not None and anterior == tasa:
            return False
        ahora = timezone.now()
        CambioTasaCambio.objects.create(
            configuracion=configuracion,
            tasa_anterior=anterior,
            tasa_nueva=tasa,
            actor=actor,
            creado_en=ahora,
        )
        configuracion.tasa_cambio_usd_nio = tasa
        configuracion.actualizada_por = actor
        configuracion.actualizada_en = ahora
        configuracion.save(
            update_fields=["tasa_cambio_usd_nio", "actualizada_por", "actualizada_en"]
        )
    return True
