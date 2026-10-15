"""API de talleres: perfil público solo si está aprobado y taller propio del artesano
(RF-008, RN-002, RN-006, RNF-004, RNF-013)."""

from rest_framework.test import APITestCase

from apps.accounts.api.tokens import emitir_tokens
from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.talleres import services
from apps.talleres.models import CAMPOS_PERFIL, EstadoTaller, Taller

from .base import (
    URL_MI_TALLER,
    URL_TALLERES,
    crear_administrador,
    crear_artesano_con_taller,
    url_taller,
)

CAMPOS_PUBLICOS = {"id", *CAMPOS_PERFIL}


class TalleresAPITestCase(APITestCase):
    def setUp(self):
        self.admin = crear_administrador()
        self.aprobado = crear_artesano_con_taller("82222222", nombre="Barro y Sombra")
        services.aprobar_taller(self.aprobado, revisor=self.admin)
        self.pendiente = crear_artesano_con_taller("83333333", nombre="Hamacas Membreño")
        self.rechazado = crear_artesano_con_taller("84444444", nombre="Cuero Masaya")
        services.rechazar_taller(self.rechazado, revisor=self.admin, motivo="Datos falsos")

    def autenticar(self, usuario):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {emitir_tokens(usuario)[0]}")


class PerfilPublicoTests(TalleresAPITestCase):
    def test_lista_solo_los_aprobados(self):
        respuesta = self.client.get(URL_TALLERES)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual([t["id"] for t in respuesta.json()], [self.aprobado.pk])

    def test_un_taller_aprobado_es_publico(self):
        respuesta = self.client.get(url_taller(self.aprobado.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["nombre"], "Barro y Sombra")
        self.assertEqual(respuesta.json()["rubro"], "Cerámica artesanal")

    def test_pendientes_y_rechazados_no_son_publicos(self):
        for taller in (self.pendiente, self.rechazado):
            with self.subTest(estado=taller.estado):
                self.assertEqual(self.client.get(url_taller(taller.pk)).status_code, 404)
        self.assertEqual(self.client.get(url_taller(999999)).status_code, 404)

    def test_la_respuesta_publica_no_expone_datos_de_la_cuenta(self):
        respuesta = self.client.get(url_taller(self.aprobado.pk))
        cuerpo = respuesta.json()
        self.assertEqual(set(cuerpo), CAMPOS_PUBLICOS)
        for campo in ("telefono", "propietario", "estado", "revisado_por", "motivo_rechazo"):
            self.assertNotIn(campo, cuerpo)
        # El teléfono de acceso de la cuenta no aparece en ninguna parte de la respuesta.
        self.assertNotIn(self.aprobado.propietario.telefono, respuesta.content.decode())
        self.assertNotIn(
            self.aprobado.propietario.telefono, self.client.get(URL_TALLERES).content.decode()
        )

    def test_publica_los_contactos_que_decide_el_artesano(self):
        services.actualizar_perfil(self.aprobado, whatsapp_publico="87776655")
        cuerpo = self.client.get(url_taller(self.aprobado.pk)).json()
        self.assertEqual(cuerpo["whatsapp_publico"], "87776655")
        self.assertEqual(cuerpo["telefono_publico"], "")

    def test_la_lectura_publica_no_depende_del_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer token-caducado")
        self.assertEqual(self.client.get(URL_TALLERES).status_code, 200)
        self.assertEqual(self.client.get(url_taller(self.aprobado.pk)).status_code, 200)

    def test_solo_lectura(self):
        for metodo in ("post", "put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                self.assertEqual(getattr(self.client, metodo)(URL_TALLERES).status_code, 405)
                self.assertEqual(
                    getattr(self.client, metodo)(url_taller(self.aprobado.pk)).status_code, 405
                )


class MiTallerConsultaTests(TalleresAPITestCase):
    def test_el_artesano_ve_su_taller_en_cualquier_estado(self):
        for taller in (self.pendiente, self.aprobado, self.rechazado):
            with self.subTest(estado=taller.estado):
                self.autenticar(taller.propietario)
                respuesta = self.client.get(URL_MI_TALLER)
                self.assertEqual(respuesta.status_code, 200)
                self.assertEqual(respuesta.json()["id"], taller.pk)
                self.assertEqual(respuesta.json()["estado"], taller.estado)
        self.assertEqual(respuesta.json()["motivo_rechazo"], "Datos falsos")
        self.assertNotIn("revisado_por", respuesta.json())
        self.assertNotIn("propietario", respuesta.json())

    def test_sin_sesion(self):
        self.assertEqual(self.client.get(URL_MI_TALLER).status_code, 401)
        self.assertEqual(self.client.patch(URL_MI_TALLER, {}, format="json").status_code, 401)

    def test_el_comprador_no_tiene_taller_propio(self):
        self.autenticar(crear_usuario("81111111", rol=Rol.COMPRADOR))
        self.assertEqual(self.client.get(URL_MI_TALLER).status_code, 403)
        self.assertEqual(self.client.patch(URL_MI_TALLER, {}, format="json").status_code, 403)

    def test_artesano_sin_taller(self):
        """Cuentas creadas antes de AUD-02 sin taller: 404, nunca el taller de otro."""
        self.autenticar(crear_usuario("85555555", rol=Rol.ARTESANO))
        self.assertEqual(self.client.get(URL_MI_TALLER).status_code, 404)
        self.assertEqual(
            self.client.patch(URL_MI_TALLER, {"nombre": "X"}, format="json").status_code, 404
        )


class MiTallerActualizacionTests(TalleresAPITestCase):
    def setUp(self):
        super().setUp()
        self.autenticar(self.aprobado.propietario)

    def patch(self, datos):
        return self.client.patch(URL_MI_TALLER, datos, format="json")

    def test_actualiza_el_perfil_publico(self):
        respuesta = self.patch(
            {
                "historia": "Desde 1985 en Masaya.",
                "telefono_publico": "8777 6655",
                "instagram_url": "https://instagram.com/barroysombra",
            }
        )
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["telefono_publico"], "87776655")
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.historia, "Desde 1985 en Masaya.")
        self.assertEqual(self.aprobado.nombre, "Barro y Sombra")  # no enviado, sin cambios
        # Editar el perfil no altera la aprobación.
        self.assertEqual(self.aprobado.estado, EstadoTaller.APROBADO)
        self.assertEqual(
            self.client.get(url_taller(self.aprobado.pk)).json()["historia"],
            "Desde 1985 en Masaya.",
        )

    def test_puede_retirar_un_contacto_publico(self):
        self.patch({"whatsapp_publico": "87776655"})
        respuesta = self.patch({"whatsapp_publico": ""})
        self.assertEqual(respuesta.status_code, 200)
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.whatsapp_publico, "")

    def test_no_permite_cambiar_campos_de_control(self):
        otro = crear_usuario("86666666", rol=Rol.ARTESANO)
        revision = (self.aprobado.revisado_por_id, self.aprobado.revisado_en)
        for campo, valor in [
            ("estado", EstadoTaller.PENDIENTE),
            ("estado", "suspendido"),
            ("revisado_por", otro.pk),
            ("revisado_en", "2020-01-01T00:00:00Z"),
            ("propietario", otro.pk),
            ("creado_en", "2020-01-01T00:00:00Z"),
            ("motivo_rechazo", "x"),
            ("id", 1),
        ]:
            with self.subTest(campo=campo, valor=valor):
                respuesta = self.patch({campo: valor, "nombre": "Cambiado"})
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {campo: ["Campo no permitido."]})
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.estado, EstadoTaller.APROBADO)
        self.assertEqual((self.aprobado.revisado_por_id, self.aprobado.revisado_en), revision)
        self.assertEqual(self.aprobado.propietario.telefono, "82222222")
        self.assertEqual(self.aprobado.nombre, "Barro y Sombra")
        self.assertFalse(Taller.objects.filter(propietario=otro).exists())

    def test_valida_los_datos(self):
        respuesta = self.patch({"nombre": "  ", "rubro": "", "sitio_web": "ftp://x.ni"})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()), {"nombre", "rubro", "sitio_web"})
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.nombre, "Barro y Sombra")

    def test_solo_modifica_el_taller_propio(self):
        self.patch({"nombre": "Barro y Sombra Masaya"})
        self.pendiente.refresh_from_db()
        self.assertEqual(self.pendiente.nombre, "Hamacas Membreño")

    def test_metodos_no_admitidos(self):
        for metodo in ("post", "put", "delete"):
            with self.subTest(metodo=metodo):
                self.assertEqual(
                    getattr(self.client, metodo)(URL_MI_TALLER, {}, format="json").status_code, 405
                )
