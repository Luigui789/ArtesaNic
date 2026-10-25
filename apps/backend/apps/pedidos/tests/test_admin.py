"""Supervisión de pedidos en Django Admin, solo lectura, y privacidad administrativa.

RF-013.5 a 8, RN-006; D-AUD14-10/11. El administrador de plataforma consulta estado e
importes, nunca modifica el acuerdo y no tiene acceso a pagos, comprobantes ni chats.
"""

from django.apps import apps
from django.contrib import admin
from django.contrib.auth.models import Permission
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import Usuario
from apps.accounts.tests.base import PASSWORD
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.tests.base import archivos_privados, confirmar_pedido, imagen
from apps.pedidos.models import EstadoOperativoPedido, Pedido
from apps.solicitudes.tests.base import SolicitudesAPITestCase
from apps.talleres.tests.base import crear_administrador

URL_PEDIDOS = "/admin/pedidos/pedido/"

# Superficie administrativa completa tras AUD-14. Ampliarla exige revisar RF-013.6 a 8:
# pagos, comprobantes y futuras conversaciones no se registran (D-AUD14-11).
SUPERFICIE_ADMIN = {
    "auth.group",
    "accounts.usuario",
    "talleres.taller",
    "catalogo.categoria",
    "catalogo.producto",
    "configuracion.configuracionplataforma",
    "pedidos.pedido",
}


class PedidoAdminTestCase(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        self.supervisor = crear_administrador("88880000")
        self.supervisor.user_permissions.add(Permission.objects.get(codename="view_pedido"))
        self.client = Client()
        self.client.force_login(self.supervisor)

    def detalle(self, pedido=None):
        return self.client.get(f"{URL_PEDIDOS}{(pedido or self.pedido).pk}/change/")


class SupervisionPedidosTests(PedidoAdminTestCase):
    def test_listado_con_estado_e_importes_sin_telefono(self):
        respuesta = self.client.get(URL_PEDIDOS)
        self.assertEqual(respuesta.status_code, 200)
        self.assertContains(respuesta, self.comprador.nombre)
        self.assertContains(respuesta, self.taller.nombre)
        self.assertContains(respuesta, "Pedido confirmado")
        self.assertContains(respuesta, "NIO")
        self.assertNotContains(respuesta, self.comprador.telefono)

    def test_filtros_y_busqueda(self):
        for params in (
            {"estado_operativo__estado__exact": "confirmado"},
            {"modalidad_entrega__exact": "entrega_artesano"},
            {"moneda__exact": "NIO"},
            {"q": str(self.pedido.pk)},
            {"q": self.taller.nombre},
            {"q": self.comprador.nombre},
        ):
            respuesta = self.client.get(URL_PEDIDOS, params)
            self.assertEqual(respuesta.status_code, 200, params)
            self.assertEqual([p.pk for p in respuesta.context["cl"].result_list], [self.pedido.pk])
        vacio = self.client.get(URL_PEDIDOS, {"estado_operativo__estado__exact": "entregado"})
        self.assertEqual(list(vacio.context["cl"].result_list), [])
        # Sin búsqueda por teléfono (RNF-013).
        por_telefono = self.client.get(URL_PEDIDOS, {"q": self.comprador.telefono})
        self.assertEqual(list(por_telefono.context["cl"].result_list), [])

    def test_detalle_de_solo_lectura_con_estado_importes_y_lineas(self):
        respuesta = self.detalle()
        self.assertEqual(respuesta.status_code, 200)
        campos = respuesta.context["adminform"].readonly_fields
        for campo in ("total", "subtotal_productos", "costo_entrega", "estado", "moneda"):
            self.assertIn(campo, campos)
        self.assertContains(respuesta, "Pedido confirmado")
        self.assertContains(respuesta, self.producto.nombre)
        self.assertNotContains(respuesta, self.comprador.telefono)
        self.assertNotContains(respuesta, 'name="_save"')

    def test_sin_n_mas_uno_en_el_listado(self):
        def consultas():
            with CaptureQueriesContext(connection) as capturadas:
                self.assertEqual(self.client.get(URL_PEDIDOS).status_code, 200)
            return len(capturadas)

        con_uno = consultas()
        for _ in range(3):
            confirmar_pedido(
                comprador=self.comprador, artesano=self.artesano, producto=self.producto
            )
        self.assertEqual(consultas(), con_uno)

    def test_no_crea_edita_borra_ni_cambia_estado(self):
        antes = Pedido.objects.filter(pk=self.pedido.pk).values().get()
        url = f"{URL_PEDIDOS}{self.pedido.pk}/change/"
        self.assertEqual(self.client.post(url, {"total": "1.00"}).status_code, 403)
        self.assertEqual(self.client.get(f"{URL_PEDIDOS}add/").status_code, 403)
        self.assertEqual(
            self.client.post(f"{URL_PEDIDOS}{self.pedido.pk}/delete/", {"post": "yes"}).status_code,
            403,
        )
        listado = self.client.get(URL_PEDIDOS)
        self.assertIsNone(listado.context["action_form"])  # sin acciones de ciclo de vida
        self.assertEqual(Pedido.objects.filter(pk=self.pedido.pk).values().get(), antes)
        self.assertEqual(EstadoOperativoPedido.objects.get(pedido=self.pedido).estado, "confirmado")

    def test_superusuario_tampoco_modifica(self):
        superusuario = Usuario.objects.create_superuser(
            telefono="89990000", password=PASSWORD, nombre="Mantenimiento"
        )
        self.client.force_login(superusuario)
        self.assertEqual(self.detalle().status_code, 200)
        url = f"{URL_PEDIDOS}{self.pedido.pk}/change/"
        self.assertEqual(self.client.post(url, {"total": "1.00"}).status_code, 403)
        self.assertEqual(self.client.get(f"{URL_PEDIDOS}add/").status_code, 403)

    def test_sin_view_pedido_no_entra(self):
        self.client.force_login(crear_administrador("88881111"))
        self.assertEqual(self.client.get(URL_PEDIDOS).status_code, 403)
        self.assertEqual(self.detalle().status_code, 403)


class PrivacidadAdministrativaTests(PedidoAdminTestCase):
    def test_superficie_admin_exacta(self):
        registrados = {m._meta.label_lower for m in admin.site._registry}
        self.assertEqual(registrados, SUPERFICIE_ADMIN)

    def test_ningun_modelo_de_pagos_registrado(self):
        for modelo in apps.get_app_config("pagos").get_models():
            self.assertNotIn(modelo, admin.site._registry, modelo)
        superusuario = Usuario.objects.create_superuser(
            telefono="89990000", password=PASSWORD, nombre="Mantenimiento"
        )
        self.client.force_login(superusuario)
        self.assertEqual(self.client.get("/admin/pagos/").status_code, 404)
        self.assertNotContains(self.client.get("/admin/"), "/admin/pagos/")

    def test_detalle_del_pedido_sin_comprobantes_ni_referencias(self):
        antes = set(archivos_privados())
        pagos.registrar_intento(
            comprador=self.comprador,
            pedido_id=self.pedido.pk,
            metodo="transferencia",
            referencia="TRX-PRIVADA-123",
            comprobante=validar_comprobante(imagen()),
        )
        nuevos = set(archivos_privados()) - antes
        self.assertEqual(len(nuevos), 1)
        contenido = self.detalle().content.decode()
        for prohibido in ("TRX-PRIVADA-123", "comprobante", "private_media", nuevos.pop().name):
            self.assertNotIn(prohibido, contenido)
        self.assertNotIn("comprobante", self.client.get(URL_PEDIDOS).content.decode().lower())

    def test_admin_de_plataforma_no_descarga_comprobantes_por_la_api(self):
        # La sesión de Django Admin no autentica la API (JWT): sin acceso a la descarga.
        for ruta in ("mios", "recibidos"):
            respuesta = self.client.get(f"/api/v1/pedidos/{ruta}/{self.pedido.pk}/pago/")
            self.assertEqual(respuesta.status_code, 401, ruta)
