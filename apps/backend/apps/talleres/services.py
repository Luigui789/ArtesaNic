"""Reglas del taller: alta pendiente, perfil y aprobación administrativa.

RF-008, RF-013, RN-002. Las transiciones de estado ocurren solo aquí: ninguna
vista, serializer ni formulario de administración cambia ``estado`` por su cuenta.
Ciclo V1: pendiente → aprobado y pendiente → rechazado; ambos resultados son finales.
"""

import logging

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Rol

from .models import CAMPOS_ACTUALIZABLES_PERFIL, CAMPOS_IMAGENES, EstadoTaller, Taller

logger = logging.getLogger(__name__)


def _eliminar_archivo(storage, nombre):
    try:
        storage.delete(nombre)
    except OSError:
        logger.exception("No se pudo limpiar imagen obsoleta del taller: %s", nombre)


def _guardar_taller(taller: Taller, **kwargs):
    nuevas = [
        getattr(taller, campo)
        for campo in CAMPOS_IMAGENES
        if getattr(taller, campo) and not getattr(taller, campo)._committed
    ]
    try:
        taller.save(**kwargs)
    except Exception:
        for archivo in nuevas:
            if archivo._committed:
                _eliminar_archivo(archivo.storage, archivo.name)
        raise


class PropietarioNoValido(Exception):
    """Solo una cuenta de artesano puede ser dueña de un taller."""


class RevisorNoValido(Exception):
    """Solo una cuenta de administración aprueba o rechaza talleres."""


class TransicionNoPermitida(Exception):
    """El estado actual del taller no admite la decisión solicitada."""

    def __init__(self, actual: str, solicitado: str):
        self.actual = actual
        self.solicitado = solicitado
        super().__init__(f"Un taller {actual} no puede pasar a {solicitado}.")


MAX_MOTIVO_RECHAZO = Taller._meta.get_field("motivo_rechazo").max_length


def crear_taller_pendiente(
    *,
    propietario,
    nombre: str,
    rubro: str,
    direccion_completa: str,
    historia: str = "",
    horario: str = "",
    telefono_publico: str = "",
    whatsapp_publico: str = "",
    facebook_url: str = "",
    instagram_url: str = "",
    sitio_web: str = "",
) -> Taller:
    """Crea el taller del artesano en estado pendiente.

    Lo invoca el registro del artesano dentro de su misma transacción
    (``accounts.services.registrar_artesano``). Los contactos públicos se toman solo
    de los datos recibidos: el teléfono de acceso de la cuenta no se copia nunca.
    """
    if propietario.rol != Rol.ARTESANO:
        raise PropietarioNoValido
    taller = Taller(
        propietario=propietario,
        estado=EstadoTaller.PENDIENTE,
        nombre=nombre,
        rubro=rubro,
        direccion_completa=direccion_completa,
        historia=historia,
        horario=horario,
        telefono_publico=telefono_publico,
        whatsapp_publico=whatsapp_publico,
        facebook_url=facebook_url,
        instagram_url=instagram_url,
        sitio_web=sitio_web,
    )
    taller.full_clean()
    with transaction.atomic():
        taller.save()
    return taller


def actualizar_perfil(taller: Taller, **datos) -> Taller:
    """Modifica los datos públicos del perfil (RF-008.4) sin tocar estado ni revisión."""
    desconocidos = set(datos) - set(CAMPOS_ACTUALIZABLES_PERFIL)
    if desconocidos:
        raise ValueError(f"Campos que no pertenecen al perfil: {sorted(desconocidos)}")
    with transaction.atomic():
        # El bloqueo evita validar contra un estado que una revisión simultánea cambió.
        actual = Taller.objects.select_for_update().get(pk=taller.pk)
        anteriores = {
            campo: (getattr(actual, campo).name, getattr(actual, campo).storage)
            for campo in CAMPOS_IMAGENES
            if campo in datos
        }
        for campo, valor in datos.items():
            setattr(actual, campo, valor)
        actual.full_clean()
        # Solo los campos enviados: nunca se reescriben estado ni revisión.
        _guardar_taller(actual, update_fields=[*datos, "actualizado_en"])
        for campo, (anterior, storage) in anteriores.items():
            if anterior and anterior != getattr(actual, campo).name:
                transaction.on_commit(lambda s=storage, n=anterior: _eliminar_archivo(s, n))
    return actual


def aprobar_taller(taller: Taller, *, revisor) -> bool:
    """Aprueba un taller pendiente. Devuelve ``False`` si ya estaba aprobado (sin efectos)."""
    return _resolver(taller, revisor=revisor, nuevo=EstadoTaller.APROBADO)


def rechazar_taller(taller: Taller, *, revisor, motivo: str = "") -> bool:
    """Rechaza un taller pendiente; el motivo es opcional.

    Devuelve ``False`` si ya estaba rechazado: no reescribe revisión ni motivo.
    """
    motivo = motivo.strip()
    if len(motivo) > MAX_MOTIVO_RECHAZO:
        raise ValidationError(
            {"motivo_rechazo": f"Máximo {MAX_MOTIVO_RECHAZO} caracteres."}, code="max_length"
        )
    return _resolver(taller, revisor=revisor, nuevo=EstadoTaller.RECHAZADO, motivo=motivo)


def _resolver(taller: Taller, *, revisor, nuevo: EstadoTaller, motivo: str = "") -> bool:
    if not (revisor.is_active and revisor.rol == Rol.ADMINISTRADOR):
        raise RevisorNoValido
    with transaction.atomic():
        # Dos revisiones simultáneas se serializan: la segunda ve el resultado de la primera.
        actual = Taller.objects.select_for_update().get(pk=taller.pk)
        if actual.estado == nuevo:
            cambio = False
        elif actual.estado != EstadoTaller.PENDIENTE:
            raise TransicionNoPermitida(actual.estado, nuevo)
        else:
            actual.estado = nuevo
            actual.revisado_por = revisor
            actual.revisado_en = timezone.now()
            actual.motivo_rechazo = motivo
            actual.save(update_fields=["estado", "revisado_por", "revisado_en", "motivo_rechazo"])
            cambio = True
    for campo in ("estado", "revisado_por", "revisado_en", "motivo_rechazo"):
        setattr(taller, campo, getattr(actual, campo))
    return cambio
