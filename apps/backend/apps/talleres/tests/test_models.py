"""Invariantes del taller garantizadas por el modelo y por PostgreSQL (RF-008, RF-013)."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Usuario
from apps.talleres.models import CAMPOS_PERFIL, EstadoTaller, Taller

from .base import crear_administrador, crear_artesano_con_taller


class EstadosTests(TestCase):
    def test_estados_de_la_v1(self):
        self.assertEqual(EstadoTaller.values, ["pendiente", "aprobado", "rechazado"])

    def test_no_existe_el_estado_suspendido(self):
        self.assertNotIn("suspendido", EstadoTaller.values)
        taller = crear_artesano_con_taller()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Taller.objects.filter(pk=taller.pk).update(estado="suspendido")

    def test_un_taller_nuevo_nace_pendiente(self):
        self.assertEqual(Taller._meta.get_field("estado").default, EstadoTaller.PENDIENTE)
        self.assertEqual(crear_artesano_con_taller().estado, EstadoTaller.PENDIENTE)


class RubroTests(TestCase):
    def test_rubro_es_texto_propio_del_taller(self):
        taller = crear_artesano_con_taller(rubro="Cerámica artesanal")
        taller.refresh_from_db()
        self.assertEqual(taller.rubro, "Cerámica artesanal")
        self.assertEqual(Taller._meta.get_field("rubro").get_internal_type(), "CharField")

    def test_no_depende_de_categorias(self):
        """El taller solo apunta a cuentas; su rubro no es una categoría (D-AUD02-03).

        Los productos del catálogo apuntan al taller (relación inversa), no al revés.
        """
        propios = {
            campo.related_model
            for campo in Taller._meta.get_fields()
            if campo.is_relation and campo.concrete
        }
        self.assertEqual(propios, {Usuario})
        self.assertNotIn(
            "catalogo.categoria",
            {
                campo.related_model._meta.label_lower
                for campo in Taller._meta.get_fields()
                if campo.is_relation
            },
        )


class RestriccionesTests(TestCase):
    def setUp(self):
        self.taller = crear_artesano_con_taller()

    def assertRechazaActualizacion(self, **campos):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Taller.objects.filter(pk=self.taller.pk).update(**campos)

    def test_un_solo_taller_por_artesano(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Taller.objects.create(
                propietario=self.taller.propietario,
                nombre="Otro",
                rubro="Otro",
                direccion_completa="Masaya",
            )

    def test_datos_minimos_obligatorios(self):
        for campo in ("nombre", "rubro", "direccion_completa"):
            for valor in ("", "   "):
                with self.subTest(campo=campo, valor=valor):
                    self.assertRechazaActualizacion(**{campo: valor})

    def test_contactos_publicos_normalizados(self):
        self.assertRechazaActualizacion(telefono_publico="8777-665")
        self.assertRechazaActualizacion(whatsapp_publico="+5058777")

    def test_revision_coherente_con_el_estado(self):
        admin = crear_administrador()
        # Resuelto sin quién ni cuándo.
        self.assertRechazaActualizacion(estado=EstadoTaller.APROBADO)
        # Pendiente con revisión.
        self.assertRechazaActualizacion(revisado_por=admin, revisado_en=timezone.now())

    def test_motivo_solo_en_rechazados(self):
        self.assertRechazaActualizacion(motivo_rechazo="Datos incompletos")

    def test_el_perfil_no_incluye_campos_de_control(self):
        for campo in ("propietario", "estado", "revisado_por", "revisado_en", "creado_en"):
            self.assertNotIn(campo, CAMPOS_PERFIL)


class UbicacionTests(TestCase):
    """Coordenadas opcionales, siempre en pareja y publicables solo si existen (FEAT-GEO-01)."""

    LATITUD = Decimal("11.971234")
    LONGITUD = Decimal("-86.095678")

    def setUp(self):
        self.taller = crear_artesano_con_taller()

    def validar(self, **ubicacion):
        for campo, valor in ubicacion.items():
            setattr(self.taller, campo, valor)
        self.taller.full_clean()

    def assertInvalida(self, campo, **ubicacion):
        with self.assertRaises(ValidationError) as contexto:
            self.validar(**ubicacion)
        self.assertEqual(set(contexto.exception.message_dict), {campo})

    def test_un_taller_nace_sin_ubicacion_ni_publicacion(self):
        self.taller.refresh_from_db()
        self.assertIsNone(self.taller.latitud)
        self.assertIsNone(self.taller.longitud)
        self.assertFalse(self.taller.ubicacion_publica)
        self.assertFalse(Taller._meta.get_field("ubicacion_publica").default)

    def test_validas(self):
        for ubicacion in (
            {"latitud": None, "longitud": None, "ubicacion_publica": False},
            {"latitud": self.LATITUD, "longitud": self.LONGITUD, "ubicacion_publica": False},
            {"latitud": self.LATITUD, "longitud": self.LONGITUD, "ubicacion_publica": True},
            {"latitud": Decimal("90"), "longitud": Decimal("-180"), "ubicacion_publica": True},
            {"latitud": Decimal("-90"), "longitud": Decimal("180"), "ubicacion_publica": True},
        ):
            with self.subTest(**ubicacion):
                self.validar(**ubicacion)
                self.taller.save()
                self.taller.refresh_from_db()
                self.assertEqual(self.taller.latitud, ubicacion["latitud"])
                self.assertEqual(self.taller.longitud, ubicacion["longitud"])

    def test_pareja_incompleta(self):
        self.assertInvalida("longitud", latitud=self.LATITUD, longitud=None)
        self.assertInvalida("latitud", latitud=None, longitud=self.LONGITUD)

    def test_fuera_de_rango(self):
        for campo, valor in [
            ("latitud", Decimal("90.000001")),
            ("latitud", Decimal("-90.000001")),
            ("longitud", Decimal("180.000001")),
            ("longitud", Decimal("-180.000001")),
        ]:
            with self.subTest(campo=campo, valor=valor):
                ubicacion = {"latitud": self.LATITUD, "longitud": self.LONGITUD, campo: valor}
                self.assertInvalida(campo, **ubicacion)

    def test_publica_sin_coordenadas(self):
        self.assertInvalida(
            "ubicacion_publica", latitud=None, longitud=None, ubicacion_publica=True
        )


class RestriccionesUbicacionTests(TestCase):
    """PostgreSQL rechaza la ubicación incoherente aunque se salte la validación del modelo."""

    def setUp(self):
        self.taller = crear_artesano_con_taller()

    def assertRechaza(self, **campos):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Taller.objects.filter(pk=self.taller.pk).update(**campos)

    def test_pareja_incompleta(self):
        self.assertRechaza(latitud=Decimal("11.97"))
        self.assertRechaza(longitud=Decimal("-86.09"))

    def test_fuera_de_rango(self):
        self.assertRechaza(latitud=Decimal("90.5"), longitud=Decimal("-86.09"))
        self.assertRechaza(latitud=Decimal("-90.5"), longitud=Decimal("-86.09"))
        self.assertRechaza(latitud=Decimal("11.97"), longitud=Decimal("180.5"))
        self.assertRechaza(latitud=Decimal("11.97"), longitud=Decimal("-180.5"))

    def test_publica_sin_coordenadas(self):
        self.assertRechaza(ubicacion_publica=True)

    def test_admite_los_estados_coherentes(self):
        consulta = Taller.objects.filter(pk=self.taller.pk)
        consulta.update(latitud=Decimal("11.97"), longitud=Decimal("-86.09"))
        consulta.update(ubicacion_publica=True)
        consulta.update(latitud=None, longitud=None, ubicacion_publica=False)
        self.taller.refresh_from_db()
        self.assertIsNone(self.taller.latitud)
