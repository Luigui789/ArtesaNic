"""Revisión de talleres en Django Admin (RF-013): aprobar o rechazar, sin editar el perfil."""

from django.contrib.admin import helpers
from django.contrib.auth.models import Permission
from django.test import TestCase

from apps.accounts.models import Usuario
from apps.accounts.tests.base import PASSWORD
from apps.talleres import services
from apps.talleres.models import EstadoTaller

from .base import crear_administrador, crear_artesano_con_taller

URL_LISTA = "/admin/talleres/taller/"


class RevisionEnAdminTests(TestCase):
    def setUp(self):
        self.taller = crear_artesano_con_taller()
        self.admin = crear_administrador()
        self.admin.user_permissions.add(
            *Permission.objects.filter(codename__in=["view_taller", "revisar_taller"])
        )
        self.client.force_login(self.admin)

    def accion(self, accion, *talleres, **extra):
        return self.client.post(
            URL_LISTA,
            {
                "action": accion,
                helpers.ACTION_CHECKBOX_NAME: [t.pk for t in talleres],
                **extra,
            },
        )

    def test_aprobar(self):
        respuesta = self.accion("aprobar", self.taller)
        self.assertEqual(respuesta.status_code, 302)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.APROBADO)
        self.assertEqual(self.taller.revisado_por, self.admin)
        self.assertIsNotNone(self.taller.revisado_en)

    def test_rechazar_pide_confirmacion_y_motivo_opcional(self):
        respuesta = self.accion("rechazar", self.taller)
        self.assertEqual(respuesta.status_code, 200)
        self.assertTemplateUsed(respuesta, "admin/talleres/taller/rechazar.html")
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.PENDIENTE)

        respuesta = self.accion("rechazar", self.taller, confirmar="1", motivo="Dirección falsa")
        self.assertEqual(respuesta.status_code, 302)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.RECHAZADO)
        self.assertEqual(self.taller.motivo_rechazo, "Dirección falsa")
        self.assertEqual(self.taller.revisado_por, self.admin)

    def test_rechazar_sin_motivo(self):
        self.accion("rechazar", self.taller, confirmar="1", motivo="")
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.RECHAZADO)
        self.assertEqual(self.taller.motivo_rechazo, "")

    def test_transicion_no_permitida_informa_y_no_cambia(self):
        services.rechazar_taller(self.taller, revisor=self.admin)
        respuesta = self.accion("aprobar", self.taller)
        self.assertEqual(respuesta.status_code, 302)
        mensajes = [str(m) for m in respuesta.wsgi_request._messages]
        self.assertTrue(any("no puede pasar a aprobado" in m for m in mensajes), mensajes)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.RECHAZADO)

    def test_sin_permiso_de_revision_no_hay_acciones(self):
        sin_permiso = crear_administrador("88886666")
        sin_permiso.user_permissions.add(Permission.objects.get(codename="view_taller"))
        self.client.force_login(sin_permiso)
        respuesta = self.client.get(URL_LISTA)
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(respuesta.context["action_form"])
        self.accion("aprobar", self.taller)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.estado, EstadoTaller.PENDIENTE)

    def test_no_edita_crea_ni_borra_talleres(self):
        url_cambio = f"{URL_LISTA}{self.taller.pk}/change/"
        respuesta = self.client.get(url_cambio)
        self.assertEqual(respuesta.status_code, 200)  # solo lectura
        respuesta = self.client.post(url_cambio, {"nombre": "Otro", "estado": "aprobado"})
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(self.client.get(f"{URL_LISTA}add/").status_code, 403)
        self.assertEqual(self.client.get(f"{URL_LISTA}{self.taller.pk}/delete/").status_code, 403)
        self.taller.refresh_from_db()
        self.assertEqual(self.taller.nombre, "Cerámica López")
        self.assertEqual(self.taller.estado, EstadoTaller.PENDIENTE)

    def test_el_superusuario_tampoco_edita_el_perfil(self):
        superusuario = Usuario.objects.create_superuser(
            telefono="89990000", password=PASSWORD, nombre="Mantenimiento"
        )
        self.client.force_login(superusuario)
        respuesta = self.client.get(f"{URL_LISTA}{self.taller.pk}/change/")
        self.assertEqual(respuesta.status_code, 200)
        self.assertIn("estado", respuesta.context["adminform"].readonly_fields)
        self.assertIn("nombre", respuesta.context["adminform"].readonly_fields)
