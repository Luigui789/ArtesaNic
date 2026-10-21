"""Smoke HTTP real: WSGI en puerto temporal, JWT/CSRF y PostgreSQL de pruebas.

Ejecutar aisladamente: uv run python manage.py test apps.solicitudes.tests.test_smoke
No modifica datos de desarrollo ni simula confirmación, propuesta o reservas.
"""

import json
from datetime import timedelta
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

from django.apps import apps
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.solicitudes.models import EstadoSolicitud, RenglonSolicitud, Solicitud
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller


@override_settings(
    CSRF_COOKIE_SECURE=False, REFRESH_COOKIE_SECURE=False, ALLOWED_HOSTS=["localhost", "testserver"]
)
class SmokeSolicitudesTests(LiveServerTestCase):
    def test_solicitud_mixta_y_aislamiento_por_http_real(self):
        admin = crear_administrador()
        taller_a = crear_artesano_con_taller("82222222")
        taller_b = crear_artesano_con_taller("83333333")
        for taller in (taller_a, taller_b):
            talleres.aprobar_taller(taller, revisor=admin)
        comprador = crear_usuario("86666666")
        otro_comprador = crear_usuario("87777777")
        categoria = crear_categoria()
        producto_a = crear_producto(
            taller_a,
            categoria,
            publicado=True,
            permite_produccion=True,
            permite_personalizacion=True,
        )
        segundo_a = crear_producto(taller_a, categoria, publicado=True, nombre="Segunda pieza")
        producto_b = crear_producto(taller_b, categoria, publicado=True)
        cliente = build_opener(HTTPCookieProcessor(CookieJar()))

        def peticion(ruta, *, datos=None, token=None, csrf=None):
            cabeceras = {"Accept": "application/json"}
            if token:
                cabeceras["Authorization"] = f"Bearer {token}"
            if csrf:
                cabeceras["X-CSRFToken"] = csrf
            cuerpo = None if datos is None else json.dumps(datos).encode()
            if cuerpo is not None:
                cabeceras["Content-Type"] = "application/json"
            request = Request(self.live_server_url + ruta, data=cuerpo, headers=cabeceras)
            try:
                with cliente.open(request, timeout=10) as respuesta:
                    return respuesta.status, json.load(respuesta)
            except HTTPError as exc:
                return exc.code, json.load(exc)

        def login(usuario):
            codigo, cuerpo = peticion("/api/v1/auth/csrf/")
            self.assertEqual(codigo, 200)
            codigo, cuerpo = peticion(
                "/api/v1/auth/login/",
                csrf=cuerpo["csrf_token"],
                datos={"telefono": usuario.telefono, "password": PASSWORD},
            )
            self.assertEqual(codigo, 200, cuerpo)
            return cuerpo["access"]

        token_comprador = login(comprador)
        token_otro = login(otro_comprador)
        token_a = login(taller_a.propietario)
        token_b = login(taller_b.propietario)
        modelos_ajenos = [
            m
            for m in apps.get_models()
            if m._meta.app_label
            in {
                "accounts",
                "catalogo",
                "talleres",
            }
        ]
        antes = {m._meta.label: m.objects.count() for m in modelos_ajenos}
        ruta = "/api/v1/solicitudes/"
        stock = {"producto": producto_a.pk, "modalidad": "stock", "cantidad": 2}
        codigo, unica = peticion(ruta, token=token_comprador, datos={"renglones": [stock]})
        self.assertEqual(codigo, 201, unica)
        self.assertEqual(unica["estado"], "pendiente_revision")
        self.assertEqual(Solicitud.objects.get(pk=unica["id"]).comprador, comprador)
        fecha = str(timezone.localdate() + timedelta(days=7))
        codigo, mixta = peticion(
            ruta,
            token=token_comprador,
            datos={
                "renglones": [
                    stock,
                    {
                        "producto": producto_a.pk,
                        "modalidad": "produccion",
                        "cantidad": 4,
                        "fecha_solicitada": fecha,
                    },
                    {
                        "producto": producto_a.pk,
                        "modalidad": "personalizacion",
                        "cantidad": 1,
                        "caracteristicas": "Iniciales AM",
                        "origen_personalizacion": "unidad_estandar",
                    },
                    {"producto": segundo_a.pk, "modalidad": "stock", "cantidad": 3},
                ]
            },
        )
        self.assertEqual(codigo, 201, mixta)
        self.assertEqual(len(mixta["renglones"]), 4)
        self.assertEqual(RenglonSolicitud.objects.filter(solicitud_id=mixta["id"]).count(), 4)
        self.assertEqual(
            {r["modalidad"] for r in mixta["renglones"]},
            {
                "stock",
                "produccion",
                "personalizacion",
            },
        )
        conteos = (Solicitud.objects.count(), RenglonSolicitud.objects.count())
        codigo, error = peticion(
            ruta,
            token=token_comprador,
            datos={
                "renglones": [
                    stock,
                    {"producto": producto_b.pk, "modalidad": "stock", "cantidad": 1},
                ]
            },
        )
        self.assertEqual(codigo, 400, error)
        self.assertEqual(conteos, (Solicitud.objects.count(), RenglonSolicitud.objects.count()))
        codigo, propia = peticion(f"{ruta}recibidas/{mixta['id']}/", token=token_a)
        self.assertEqual(codigo, 200)
        self.assertEqual(propia["comprador"], {"id": comprador.pk, "nombre": comprador.nombre})
        self.assertEqual(peticion(f"{ruta}recibidas/{mixta['id']}/", token=token_b)[0], 404)
        self.assertEqual(peticion(f"{ruta}mias/{mixta['id']}/", token=token_otro)[0], 404)
        self.assertEqual(antes, {m._meta.label: m.objects.count() for m in modelos_ajenos})
        self.assertEqual(
            {m.__name__ for m in apps.get_app_config("solicitudes").get_models()},
            {
                "Solicitud",
                "RenglonSolicitud",
            },
        )
        for clave in ("pedido", "propuesta", "reserva", "movimientos", "pagos", "chat", "total"):
            self.assertNotIn(clave, mixta)
        self.assertEqual(EstadoSolicitud.RECHAZADA.value, "rechazada")
        print(
            "SMOKE AUD-05 HTTP/JWT/CSRF/PostgreSQL: creación simple y mixta, rollback, "
            "ownership y separación de etapas OK; DR-03 representado, sin confirmación."
        )
