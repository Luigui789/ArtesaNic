"""Orígenes admitidos: CORS con credenciales y orígenes de confianza para CSRF."""

from django.conf import settings
from django.test import override_settings

from apps.accounts.tests.base import PASSWORD, URL_LOGIN, AuthAPITestCase, crear_usuario

FRONTEND = "http://localhost:5173"
AJENO = "https://sitio-ajeno.example"


@override_settings(CORS_ALLOWED_ORIGINS=[FRONTEND], CSRF_TRUSTED_ORIGINS=[FRONTEND])
class OrigenesTests(AuthAPITestCase):
    def preflight(self, origen):
        return self.client.options(
            URL_LOGIN,
            HTTP_ORIGIN=origen,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-csrftoken",
        )

    def test_frontend_admitido_con_credenciales(self):
        respuesta = self.preflight(FRONTEND)
        self.assertEqual(respuesta.headers["Access-Control-Allow-Origin"], FRONTEND)
        self.assertEqual(respuesta.headers["Access-Control-Allow-Credentials"], "true")
        self.assertIn("x-csrftoken", respuesta.headers["Access-Control-Allow-Headers"])

    def test_origen_ajeno_sin_cabeceras_cors(self):
        self.assertNotIn("Access-Control-Allow-Origin", self.preflight(AJENO).headers)

    def test_nunca_se_admite_cualquier_origen(self):
        self.assertFalse(getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False))
        self.assertNotIn("*", settings.CORS_ALLOWED_ORIGINS)

    def test_csrf_verifica_el_origen(self):
        crear_usuario("85551234")
        credenciales = {"telefono": "85551234", "password": PASSWORD}
        desde_frontend = self.post_con_csrf(URL_LOGIN, credenciales, HTTP_ORIGIN=FRONTEND)
        self.assertEqual(desde_frontend.status_code, 200)
        # Token válido, pero enviado desde un sitio ajeno.
        desde_ajeno = self.post_con_csrf(URL_LOGIN, credenciales, HTTP_ORIGIN=AJENO)
        self.assertEqual(desde_ajeno.status_code, 403)

    def test_frontend_puede_enviar_la_clave_y_leer_la_repeticion(self):
        respuesta = self.client.options(
            "/api/v1/solicitudes/",
            HTTP_ORIGIN=FRONTEND,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type,idempotency-key",
        )
        self.assertIn("idempotency-key", respuesta.headers["Access-Control-Allow-Headers"])
        self.assertEqual(settings.CORS_EXPOSE_HEADERS, ["Idempotency-Replayed"])
