from unittest import mock

from apps.accounts import services
from apps.accounts.api.csrf import MENSAJE_CSRF
from apps.accounts.models import Rol, Usuario
from apps.accounts.phone import MENSAJE_FORMATO, MENSAJE_OTRO_PAIS

from .base import (
    PASSWORD,
    URL_PERFIL,
    URL_REGISTRO_ARTESANO,
    URL_REGISTRO_COMPRADOR,
    AuthAPITestCase,
    crear_usuario,
)


def datos(**cambios):
    return {"nombre": "Ana Lucía Delgado", "telefono": "8555 1234", "password": PASSWORD} | cambios


def datos_artesano(**cambios):
    """El artesano envía además los datos iniciales de su taller (AUD-02)."""
    taller = {"nombre": "Cerámica López", "rubro": "Cerámica", "direccion_completa": "Masaya"}
    return datos(taller=taller, **cambios)


class RegistroValidoTests(AuthAPITestCase):
    def assertRegistroCorrecto(self, url, rol, cuerpo=None):
        respuesta = self.post_con_csrf(url, cuerpo or datos())

        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        usuario = Usuario.objects.get()
        self.assertEqual(
            respuesta.json()["usuario"],
            {"id": usuario.pk, "nombre": "Ana Lucía Delgado", "telefono": "85551234", "rol": rol},
        )
        self.assertEqual(usuario.rol, rol)
        self.assertTrue(usuario.is_active)
        self.assertFalse(usuario.is_staff)
        self.assertFalse(usuario.is_superuser)
        self.assertTrue(usuario.check_password(PASSWORD))
        self.assertIsNotNone(usuario.last_login)  # el registro inicia la sesión
        # El token de renovación solo viaja en la cookie HttpOnly.
        self.assertEqual(set(respuesta.json()), {"access", "usuario"})
        cookie = respuesta.cookies["refresh"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/v1/auth/")
        self.assertEqual(cookie["samesite"], "Lax")
        return respuesta

    def test_registra_comprador(self):
        self.assertRegistroCorrecto(URL_REGISTRO_COMPRADOR, Rol.COMPRADOR)

    def test_registra_artesano_sin_aprobar_taller(self):
        respuesta = self.assertRegistroCorrecto(
            URL_REGISTRO_ARTESANO, Rol.ARTESANO, datos_artesano()
        )
        # El taller nace pendiente (apps.talleres); la respuesta de registro no lo incluye.
        self.assertNotIn("artesano_id", respuesta.json()["usuario"])
        self.assertNotIn("artesano_estado", respuesta.json()["usuario"])

    def test_el_registro_inicia_la_sesion(self):
        access = self.post_con_csrf(URL_REGISTRO_COMPRADOR, datos()).json()["access"]
        self.con_token(access)
        self.assertEqual(self.client.get(URL_PERFIL).json()["telefono"], "85551234")


class TelefonoDuplicadoTests(AuthAPITestCase):
    def test_duplicado_tras_normalizar(self):
        crear_usuario("85551234")
        for variante in ["85551234", "8555-1234", "+505 8555 1234", "505 85551234"]:
            with self.subTest(variante=variante):
                respuesta = self.post_con_csrf(
                    URL_REGISTRO_ARTESANO, datos_artesano(telefono=variante)
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(
                    respuesta.json(), {"telefono": ["Ya existe una cuenta con este teléfono."]}
                )
        self.assertEqual(Usuario.objects.count(), 1)

    def test_registro_simultaneo_resuelto_por_la_restriccion_unica(self):
        """La comprobación previa no ve la otra cuenta; PostgreSQL rechaza el duplicado."""
        crear_usuario("85551234")
        filtrar = Usuario.objects.filter
        llamadas = []

        def filtro_que_no_ve_la_otra_cuenta(*args, **kwargs):
            llamadas.append(kwargs)
            if len(llamadas) == 1:
                return Usuario.objects.none()
            return filtrar(*args, **kwargs)

        with mock.patch.object(
            Usuario.objects, "filter", side_effect=filtro_que_no_ve_la_otra_cuenta
        ) as consultas:
            with self.assertRaises(services.TelefonoYaRegistrado):
                services.registrar_comprador(
                    nombre="Otra", telefono="+505 8555 1234", password=PASSWORD
                )
        # Comprobación previa (sin resultado) y nueva consulta tras el IntegrityError.
        self.assertEqual(consultas.call_count, 2)
        self.assertEqual(Usuario.objects.count(), 1)


class ValidacionTests(AuthAPITestCase):
    def assertErrores(self, cuerpo, campos):
        respuesta = self.post_con_csrf(URL_REGISTRO_COMPRADOR, cuerpo)
        self.assertEqual(respuesta.status_code, 400, respuesta.content)
        self.assertEqual(set(respuesta.json()), set(campos))
        self.assertFalse(Usuario.objects.exists())
        return respuesta.json()

    def test_campos_obligatorios(self):
        self.assertErrores({}, {"nombre", "telefono", "password"})

    def test_nombre_en_blanco(self):
        self.assertErrores(datos(nombre="   "), {"nombre"})

    def test_telefono_invalido(self):
        self.assertEqual(
            self.assertErrores(datos(telefono="1234"), {"telefono"}),
            {"telefono": [MENSAJE_FORMATO]},
        )
        self.assertEqual(
            self.assertErrores(datos(telefono="+506 8555 1234"), {"telefono"}),
            {"telefono": [MENSAJE_OTRO_PAIS]},
        )

    def test_contrasenas_rechazadas_por_los_validadores_de_django(self):
        for password in [
            "Ab-1x",  # corta
            "4815162342",  # solo números
            "qwertyuiop",  # común
            "Delgado2026!",  # parecida al nombre
            "85551234ab",  # parecida al teléfono
        ]:
            with self.subTest(password=password):
                errores = self.assertErrores(datos(password=password), {"password"})
                self.assertTrue(errores["password"])

    def test_solo_acepta_json(self):
        respuesta = self.client.post(
            URL_REGISTRO_COMPRADOR,
            datos(),
            format="multipart",
            HTTP_X_CSRFTOKEN=self.obtener_csrf(),
        )
        self.assertEqual(respuesta.status_code, 415)
        self.assertFalse(Usuario.objects.exists())


class PrivilegiosTests(AuthAPITestCase):
    def test_no_se_aceptan_campos_de_rol_ni_de_privilegios(self):
        for campo, valor in [
            ("rol", "administrador"),
            ("rol", "artesano"),
            ("is_staff", True),
            ("is_superuser", True),
            ("is_active", False),
            ("groups", [1]),
            ("user_permissions", [1]),
        ]:
            with self.subTest(campo=campo, valor=valor):
                respuesta = self.post_con_csrf(URL_REGISTRO_COMPRADOR, datos(**{campo: valor}))
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {campo: ["Campo no permitido."]})
        self.assertFalse(Usuario.objects.exists())

    def test_no_existe_registro_publico_de_administradores(self):
        for url in ["/api/v1/auth/registro/administrador/", "/api/v1/auth/registro/"]:
            with self.subTest(url=url):
                self.assertEqual(
                    self.post_con_csrf(url, datos(rol="administrador")).status_code, 404
                )
        self.assertFalse(Usuario.objects.exists())


class CSRFRegistroTests(AuthAPITestCase):
    def test_sin_token_csrf(self):
        respuesta = self.client.post(URL_REGISTRO_COMPRADOR, datos(), format="json")
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(respuesta.json(), {"detail": MENSAJE_CSRF})
        self.assertFalse(Usuario.objects.exists())

    def test_token_csrf_incorrecto(self):
        self.obtener_csrf()  # la cookie existe, pero la cabecera no corresponde
        respuesta = self.client.post(
            URL_REGISTRO_COMPRADOR, datos(), format="json", HTTP_X_CSRFTOKEN="x" * 64
        )
        self.assertEqual(respuesta.status_code, 403)
        self.assertFalse(Usuario.objects.exists())


class LimiteDeRegistrosTests(AuthAPITestCase):
    def test_limite_por_ip(self):
        for indice in range(10):
            telefono = f"8{indice:07d}"
            respuesta = self.post_con_csrf(URL_REGISTRO_COMPRADOR, datos(telefono=telefono))
            self.assertEqual(respuesta.status_code, 201, respuesta.content)
        respuesta = self.post_con_csrf(URL_REGISTRO_COMPRADOR, datos(telefono="89999999"))
        self.assertEqual(respuesta.status_code, 429)
        self.assertIn("Retry-After", respuesta.headers)
        self.assertEqual(Usuario.objects.count(), 10)
