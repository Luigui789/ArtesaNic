"""Catálogo público y categorías (RF-003, RF-019; RN-003; RNF-003, RNF-007, RNF-013)."""

from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.catalogo import services
from apps.catalogo.models import Producto

from .base import (
    URL_CATALOGO,
    URL_CATEGORIAS,
    CatalogoAPITestCase,
    crear_producto,
    datos_producto,
    url_producto,
)

CAMPOS_PUBLICOS = {
    "id",
    "nombre",
    "descripcion",
    "precio",
    "categoria",
    "modalidades",
    "taller",
    "creado_en",
    "fotografia_url",
    "disponible_stock",
}


class CategoriasTests(CatalogoAPITestCase):
    def test_lista_las_categorias_reales_por_nombre_sin_sesion(self):
        respuesta = self.client.get(URL_CATEGORIAS)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(
            respuesta.json(),
            [
                {"id": self.categoria.pk, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado"},
                {"id": self.otra_categoria.pk, "codigo": "hamacas", "nombre": "Hamacas"},
            ],
        )

    def test_un_token_no_valido_no_impide_la_lectura(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer caducado")
        self.assertEqual(self.client.get(URL_CATEGORIAS).status_code, 200)
        self.assertEqual(self.client.get(URL_CATALOGO).status_code, 200)

    def test_es_de_solo_lectura(self):
        self.autenticar(self.artesano)
        respuesta = self.client.post(URL_CATEGORIAS, {"codigo": "x", "nombre": "X"}, format="json")
        self.assertEqual(respuesta.status_code, 405)


class VisibilidadTests(CatalogoAPITestCase):
    """Solo productos publicados de talleres aprobados (RN-003)."""

    def setUp(self):
        super().setUp()
        self.publicado = crear_producto(self.taller, self.categoria, publicado=True)
        self.borrador = crear_producto(self.taller, self.categoria, nombre="Borrador")
        self.despublicado = crear_producto(
            self.taller, self.categoria, nombre="Retirado", publicado=True
        )
        services.despublicar_producto(self.despublicado)
        # Datos incoherentes escritos sin pasar por los servicios: publicados de talleres
        # que no están aprobados. El filtro del servidor debe excluirlos igualmente.
        self.de_pendiente = Producto.objects.create(
            taller=self.taller_pendiente, publicado=True, **datos_producto(self.categoria)
        )
        self.de_rechazado = Producto.objects.create(
            taller=self.taller_rechazado, publicado=True, **datos_producto(self.categoria)
        )

    def test_el_listado_muestra_solo_publicados_de_talleres_aprobados(self):
        respuesta = self.client.get(URL_CATALOGO)
        self.assertEqual(respuesta.status_code, 200)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo["count"], 1)
        self.assertEqual([p["id"] for p in cuerpo["results"]], [self.publicado.pk])

    def test_el_dto_publico_no_expone_datos_internos(self):
        producto = self.client.get(URL_CATALOGO).json()["results"][0]
        self.assertEqual(set(producto), CAMPOS_PUBLICOS)
        self.assertEqual(producto["taller"], {"id": self.taller.pk, "nombre": "Barro y Sombra"})
        self.assertEqual(producto["precio"], "850.00")
        self.assertEqual(producto["disponible_stock"], 0)
        texto = str(producto)
        self.assertNotIn(self.artesano.telefono, texto)
        for interno in (
            "publicado",
            "propietario",
            "revisado_por",
            "estado",
            "existencia_fisica",
            "reservada",
            "movimientos",
            "ajustes",
            "motivos",
        ):
            self.assertNotIn(interno, texto)

    def test_disponible_stock_publico_segun_modalidad_e_inventario(self):
        from apps.inventario import services as inventario
        from apps.inventario.models import InventarioProducto

        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.publicado.pk, cantidad=8
        )
        InventarioProducto.objects.filter(producto=self.publicado).update(reservada=3)
        solo_prod = crear_producto(
            self.taller,
            self.categoria,
            nombre="Solo producción",
            permite_stock=False,
            permite_produccion=True,
            publicado=True,
        )

        detalle_stock = self.client.get(url_producto(self.publicado.pk)).json()
        self.assertEqual(detalle_stock["disponible_stock"], 5)

        detalle_prod = self.client.get(url_producto(solo_prod.pk)).json()
        self.assertIsNone(detalle_prod["disponible_stock"])

    def test_el_taller_del_producto_lleva_a_su_perfil_publico(self):
        producto = self.client.get(url_producto(self.publicado.pk)).json()
        perfil = self.client.get(f"/api/v1/talleres/{producto['taller']['id']}/")
        self.assertEqual(perfil.status_code, 200)

    def test_detalle_publicado_de_taller_aprobado(self):
        respuesta = self.client.get(url_producto(self.publicado.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(set(respuesta.json()), CAMPOS_PUBLICOS)

    def test_detalle_no_visible_responde_404(self):
        for producto in (self.borrador, self.despublicado, self.de_pendiente, self.de_rechazado):
            with self.subTest(producto=producto.nombre, taller=producto.taller.nombre):
                self.assertEqual(self.client.get(url_producto(producto.pk)).status_code, 404)
        self.assertEqual(self.client.get(url_producto(999_999)).status_code, 404)

    def test_despublicar_lo_retira_del_catalogo_y_conserva_la_fila(self):
        services.despublicar_producto(self.publicado)
        self.assertEqual(self.client.get(URL_CATALOGO).json()["count"], 0)
        self.assertEqual(self.client.get(url_producto(self.publicado.pk)).status_code, 404)
        self.assertTrue(Producto.objects.filter(pk=self.publicado.pk).exists())

    def test_el_catalogo_es_de_solo_lectura(self):
        self.autenticar(self.artesano)
        self.assertEqual(self.client.post(URL_CATALOGO, {}, format="json").status_code, 405)
        url = url_producto(self.publicado.pk)
        self.assertEqual(self.client.patch(url, {}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)


class FiltrosYOrdenTests(CatalogoAPITestCase):
    def setUp(self):
        super().setUp()
        ahora = timezone.now()

        def publicar(taller, nombre, precio, categoria, dias):
            producto = crear_producto(
                taller, categoria, nombre=nombre, precio=Decimal(precio), publicado=True
            )
            Producto.objects.filter(pk=producto.pk).update(creado_en=ahora - timedelta(days=dias))
            return producto

        self.sandalias = publicar(self.taller, "Sandalias de cuero", "850", self.categoria, 3)
        self.cartera = publicar(self.taller, "Cartera de cuero", "1200.50", self.categoria, 1)
        self.hamaca = publicar(
            self.taller_ajeno, "Hamaca matrimonial", "3500", self.otra_categoria, 2
        )
        self.cinturon = publicar(self.taller_ajeno, "Cinturón trenzado", "450", self.categoria, 4)

    def ids(self, **parametros):
        respuesta = self.client.get(URL_CATALOGO, parametros)
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        return [p["id"] for p in respuesta.json()["results"]]

    def test_orden_por_defecto_del_mas_reciente_al_mas_antiguo(self):
        esperado = [self.cartera.pk, self.hamaca.pk, self.sandalias.pk, self.cinturon.pk]
        self.assertEqual(self.ids(), esperado)
        self.assertEqual(self.ids(orden="recientes"), esperado)

    def test_orden_por_precio(self):
        ascendente = [self.cinturon.pk, self.sandalias.pk, self.cartera.pk, self.hamaca.pk]
        self.assertEqual(self.ids(orden="precio_asc"), ascendente)
        self.assertEqual(self.ids(orden="precio_desc"), ascendente[::-1])

    def test_orden_por_nombre(self):
        self.assertEqual(
            self.ids(orden="nombre"),
            [self.cartera.pk, self.cinturon.pk, self.hamaca.pk, self.sandalias.pk],
        )

    def test_busqueda_por_nombre_sin_distinguir_mayusculas(self):
        self.assertEqual(sorted(self.ids(q="CUERO")), sorted([self.sandalias.pk, self.cartera.pk]))
        self.assertEqual(self.ids(q="hamaca"), [self.hamaca.pk])
        self.assertEqual(self.ids(q="inexistente"), [])
        self.assertEqual(len(self.ids(q="")), 4)

    def test_filtro_por_categoria(self):
        self.assertEqual(self.ids(categoria="hamacas"), [self.hamaca.pk])
        self.assertEqual(len(self.ids(categoria="cuero_y_calzado")), 3)
        self.assertEqual(self.ids(categoria="no_existe"), [])

    def test_filtro_por_rango_de_precio(self):
        self.assertEqual(
            self.ids(precio_min="1000", orden="precio_asc"), [self.cartera.pk, self.hamaca.pk]
        )
        self.assertEqual(
            self.ids(precio_max="850", orden="precio_asc"), [self.cinturon.pk, self.sandalias.pk]
        )
        self.assertEqual(
            self.ids(precio_min="850", precio_max="1200.50", orden="precio_asc"),
            [self.sandalias.pk, self.cartera.pk],
        )

    def test_filtro_por_taller(self):
        self.assertEqual(
            self.ids(taller=self.taller_ajeno.pk, orden="nombre"),
            [self.cinturon.pk, self.hamaca.pk],
        )
        self.assertEqual(self.ids(taller=self.taller_pendiente.pk), [])

    def test_filtros_combinados(self):
        self.assertEqual(
            self.ids(q="cuero", taller=self.taller.pk, precio_max="1000"), [self.sandalias.pk]
        )

    def test_parametros_no_validos_responden_400(self):
        for parametros in (
            {"orden": "popularidad"},
            {"precio_min": "abc"},
            {"precio_max": "-1"},
            {"precio_min": "500", "precio_max": "100"},
            {"taller": "uno"},
            {"taller": "0"},
        ):
            with self.subTest(parametros=parametros):
                respuesta = self.client.get(URL_CATALOGO, parametros)
                self.assertEqual(respuesta.status_code, 400)


class PaginacionTests(CatalogoAPITestCase):
    def setUp(self):
        super().setUp()
        for i in range(30):
            crear_producto(self.taller, self.categoria, nombre=f"Pieza {i:02d}", publicado=True)

    def test_pagina_de_12_por_defecto(self):
        cuerpo = self.client.get(URL_CATALOGO).json()
        self.assertEqual(cuerpo["count"], 30)
        self.assertEqual(len(cuerpo["results"]), 12)
        self.assertIsNone(cuerpo["previous"])
        self.assertIn("page=2", cuerpo["next"])

    def test_page_y_page_size(self):
        cuerpo = self.client.get(URL_CATALOGO, {"page": 3, "page_size": 10, "orden": "nombre"})
        cuerpo = cuerpo.json()
        self.assertEqual([p["nombre"] for p in cuerpo["results"]][0], "Pieza 20")
        self.assertEqual(len(cuerpo["results"]), 10)
        self.assertIsNone(cuerpo["next"])

    def test_las_paginas_no_repiten_ni_pierden_productos(self):
        vistos = []
        for pagina in (1, 2, 3):
            cuerpo = self.client.get(URL_CATALOGO, {"page": pagina, "orden": "precio_asc"}).json()
            vistos += [p["id"] for p in cuerpo["results"]]
        self.assertEqual(len(vistos), 30)
        self.assertEqual(len(set(vistos)), 30)

    def test_page_size_tiene_un_maximo(self):
        cuerpo = self.client.get(URL_CATALOGO, {"page_size": 1000}).json()
        self.assertEqual(len(cuerpo["results"]), 30)  # 30 < 48, el máximo
        for i in range(30, 60):
            crear_producto(self.taller, self.categoria, nombre=f"Pieza {i}", publicado=True)
        cuerpo = self.client.get(URL_CATALOGO, {"page_size": 1000}).json()
        self.assertEqual(len(cuerpo["results"]), 48)

    def test_pagina_inexistente_responde_404(self):
        self.assertEqual(self.client.get(URL_CATALOGO, {"page": 99}).status_code, 404)

    def test_consultas_constantes_sin_importar_el_numero_de_productos(self):
        # Una consulta para el total y otra para la página, con taller y categoría unidos
        # (sin N+1).
        with CaptureQueriesContext(connection) as consultas:
            cuerpo = self.client.get(URL_CATALOGO, {"page_size": 30}).json()
        self.assertEqual(len(cuerpo["results"]), 30)
        self.assertEqual(len(consultas), 2)
