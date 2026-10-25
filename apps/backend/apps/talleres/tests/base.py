"""Apoyo compartido por las pruebas de talleres."""

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.talleres import services
from apps.talleres.models import Taller

URL_TALLERES = "/api/v1/talleres/"
URL_MI_TALLER = "/api/v1/talleres/mi-taller/"


def url_taller(taller_id: int) -> str:
    return f"{URL_TALLERES}{taller_id}/"


def datos_taller(**cambios) -> dict:
    """Datos iniciales mínimos de un taller (nombre, rubro y dirección)."""
    return {
        "nombre": "Cerámica López",
        "rubro": "Cerámica artesanal",
        "direccion_completa": "Barrio San Juan, de la iglesia 2 c. al sur, Masaya",
    } | cambios


def crear_artesano_con_taller(telefono="82222222", **taller) -> Taller:
    artesano = crear_usuario(telefono, rol=Rol.ARTESANO)
    return services.crear_taller_pendiente(propietario=artesano, **datos_taller(**taller))


def crear_administrador(telefono="88887777", **extra):
    return crear_usuario(telefono, rol=Rol.ADMINISTRADOR, is_staff=True, **extra)
