"""Tasa de cambio administrada (RF-007, RF-013.4; D-AUD14-05/06/08/09)."""

from decimal import Decimal

from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import Rol, Usuario
from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.configuracion import services
from apps.configuracion.models import CambioTasaCambio, ConfiguracionPlataforma
from apps.talleres.tests.base import crear_administrador

from .base import (
    URL_ADMIN,
    URL_ADMIN_CAMBIO,
    URL_CONFIGURACION,
    administrador_de_tasa,
)


def configuracion() -> ConfiguracionPlataforma:
    return ConfiguracionPlataforma.objects.get(pk=1)


class SingletonTests(TestCase):
    def test_la_migracion_crea_el_singleton_sin_tasa(self):
        actual = configuracion()
        self.assertIsNone(actual.tasa_cambio_usd_nio)
        self.assertIsNone(actual.actualizada_por)
        self.assertIsNone(actual.actualizada_en)
        self.assertEqual(ConfiguracionPlataforma.objects.count(), 1)
        self.assertFalse(CambioTasaCambio.objects.exists())

    def test_segunda_fila_imposible_en_la_base_de_datos(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConfiguracionPlataforma.objects.bulk_create([ConfiguracionPlataforma(id=2)])
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConfiguracionPlataforma.objects.bulk_create([ConfiguracionPlataforma(id=1)])

    def test_tasa_sin_actor_o_actor_sin_tasa_es_incoherente(self):
        admin = crear_administrador()
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConfiguracionPlataforma.objects.filter(pk=1).update(tasa_cambio_usd_nio=Decimal("36"))
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConfiguracionPlataforma.objects.filter(pk=1).update(actualizada_por=admin)

    def test_tasa_cero_o_negativa_imposible_en_la_base_de_datos(self):
        admin = crear_administrador()
        for valor in ("0", "-1"):
            with self.assertRaises(IntegrityError), transaction.atomic():
                ConfiguracionPlataforma.objects.filter(pk=1).update(
                    tasa_cambio_usd_nio=Decimal(valor),
                    actualizada_por=admin,
                    actualizada_en="2026-10-25T10:00:00Z",
                )

    def test_no_se_elimina(self):
        with self.assertRaises(ValidationError):
            configuracion().delete()


class ServicioTasaTests(TestCase):
    def setUp(self):
        self.admin = administrador_de_tasa()

    def test_actualiza_registra_actor_fecha_e_historial(self):
        self.assertTrue(services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa="36.8500"))
        actual = configuracion()
        self.assertEqual(actual.tasa_cambio_usd_nio, Decimal("36.8500"))
        self.assertEqual(actual.actualizada_por, self.admin)
        self.assertIsNotNone(actual.actualizada_en)
        cambio = CambioTasaCambio.objects.get()
        self.assertEqual(
            (cambio.tasa_anterior, cambio.tasa_nueva, cambio.actor),
            (None, Decimal("36.8500"), self.admin),
        )
        self.assertEqual(cambio.creado_en, actual.actualizada_en)

    def test_segundo_cambio_conserva_la_tasa_anterior(self):
        services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa=Decimal("40"))
        services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa=Decimal("50"))
        anteriores = list(
            CambioTasaCambio.objects.order_by("id").values_list("tasa_anterior", "tasa_nueva")
        )
        self.assertEqual(anteriores, [(None, Decimal("40")), (Decimal("40"), Decimal("50"))])
        self.assertEqual(configuracion().tasa_cambio_usd_nio, Decimal("50"))

    def test_misma_tasa_no_crea_evento_ni_cambia_fecha(self):
        services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa=Decimal("36.8"))
        fecha = configuracion().actualizada_en
        otro = administrador_de_tasa("88886666")
        self.assertFalse(services.actualizar_tasa_cambio(actor=otro, nueva_tasa="36.8000"))
        actual = configuracion()
        self.assertEqual((actual.actualizada_en, actual.actualizada_por), (fecha, self.admin))
        self.assertEqual(CambioTasaCambio.objects.count(), 1)

    def test_rechaza_tasas_no_positivas_o_mal_formadas(self):
        for valor in ("0", "0.0000", "-36.8", "abc", None, "NaN", "Infinity"):
            with self.subTest(valor=valor), self.assertRaises(ValidationError):
                services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa=valor)
        self.assertIsNone(configuracion().tasa_cambio_usd_nio)
        self.assertFalse(CambioTasaCambio.objects.exists())

    def test_precision_decimal(self):
        services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa="0.0001")
        self.assertEqual(configuracion().tasa_cambio_usd_nio, Decimal("0.0001"))
        services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa="999999.9999")
        self.assertEqual(configuracion().tasa_cambio_usd_nio, Decimal("999999.9999"))
        # Sin redondeo silencioso: más de cuatro decimales o más de 10 dígitos se rechazan.
        for valor in ("36.80001", "1000000.0000"):
            with self.subTest(valor=valor), self.assertRaises(ValidationError):
                services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa=valor)
        self.assertEqual(configuracion().tasa_cambio_usd_nio, Decimal("999999.9999"))

    def test_actor_sin_permiso_inactivo_o_sin_rol_rechazado(self):
        sin_permiso = crear_administrador("88886666")
        inactivo = administrador_de_tasa("88885555", is_active=False)
        comprador = crear_usuario("86666666", rol=Rol.COMPRADOR)
        for actor in (sin_permiso, inactivo, comprador, None):
            with self.subTest(actor=actor), self.assertRaises(services.ActorNoAutorizado):
                services.actualizar_tasa_cambio(actor=actor, nueva_tasa="36.8")
        self.assertIsNone(configuracion().tasa_cambio_usd_nio)

    def test_historial_append_only(self):
        services.actualizar_tasa_cambio(actor=self.admin, nueva_tasa="36.8")
        cambio = CambioTasaCambio.objects.get()
        cambio.tasa_nueva = Decimal("1")
        with self.assertRaises(ValidationError):
            cambio.save()
        with self.assertRaises(ValidationError):
            cambio.delete()
        self.assertEqual(CambioTasaCambio.objects.get().tasa_nueva, Decimal("36.8"))


class ConfiguracionPublicaAPITests(APITestCase):
    def test_get_publico_sin_tasa(self):
        respuesta = self.client.get(URL_CONFIGURACION)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json(), {"tasa_cambio": None, "actualizada_en": None})

    def test_get_con_tasa_decimal_como_texto(self):
        services.actualizar_tasa_cambio(actor=administrador_de_tasa(), nueva_tasa="36.85")
        datos = self.client.get(URL_CONFIGURACION).json()
        self.assertEqual(datos["tasa_cambio"], "36.8500")
        self.assertIsNotNone(datos["actualizada_en"])
        self.assertEqual(set(datos), {"tasa_cambio", "actualizada_en"})  # sin actor

    def test_token_invalido_no_bloquea(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer token-caducado")
        self.assertEqual(self.client.get(URL_CONFIGURACION).status_code, 200)

    def test_sin_escritura_por_la_api(self):
        for metodo in ("post", "put", "patch", "delete"):
            respuesta = getattr(self.client, metodo)(
                URL_CONFIGURACION, {"tasa_cambio": "1"}, format="json"
            )
            self.assertEqual(respuesta.status_code, 405, metodo)
        self.assertIsNone(configuracion().tasa_cambio_usd_nio)

    def test_no_usa_idempotency_key(self):
        respuesta = self.client.get(URL_CONFIGURACION, HTTP_IDEMPOTENCY_KEY="no-aplica")
        self.assertEqual(respuesta.status_code, 200)


class TasaEnAdminTests(TestCase):
    def setUp(self):
        self.admin = administrador_de_tasa()
        self.client.force_login(self.admin)

    def test_listado_lleva_al_singleton(self):
        respuesta = self.client.get(URL_ADMIN)
        self.assertRedirects(respuesta, URL_ADMIN_CAMBIO)

    def test_actualiza_por_el_servicio(self):
        self.assertEqual(self.client.get(URL_ADMIN_CAMBIO).status_code, 200)
        respuesta = self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "36.8500"})
        self.assertEqual(respuesta.status_code, 302)
        actual = configuracion()
        self.assertEqual(actual.tasa_cambio_usd_nio, Decimal("36.8500"))
        self.assertEqual(actual.actualizada_por, self.admin)
        cambio = CambioTasaCambio.objects.get()
        self.assertEqual(cambio.actor, self.admin)
        self.assertContains(self.client.get(URL_ADMIN_CAMBIO), "36.8500")

    def test_actor_del_formulario_ignorado(self):
        otro = crear_administrador("88886666")
        self.client.post(
            URL_ADMIN_CAMBIO,
            {
                "tasa_cambio_usd_nio": "40",
                "actualizada_por": otro.pk,
                "actualizada_en": "2020-01-01",
            },
        )
        actual = configuracion()
        self.assertEqual(actual.actualizada_por, self.admin)
        self.assertNotEqual(actual.actualizada_en.year, 2020)

    def test_misma_tasa_sin_evento(self):
        self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "40"})
        respuesta = self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "40.0000"})
        self.assertEqual(respuesta.status_code, 302)
        self.assertEqual(CambioTasaCambio.objects.count(), 1)

    def test_valores_invalidos_no_guardan(self):
        for valor in ("0", "-5", "", "36.12345", "abc"):
            respuesta = self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": valor})
            self.assertEqual(respuesta.status_code, 200, valor)  # formulario con errores
        self.assertIsNone(configuracion().tasa_cambio_usd_nio)
        self.assertFalse(CambioTasaCambio.objects.exists())

    def test_sin_add_ni_delete(self):
        self.assertEqual(self.client.get(f"{URL_ADMIN}add/").status_code, 403)
        self.assertEqual(
            self.client.post(f"{URL_ADMIN}1/delete/", {"post": "yes"}).status_code, 403
        )
        self.assertTrue(ConfiguracionPlataforma.objects.filter(pk=1).exists())

    def test_solo_lectura_sin_permiso_de_cambio(self):
        lector = crear_administrador("88886666")
        lector.user_permissions.add(Permission.objects.get(codename="view_configuracionplataforma"))
        self.client.force_login(lector)
        self.assertEqual(self.client.get(URL_ADMIN_CAMBIO).status_code, 200)
        respuesta = self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "40"})
        self.assertEqual(respuesta.status_code, 403)
        self.assertIsNone(configuracion().tasa_cambio_usd_nio)

    def test_sin_permisos_no_entra(self):
        self.client.force_login(crear_administrador("88886666"))
        self.assertEqual(self.client.get(URL_ADMIN_CAMBIO).status_code, 403)
        self.assertEqual(
            self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "1"}).status_code, 403
        )

    def test_comprador_y_artesano_no_entran_al_admin(self):
        for rol, telefono in ((Rol.COMPRADOR, "86666666"), (Rol.ARTESANO, "82222222")):
            usuario = crear_usuario(telefono, rol=rol)
            self.client.force_login(usuario)
            respuesta = self.client.get(URL_ADMIN_CAMBIO)
            self.assertEqual(respuesta.status_code, 302, rol)
            self.assertIn("/admin/login/", respuesta["Location"])

    def test_superusuario_tambien_pasa_por_el_servicio(self):
        superusuario = Usuario.objects.create_superuser(
            telefono="89990000", password=PASSWORD, nombre="Mantenimiento"
        )
        self.client.force_login(superusuario)
        self.client.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "41"})
        self.assertEqual(CambioTasaCambio.objects.get().actor, superusuario)

    def test_admin_exige_csrf(self):
        cliente = Client(enforce_csrf_checks=True)
        cliente.force_login(self.admin)
        respuesta = cliente.post(URL_ADMIN_CAMBIO, {"tasa_cambio_usd_nio": "40"})
        self.assertEqual(respuesta.status_code, 403)
        self.assertIsNone(configuracion().tasa_cambio_usd_nio)
