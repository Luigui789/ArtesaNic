"""El esquema OpenAPI se genera desde el código y coincide con las rutas reales."""

import re

import yaml
from django.conf import settings
from django.test import SimpleTestCase
from django.urls import URLResolver, get_resolver
from drf_spectacular.generators import SchemaGenerator
from drf_spectacular.renderers import OpenApiYamlRenderer
from drf_spectacular.validation import validate_schema

ARCHIVO = settings.DOCS_DIR / "api" / "openapi.yaml"
METODOS_HTTP = ("get", "post", "put", "patch", "delete")
COMANDO = (
    "uv run python manage.py spectacular --validate --fail-on-warn "
    "--file ../../docs/api/openapi.yaml"
)


def rutas_de_la_api(patrones=None, prefijo=""):
    """Rutas /api/ del URLconf y los métodos HTTP que implementa cada vista."""
    rutas = {}
    for patron in get_resolver().url_patterns if patrones is None else patrones:
        ruta = prefijo + str(patron.pattern)
        if isinstance(patron, URLResolver):
            rutas |= rutas_de_la_api(patron.url_patterns, ruta)
        elif ruta.startswith("api/"):
            vista = patron.callback.view_class
            # "<int:taller_id>" del URLconf es "{taller_id}" en OpenAPI.
            ruta = re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", ruta)
            rutas["/" + ruta] = {metodo for metodo in METODOS_HTTP if hasattr(vista, metodo)}
    return rutas


class EsquemaOpenAPITests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)

    def test_es_un_documento_openapi_valido(self):
        validate_schema(self.esquema)

    def test_documenta_exactamente_las_rutas_y_metodos_reales(self):
        documentadas = {
            ruta: set(operaciones) for ruta, operaciones in self.esquema["paths"].items()
        }
        self.assertEqual(documentadas, rutas_de_la_api())

    def test_el_archivo_versionado_esta_al_dia(self):
        generado = yaml.safe_load(OpenApiYamlRenderer().render(self.esquema, renderer_context={}))
        versionado = yaml.safe_load(ARCHIVO.read_text(encoding="utf-8"))
        self.assertEqual(versionado, generado, f"Regenerar con: {COMANDO}")

    def test_mensajeria_del_pedido(self):
        """AUD-16: una sola ruta GET/POST, sin endpoints por mensaje y con sus esquemas."""
        operaciones = self.esquema["paths"]["/api/v1/pedidos/{pedido_id}/mensajes/"]
        self.assertEqual(set(operaciones), {"get", "post"})
        self.assertEqual(set(operaciones["get"]["responses"]), {"200", "400", "401", "403", "404"})
        self.assertEqual(
            set(operaciones["post"]["responses"]), {"201", "400", "401", "403", "404", "409"}
        )
        self.assertEqual(
            [p["name"] for p in operaciones["get"]["parameters"] if p["in"] == "query"],
            ["despues_de"],
        )
        esquemas = self.esquema["components"]["schemas"]
        for nombre in (
            "MensajePedido",
            "AutorMensaje",
            "ConversacionPedido",
            "MensajeEntradaRequest",
            "ConflictoConversacion",
        ):
            self.assertIn(nombre, esquemas)
        self.assertEqual(set(esquemas["AutorMensaje"]["properties"]), {"id", "nombre"})
        self.assertEqual(set(esquemas["MensajeEntradaRequest"]["properties"]), {"texto"})
        self.assertFalse(
            [ruta for ruta in self.esquema["paths"] if "/mensajes/{" in ruta],
            "sin rutas por mensaje: no hay edición ni borrado",
        )
