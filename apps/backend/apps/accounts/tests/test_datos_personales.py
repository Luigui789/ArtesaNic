"""Actualización de los datos personales propios: PATCH /api/v1/auth/perfil/ (AUD-15, RF-004)."""

from django.contrib.auth.models import Group, Permission
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Rol, Usuario
from apps.talleres import services as talleres
from apps.talleres.models import EstadoTaller, Taller
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from .base import PASSWORD, URL_LOGIN, URL_PERFIL, URL_REFRESCAR, AuthAPITestCase, crear_usuario

MENSAJE_DUPLICADO = "Ya existe una cuenta con este teléfono."
MENSAJE_REQUERIDA = "Confirma tu contraseña actual para cambiar el teléfono."
MENSAJE_INCORRECTA = "La contraseña actual no es correcta."


class ActualizarPerfilTestCase(AuthAPITestCase):
    def setUp(self):
        super().setUp()
        self.usuario = crear_usuario("85551234", nombre="Ana Delgado")
        self.autenticar(self.usuario)

    def autenticar(self, usuario):
        self.con_token(str(AccessToken.for_user(usuario)))

    def patch(self, datos):
        # Sin cabecera X-CSRFToken: la autenticación es Bearer, como el GET.
        return self.client.patch(URL_PERFIL, datos, format="json")

    def estado_guardado(self, usuario=None):
        usuario = usuario or self.usuario
        return Usuario.objects.values(
            "nombre", "telefono", "rol", "is_active", "is_staff", "is_superuser", "password"
        ).get(pk=usuario.pk)


class EditarDatosTests(ActualizarPerfilTestCase):
    def test_get_perfil_sigue_funcionando(self):
        respuesta = self.client.get(URL_PERFIL)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(
            respuesta.json(),
            {
                "id": self.usuario.pk,
                "nombre": "Ana Delgado",
                "telefono": "85551234",
                "rol": "comprador",
            },
        )

    def test_cambia_el_nombre_sin_contrasena(self):
        respuesta = self.patch({"nombre": "  Ana López  "})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(
            respuesta.json(),
            {
                "id": self.usuario.pk,
                "nombre": "Ana López",
                "telefono": "85551234",
                "rol": "comprador",
            },
        )
        self.assertEqual(self.estado_guardado()["nombre"], "Ana López")
        self.assertIn("no-store", respuesta.headers["Cache-Control"])

    def test_cambia_el_telefono_con_contrasena(self):
        respuesta = self.patch({"telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["telefono"], "87771234")
        self.assertEqual(self.estado_guardado()["telefono"], "87771234")

    def test_cambia_nombre_y_telefono(self):
        respuesta = self.patch(
            {"nombre": "Ana López", "telefono": "8777 1234", "password_actual": PASSWORD}
        )
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        guardado = self.estado_guardado()
        self.assertEqual((guardado["nombre"], guardado["telefono"]), ("Ana López", "87771234"))

    def test_normaliza_el_telefono(self):
        for entrada, esperado in [("+505 8777-1234", "87771234"), ("(8666) 1234", "86661234")]:
            with self.subTest(entrada=entrada):
                respuesta = self.patch({"telefono": entrada, "password_actual": PASSWORD})
                self.assertEqual(respuesta.status_code, 200, respuesta.content)
                self.assertEqual(respuesta.json()["telefono"], esperado)
                self.assertEqual(self.estado_guardado()["telefono"], esperado)

    def test_respuesta_sin_contrasena_ni_privilegios(self):
        respuesta = self.patch({"telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(set(respuesta.json()), {"id", "nombre", "telefono", "rol"})
        self.assertNotIn(PASSWORD, respuesta.content.decode())

    def test_la_contrasena_no_cambia(self):
        hash_anterior = self.estado_guardado()["password"]
        self.patch({"nombre": "Ana López", "telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(self.estado_guardado()["password"], hash_anterior)

    def test_cuerpo_vacio_no_cambia_nada(self):
        antes = self.estado_guardado()
        respuesta = self.patch({})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(self.estado_guardado(), antes)


class ValidacionTests(ActualizarPerfilTestCase):
    def test_telefono_duplicado(self):
        crear_usuario("87771234", nombre="Otra cuenta")
        antes = self.estado_guardado()
        respuesta = self.patch({"telefono": "8777-1234", "password_actual": PASSWORD})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json(), {"telefono": [MENSAJE_DUPLICADO]})
        self.assertEqual(self.estado_guardado(), antes)

    def test_duplicado_no_se_revela_sin_la_contrasena_correcta(self):
        crear_usuario("87771234", nombre="Otra cuenta")
        respuesta = self.patch({"telefono": "87771234", "password_actual": "otra-cosa"})
        self.assertEqual(respuesta.json(), {"password_actual": [MENSAJE_INCORRECTA]})

    def test_nombre_vacio(self):
        for nombre in ["", "   "]:
            with self.subTest(nombre=nombre):
                respuesta = self.patch({"nombre": nombre})
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("nombre", respuesta.json())
        self.assertEqual(self.estado_guardado()["nombre"], "Ana Delgado")

    def test_nombre_nulo(self):
        self.assertEqual(self.patch({"nombre": None}).status_code, 400)

    def test_nombre_de_mas_de_150_caracteres(self):
        self.assertEqual(self.patch({"nombre": "a" * 150}).status_code, 200)
        respuesta = self.patch({"nombre": "a" * 151})
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("nombre", respuesta.json())
        self.assertEqual(self.estado_guardado()["nombre"], "a" * 150)

    def test_telefono_invalido(self):
        for telefono in ["1234", "+1 555 123 4567", "abcdefgh", ""]:
            with self.subTest(telefono=telefono):
                respuesta = self.patch({"telefono": telefono, "password_actual": PASSWORD})
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("telefono", respuesta.json())
        self.assertEqual(self.estado_guardado()["telefono"], "85551234")

    def test_contrasena_requerida_para_cambiar_el_telefono(self):
        for datos in [{"telefono": "87771234"}, {"telefono": "87771234", "password_actual": ""}]:
            with self.subTest(datos=datos):
                respuesta = self.patch(datos)
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {"password_actual": [MENSAJE_REQUERIDA]})
        self.assertEqual(self.estado_guardado()["telefono"], "85551234")

    def test_contrasena_incorrecta(self):
        respuesta = self.patch({"telefono": "87771234", "password_actual": "no-es-la-mia"})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json(), {"password_actual": [MENSAJE_INCORRECTA]})
        self.assertEqual(self.estado_guardado()["telefono"], "85551234")

    def test_error_de_telefono_no_aplica_el_nombre(self):
        respuesta = self.patch({"nombre": "Ana López", "telefono": "87771234"})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(self.estado_guardado()["nombre"], "Ana Delgado")

    def test_mismo_telefono_normalizado_no_exige_contrasena(self):
        for telefono in ["8555-1234", "+505 8555 1234", "85551234"]:
            with self.subTest(telefono=telefono):
                respuesta = self.patch({"nombre": "Ana López", "telefono": telefono})
                self.assertEqual(respuesta.status_code, 200, respuesta.content)
                self.assertEqual(respuesta.json()["telefono"], "85551234")

    def test_limita_las_confirmaciones_de_contrasena(self):
        for _ in range(10):
            self.patch({"telefono": "87771234", "password_actual": "no-es-la-mia"})
        respuesta = self.patch({"telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(respuesta.status_code, 429)
        self.assertEqual(self.estado_guardado()["telefono"], "85551234")
        # Editar el nombre no se limita.
        self.assertEqual(self.patch({"nombre": "Ana López"}).status_code, 200)


class CamposProtegidosTests(ActualizarPerfilTestCase):
    def test_rechaza_campos_protegidos_sin_cambiar_nada(self):
        grupo = Group.objects.create(name="Moderación")
        permiso = Permission.objects.first()
        intentos = {
            "rol": "administrador",
            "is_active": False,
            "is_staff": True,
            "is_superuser": True,
            "groups": [grupo.pk],
            "user_permissions": [permiso.pk],
            "password": "Nueva-Contrasena-2026",
            "id": 999,
            "last_login": "2026-01-01T00:00:00Z",
            "creado_en": "2026-01-01T00:00:00Z",
        }
        antes = self.estado_guardado()
        for campo, valor in intentos.items():
            with self.subTest(campo=campo):
                respuesta = self.patch({"nombre": "Ana López", campo: valor})
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {campo: ["Campo no permitido."]})
        self.assertEqual(self.estado_guardado(), antes)
        self.assertFalse(self.usuario.groups.exists())
        self.assertFalse(self.usuario.user_permissions.exists())

    def test_escalamiento_combinado(self):
        antes = self.estado_guardado()
        respuesta = self.patch({"rol": "administrador", "is_staff": True})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(
            respuesta.json(), {"is_staff": ["Campo no permitido."], "rol": ["Campo no permitido."]}
        )
        self.assertEqual(self.estado_guardado(), antes)


class AutorizacionTests(ActualizarPerfilTestCase):
    def test_anonimo(self):
        self.client.credentials()
        respuesta = self.patch({"nombre": "Ana López"})
        self.assertEqual(respuesta.status_code, 401)
        self.assertEqual(self.estado_guardado()["nombre"], "Ana Delgado")

    def test_token_no_valido(self):
        self.con_token("basura")
        self.assertEqual(self.patch({"nombre": "Ana López"}).status_code, 401)

    def test_solo_modifica_la_cuenta_del_token(self):
        otra = crear_usuario("86661234", nombre="Otra cuenta")
        self.autenticar(otra)
        respuesta = self.patch({"nombre": "Cambiada"})
        self.assertEqual(respuesta.json()["id"], otra.pk)
        self.assertEqual(self.estado_guardado(otra)["nombre"], "Cambiada")
        self.assertEqual(self.estado_guardado()["nombre"], "Ana Delgado")

    def test_cuenta_inactiva_no_puede_actualizar(self):
        Usuario.objects.filter(pk=self.usuario.pk).update(is_active=False)
        self.assertEqual(self.patch({"nombre": "Ana López"}).status_code, 401)
        self.assertEqual(self.estado_guardado()["nombre"], "Ana Delgado")

    def test_cuenta_de_administracion_no_usa_la_api(self):
        administrador = crear_administrador()
        self.autenticar(administrador)
        self.assertEqual(self.patch({"nombre": "Otro"}).status_code, 401)

    def test_comprador_puede_actualizar(self):
        respuesta = self.patch({"nombre": "Ana López"})
        self.assertEqual((respuesta.status_code, respuesta.json()["rol"]), (200, "comprador"))


class ArtesanoTests(ActualizarPerfilTestCase):
    def setUp(self):
        super().setUp()
        self.taller = crear_artesano_con_taller(
            "82222222", telefono_publico="88889999", whatsapp_publico="88880000"
        )
        self.artesano = self.taller.propietario
        self.autenticar(self.artesano)

    def contactos_y_estado(self):
        return Taller.objects.values("telefono_publico", "whatsapp_publico", "estado").get(
            pk=self.taller.pk
        )

    def test_artesano_puede_actualizar(self):
        respuesta = self.patch({"nombre": "Ana López"})
        self.assertEqual((respuesta.status_code, respuesta.json()["rol"]), (200, "artesano"))

    def test_cambiar_el_telefono_privado_no_modifica_el_taller(self):
        antes = self.contactos_y_estado()
        respuesta = self.patch({"telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(self.estado_guardado(self.artesano)["telefono"], "87771234")
        self.assertEqual(
            self.contactos_y_estado(),
            antes
            | {
                "telefono_publico": "88889999",
                "whatsapp_publico": "88880000",
                "estado": EstadoTaller.PENDIENTE,
            },
        )

    def test_aprobacion_no_cambia(self):
        talleres.aprobar_taller(self.taller, revisor=crear_administrador())
        self.patch({"nombre": "Ana López", "telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(self.contactos_y_estado()["estado"], EstadoTaller.APROBADO)

    def test_artesano_pendiente_o_rechazado_gestiona_su_identidad(self):
        self.assertEqual(self.patch({"nombre": "Pendiente"}).status_code, 200)
        talleres.rechazar_taller(self.taller, revisor=crear_administrador(), motivo="Faltan datos")
        respuesta = self.patch({"telefono": "87771234", "password_actual": PASSWORD})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(self.contactos_y_estado()["estado"], EstadoTaller.RECHAZADO)
        self.assertEqual(self.estado_guardado(self.artesano)["rol"], Rol.ARTESANO)


class SesionTrasActualizarTests(AuthAPITestCase):
    def setUp(self):
        super().setUp()
        self.usuario = crear_usuario("85551234", nombre="Ana Delgado")
        self.con_token(self.iniciar_sesion("85551234"))

    def test_la_sesion_sigue_valida_y_no_emite_tokens(self):
        respuesta = self.client.patch(
            URL_PERFIL, {"telefono": "87771234", "password_actual": PASSWORD}, format="json"
        )
        self.assertEqual(respuesta.status_code, 200)
        self.assertNotIn("access", respuesta.json())
        self.assertNotIn("refresh", respuesta.cookies)
        perfil = self.client.get(URL_PERFIL)
        self.assertEqual(perfil.status_code, 200)
        self.assertEqual(perfil.json()["telefono"], "87771234")
        # La cookie de renovación emitida antes del cambio sigue sirviendo.
        self.client.credentials()
        self.assertEqual(self.post_con_csrf(URL_REFRESCAR).status_code, 200)

    def test_login_con_el_telefono_viejo_falla_y_con_el_nuevo_funciona(self):
        self.client.patch(
            URL_PERFIL, {"telefono": "87771234", "password_actual": PASSWORD}, format="json"
        )
        self.client.credentials()
        viejo = self.post_con_csrf(URL_LOGIN, {"telefono": "85551234", "password": PASSWORD})
        self.assertEqual(viejo.status_code, 401)
        nuevo = self.post_con_csrf(URL_LOGIN, {"telefono": "87771234", "password": PASSWORD})
        self.assertEqual(nuevo.status_code, 200)
        self.assertEqual(nuevo.json()["usuario"]["id"], self.usuario.pk)
