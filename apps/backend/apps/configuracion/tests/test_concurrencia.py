"""Dos cambios de tasa simultáneos en PostgreSQL real: se serializan sobre el singleton."""

import threading
from decimal import Decimal

from django.test import TransactionTestCase

from apps.configuracion import services
from apps.configuracion.models import CambioTasaCambio, ConfiguracionPlataforma
from apps.propuestas.tests.test_concurrencia import CarreraTestCase, _Hilo

from .base import administrador_de_tasa


class CarrerasDeTasaTests(CarreraTestCase):
    def setUp(self):
        TransactionTestCase.setUp(self)
        # TransactionTestCase vacía las tablas entre pruebas: el singleton se recrea aquí.
        ConfiguracionPlataforma.objects.get_or_create(pk=1)
        self.primero = administrador_de_tasa("88881111")
        self.segundo = administrador_de_tasa("88882222")
        self.dentro = threading.Event()
        self.continuar = threading.Event()
        self.fallar_primera = False
        self.llamadas = 0

    def cambiar(self, actor, tasa):
        return _Hilo(services.actualizar_tasa_cambio, actor=actor, nueva_tasa=tasa)

    def test_dos_cambios_sin_actualizacion_perdida(self):
        self.pausar_en(services, "_bloquear_configuracion")
        primera, segunda = self.carrera(
            self.cambiar(self.primero, Decimal("40")), self.cambiar(self.segundo, Decimal("50"))
        )
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        historial = list(
            CambioTasaCambio.objects.order_by("id").values_list(
                "tasa_anterior", "tasa_nueva", "actor"
            )
        )
        self.assertEqual(
            historial,
            [
                (None, Decimal("40"), self.primero.pk),
                (Decimal("40"), Decimal("50"), self.segundo.pk),
            ],
        )
        actual = ConfiguracionPlataforma.objects.get()
        self.assertEqual(
            (actual.tasa_cambio_usd_nio, actual.actualizada_por), (Decimal("50"), self.segundo)
        )

    def test_misma_tasa_en_paralelo_un_solo_evento(self):
        self.pausar_en(services, "_bloquear_configuracion")
        primera, segunda = self.carrera(
            self.cambiar(self.primero, Decimal("40")), self.cambiar(self.segundo, Decimal("40"))
        )
        self.assertTrue(primera.resultado)
        self.assertFalse(segunda.resultado)
        self.assertEqual(CambioTasaCambio.objects.count(), 1)
        self.assertEqual(ConfiguracionPlataforma.objects.get().actualizada_por, self.primero)
