"""Smoke HTTP real de AUD-08: WSGI en puerto temporal, JWT, CSRF y PostgreSQL de pruebas.

Ejecutar aisladamente: uv run python manage.py test apps.solicitudes.tests.test_smoke_idempotencia
Incluye dos POST simultáneos con la misma clave contra el servidor multihilo.
"""

import json
import threading
import time
from http.cookiejar import CookieJar
from unittest import mock
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

from django.core.cache import cache
from django.db import connection
from django.test import LiveServerTestCase, override_settings

from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.operaciones.models import OperacionIdempotente
from apps.solicitudes import services
from apps.solicitudes.models import RenglonSolicitud, Solicitud
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

RUTA = "/api/v1/solicitudes/"


@override_settings(
    CSRF_COOKIE_SECURE=False, REFRESH_COOKIE_SECURE=False, ALLOWED_HOSTS=["localhost", "testserver"]
)
class SmokeIdempotenciaTests(LiveServerTestCase):
    def setUp(self):
        cache.clear()  # contadores de la limitación de intentos de otros tests
        admin = crear_administrador()
        self.taller_a = crear_artesano_con_taller("82222222")
        self.taller_b = crear_artesano_con_taller("83333333")
        for taller in (self.taller_a, self.taller_b):
            talleres.aprobar_taller(taller, revisor=admin)
        self.comprador = crear_usuario("86666666")
        self.otro_comprador = crear_usuario("87777777")
        categoria = crear_categoria()
        self.producto_a = crear_producto(self.taller_a, categoria, publicado=True)
        self.producto_b = crear_producto(self.taller_b, categoria, publicado=True)

    def peticion(self, ruta, *, datos=None, token=None, csrf=None, clave=None, cliente=None):
        cabeceras = {"Accept": "application/json"}
        if token:
            cabeceras["Authorization"] = f"Bearer {token}"
        if csrf:
            cabeceras["X-CSRFToken"] = csrf
        if clave:
            cabeceras["Idempotency-Key"] = clave
        cuerpo = None if datos is None else json.dumps(datos).encode()
        if cuerpo is not None:
            cabeceras["Content-Type"] = "application/json"
        request = Request(self.live_server_url + ruta, data=cuerpo, headers=cabeceras)
        abridor = cliente or build_opener()
        try:
            with abridor.open(request, timeout=20) as respuesta:
                return respuesta.status, json.load(respuesta), respuesta.headers
        except HTTPError as exc:
            return exc.code, json.load(exc), exc.headers

    def login(self, usuario):
        cliente = build_opener(HTTPCookieProcessor(CookieJar()))
        codigo, cuerpo, _ = self.peticion("/api/v1/auth/csrf/", cliente=cliente)
        self.assertEqual(codigo, 200)
        codigo, cuerpo, _ = self.peticion(
            "/api/v1/auth/login/",
            cliente=cliente,
            csrf=cuerpo["csrf_token"],
            datos={"telefono": usuario.telefono, "password": PASSWORD},
        )
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["access"]

    def test_flujo_completo_de_idempotencia_por_http_real(self):
        token = self.login(self.comprador)
        k1, k2 = str(uuid4()), str(uuid4())
        datos = {
            "renglones": [{"producto": self.producto_a.pk, "modalidad": "stock", "cantidad": 2}]
        }

        codigo, primera, cabeceras = self.peticion(RUTA, datos=datos, token=token, clave=k1)
        self.assertEqual(codigo, 201, primera)
        self.assertIsNone(cabeceras.get("Idempotency-Replayed"))

        codigo, repetida, cabeceras = self.peticion(RUTA, datos=datos, token=token, clave=k1)
        self.assertEqual(codigo, 201)
        self.assertEqual(cabeceras.get("Idempotency-Replayed"), "true")
        self.assertEqual(repetida["id"], primera["id"])
        self.assertEqual(Solicitud.objects.count(), 1)

        codigo, resultado, _ = self.peticion(
            f"/api/v1/operaciones/crear_solicitud/{k1}/", token=token
        )
        self.assertEqual(codigo, 200)
        self.assertEqual(resultado["recurso"], {"tipo": "solicitud", "id": primera["id"]})

        codigo, segunda, _ = self.peticion(RUTA, datos=datos, token=token, clave=k2)
        self.assertEqual(codigo, 201)
        self.assertNotEqual(segunda["id"], primera["id"])

        otro = {
            "renglones": [{"producto": self.producto_a.pk, "modalidad": "stock", "cantidad": 9}]
        }
        codigo, conflicto, _ = self.peticion(RUTA, datos=otro, token=token, clave=k1)
        self.assertEqual(codigo, 409)
        self.assertEqual(conflicto["codigo"], "clave_idempotencia_reutilizada")
        self.assertEqual(Solicitud.objects.count(), 2)

        token_otro = self.login(self.otro_comprador)
        codigo, ajeno, _ = self.peticion(
            f"/api/v1/operaciones/crear_solicitud/{k1}/", token=token_otro
        )
        self.assertEqual(codigo, 404)
        self.assertNotIn(str(primera["id"]), json.dumps(ajeno))

        conteos = (Solicitud.objects.count(), RenglonSolicitud.objects.count())
        k3 = str(uuid4())
        mezcla = {
            "renglones": [
                datos["renglones"][0],
                {"producto": self.producto_b.pk, "modalidad": "stock", "cantidad": 1},
            ]
        }
        codigo, error, _ = self.peticion(RUTA, datos=mezcla, token=token, clave=k3)
        self.assertEqual(codigo, 400, error)
        self.assertEqual(conteos, (Solicitud.objects.count(), RenglonSolicitud.objects.count()))
        codigo, _, _ = self.peticion(f"/api/v1/operaciones/crear_solicitud/{k3}/", token=token)
        self.assertEqual(codigo, 404)
        self.assertEqual(OperacionIdempotente.objects.count(), 2)
        print(
            "SMOKE AUD-08 HTTP/JWT/PostgreSQL: 201, replay mismo id, recuperación, clave nueva, "
            "409, ownership 404 y rollback de mezcla OK."
        )

    def test_dos_post_simultaneos_con_la_misma_clave_crean_una_solicitud(self):
        token = self.login(self.comprador)
        clave = str(uuid4())
        datos = {
            "renglones": [{"producto": self.producto_a.pk, "modalidad": "stock", "cantidad": 1}]
        }
        dentro, continuar = threading.Event(), threading.Event()
        original = services.crear_solicitud
        llamadas = []

        def pausada(**kwargs):
            llamadas.append(1)
            solicitud = original(**kwargs)
            if len(llamadas) == 1:
                dentro.set()
                continuar.wait(15)
            return solicitud

        respuestas = {}

        def enviar(nombre):
            respuestas[nombre] = self.peticion(RUTA, datos=datos, token=token, clave=clave)

        with mock.patch.object(services, "crear_solicitud", side_effect=pausada):
            hilos = {n: threading.Thread(target=enviar, args=(n,)) for n in ("a", "b")}
            hilos["a"].start()
            self.assertTrue(dentro.wait(15))
            hilos["b"].start()
            limite = time.monotonic() + 15
            with connection.cursor() as cursor:
                while time.monotonic() < limite:
                    cursor.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                        "AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()"
                    )
                    if cursor.fetchone()[0]:
                        break
                    time.sleep(0.02)
                else:
                    self.fail("La segunda petición no quedó esperando a la primera.")
            continuar.set()
            for hilo in hilos.values():
                hilo.join(20)
        (codigo_a, cuerpo_a, cab_a), (codigo_b, cuerpo_b, cab_b) = respuestas["a"], respuestas["b"]
        self.assertEqual((codigo_a, codigo_b), (201, 201))
        self.assertEqual(cuerpo_a["id"], cuerpo_b["id"])
        self.assertIsNone(cab_a.get("Idempotency-Replayed"))
        self.assertEqual(cab_b.get("Idempotency-Replayed"), "true")
        self.assertEqual(len(llamadas), 1)
        self.assertEqual(Solicitud.objects.count(), 1)
        self.assertEqual(OperacionIdempotente.objects.count(), 1)
        print("SMOKE AUD-08 concurrencia HTTP: dos POST simultáneos, una solicitud OK.")
