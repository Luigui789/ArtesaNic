"""GET /api/v1/operaciones/{tipo}/{clave}/: recuperación propia, solo lectura."""

from uuid import uuid4

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.operaciones import services
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.solicitudes.tests.base import SolicitudesAPITestCase, datos_renglon


def url(clave, tipo="crear_solicitud"):
    return f"/api/v1/operaciones/{tipo}/{clave}/"


class RecuperacionTests(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.clave = str(uuid4())
        self.creada = self.enviar(datos_renglon(self.producto), clave=self.clave)

    def test_operacion_completada_es_recuperable(self):
        respuesta = self.client.get(url(self.clave))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(
            set(respuesta.data),
            {"tipo", "estado", "recurso", "codigo_http", "creado_en", "completado_en"},
        )
        self.assertEqual(respuesta.data["tipo"], "crear_solicitud")
        self.assertEqual(respuesta.data["estado"], "completada")
        self.assertEqual(respuesta.data["codigo_http"], 201)
        self.assertEqual(
            respuesta.data["recurso"], {"tipo": "solicitud", "id": self.creada.data["id"]}
        )
        self.assertEqual(
            respuesta["Cache-Control"], "max-age=0, no-cache, no-store, must-revalidate, private"
        )

    def test_no_expone_huella_actor_ni_peticion(self):
        cuerpo = str(self.client.get(url(self.clave)).data)
        operacion = OperacionIdempotente.objects.get()
        for oculto in (operacion.huella, "actor", "renglones", "huella"):
            self.assertNotIn(oculto, cuerpo)

    def test_inexistente_es_404(self):
        self.assertEqual(self.client.get(url(str(uuid4()))).status_code, 404)

    def test_tipo_desconocido_o_clave_malformada_es_404(self):
        self.assertEqual(self.client.get(url(self.clave, tipo="pagar")).status_code, 404)
        self.assertEqual(self.client.get(url("corta")).status_code, 404)

    def test_operacion_ajena_es_404_como_inexistente(self):
        self.autenticar(self.otro_comprador)
        ajena = self.client.get(url(self.clave))
        self.assertEqual(ajena.status_code, 404)
        self.assertEqual(ajena.data, self.client.get(url(str(uuid4()))).data)
        self.autenticar(self.artesano)
        self.assertEqual(self.client.get(url(self.clave)).status_code, 404)

    def test_misma_clave_en_dos_compradores_devuelve_la_propia(self):
        self.autenticar(self.otro_comprador)
        propia = self.enviar(datos_renglon(self.producto), clave=self.clave)
        respuesta = self.client.get(url(self.clave))
        self.assertEqual(respuesta.data["recurso"]["id"], propia.data["id"])
        self.assertNotEqual(propia.data["id"], self.creada.data["id"])

    def test_exige_autenticacion(self):
        self.anonimo()
        self.assertEqual(self.client.get(url(self.clave)).status_code, 401)

    def test_es_solo_lectura(self):
        antes = list(OperacionIdempotente.objects.values())
        for metodo in ("post", "put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                respuesta = getattr(self.client, metodo)(url(self.clave), {}, format="json")
                self.assertEqual(respuesta.status_code, 405)
        self.assertEqual(antes, list(OperacionIdempotente.objects.values()))

    def test_una_consulta_de_dominio_sin_n_mas_uno(self):
        for _ in range(5):
            self.enviar(datos_renglon(self.producto))
        with CaptureQueriesContext(connection) as consultas:
            self.assertEqual(self.client.get(url(self.clave)).status_code, 200)
        del_dominio = [
            q["sql"] for q in consultas if "operaciones_operacionidempotente" in q["sql"]
        ]
        self.assertEqual(len(del_dominio), 1)
        self.assertIn('"actor_id" =', del_dominio[0])
        self.assertNotIn("solicitudes_", " ".join(q["sql"] for q in consultas))

    def test_lookup_del_servicio_siempre_filtra_actor(self):
        operacion = OperacionIdempotente.objects.get()
        with CaptureQueriesContext(connection) as consultas:
            self.assertIsNone(
                services.consultar_operacion(self.otro_comprador, "crear_solicitud", self.clave)
            )
            self.assertEqual(
                services.consultar_operacion(
                    self.comprador, TipoOperacion.CREAR_SOLICITUD, self.clave
                ),
                operacion,
            )
        self.assertEqual(len(consultas), 2)
        for consulta in consultas:
            self.assertIn('"actor_id" =', consulta["sql"])
