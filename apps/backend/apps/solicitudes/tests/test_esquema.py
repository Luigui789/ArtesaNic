"""RNF-005: contrato cerrado de solicitudes, sin anticipar acciones AUD-06/AUD-07."""

from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator

from .base import URL_CREAR, URL_MIAS, URL_RECIBIDAS

RUTA_MIA = URL_MIAS + "{solicitud_id}/"
RUTA_RECIBIDA = URL_RECIBIDAS + "{solicitud_id}/"
RUTAS = {
    URL_CREAR: {"post"},
    URL_MIAS: {"get"},
    RUTA_MIA: {"get"},
    URL_RECIBIDAS: {"get"},
    RUTA_RECIBIDA: {"get"},
}
CLAVES_COMPRADOR = {"id", "taller", "estado", "creado_en", "actualizado_en", "renglones"}
CLAVES_PAGINA = {"count", "next", "previous", "results"}


def referencia(nombre):
    return f"#/components/schemas/{nombre}"


class EsquemaSolicitudesTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)
        cls.componentes = cls.esquema["components"]["schemas"]

    def esquema_respuesta(self, ruta, codigo="200", metodo="get"):
        return self.esquema["paths"][ruta][metodo]["responses"][codigo]["content"][
            "application/json"
        ]["schema"]

    def valores_enum(self, esquema):
        if "$ref" in esquema:
            return self.valores_enum(self.componentes[esquema["$ref"].rsplit("/", 1)[1]])
        valores = set(esquema.get("enum", []))
        for combinacion in ("oneOf", "anyOf", "allOf"):
            for parte in esquema.get(combinacion, []):
                valores |= self.valores_enum(parte)
        return valores

    def test_documenta_exactamente_cinco_rutas_sin_acciones_futuras(self):
        rutas = {
            ruta: set(operaciones)
            for ruta, operaciones in self.esquema["paths"].items()
            if ruta.startswith(URL_CREAR)
        }
        self.assertEqual(rutas, RUTAS)

    def test_todas_las_operaciones_exigen_bearer_y_documentan_401_403(self):
        for ruta, metodos in RUTAS.items():
            for metodo in metodos:
                with self.subTest(ruta=ruta):
                    operacion = self.esquema["paths"][ruta][metodo]
                    self.assertEqual(operacion["security"], [{"jwtAuth": []}])
                    self.assertTrue({"401", "403"} <= set(operacion["responses"]))

    def test_alta_documenta_request_renglones_y_respuesta_201_del_comprador(self):
        operacion = self.esquema["paths"][URL_CREAR]["post"]
        entrada = operacion["requestBody"]["content"]["application/json"]["schema"]
        self.assertEqual(entrada, {"$ref": referencia("SolicitudEntradaRequest")})
        self.assertEqual(
            self.esquema_respuesta(URL_CREAR, "201", "post"),
            {"$ref": referencia("SolicitudComprador")},
        )
        self.assertIn("400", operacion["responses"])

    def test_request_no_declara_comprador_taller_estado_o_datos_contractuales(self):
        solicitud = self.componentes["SolicitudEntradaRequest"]
        self.assertEqual(set(solicitud["properties"]), {"renglones"})
        self.assertEqual(solicitud["required"], ["renglones"])
        renglones = solicitud["properties"]["renglones"]
        self.assertEqual(renglones["type"], "array")
        self.assertEqual(renglones["minItems"], 1)
        self.assertEqual(renglones["items"], {"$ref": referencia("RenglonSolicitudEntradaRequest")})

    def test_renglon_de_entrada_tiene_modalidad_y_cantidad_individuales(self):
        renglon = self.componentes["RenglonSolicitudEntradaRequest"]
        self.assertEqual(
            set(renglon["properties"]),
            {
                "producto",
                "modalidad",
                "cantidad",
                "fecha_solicitada",
                "caracteristicas",
                "origen_personalizacion",
            },
        )
        self.assertEqual(set(renglon["required"]), {"producto", "modalidad", "cantidad"})
        cantidad = renglon["properties"]["cantidad"]
        self.assertEqual(cantidad["type"], "integer")
        self.assertEqual(cantidad["minimum"], 1)
        self.assertEqual(renglon["properties"]["fecha_solicitada"]["format"], "date")
        self.assertEqual(renglon["properties"]["caracteristicas"]["minLength"], 1)

    def test_modalidades_y_origenes_son_explicitos_y_no_order_option(self):
        renglon = self.componentes["RenglonSolicitudEntradaRequest"]["properties"]
        self.assertEqual(
            self.valores_enum(renglon["modalidad"]), {"stock", "produccion", "personalizacion"}
        )
        self.assertEqual(
            self.valores_enum(renglon["origen_personalizacion"]), {"desde_cero", "unidad_estandar"}
        )

    def test_dto_comprador_excluye_la_cuenta_y_solo_muestra_taller_resumido(self):
        solicitud = self.componentes["SolicitudComprador"]
        self.assertEqual(set(solicitud["properties"]), CLAVES_COMPRADOR)
        self.assertEqual(set(solicitud["required"]), CLAVES_COMPRADOR)
        self.assertTrue(all(campo["readOnly"] for campo in solicitud["properties"].values()))
        self.assertEqual(set(self.componentes["TallerResumen"]["properties"]), {"id", "nombre"})

    def test_dto_artesano_solo_agrega_identidad_minima_del_comprador(self):
        solicitud = self.componentes["SolicitudArtesano"]
        self.assertEqual(set(solicitud["properties"]), CLAVES_COMPRADOR | {"comprador"})
        self.assertEqual(
            set(self.componentes["CompradorSolicitud"]["properties"]), {"id", "nombre"}
        )

    def test_renglones_de_lectura_conservan_resolucion_y_motivo_sin_precio(self):
        renglon = self.componentes["RenglonSolicitud"]
        self.assertEqual(
            set(renglon["properties"]),
            {
                "id",
                "posicion",
                "producto",
                "modalidad",
                "cantidad",
                "fecha_solicitada",
                "caracteristicas",
                "origen_personalizacion",
                "resolucion",
                "motivo_rechazo",
            },
        )
        self.assertEqual(
            set(self.componentes["ProductoSolicitud"]["properties"]), {"id", "nombre", "categoria"}
        )
        self.assertTrue(renglon["properties"]["fecha_solicitada"]["nullable"])
        self.assertEqual(
            self.valores_enum(renglon["properties"]["resolucion"]),
            {"pendiente", "aceptado", "rechazado"},
        )

    def test_origen_de_lectura_documenta_vacio_cuando_no_es_personalizacion(self):
        origen = self.componentes["RenglonSolicitud"]["properties"]["origen_personalizacion"]
        self.assertEqual(self.valores_enum(origen), {"", "desde_cero", "unidad_estandar"})

    def test_dr03_es_rechazada_y_no_un_estado_del_pedido_confirmado(self):
        estado = self.componentes["SolicitudComprador"]["properties"]["estado"]
        self.assertEqual(self.valores_enum(estado), {"pendiente_revision", "rechazada"})

    def test_detalles_documentan_dto_por_rol_y_404_sin_revelar_ownership(self):
        for ruta, dto in ((RUTA_MIA, "SolicitudComprador"), (RUTA_RECIBIDA, "SolicitudArtesano")):
            with self.subTest(ruta=ruta):
                self.assertEqual(self.esquema_respuesta(ruta), {"$ref": referencia(dto)})
                self.assertIn("404", self.esquema["paths"][ruta]["get"]["responses"])

    def test_listados_tienen_paginacion_drf_y_renglones_anidados(self):
        for ruta, dto in ((URL_MIAS, "SolicitudComprador"), (URL_RECIBIDAS, "SolicitudArtesano")):
            with self.subTest(ruta=ruta):
                pagina = f"Paginated{dto}List"
                self.assertEqual(self.esquema_respuesta(ruta), {"$ref": referencia(pagina)})
                esquema = self.componentes[pagina]
                self.assertEqual(set(esquema["properties"]), CLAVES_PAGINA)
                self.assertEqual(set(esquema["required"]), CLAVES_PAGINA)
                self.assertEqual(
                    esquema["properties"]["results"]["items"], {"$ref": referencia(dto)}
                )
                self.assertTrue(esquema["properties"]["next"]["nullable"])
                self.assertTrue(esquema["properties"]["previous"]["nullable"])
                self.assertEqual(
                    self.componentes[dto]["properties"]["renglones"]["items"],
                    {"$ref": referencia("RenglonSolicitud")},
                )

    def test_listados_documentan_parametros_de_pagina(self):
        for ruta in (URL_MIAS, URL_RECIBIDAS):
            with self.subTest(ruta=ruta):
                parametros = {
                    p["name"]: p
                    for p in self.esquema["paths"][ruta]["get"]["parameters"]
                    if p["in"] == "query"
                }
                self.assertEqual(set(parametros), {"page", "page_size"})
                self.assertEqual(parametros["page"]["schema"]["type"], "integer")
                self.assertEqual(parametros["page_size"]["schema"]["type"], "integer")

    def test_contrato_no_declara_componentes_de_propuesta_pedido_pago_o_reserva(self):
        self.assertFalse(
            {"Propuesta", "PedidoConfirmado", "FrozenQuote", "Reserva", "Pago"}
            & set(self.componentes)
        )
