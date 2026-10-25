"""Apoyo compartido por las pruebas de configuración."""

from django.contrib.auth.models import Permission

from apps.talleres.tests.base import crear_administrador

URL_CONFIGURACION = "/api/v1/configuracion/"
URL_ADMIN = "/admin/configuracion/configuracionplataforma/"
URL_ADMIN_CAMBIO = f"{URL_ADMIN}1/change/"


def administrador_de_tasa(telefono="88887777", **extra):
    """Administrador de plataforma (sin superusuario) con el permiso concreto de la tasa."""
    admin = crear_administrador(telefono, **extra)
    admin.user_permissions.add(
        *Permission.objects.filter(
            content_type__app_label="configuracion",
            codename__in=["view_configuracionplataforma", "change_configuracionplataforma"],
        )
    )
    # Los permisos se cachean por instancia: se vuelve a leer la cuenta.
    return type(admin).objects.get(pk=admin.pk)
