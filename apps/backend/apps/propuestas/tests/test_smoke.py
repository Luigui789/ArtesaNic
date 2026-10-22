"""Smoke HTTP real de AUD-06: WSGI en puerto temporal, login JWT, CSRF y PostgreSQL.

Ejecutar aisladamente: uv run python manage.py test apps.propuestas.tests.test_smoke
Recorre solicitud → revisión → propuesta → lectura del comprador, DR-03 y una carrera
HTTP aceptar contra rechazar el mismo renglón con claves distintas.
"""

import json
import threading
import time
from datetime import timedelta
from decimal import Decimal
from http.cookiejar import CookieJar
from unittest import mock
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

from django.apps import apps
from django.core.cache import cache
from django.db import connection
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.propuestas.models import LineaPropuesta, Propuesta
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import RevisionRenglonSolicitud
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

RUTA = "/api/v1/solicitudes/"


@override_settings(
    CSRF_COOKIE_SECURE=False, REFRESH_COOKIE_SECURE=False, ALLOWED_HOSTS=["localhost", "testserver"]
)
class SmokePropuestaTests(LiveServerTestCase):
    def setUp(self):
        cache.clear()  # contadores de la limitación de intentos de otros tests
        self.taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(self.taller, revisor=crear_administrador())
        self.comprador = crear_usuario("86666666")
        categoria = crear_categoria()
        self.jarron = crear_producto(
            self.taller, categoria, publicado=True, precio=Decimal("150.00")
        )
        self.taza = crear_producto(
            self.taller,
            categoria,
            publicado=True,
            nombre="Taza",
            precio=Decimal("40.00"),
            permite_stock=False,
            permite_produccion=True,
        )
        self.plato = crear_producto(
            self.taller,
            categoria,
            publicado=True,
            nombre="Plato",
            precio=Decimal("200.00"),
            permite_personalizacion=True,
        )

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
        try:
            with (cliente or build_opener()).open(request, timeout=20) as respuesta:
                return respuesta.status, json.load(respuesta), respuesta.headers
        except HTTPError as exc:
            return exc.code, json.load(exc), exc.headers

    def login(self, usuario):
        cliente = build_opener(HTTPCookieProcessor(CookieJar()))
        _, cuerpo, _ = self.peticion("/api/v1/auth/csrf/", cliente=cliente)
        codigo, cuerpo, _ = self.peticion(
            "/api/v1/auth/login/",
            cliente=cliente,
            csrf=cuerpo["csrf_token"],
            datos={"telefono": usuario.telefono, "password": PASSWORD},
        )
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["access"]

    def resolver(self, token, solicitud_id, renglon_id, datos, clave=None):
        return self.peticion(
            f"{RUTA}recibidas/{solicitud_id}/renglones/{renglon_id}/resolver/",
            datos=datos,
            token=token,
            clave=clave or str(uuid4()),
        )

    def test_flujo_completo_revision_propuesta_y_dr03(self):
        token_c = self.login(self.comprador)
        token_a = self.login(self.taller.propietario)
        fecha = (timezone.localdate() + timedelta(days=10)).isoformat()
        comprometida = (timezone.localdate() + timedelta(days=15)).isoformat()

        # 4. El comprador crea la solicitud, con preferencia de entrega (RF-016).
        codigo, solicitud, _ = self.peticion(
            RUTA,
            token=token_c,
            clave=str(uuid4()),
            datos={
                "renglones": [
                    {
                        "producto": self.taza.pk,
                        "modalidad": "produccion",
                        "cantidad": 10,
                        "fecha_solicitada": fecha,
                    },
                    {"producto": self.jarron.pk, "modalidad": "stock", "cantidad": 2},
                    {
                        "producto": self.plato.pk,
                        "modalidad": "personalizacion",
                        "cantidad": 1,
                        "caracteristicas": "Escudo familiar",
                        "origen_personalizacion": "desde_cero",
                    },
                ],
                "modalidad_entrega_preferida": "punto_encuentro",
                "descripcion_entrega_preferida": "Mercado de artesanías",
            },
        )
        self.assertEqual(codigo, 201, solicitud)
        sid = solicitud["id"]
        r1, r2, r3 = (r["id"] for r in solicitud["renglones"])

        # 5–9. El artesano consulta, acepta 1, rechaza 2 con motivo y acepta 3.
        codigo, recibida, _ = self.peticion(f"{RUTA}recibidas/{sid}/", token=token_a)
        self.assertEqual(
            (codigo, recibida["modalidad_entrega_preferida"]), (200, "punto_encuentro")
        )
        self.assertEqual(self.resolver(token_a, sid, r1, {"resolucion": "aceptado"})[0], 200)
        codigo, parcial, _ = self.resolver(
            token_a, sid, r2, {"resolucion": "rechazado", "motivo_rechazo": "Sin existencias"}
        )
        self.assertEqual((codigo, parcial["estado"]), (200, "pendiente_revision"))
        codigo, lista, _ = self.resolver(token_a, sid, r3, {"resolucion": "aceptado"})
        self.assertEqual((codigo, lista["estado"]), (200, "lista_propuesta"))

        # 10–12. Emisión con plan, costo, fecha comprometida y cargos; desglose y total.
        condiciones = {
            "modalidad_entrega": "punto_encuentro",
            "descripcion_entrega": "Mercado de artesanías, sábado 10:00",
            "costo_entrega": "50.00",
            "lineas": [
                {"renglon": r1, "fecha_comprometida": comprometida},
                {"renglon": r3, "cargo_personalizacion": "80.00"},
            ],
            "otros_cargos": [{"descripcion": "Caja de madera", "monto": "25.00", "renglon": r3}],
        }
        clave = str(uuid4())
        codigo, propuesta, cabeceras = self.peticion(
            f"{RUTA}recibidas/{sid}/propuesta/", datos=condiciones, token=token_a, clave=clave
        )
        self.assertEqual(codigo, 201, propuesta)
        self.assertIsNone(cabeceras.get("Idempotency-Replayed"))
        self.assertEqual([linea["renglon"] for linea in propuesta["lineas"]], [r1, r3])
        self.assertEqual(
            [(linea["precio_unitario"], linea["subtotal"]) for linea in propuesta["lineas"]],
            [("40.00", "400.00"), ("200.00", "200.00")],
        )
        self.assertEqual(propuesta["lineas"][0]["fecha_comprometida"], comprometida)
        self.assertEqual(
            (
                propuesta["subtotal_productos"],
                propuesta["total_personalizacion"],
                propuesta["total_otros_cargos"],
                propuesta["costo_entrega"],
                propuesta["total"],
                propuesta["moneda"],
            ),
            ("600.00", "80.00", "25.00", "50.00", "755.00", "NIO"),
        )

        # 13. El comprador consulta la propuesta; ve el rechazado en su solicitud.
        codigo, vista, _ = self.peticion(f"{RUTA}mias/{sid}/propuesta/", token=token_c)
        self.assertEqual((codigo, vista["id"], vista["total"]), (200, propuesta["id"], "755.00"))
        _, mia, _ = self.peticion(f"{RUTA}mias/{sid}/", token=token_c)
        self.assertEqual(mia["estado"], "propuesta_emitida")
        self.assertEqual(mia["renglones"][1]["motivo_rechazo"], "Sin existencias")

        # 14. Repetir con la misma clave devuelve el mismo recurso.
        codigo, repetida, cabeceras = self.peticion(
            f"{RUTA}recibidas/{sid}/propuesta/", datos=condiciones, token=token_a, clave=clave
        )
        self.assertEqual((codigo, repetida["id"]), (201, propuesta["id"]))
        self.assertEqual(cabeceras.get("Idempotency-Replayed"), "true")
        self.assertEqual(Propuesta.objects.count(), 1)

        # 15–16. Ni pedido ni reserva: no existen esos dominios ni se crean filas ajenas.
        self.assertFalse(
            {"pedidos", "inventario", "reservas"} & {m._meta.app_label for m in apps.get_models()}
        )

        # 17–20. Solicitud nueva totalmente rechazada: DR-03, sin propuesta, historial.
        _, otra, _ = self.peticion(
            RUTA,
            token=token_c,
            clave=str(uuid4()),
            datos={
                "renglones": [{"producto": self.jarron.pk, "modalidad": "stock", "cantidad": 1}] * 2
            },
        )
        for i, renglon in enumerate(otra["renglones"], start=1):
            codigo, final, _ = self.resolver(
                token_a,
                otra["id"],
                renglon["id"],
                {"resolucion": "rechazado", "motivo_rechazo": f"Motivo {i}"},
            )
        self.assertEqual((codigo, final["estado"]), (200, "rechazada"))
        codigo, error, _ = self.peticion(
            f"{RUTA}recibidas/{otra['id']}/propuesta/",
            datos=condiciones
            | {"lineas": [{"renglon": otra["renglones"][0]["id"]}], "otros_cargos": []},
            token=token_a,
            clave=str(uuid4()),
        )
        self.assertEqual((codigo, error["codigo"]), (409, "solicitud_rechazada"))
        self.assertEqual(
            self.peticion(f"{RUTA}mias/{otra['id']}/propuesta/", token=token_c)[0], 404
        )
        historial = RevisionRenglonSolicitud.objects.filter(renglon__solicitud_id=otra["id"])
        self.assertEqual(
            sorted(historial.values_list("resolucion", "motivo_rechazo", "resuelto_por")),
            [
                ("rechazado", "Motivo 1", self.taller.propietario.pk),
                ("rechazado", "Motivo 2", self.taller.propietario.pk),
            ],
        )
        self.assertTrue(all(r.resuelto_en for r in historial))
        self.assertEqual(LineaPropuesta.objects.count(), 2)
        print(
            "SMOKE AUD-06 HTTP/JWT/PostgreSQL: revisión individual, lista_propuesta, propuesta con "
            "desglose y total servidor, lectura comprador, replay, DR-03 sin propuesta OK; "
            "sin pedido ni reserva."
        )

    def test_aceptar_y_rechazar_simultaneos_por_http_solo_persiste_uno(self):
        token_c = self.login(self.comprador)
        token_a = self.login(self.taller.propietario)
        _, solicitud, _ = self.peticion(
            RUTA,
            token=token_c,
            clave=str(uuid4()),
            datos={
                "renglones": [{"producto": self.jarron.pk, "modalidad": "stock", "cantidad": 1}]
            },
        )
        sid, rid = solicitud["id"], solicitud["renglones"][0]["id"]
        dentro, continuar = threading.Event(), threading.Event()
        original = solicitudes.estado_tras_revision
        llamadas = []

        def pausada(resoluciones):
            llamadas.append(1)
            estado = original(resoluciones)
            if len(llamadas) == 1:
                dentro.set()
                continuar.wait(15)
            return estado

        respuestas = {}
        cuerpos = {
            "aceptar": {"resolucion": "aceptado"},
            "rechazar": {"resolucion": "rechazado", "motivo_rechazo": "Agotado"},
        }

        def enviar(nombre):
            respuestas[nombre] = self.resolver(token_a, sid, rid, cuerpos[nombre])

        with mock.patch.object(solicitudes, "estado_tras_revision", side_effect=pausada):
            hilos = {n: threading.Thread(target=enviar, args=(n,)) for n in cuerpos}
            hilos["aceptar"].start()
            self.assertTrue(dentro.wait(15))
            hilos["rechazar"].start()
            limite = time.monotonic() + 15
            with connection.cursor() as cursor:
                while time.monotonic() < limite:
                    cursor.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                        "AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() "
                        "AND query ILIKE '%%FOR UPDATE%%'"
                    )
                    if cursor.fetchone()[0]:
                        break
                    time.sleep(0.02)
                else:
                    self.fail("La segunda petición no quedó esperando el lock de la solicitud.")
            continuar.set()
            for hilo in hilos.values():
                hilo.join(20)
        self.assertEqual(respuestas["aceptar"][0], 200)
        self.assertEqual(respuestas["rechazar"][0], 409)
        self.assertEqual(respuestas["rechazar"][1]["codigo"], "renglon_ya_resuelto")
        self.assertEqual(RevisionRenglonSolicitud.objects.get().resolucion, "aceptado")
        print("SMOKE AUD-06 concurrencia HTTP: aceptar vs rechazar simultáneos, una resolución OK.")
