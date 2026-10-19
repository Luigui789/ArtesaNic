"""Categorías en Django Admin (RF-013): alta y cambio de nombre con código estable."""

from django.contrib.auth.models import Permission
from django.test import TestCase

from apps.catalogo.models import Categoria
from apps.talleres import services as servicios_taller
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from .base import crear_categoria, crear_producto

URL_LISTA = "/admin/catalogo/categoria/"


class CategoriasEnAdminTests(TestCase):
    def setUp(self):
        self.admin = crear_administrador()
        self.admin.user_permissions.add(
            *Permission.objects.filter(
                content_type__app_label="catalogo", codename__contains="categoria"
            )
        )
        self.client.force_login(self.admin)
        self.categoria = crear_categoria()

    def test_crea_una_categoria(self):
        respuesta = self.client.post(
            f"{URL_LISTA}add/", {"codigo": "textiles", "nombre": "Textiles"}
        )
        self.assertEqual(respuesta.status_code, 302)
        self.assertTrue(Categoria.objects.filter(codigo="textiles").exists())

    def test_rechaza_un_codigo_no_valido(self):
        respuesta = self.client.post(f"{URL_LISTA}add/", {"codigo": "Con espacios", "nombre": "X"})
        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(Categoria.objects.filter(nombre="X").exists())

    def test_el_codigo_no_cambia_al_editar(self):
        url = f"{URL_LISTA}{self.categoria.pk}/change/"
        respuesta = self.client.post(url, {"codigo": "otro", "nombre": "Cuero"})
        self.assertEqual(respuesta.status_code, 302)
        self.categoria.refresh_from_db()
        self.assertEqual(
            (self.categoria.codigo, self.categoria.nombre), ("cuero_y_calzado", "Cuero")
        )

    def test_no_borra_una_categoria_con_productos(self):
        taller = crear_artesano_con_taller()
        servicios_taller.aprobar_taller(taller, revisor=self.admin)
        crear_producto(taller, self.categoria)
        respuesta = self.client.post(f"{URL_LISTA}{self.categoria.pk}/delete/", {"post": "yes"})
        self.assertEqual(respuesta.status_code, 200)  # Django muestra los objetos protegidos
        self.assertTrue(Categoria.objects.filter(pk=self.categoria.pk).exists())
