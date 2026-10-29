"""Operaciones de cuentas con reglas del negocio (RF-004).

El rol lo decide el servidor según la operación invocada; ningún dato de la
petición lo determina.
"""

import logging

from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.talleres import services as talleres

from .models import Rol, Usuario
from .phone import normalizar_telefono

logger = logging.getLogger(__name__)

MAX_NOMBRE = Usuario._meta.get_field("nombre").max_length


class _NoEnviado:
    def __repr__(self):
        return "NO_ENVIADO"


# Distingue «campo ausente» de cualquier valor enviado (incluido uno vacío).
NO_ENVIADO = _NoEnviado()


class TelefonoYaRegistrado(Exception):
    """Ya existe una cuenta con ese teléfono, una vez normalizado."""


class PasswordActualRequerido(Exception):
    """Cambiar el teléfono de acceso exige confirmar la contraseña actual."""


class PasswordActualIncorrecto(Exception):
    """La contraseña actual enviada para cambiar el teléfono no es la de la cuenta."""


class CredencialesInvalidas(Exception):
    """Teléfono o contraseña incorrectos, o cuenta inactiva: no se distinguen."""


class CuentaDeAdministracion(Exception):
    """Credenciales correctas de una cuenta que opera en Django Admin, no en la API."""


def registrar_comprador(*, nombre: str, telefono: str, password: str) -> Usuario:
    return _registrar(Rol.COMPRADOR, nombre=nombre, telefono=telefono, password=password)


def registrar_artesano(*, nombre: str, telefono: str, password: str, taller: dict) -> Usuario:
    """Crea la cuenta del artesano y su taller pendiente en una sola transacción.

    ``taller`` son los datos iniciales del perfil (RF-008). Si el taller no puede
    crearse, la cuenta tampoco queda: nunca existe un artesano registrado sin taller.
    El taller nace pendiente; solo la administración lo aprueba (RF-013, RN-002).
    """
    with transaction.atomic():
        usuario = _registrar(Rol.ARTESANO, nombre=nombre, telefono=telefono, password=password)
        talleres.crear_taller_pendiente(propietario=usuario, **taller)
    return usuario


def _registrar(rol: Rol, *, nombre: str, telefono: str, password: str) -> Usuario:
    telefono = normalizar_telefono(telefono)
    if Usuario.objects.filter(telefono=telefono).exists():
        raise TelefonoYaRegistrado
    try:
        with transaction.atomic():
            return Usuario.objects.create_user(
                telefono=telefono, password=password, nombre=nombre, rol=rol
            )
    except IntegrityError:
        # Dos registros simultáneos del mismo teléfono: la restricción única decide.
        if Usuario.objects.filter(telefono=telefono).exists():
            raise TelefonoYaRegistrado from None
        raise


def actualizar_datos_personales(
    usuario: Usuario,
    *,
    nombre=NO_ENVIADO,
    telefono=NO_ENVIADO,
    password_actual: str | None = None,
) -> Usuario:
    """Actualiza los datos personales propios permitidos: nombre y teléfono (RF-004).

    La fila bloqueada es la autoridad: las comprobaciones se hacen contra ella y
    no contra la instancia recibida, que puede estar desactualizada. Un cambio
    efectivo del teléfono de acceso exige la contraseña actual (D-AUD15-02); un
    teléfono que normaliza al actual no es un cambio. Rol, estado, privilegios y
    contraseña no se tocan aquí, ni los contactos públicos del taller (D-AUD15-05).
    No se conservan los valores anteriores (D-AUD15-06).
    """
    with transaction.atomic():
        actual = _bloquear_usuario(usuario.pk)
        campos = []

        if nombre is not NO_ENVIADO:
            nombre = _validar_nombre(nombre)
            if nombre != actual.nombre:
                actual.nombre = nombre
                campos.append("nombre")

        if telefono is not NO_ENVIADO:
            try:
                telefono = normalizar_telefono(telefono)
            except ValidationError as exc:
                raise ValidationError({"telefono": exc.messages}) from None
            if telefono != actual.telefono:
                if not password_actual:
                    raise PasswordActualRequerido
                if not actual.check_password(password_actual):
                    logger.info(
                        "actualizar_datos_personales usuario_id=%s resultado=password_incorrecto",
                        actual.pk,
                    )
                    raise PasswordActualIncorrecto
                if Usuario.objects.filter(telefono=telefono).exclude(pk=actual.pk).exists():
                    raise TelefonoYaRegistrado
                actual.telefono = telefono
                campos.append("telefono")

        if campos:
            _guardar_datos_personales(actual, campos)
            logger.info(
                "actualizar_datos_personales usuario_id=%s resultado=actualizado campos=%s",
                actual.pk,
                ",".join(campos),
            )
    return actual


def _bloquear_usuario(pk: int) -> Usuario:
    return Usuario.objects.select_for_update().get(pk=pk)


def _validar_nombre(nombre) -> str:
    if not isinstance(nombre, str) or not nombre.strip():
        raise ValidationError({"nombre": ["Ingresa tu nombre."]}, code="blank")
    nombre = nombre.strip()
    if len(nombre) > MAX_NOMBRE:
        raise ValidationError({"nombre": [f"Máximo {MAX_NOMBRE} caracteres."]}, code="max_length")
    return nombre


def _guardar_datos_personales(usuario: Usuario, campos: list[str]) -> None:
    try:
        # Punto de guardado: el fallo de la restricción única no invalida la transacción.
        with transaction.atomic():
            usuario.save(update_fields=campos)
    except IntegrityError:
        # Otra cuenta obtuvo el mismo teléfono en paralelo: la restricción única decide.
        if (
            "telefono" in campos
            and Usuario.objects.filter(telefono=usuario.telefono).exclude(pk=usuario.pk).exists()
        ):
            raise TelefonoYaRegistrado from None
        raise


def autenticar(request, *, telefono: str, password: str) -> Usuario:
    """Verifica las credenciales con los backends de Django y la regla de acceso a la API."""
    usuario = authenticate(request, telefono=telefono, password=password)
    if usuario is None:
        # El backend de Django también rechaza aquí las cuentas inactivas.
        raise CredencialesInvalidas
    if not usuario.puede_usar_api:
        raise CuentaDeAdministracion
    return usuario
