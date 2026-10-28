"""El registro del artesano crea la cuenta y su taller pendiente en una transacción (RF-004,
RF-008, RN-002); el del comprador no crea taller."""

from decimal import Decimal
from unittest import mock

from django.core.exceptions import ValidationError

from apps.accounts import services as cuentas
from apps.accounts.models import Rol, Usuario
from apps.accounts.tests.base import (
    PASSWORD,
    URL_REGISTRO_ARTESANO,
    URL_REGISTRO_COMPRADOR,
    AuthAPITestCase,
)
from apps.talleres import services
from apps.talleres.models import EstadoTaller, Taller

from .base import datos_taller


def datos_registro(**taller):
    return {
        "nombre": "Ana Lucía Delgado",
        "telefono": "8555 1234",
        "password": PASSWORD,
        "taller": datos_taller(**taller),
    }


class RegistroArtesanoTests(AuthAPITestCase):
    def assertSinCuentasNiTalleres(self):
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())

    def test_crea_cuenta_y_taller_pendiente(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_ARTESANO,
            datos_registro(
                historia="Taller familiar fundado en 1985.",
                horario="Lunes a sábado, 8:00 a 17:00",
                telefono_publico="8777-6655",
                whatsapp_publico="+505 8777 6655",
                facebook_url="https://facebook.com/ceramicalopez",
                instagram_url="https://instagram.com/ceramicalopez",
                sitio_web="https://ceramicalopez.ni",
            ),
        )

        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        usuario = Usuario.objects.get()
        self.assertEqual(usuario.rol, Rol.ARTESANO)
        taller = Taller.objects.get()
        self.assertEqual(taller.propietario, usuario)
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)
        self.assertIsNone(taller.revisado_por)
        self.assertIsNone(taller.revisado_en)
        self.assertEqual(taller.nombre, "Cerámica López")
        self.assertEqual(taller.rubro, "Cerámica artesanal")
        self.assertEqual(taller.historia, "Taller familiar fundado en 1985.")
        self.assertEqual(taller.telefono_publico, "87776655")
        self.assertEqual(taller.whatsapp_publico, "87776655")
        self.assertEqual(taller.sitio_web, "https://ceramicalopez.ni")
        # La respuesta de registro no cambia en AUD-02: sesión e identidad de la cuenta.
        self.assertEqual(set(respuesta.json()), {"access", "usuario"})
        self.assertEqual(
            respuesta.json()["usuario"],
            {
                "id": usuario.pk,
                "nombre": "Ana Lucía Delgado",
                "telefono": "85551234",
                "rol": "artesano",
            },
        )

    def test_basta_con_los_datos_minimos(self):
        respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro())
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        taller = Taller.objects.get()
        self.assertEqual((taller.historia, taller.horario), ("", ""))

    def test_el_telefono_de_acceso_no_se_vuelve_contacto_publico(self):
        self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro())
        taller = Taller.objects.get()
        self.assertEqual(taller.telefono_publico, "")
        self.assertEqual(taller.whatsapp_publico, "")

    def test_sin_datos_del_taller(self):
        cuerpo = datos_registro()
        del cuerpo["taller"]
        respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, cuerpo)
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()), {"taller"})
        self.assertSinCuentasNiTalleres()

    def test_sin_los_campos_minimos_del_taller(self):
        cuerpo = datos_registro() | {"taller": {"historia": "Desde 1985."}}
        respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, cuerpo)
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()["taller"]), {"nombre", "rubro", "direccion_completa"})
        self.assertSinCuentasNiTalleres()

    def test_campos_minimos_en_blanco(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_ARTESANO, datos_registro(nombre="  ", rubro="", direccion_completa=" ")
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()["taller"]), {"nombre", "rubro", "direccion_completa"})
        self.assertSinCuentasNiTalleres()

    def test_contactos_invalidos(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_ARTESANO,
            datos_registro(whatsapp_publico="1234", sitio_web="javascript:alert(1)"),
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()["taller"]), {"whatsapp_publico", "sitio_web"})
        self.assertSinCuentasNiTalleres()

    def test_el_cliente_no_fija_estado_ni_revision(self):
        for campo, valor in [
            ("estado", "aprobado"),
            ("propietario", 1),
            ("revisado_por", 1),
            ("revisado_en", "2026-10-14T00:00:00Z"),
            ("motivo_rechazo", "x"),
            ("creado_en", "2026-10-14T00:00:00Z"),
            ("id", 99),
        ]:
            with self.subTest(campo=campo):
                respuesta = self.post_con_csrf(
                    URL_REGISTRO_ARTESANO, datos_registro(**{campo: valor})
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(respuesta.json(), {"taller": {campo: ["Campo no permitido."]}})
        self.assertSinCuentasNiTalleres()

    def test_telefono_duplicado_no_crea_taller(self):
        self.assertEqual(
            self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro()).status_code, 201
        )
        respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro(nombre="Otro"))
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(
            respuesta.json(), {"telefono": ["Ya existe una cuenta con este teléfono."]}
        )
        self.assertEqual(Usuario.objects.count(), 1)
        self.assertEqual(Taller.objects.count(), 1)


class RegistroConUbicacionTests(AuthAPITestCase):
    """La ubicación es opcional en el alta; el registro anterior no cambia (FEAT-GEO-01)."""

    def assertSinCuentasNiTalleres(self):
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())

    def test_registro_sin_ubicacion_sigue_funcionando(self):
        respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro())
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        taller = Taller.objects.get()
        self.assertIsNone(taller.latitud)
        self.assertIsNone(taller.longitud)
        self.assertFalse(taller.ubicacion_publica)

    def test_registro_con_ubicacion_privada(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_ARTESANO, datos_registro(latitud=11.971234, longitud=-86.095678)
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        taller = Taller.objects.get()
        self.assertEqual(taller.latitud, Decimal("11.971234"))
        self.assertEqual(taller.longitud, Decimal("-86.095678"))
        self.assertFalse(taller.ubicacion_publica)
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)

    def test_registro_con_ubicacion_publica(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_ARTESANO,
            datos_registro(latitud="11.971234", longitud="-86.095678", ubicacion_publica=True),
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        taller = Taller.objects.get()
        self.assertTrue(taller.ubicacion_publica)
        self.assertEqual(taller.estado, EstadoTaller.PENDIENTE)

    def test_ubicacion_invalida_no_crea_nada(self):
        for ubicacion, campo in [
            ({"latitud": 11.97}, "longitud"),
            ({"longitud": -86.09}, "latitud"),
            ({"ubicacion_publica": True}, "ubicacion_publica"),
            ({"latitud": 95, "longitud": -86.09}, "latitud"),
        ]:
            with self.subTest(ubicacion=ubicacion):
                respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro(**ubicacion))
                self.assertEqual(respuesta.status_code, 400)
                self.assertEqual(set(respuesta.json()), {"taller"})
                self.assertIn(campo, respuesta.json()["taller"])
                self.assertSinCuentasNiTalleres()


class AtomicidadDelRegistroTests(AuthAPITestCase):
    """Cuenta y taller se crean juntos o no se crea ninguno."""

    def test_si_el_taller_falla_no_queda_la_cuenta(self):
        with mock.patch.object(
            services, "crear_taller_pendiente", side_effect=RuntimeError("fallo del taller")
        ):
            with self.assertRaises(RuntimeError):
                cuentas.registrar_artesano(
                    nombre="Ana", telefono="85551234", password=PASSWORD, taller=datos_taller()
                )
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())

    def test_si_la_operacion_falla_tras_crear_el_taller_no_queda_ninguno(self):
        crear_real = services.crear_taller_pendiente

        def crea_y_falla(**kwargs):
            crear_real(**kwargs)
            self.assertEqual(Taller.objects.count(), 1)  # el taller llegó a existir
            raise RuntimeError("fallo posterior")

        with mock.patch.object(services, "crear_taller_pendiente", side_effect=crea_y_falla):
            with self.assertRaises(RuntimeError):
                cuentas.registrar_artesano(
                    nombre="Ana", telefono="85551234", password=PASSWORD, taller=datos_taller()
                )
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())

    def test_taller_invalido_en_el_servicio_deshace_la_cuenta(self):
        with self.assertRaises(ValidationError):
            cuentas.registrar_artesano(
                nombre="Ana",
                telefono="85551234",
                password=PASSWORD,
                taller=datos_taller(rubro="   "),
            )
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())

    def test_la_validacion_del_modelo_responde_400_sin_crear_nada(self):
        """Un error que solo detecta el modelo también deshace la cuenta y responde 400."""
        crear_real = services.crear_taller_pendiente

        def con_rubro_invalido(**kwargs):
            return crear_real(**(kwargs | {"rubro": "   "}))

        with mock.patch.object(services, "crear_taller_pendiente", side_effect=con_rubro_invalido):
            respuesta = self.post_con_csrf(URL_REGISTRO_ARTESANO, datos_registro())
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(set(respuesta.json()), {"taller"})
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())


class RegistroCompradorTests(AuthAPITestCase):
    def test_el_comprador_no_tiene_taller(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_COMPRADOR,
            {"nombre": "Ana Lucía Delgado", "telefono": "8555 1234", "password": PASSWORD},
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        comprador = Usuario.objects.get()
        self.assertEqual(comprador.rol, Rol.COMPRADOR)
        self.assertFalse(Taller.objects.filter(propietario=comprador).exists())
        self.assertFalse(Taller.objects.exists())

    def test_el_registro_del_comprador_no_acepta_taller(self):
        respuesta = self.post_con_csrf(
            URL_REGISTRO_COMPRADOR,
            {
                "nombre": "Ana Lucía Delgado",
                "telefono": "8555 1234",
                "password": PASSWORD,
                "taller": datos_taller(),
            },
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json(), {"taller": ["Campo no permitido."]})
        self.assertFalse(Usuario.objects.exists())
        self.assertFalse(Taller.objects.exists())
