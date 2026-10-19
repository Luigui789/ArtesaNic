"""El OpenAPI de los listados paginados describe la respuesta real de DRF (RF-003, RNF-005).

Además de que el archivo versionado coincida con el generado (config/tests/test_openapi.py),
se comprueba la forma de cada listado y que la respuesta en ejecución tenga esa forma.
"""

from drf_spectacular.generators import SchemaGenerator

from .base import (
    URL_CATALOGO,
    URL_MIS_PRODUCTOS,
    CatalogoAPITestCase,
    crear_producto,
)

CLAVES_PAGINA = {"count", "next", "previous", "results"}
LISTADOS = {
    URL_CATALOGO: ("PaginatedProductoPublicoList", "ProductoPublico"),
    URL_MIS_PRODUCTOS: ("PaginatedProductoPropioList", "ProductoPropio"),
}


def referencia(nombre: str) -> str:
    return f"#/components/schemas/{nombre}"


class EsquemaPaginadoTests(CatalogoAPITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)
        cls.componentes = cls.esquema["components"]["schemas"]

    def operacion(self, ruta: str) -> dict:
        return self.esquema["paths"][ruta]["get"]

    def test_la_respuesta_200_es_una_pagina_de_drf(self):
        for ruta, (pagina, elemento) in LISTADOS.items():
            with self.subTest(ruta=ruta):
                respuesta = self.operacion(ruta)["responses"]["200"]
                esquema = respuesta["content"]["application/json"]["schema"]
                self.assertEqual(esquema, {"$ref": referencia(pagina)})

                componente = self.componentes[pagina]
                self.assertEqual(componente["type"], "object")
                self.assertEqual(set(componente["properties"]), CLAVES_PAGINA)
                self.assertEqual(set(componente["required"]), CLAVES_PAGINA)
                propiedades = componente["properties"]
                self.assertEqual(propiedades["count"]["type"], "integer")
                for enlace in ("next", "previous"):
                    self.assertTrue(propiedades[enlace]["nullable"])
                self.assertEqual(propiedades["results"]["type"], "array")
                self.assertEqual(propiedades["results"]["items"], {"$ref": referencia(elemento)})

    def test_documenta_page_y_page_size(self):
        for ruta in LISTADOS:
            with self.subTest(ruta=ruta):
                parametros = {
                    p["name"]: p for p in self.operacion(ruta)["parameters"] if p["in"] == "query"
                }
                self.assertEqual(parametros["page"]["schema"]["type"], "integer")
                self.assertEqual(parametros["page"]["schema"]["minimum"], 1)
                tamano = parametros["page_size"]["schema"]
                self.assertEqual(tamano["type"], "integer")
                self.assertEqual(tamano["default"], 12)
                self.assertEqual(tamano["maximum"], 48)
                self.assertFalse(parametros["page"]["required"])
                self.assertFalse(parametros["page_size"]["required"])

    def test_el_catalogo_conserva_sus_filtros(self):
        parametros = {p["name"] for p in self.operacion(URL_CATALOGO)["parameters"]}
        self.assertTrue(
            {"q", "categoria", "precio_min", "precio_max", "taller", "orden"} <= parametros
        )

    def comprobar_respuesta_real(self, url: str):
        pagina, elemento = LISTADOS[url]
        cuerpo = self.client.get(url, {"page_size": 1}).json()
        self.assertEqual(set(cuerpo), set(self.componentes[pagina]["properties"]))
        self.assertEqual(len(cuerpo["results"]), 1)
        self.assertEqual(set(cuerpo["results"][0]), set(self.componentes[elemento]["properties"]))
        self.assertIsInstance(cuerpo["count"], int)
        self.assertIsNotNone(cuerpo["next"])
        self.assertIsNone(cuerpo["previous"])

    def test_la_respuesta_real_del_catalogo_coincide_con_el_esquema(self):
        for nombre in ("Uno", "Dos"):
            crear_producto(self.taller, self.categoria, nombre=nombre, publicado=True)
        self.comprobar_respuesta_real(URL_CATALOGO)

    def test_la_respuesta_real_de_mis_productos_coincide_con_el_esquema(self):
        for nombre in ("Uno", "Dos"):
            crear_producto(self.taller, self.categoria, nombre=nombre)
        self.autenticar(self.artesano)
        self.comprobar_respuesta_real(URL_MIS_PRODUCTOS)
