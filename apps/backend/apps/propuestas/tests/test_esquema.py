"""RNF-005: contrato de revisión y propuesta (AUD-06), sin acciones de AUD-07."""

from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator

RESOLVER = "/api/v1/solicitudes/recibidas/{solicitud_id}/renglones/{renglon_id}/resolver/"
PROPUESTA_RECIBIDA = "/api/v1/solicitudes/recibidas/{solicitud_id}/propuesta/"
PROPUESTA_MIA = "/api/v1/solicitudes/mias/{solicitud_id}/propuesta/"


def referencia(nombre):
    return f"#/components/schemas/{nombre}"


class EsquemaPropuestaTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)
        cls.componentes = cls.esquema["components"]["schemas"]

    def operacion(self, ruta, metodo):
        return self.esquema["paths"][ruta][metodo]

    def test_mutaciones_exigen_idempotency_key_y_documentan_replay(self):
        for ruta, metodo, codigo in (
            (RESOLVER, "post", "200"),
            (PROPUESTA_RECIBIDA, "post", "201"),
        ):
            with self.subTest(ruta=ruta):
                operacion = self.operacion(ruta, metodo)
                clave = next(p for p in operacion["parameters"] if p["name"] == "Idempotency-Key")
                self.assertEqual((clave["in"], clave["required"]), ("header", True))
                cabeceras = operacion["responses"][codigo]["headers"]
                self.assertIn("Idempotency-Replayed", cabeceras)

    def test_mutaciones_documentan_400_401_403_404_y_409_con_codigos_estables(self):
        for ruta in (RESOLVER, PROPUESTA_RECIBIDA):
            with self.subTest(ruta=ruta):
                respuestas = self.operacion(ruta, "post")["responses"]
                self.assertTrue({"400", "401", "403", "404", "409"} <= set(respuestas))
                self.assertEqual(
                    respuestas["409"]["content"]["application/json"]["schema"],
                    {"$ref": referencia("ConflictoSolicitud")},
                )
        self.assertEqual(
            set(self.componentes["CodigoConflictoSolicitudEnum"]["enum"]),
            {
                "renglon_ya_resuelto",
                "solicitud_con_renglones_pendientes",
                "solicitud_rechazada",
                "solicitud_sin_renglones_aceptados",
                "propuesta_ya_emitida",
                "clave_idempotencia_reutilizada",
            },
        )

    def test_resolucion_no_admite_contraoferta(self):
        entrada = self.componentes["ResolucionEntradaRequest"]
        self.assertEqual(set(entrada["properties"]), {"resolucion", "motivo_rechazo"})
        self.assertEqual(entrada["required"], ["resolucion"])
        self.assertEqual(self.componentes["ResolucionFinalEnum"]["enum"], ["aceptado", "rechazado"])

    def test_entrada_de_propuesta_no_acepta_precios_totales_ni_identidad(self):
        entrada = self.componentes["PropuestaEntradaRequest"]
        self.assertEqual(
            set(entrada["properties"]),
            {"modalidad_entrega", "descripcion_entrega", "costo_entrega", "lineas", "otros_cargos"},
        )
        self.assertEqual(
            set(self.componentes["LineaPropuestaEntradaRequest"]["properties"]),
            {"renglon", "fecha_comprometida", "cargo_personalizacion"},
        )
        self.assertEqual(
            set(self.componentes["CargoEntradaRequest"]["properties"]),
            {"descripcion", "monto", "renglon"},
        )

    def test_lectura_muestra_desglose_por_linea_y_global(self):
        propuesta = self.componentes["Propuesta"]["properties"]
        self.assertTrue(
            {
                "lineas",
                "otros_cargos",
                "modalidad_entrega",
                "descripcion_entrega",
                "costo_entrega",
                "subtotal_productos",
                "total_personalizacion",
                "total_otros_cargos",
                "total",
                "moneda",
            }
            <= set(propuesta)
        )
        linea = self.componentes["LineaPropuesta"]["properties"]
        self.assertTrue(
            {
                "producto",
                "modalidad",
                "cantidad",
                "precio_unitario",
                "subtotal",
                "cargo_personalizacion",
                "fecha_solicitada",
                "fecha_comprometida",
            }
            <= set(linea)
        )
        self.assertEqual(linea["subtotal"]["format"], "decimal")
        self.assertEqual(
            self.componentes["ModalidadEntregaEnum"]["enum"],
            ["retiro_taller", "punto_encuentro", "entrega_artesano", "otra"],
        )

    def test_lecturas_por_parte_y_sin_acciones_de_aud07(self):
        self.assertEqual(set(self.esquema["paths"][PROPUESTA_MIA]), {"get"})
        self.assertEqual(set(self.esquema["paths"][PROPUESTA_RECIBIDA]), {"get", "post"})
        for ruta in (PROPUESTA_MIA, PROPUESTA_RECIBIDA):
            self.assertIn("404", self.operacion(ruta, "get")["responses"])
        rutas = " ".join(self.esquema["paths"])
        for accion in ("aceptar", "rechazar", "confirmar", "reservar", "pedido"):
            self.assertNotIn(accion, rutas)
