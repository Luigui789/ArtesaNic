"""Invariantes del taller garantizadas por el modelo y por PostgreSQL (RF-008, RF-013)."""

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
