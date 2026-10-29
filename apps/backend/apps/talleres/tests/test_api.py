"""API de talleres: perfil público solo si está aprobado y taller propio del artesano
(RF-008, RN-002, RN-006, RNF-004, RNF-013)."""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from apps.accounts.api.tokens import emitir_tokens
from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.talleres import services
from apps.talleres.models import CAMPOS_PERFIL, CAMPOS_UBICACION, EstadoTaller, Taller

from .base import (
    URL_MI_TALLER,
    URL_TALLERES,
    crear_administrador,
    crear_artesano_con_taller,
    url_taller,
)

CAMPOS_PUBLICOS = {
    "id",
    *CAMPOS_PERFIL,
    "imagen_perfil_url",
    "imagen_portada_url",
    "ubicacion_mapa",
}


def imagen_prueba_taller(formato="PNG", nombre="original.png"):
    contenido = BytesIO()
    Image.new("RGB", (8, 6), "blue").save(contenido, format=formato)
    return SimpleUploadedFile(nombre, contenido.getvalue(), content_type="image/png")


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


class ImagenesTallerTests(TalleresAPITestCase):
    def setUp(self):
        super().setUp()
        self.temporal = TemporaryDirectory(prefix="taller-img-")
        self.addCleanup(self.temporal.cleanup)
        configuracion = override_settings(MEDIA_ROOT=self.temporal.name)
        configuracion.enable()
        self.addCleanup(configuracion.disable)
        self.autenticar(self.aprobado.propietario)

    def test_subir_solo_perfil_y_luego_solo_portada_conserva_la_otra(self):
        r1 = self.client.patch(
            URL_MI_TALLER,
            {"imagen_perfil": imagen_prueba_taller("PNG", "logo.png")},
            format="multipart",
        )
        self.assertEqual(r1.status_code, 200, r1.content)
        datos1 = r1.json()
        self.assertIsNotNone(datos1["imagen_perfil_url"])
        self.assertIsNone(datos1["imagen_portada_url"])
        self.aprobado.refresh_from_db()
        ruta_perfil_inicial = self.aprobado.imagen_perfil.path
        self.assertTrue(Path(ruta_perfil_inicial).is_file())
        self.assertRegex(
            self.aprobado.imagen_perfil.name,
            r"^talleres/[a-f0-9]{32}/perfil/[a-f0-9]{32}\.png$",
        )

        # Ahora subir solo portada: debe conservar imagen_perfil intacta.
        r2 = self.client.patch(
            URL_MI_TALLER,
            {"imagen_portada": imagen_prueba_taller("JPEG", "portada.jpg")},
            format="multipart",
        )
        self.assertEqual(r2.status_code, 200, r2.content)
        datos2 = r2.json()
        self.assertEqual(datos2["imagen_perfil_url"], datos1["imagen_perfil_url"])
        self.assertIsNotNone(datos2["imagen_portada_url"])
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.imagen_perfil.path, ruta_perfil_inicial)
        self.assertTrue(Path(self.aprobado.imagen_portada.path).is_file())
        self.assertRegex(
            self.aprobado.imagen_portada.name,
            r"^talleres/[a-f0-9]{32}/portada/[a-f0-9]{32}\.jpg$",
        )

        # Vista pública muestra ambas URLs.
        publico = self.client.get(url_taller(self.aprobado.pk)).json()
        self.assertEqual(publico["imagen_perfil_url"], datos2["imagen_perfil_url"])
        self.assertEqual(publico["imagen_portada_url"], datos2["imagen_portada_url"])

    def test_subir_ambas_y_reemplazar_elimina_archivo_anterior_tras_commit(self):
        r1 = self.client.patch(
            URL_MI_TALLER,
            {
                "imagen_perfil": imagen_prueba_taller("PNG"),
                "imagen_portada": imagen_prueba_taller("WEBP"),
            },
            format="multipart",
        )
        self.assertEqual(r1.status_code, 200, r1.content)
        self.aprobado.refresh_from_db()
        anterior_perfil = self.aprobado.imagen_perfil.path
        anterior_portada = self.aprobado.imagen_portada.path

        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            r2 = self.client.patch(
                URL_MI_TALLER,
                {"imagen_perfil": imagen_prueba_taller("JPEG")},
                format="multipart",
            )
            self.assertEqual(r2.status_code, 200, r2.content)
            self.assertTrue(Path(anterior_perfil).exists())
        self.assertEqual(len(callbacks), 1)
        self.aprobado.refresh_from_db()
        self.assertFalse(Path(anterior_perfil).exists())
        self.assertTrue(Path(self.aprobado.imagen_perfil.path).exists())
        self.assertEqual(self.aprobado.imagen_portada.path, anterior_portada)
        self.assertTrue(Path(anterior_portada).exists())

    def test_rechaza_archivos_invalidos_pesados_corruptos_y_base64(self):
        limite = 5 * 1024 * 1024
        base_png = imagen_prueba_taller().read()
        archivos_invalidos = [
            imagen_prueba_taller("GIF", "anim.gif"),
            SimpleUploadedFile("vector.svg", b"<svg></svg>", "image/svg+xml"),
            SimpleUploadedFile("falso.jpg", b"no es imagen", "image/jpeg"),
            SimpleUploadedFile("corrupto.png", b"\x89PNG\r\n\x1a\ncorrupto", "image/png"),
            SimpleUploadedFile(
                "grande.png", base_png + b"0" * (limite + 1 - len(base_png)), "image/png"
            ),
        ]
        for campo in ("imagen_perfil", "imagen_portada"):
            for archivo in archivos_invalidos:
                with self.subTest(campo=campo, archivo=archivo.name):
                    archivo.seek(0)
                    r = self.client.patch(URL_MI_TALLER, {campo: archivo}, format="multipart")
                    self.assertEqual(r.status_code, 400, r.content)
                    self.assertIn(campo, r.json())
            for texto in (
                "data:image/png;base64,iVBORw0KGgo=",
                "/etc/passwd",
                "https://x.ni/a.jpg",
            ):
                with self.subTest(campo=campo, texto=texto):
                    r = self.client.patch(URL_MI_TALLER, {campo: texto}, format="json")
                    self.assertEqual(r.status_code, 400, r.content)
                    self.assertIn(campo, r.json())
        self.assertEqual(list(Path(self.temporal.name).rglob("*")), [])


LATITUD = Decimal("11.971234")
LONGITUD = Decimal("-86.095678")


def ubicar(taller, *, publica):
    services.actualizar_perfil(
        taller, latitud=LATITUD, longitud=LONGITUD, ubicacion_publica=publica
    )


class UbicacionMiTallerTests(TalleresAPITestCase):
    """El artesano gestiona la ubicación de su taller con el contrato existente."""

    def setUp(self):
        super().setUp()
        self.autenticar(self.aprobado.propietario)

    def patch(self, datos):
        return self.client.patch(URL_MI_TALLER, datos, format="json")

    def test_consulta_devuelve_la_ubicacion_aunque_sea_privada(self):
        cuerpo = self.client.get(URL_MI_TALLER).json()
        self.assertEqual(
            {campo: cuerpo[campo] for campo in CAMPOS_UBICACION},
            {"latitud": None, "longitud": None, "ubicacion_publica": False},
        )
        ubicar(self.aprobado, publica=False)
        cuerpo = self.client.get(URL_MI_TALLER).json()
        self.assertEqual(
            {campo: cuerpo[campo] for campo in CAMPOS_UBICACION},
            {"latitud": "11.971234", "longitud": "-86.095678", "ubicacion_publica": False},
        )

    def test_guarda_la_ubicacion(self):
        revision = (self.aprobado.revisado_por_id, self.aprobado.revisado_en)
        respuesta = self.patch(
            {"latitud": 11.971234, "longitud": -86.095678, "ubicacion_publica": True}
        )
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()["latitud"], "11.971234")
        self.assertEqual(respuesta.json()["longitud"], "-86.095678")
        self.assertTrue(respuesta.json()["ubicacion_publica"])
        self.aprobado.refresh_from_db()
        self.assertEqual((self.aprobado.latitud, self.aprobado.longitud), (LATITUD, LONGITUD))
        self.assertEqual(self.aprobado.estado, EstadoTaller.APROBADO)
        self.assertEqual((self.aprobado.revisado_por_id, self.aprobado.revisado_en), revision)

    def test_parcial_modifica_una_coordenada_si_la_otra_existe(self):
        ubicar(self.aprobado, publica=True)
        respuesta = self.patch({"latitud": "11.971"})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.latitud, Decimal("11.971"))
        self.assertEqual(self.aprobado.longitud, LONGITUD)
        self.assertTrue(self.aprobado.ubicacion_publica)

    def test_parcial_publica_una_ubicacion_ya_registrada(self):
        ubicar(self.aprobado, publica=False)
        respuesta = self.patch({"ubicacion_publica": True})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.aprobado.refresh_from_db()
        self.assertTrue(self.aprobado.ubicacion_publica)

    def test_pareja_incompleta(self):
        for datos, campo in [
            ({"latitud": 11.97}, "longitud"),
            ({"longitud": -86.09}, "latitud"),
            ({"latitud": 11.97, "longitud": None}, "longitud"),
        ]:
            with self.subTest(datos=datos):
                respuesta = self.patch(datos)
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(set(respuesta.json()), {campo})
        self.aprobado.refresh_from_db()
        self.assertIsNone(self.aprobado.latitud)
        self.assertIsNone(self.aprobado.longitud)

    def test_parcial_no_deja_media_pareja(self):
        ubicar(self.aprobado, publica=False)
        respuesta = self.patch({"longitud": None})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()), {"longitud"})
        self.aprobado.refresh_from_db()
        self.assertEqual(self.aprobado.longitud, LONGITUD)

    def test_rango_y_formato_invalidos(self):
        for datos, campo in [
            ({"latitud": 90.000001, "longitud": 0}, "latitud"),
            ({"latitud": -91, "longitud": 0}, "latitud"),
            ({"latitud": 0, "longitud": 180.5}, "longitud"),
            ({"latitud": 0, "longitud": -181}, "longitud"),
            ({"latitud": "norte", "longitud": 0}, "latitud"),
            ({"latitud": "11.1234567", "longitud": 0}, "latitud"),
        ]:
            with self.subTest(datos=datos):
                respuesta = self.patch(datos)
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn(campo, respuesta.json())
        self.aprobado.refresh_from_db()
        self.assertIsNone(self.aprobado.latitud)

    def test_publica_sin_coordenadas(self):
        for datos in (
            {"ubicacion_publica": True},
            {"latitud": None, "longitud": None, "ubicacion_publica": True},
        ):
            with self.subTest(datos=datos):
                respuesta = self.patch(datos)
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(set(respuesta.json()), {"ubicacion_publica"})
        self.aprobado.refresh_from_db()
        self.assertFalse(self.aprobado.ubicacion_publica)

    def test_limpiar_la_ubicacion(self):
        ubicar(self.aprobado, publica=True)
        respuesta = self.patch({"latitud": None, "longitud": None, "ubicacion_publica": False})
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(
            {campo: respuesta.json()[campo] for campo in CAMPOS_UBICACION},
            {"latitud": None, "longitud": None, "ubicacion_publica": False},
        )
        self.aprobado.refresh_from_db()
        self.assertIsNone(self.aprobado.latitud)
        self.assertIsNone(self.aprobado.longitud)
        self.assertIsNone(self.client.get(url_taller(self.aprobado.pk)).json()["ubicacion_mapa"])

    def test_no_acepta_la_ubicacion_publica_como_entrada(self):
        respuesta = self.patch({"ubicacion_mapa": {"latitud": 1, "longitud": 1}})
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json(), {"ubicacion_mapa": ["Campo no permitido."]})

    def test_solo_el_artesano_propietario_edita_la_ubicacion(self):
        datos = {"latitud": 11.97, "longitud": -86.09, "ubicacion_publica": True}
        self.autenticar(crear_usuario("81111111", rol=Rol.COMPRADOR))
        self.assertEqual(self.patch(datos).status_code, 403)
        # Las cuentas de administración no usan la API (política de autenticación vigente).
        self.autenticar(self.admin)
        self.assertEqual(self.patch(datos).status_code, 401)
        self.client.credentials()
        self.assertEqual(self.patch(datos).status_code, 401)
        self.assertFalse(Taller.objects.filter(latitud__isnull=False).exists())


class UbicacionPublicaTests(TalleresAPITestCase):
    """La API pública solo entrega coordenadas autorizadas de talleres aprobados."""

    def ubicacion_en_lista(self, taller):
        (cuerpo,) = [t for t in self.client.get(URL_TALLERES).json() if t["id"] == taller.pk]
        return cuerpo["ubicacion_mapa"]

    def test_aprobado_con_ubicacion_publica(self):
        ubicar(self.aprobado, publica=True)
        esperado = {"latitud": "11.971234", "longitud": "-86.095678"}
        self.assertEqual(self.ubicacion_en_lista(self.aprobado), esperado)
        detalle = self.client.get(url_taller(self.aprobado.pk)).json()
        self.assertEqual(detalle["ubicacion_mapa"], esperado)

    def test_aprobado_con_ubicacion_privada(self):
        ubicar(self.aprobado, publica=False)
        self.assertIsNone(self.ubicacion_en_lista(self.aprobado))
        respuesta = self.client.get(url_taller(self.aprobado.pk))
        self.assertIsNone(respuesta.json()["ubicacion_mapa"])
        # Las coordenadas privadas no se filtran por ningún otro campo.
        for contenido in (respuesta.content, self.client.get(URL_TALLERES).content):
            self.assertNotIn("11.971234", contenido.decode())
            self.assertNotIn("86.095678", contenido.decode())

    def test_aprobado_sin_ubicacion(self):
        self.assertIsNone(self.ubicacion_en_lista(self.aprobado))
        self.assertIsNone(self.client.get(url_taller(self.aprobado.pk)).json()["ubicacion_mapa"])

    def test_no_expone_las_coordenadas_sueltas(self):
        ubicar(self.aprobado, publica=True)
        for cuerpo in (
            self.client.get(url_taller(self.aprobado.pk)).json(),
            self.client.get(URL_TALLERES).json()[0],
        ):
            self.assertEqual(set(cuerpo), CAMPOS_PUBLICOS)
            for campo in CAMPOS_UBICACION:
                self.assertNotIn(campo, cuerpo)

    def test_pendientes_y_rechazados_siguen_ocultos(self):
        for taller in (self.pendiente, self.rechazado):
            ubicar(taller, publica=True)
        ids = [t["id"] for t in self.client.get(URL_TALLERES).json()]
        self.assertEqual(ids, [self.aprobado.pk])
        for taller in (self.pendiente, self.rechazado):
            with self.subTest(estado=taller.estado):
                self.assertEqual(self.client.get(url_taller(taller.pk)).status_code, 404)

    def test_solo_un_taller_aprobado_publica_su_posicion(self):
        for taller in (self.pendiente, self.rechazado):
            ubicar(taller, publica=True)
            taller.refresh_from_db()
            self.assertFalse(taller.publica_ubicacion)
        ubicar(self.aprobado, publica=True)
        self.aprobado.refresh_from_db()
        self.assertTrue(self.aprobado.publica_ubicacion)
