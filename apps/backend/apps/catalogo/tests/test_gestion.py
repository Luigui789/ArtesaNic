"""Gestión de productos propios (RF-001, RF-017, RF-019; RN-002, RN-003, RN-004; RNF-004).

Solo el artesano con taller aprobado opera su catálogo; el taller sale de la sesión
y un producto ajeno responde 404, igual que uno inexistente.
"""

from decimal import Decimal

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.catalogo.models import Producto
from apps.talleres.api.permissions import MENSAJE_TALLER_NO_APROBADO

from .base import (
    URL_MIS_PRODUCTOS,
    CatalogoAPITestCase,
    crear_producto,
    cuerpo_producto,
    imagen_prueba,
    url_despublicar,
    url_mi_producto,
    url_publicar,
)

CAMPOS_PROPIOS = {
    "id",
    "nombre",
    "descripcion",
    "precio",
    "categoria",
    "modalidades",
    "taller",
    "publicado",
    "moderacion",
    "creado_en",
    "fotografia_url",
    "actualizado_en",
}


class CrearProductoTests(CatalogoAPITestCase):
    def test_el_artesano_aprobado_crea_un_producto_de_su_taller(self):
        self.autenticar(self.artesano)
        respuesta = self.client.post(URL_MIS_PRODUCTOS, cuerpo_producto(), format="json")
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        cuerpo = respuesta.json()
        self.assertEqual(set(cuerpo), CAMPOS_PROPIOS)
        self.assertEqual(cuerpo["taller"], {"id": self.taller.pk, "nombre": "Barro y Sombra"})
        self.assertEqual(
            cuerpo["categoria"],
            {"id": self.categoria.pk, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado"},
        )
        self.assertEqual(cuerpo["precio"], "850.00")
        self.assertEqual(cuerpo["modalidades"], ["stock"])
        self.assertFalse(cuerpo["publicado"])
        producto = Producto.objects.get(pk=cuerpo["id"])
        self.assertEqual(producto.taller, self.taller)
        self.assertEqual(producto.precio, Decimal("850.00"))

    def test_el_taller_sale_de_la_sesion_y_no_del_cuerpo(self):
        self.autenticar(self.artesano)
        for campo, valor in (
            ("taller", self.taller_ajeno.pk),
            ("taller_id", self.taller_ajeno.pk),
            ("propietario", self.artesano_ajeno.pk),
            ("user_id", self.artesano_ajeno.pk),
            ("rol", "administrador"),
            ("publicado", True),
            ("id", 999),
            ("creado_en", "2020-01-01T00:00:00Z"),
            ("imagen", "https://example.com/foto.jpg"),
        ):
            with self.subTest(campo=campo):
                respuesta = self.client.post(
                    URL_MIS_PRODUCTOS, cuerpo_producto(**{campo: valor}), format="json"
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {campo: ["Campo no permitido."]})
        self.assertFalse(Producto.objects.exists())

    def test_campos_obligatorios(self):
        self.autenticar(self.artesano)
        respuesta = self.client.post(URL_MIS_PRODUCTOS, {}, format="json")
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(
            set(respuesta.json()),
            {"nombre", "descripcion", "precio", "categoria", "modalidades"},
        )

    def test_rechaza_textos_en_blanco(self):
        self.autenticar(self.artesano)
        for campo in ("nombre", "descripcion"):
            with self.subTest(campo=campo):
                respuesta = self.client.post(
                    URL_MIS_PRODUCTOS, cuerpo_producto(**{campo: "   "}), format="json"
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn(campo, respuesta.json())

    def test_rechaza_una_categoria_inexistente(self):
        self.autenticar(self.artesano)
        respuesta = self.client.post(
            URL_MIS_PRODUCTOS, cuerpo_producto(categoria="no_existe"), format="json"
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json(), {"categoria": ["La categoría indicada no existe."]})

    def test_rechaza_precios_no_validos(self):
        self.autenticar(self.artesano)
        for precio in ("0", "-5", "0.001", "abc", "12345678901.00", None):
            with self.subTest(precio=precio):
                respuesta = self.client.post(
                    URL_MIS_PRODUCTOS, cuerpo_producto(precio=precio), format="json"
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("precio", respuesta.json())

    def test_admite_un_precio_numerico_y_lo_conserva_exacto(self):
        self.autenticar(self.artesano)
        respuesta = self.client.post(
            URL_MIS_PRODUCTOS, cuerpo_producto(precio=1234.5), format="json"
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        self.assertEqual(respuesta.json()["precio"], "1234.50")
        self.assertEqual(Producto.objects.get().precio, Decimal("1234.50"))


class PermisosDeGestionTests(CatalogoAPITestCase):
    """Toda función operativa exige EsArtesanoAprobado (RN-002)."""

    def setUp(self):
        super().setUp()
        self.producto = crear_producto(self.taller, self.categoria)
        self.comprador = crear_usuario("86666666", rol=Rol.COMPRADOR)

    def peticiones(self):
        return [
            ("get", URL_MIS_PRODUCTOS, None),
            ("post", URL_MIS_PRODUCTOS, cuerpo_producto()),
            ("get", url_mi_producto(self.producto.pk), None),
            ("patch", url_mi_producto(self.producto.pk), {"nombre": "Nuevo"}),
            ("post", url_publicar(self.producto.pk), None),
            ("post", url_despublicar(self.producto.pk), None),
        ]

    def comprobar(self, codigo: int, detalle: str | None = None):
        for metodo, url, cuerpo in self.peticiones():
            with self.subTest(metodo=metodo, url=url):
                respuesta = getattr(self.client, metodo)(url, cuerpo, format="json")
                self.assertEqual(respuesta.status_code, codigo, respuesta.content)
                if detalle:
                    self.assertEqual(respuesta.json(), {"detail": detalle})
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.nombre, "Sandalias de cuero natural")
        self.assertFalse(self.producto.publicado)
        self.assertEqual(Producto.objects.count(), 1)

    def test_anonimo_recibe_401(self):
        self.anonimo()
        self.comprobar(401)

    def test_comprador_recibe_403(self):
        self.autenticar(self.comprador)
        self.comprobar(403, "Esta operación es exclusiva de las cuentas de artesano.")

    def test_artesano_pendiente_recibe_403(self):
        self.autenticar(self.taller_pendiente.propietario)
        self.comprobar(403, MENSAJE_TALLER_NO_APROBADO)

    def test_artesano_rechazado_recibe_403(self):
        self.autenticar(self.taller_rechazado.propietario)
        self.comprobar(403, MENSAJE_TALLER_NO_APROBADO)

    def test_el_artesano_pendiente_sigue_gestionando_su_taller(self):
        self.autenticar(self.taller_pendiente.propietario)
        self.assertEqual(self.client.get("/api/v1/talleres/mi-taller/").status_code, 200)

    def test_otro_artesano_aprobado_recibe_404_sobre_un_producto_ajeno(self):
        self.autenticar(self.artesano_ajeno)
        for metodo, url, cuerpo in self.peticiones()[2:]:
            with self.subTest(metodo=metodo, url=url):
                respuesta = getattr(self.client, metodo)(url, cuerpo, format="json")
                self.assertEqual(respuesta.status_code, 404)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.nombre, "Sandalias de cuero natural")
        self.assertFalse(self.producto.publicado)

    def test_un_producto_ajeno_responde_igual_que_uno_inexistente(self):
        self.autenticar(self.artesano_ajeno)
        ajeno = self.client.get(url_mi_producto(self.producto.pk))
        inexistente = self.client.get(url_mi_producto(self.producto.pk + 1000))
        self.assertEqual(ajeno.status_code, inexistente.status_code)
        self.assertEqual(ajeno.json(), inexistente.json())

    def test_el_listado_propio_no_incluye_productos_ajenos(self):
        crear_producto(self.taller_ajeno, self.categoria, nombre="Hamaca ajena")
        self.autenticar(self.artesano)
        respuesta = self.client.get(URL_MIS_PRODUCTOS)
        self.assertEqual([p["id"] for p in respuesta.json()["results"]], [self.producto.pk])

    def test_no_hay_put_ni_delete(self):
        self.autenticar(self.artesano)
        url = url_mi_producto(self.producto.pk)
        self.assertEqual(self.client.put(url, cuerpo_producto(), format="json").status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)
        self.assertTrue(Producto.objects.filter(pk=self.producto.pk).exists())


class ModalidadesTests(CatalogoAPITestCase):
    """Las tres modalidades se combinan libremente; ninguna exige existencias (RN-004)."""

    def setUp(self):
        super().setUp()
        self.autenticar(self.artesano)

    def test_combinaciones_validas(self):
        for modalidades in (
            ["stock"],
            ["produccion"],
            ["personalizacion"],
            ["stock", "produccion"],
            ["stock", "personalizacion"],
            ["produccion", "personalizacion"],
            ["stock", "produccion", "personalizacion"],
        ):
            with self.subTest(modalidades=modalidades):
                respuesta = self.client.post(
                    URL_MIS_PRODUCTOS, cuerpo_producto(modalidades=modalidades), format="json"
                )
                self.assertEqual(respuesta.status_code, 201, respuesta.content)
                self.assertEqual(respuesta.json()["modalidades"], modalidades)
                producto = Producto.objects.get(pk=respuesta.json()["id"])
                self.assertEqual(producto.permite_stock, "stock" in modalidades)
                self.assertEqual(producto.permite_produccion, "produccion" in modalidades)
                self.assertEqual(producto.permite_personalizacion, "personalizacion" in modalidades)

    def test_se_entregan_en_orden_canonico(self):
        respuesta = self.client.post(
            URL_MIS_PRODUCTOS,
            cuerpo_producto(modalidades=["personalizacion", "stock"]),
            format="json",
        )
        self.assertEqual(respuesta.json()["modalidades"], ["stock", "personalizacion"])

    def test_sin_modalidades_responde_400(self):
        for modalidades in ([], None, ""):
            with self.subTest(modalidades=modalidades):
                respuesta = self.client.post(
                    URL_MIS_PRODUCTOS, cuerpo_producto(modalidades=modalidades), format="json"
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("modalidades", respuesta.json())
        self.assertFalse(Producto.objects.exists())

    def test_rechaza_modalidades_desconocidas_o_repetidas(self):
        for modalidades in (["pieza_unica"], ["stock", "stock"], "stock"):
            with self.subTest(modalidades=modalidades):
                respuesta = self.client.post(
                    URL_MIS_PRODUCTOS, cuerpo_producto(modalidades=modalidades), format="json"
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("modalidades", respuesta.json())

    def test_no_pide_existencias_para_ninguna_modalidad(self):
        respuesta = self.client.post(
            URL_MIS_PRODUCTOS,
            cuerpo_producto(modalidades=["produccion", "personalizacion"]),
            format="json",
        )
        self.assertEqual(respuesta.status_code, 201)
        for campo in ("existencias", "existenciasFisicas", "stock", "unidades_disponibles"):
            self.assertNotIn(campo, respuesta.json())

    def test_rechaza_campos_de_inventario(self):
        respuesta = self.client.post(
            URL_MIS_PRODUCTOS, cuerpo_producto(existencias_fisicas=3), format="json"
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json(), {"existencias_fisicas": ["Campo no permitido."]})


class EditarProductoTests(CatalogoAPITestCase):
    def setUp(self):
        super().setUp()
        self.producto = crear_producto(self.taller, self.categoria, publicado=True)
        self.autenticar(self.artesano)

    def editar(self, cuerpo):
        return self.client.patch(url_mi_producto(self.producto.pk), cuerpo, format="json")

    def test_el_propietario_edita_solo_los_campos_enviados(self):
        respuesta = self.editar({"nombre": "Sandalias trenzadas", "precio": "990.50"})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["nombre"], "Sandalias trenzadas")
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.precio, Decimal("990.50"))
        self.assertEqual(
            self.producto.descripcion, "Sandalias cosidas a mano en cuero curtido al vegetal."
        )
        self.assertTrue(self.producto.publicado, "Editar no cambia la publicación.")

    def test_cambia_la_categoria_por_codigo(self):
        respuesta = self.editar({"categoria": "hamacas"})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["categoria"]["codigo"], "hamacas")

    def test_modalidades_reemplaza_la_lista_completa(self):
        respuesta = self.editar({"modalidades": ["produccion", "personalizacion"]})
        self.assertEqual(respuesta.status_code, 200)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.modalidades, ["produccion", "personalizacion"])
        self.assertFalse(self.producto.permite_stock)

    def test_sin_modalidades_no_modifica_las_existentes(self):
        self.editar({"nombre": "Otro nombre"})
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.modalidades, ["stock"])

    def test_no_puede_quedar_sin_modalidades(self):
        respuesta = self.editar({"modalidades": []})
        self.assertEqual(respuesta.status_code, 400)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.modalidades, ["stock"])

    def test_no_cambia_taller_publicacion_ni_fechas(self):
        creado_en = self.producto.creado_en
        for campo, valor in (
            ("taller", self.taller_ajeno.pk),
            ("taller_id", self.taller_ajeno.pk),
            ("propietario", self.artesano_ajeno.pk),
            ("publicado", False),
            ("creado_en", "2020-01-01T00:00:00Z"),
            ("actualizado_en", "2020-01-01T00:00:00Z"),
        ):
            with self.subTest(campo=campo):
                respuesta = self.editar({campo: valor})
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {campo: ["Campo no permitido."]})
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.taller, self.taller)
        self.assertTrue(self.producto.publicado)
        self.assertEqual(self.producto.creado_en, creado_en)

    def test_un_artesano_que_deja_de_estar_habilitado_no_edita(self):
        # Solo se llega a este estado escribiendo la base: el ciclo V1 no revierte una aprobación.
        type(self.taller).objects.filter(pk=self.taller.pk).update(estado="rechazado")
        respuesta = self.editar({"nombre": "Otro"})
        self.assertEqual(respuesta.status_code, 403)


class PublicacionTests(CatalogoAPITestCase):
    def setUp(self):
        super().setUp()
        self.producto = crear_producto(
            self.taller, self.categoria, fotografia_principal=imagen_prueba()
        )
        self.autenticar(self.artesano)

    def test_publicar_y_despublicar(self):
        respuesta = self.client.post(url_publicar(self.producto.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertTrue(respuesta.json()["publicado"])

        respuesta = self.client.post(url_despublicar(self.producto.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(respuesta.json()["publicado"])
        self.producto.refresh_from_db()
        self.assertFalse(self.producto.publicado)

    def test_son_idempotentes(self):
        for url, esperado in (
            (url_publicar(self.producto.pk), True),
            (url_publicar(self.producto.pk), True),
            (url_despublicar(self.producto.pk), False),
            (url_despublicar(self.producto.pk), False),
        ):
            respuesta = self.client.post(url)
            self.assertEqual(respuesta.status_code, 200)
            self.assertEqual(respuesta.json()["publicado"], esperado)

    def test_ignoran_el_cuerpo(self):
        # El cuerpo se ignora: la acción no recibe parámetros y no cambia otros campos.
        respuesta = self.client.post(
            url_publicar(self.producto.pk), {"nombre": "Otro"}, format="json"
        )
        self.assertEqual(respuesta.status_code, 200)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.nombre, "Sandalias de cuero natural")

    def test_despublicar_conserva_el_producto_y_su_lectura_propia(self):
        self.client.post(url_publicar(self.producto.pk))
        self.client.post(url_despublicar(self.producto.pk))
        self.assertTrue(Producto.objects.filter(pk=self.producto.pk).exists())
        respuesta = self.client.get(url_mi_producto(self.producto.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(respuesta.json()["publicado"])

    def test_el_listado_propio_incluye_despublicados_y_pagina(self):
        for i in range(13):
            crear_producto(self.taller, self.categoria, nombre=f"Pieza {i}")
        respuesta = self.client.get(URL_MIS_PRODUCTOS)
        self.assertEqual(respuesta.status_code, 200)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["count"], 14)
        self.assertEqual(len(cuerpo["results"]), 12)
        self.assertEqual(cuerpo["results"][0]["nombre"], "Pieza 12")
        segunda = self.client.get(URL_MIS_PRODUCTOS, {"page": 2}).json()
        self.assertEqual(len(segunda["results"]), 2)
        self.assertEqual(segunda["results"][-1]["id"], self.producto.pk)
