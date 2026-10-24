"""El contrato OpenAPI documenta Idempotency-Key, la repetición, el 409 y la recuperación."""

from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator

from apps.operaciones.models import PATRON_CLAVE

CREAR = "/api/v1/solicitudes/"
RECUPERAR = "/api/v1/operaciones/{tipo}/{clave}/"


class EsquemaIdempotenciaTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)
        cls.componentes = cls.esquema["components"]["schemas"]

    def test_crear_solicitud_exige_la_cabecera(self):
        operacion = self.esquema["paths"][CREAR]["post"]
        (cabecera,) = [p for p in operacion["parameters"] if p["in"] == "header"]
        self.assertEqual(cabecera["name"], "Idempotency-Key")
        self.assertTrue(cabecera["required"])
        self.assertEqual(cabecera["schema"], {"type": "string", "pattern": PATRON_CLAVE})
        self.assertIn("409", cabecera["description"])

    def test_documenta_repeticion_y_conflicto(self):
        respuestas = self.esquema["paths"][CREAR]["post"]["responses"]
        self.assertEqual(
            respuestas["201"]["headers"]["Idempotency-Replayed"]["schema"]["enum"], ["true"]
        )
        self.assertEqual(
            respuestas["409"]["content"]["application/json"]["schema"]["$ref"],
            "#/components/schemas/ConflictoIdempotencia",
        )
        self.assertEqual(
            self.componentes["CodigoConflictoIdempotenciaEnum"]["enum"],
            ["clave_idempotencia_reutilizada"],
        )
        self.assertTrue({"400", "401", "403"} <= set(respuestas))

    def test_recuperacion_solo_lectura_y_autenticada(self):
        ruta = self.esquema["paths"][RECUPERAR]
        self.assertEqual(set(ruta), {"get"})
        self.assertEqual(ruta["get"]["security"], [{"jwtAuth": []}])
        self.assertEqual(set(ruta["get"]["responses"]), {"200", "401", "404"})
        tipo = next(p for p in ruta["get"]["parameters"] if p["name"] == "tipo")
        self.assertEqual(
            tipo["schema"]["enum"],
            [
                "ajustar_inventario",
                "corregir_intento_pago",
                "crear_solicitud",
                "decidir_propuesta",
                "establecer_inventario_inicial",
                "finalizar_propuesta",
                "iniciar_cumplimiento_linea",
                "registrar_entrada_inventario",
                "registrar_entrega_pedido",
                "registrar_intento_pago",
                "registrar_recepcion_entrega",
                "resolver_intento_pago",
                "resolver_renglon",
            ],
        )

    def test_resultado_no_expone_huella_ni_actor(self):
        propiedades = set(self.componentes["OperacionIdempotente"]["properties"])
        self.assertEqual(
            propiedades, {"tipo", "estado", "recurso", "codigo_http", "creado_en", "completado_en"}
        )
        self.assertEqual(self.componentes["EstadoOperacionEnum"]["enum"], ["completada"])

    def test_los_get_no_exigen_clave(self):
        for ruta, metodos in self.esquema["paths"].items():
            for metodo, operacion in metodos.items():
                if metodo == "get":
                    nombres = {p["name"] for p in operacion.get("parameters", [])}
                    self.assertNotIn("Idempotency-Key", nombres, ruta)
