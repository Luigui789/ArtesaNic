"""Carreras reales de AUD-15 en PostgreSQL: dos hilos y dos conexiones, sin simular locks.

Carrera A: dos cuentas piden el mismo teléfono nuevo. Sus filas son distintas, así que
``SELECT … FOR UPDATE`` no las ordena: el árbitro es la restricción única. La primera se
detiene después de escribir, sin confirmar; la segunda queda bloqueada en el índice único
hasta que la primera confirma y entonces recibe el conflicto de dominio, nunca un 500.

Carrera B: dos actualizaciones de la misma cuenta se serializan sobre su fila, y la
segunda decide con los datos que dejó la primera (la fila bloqueada es la autoridad).
"""

import threading
import time

from django.db import connection
from django.test import TransactionTestCase

from apps.accounts import services
from apps.accounts.models import Usuario
from apps.propuestas.tests.test_concurrencia import ESPERA, CarreraTestCase, _Hilo

from .base import PASSWORD, crear_usuario


class CarrerasDeDatosPersonalesTests(CarreraTestCase):
    def setUp(self):
        TransactionTestCase.setUp(self)
        self.ana = crear_usuario("85551234", nombre="Ana Delgado")
        self.luis = crear_usuario("86661234", nombre="Luis Pérez")
        self.dentro = threading.Event()
        self.continuar = threading.Event()
        self.fallar_primera = False
        self.llamadas = 0

    def actualizar(self, usuario, **datos):
        return _Hilo(services.actualizar_datos_personales, usuario=usuario, **datos)

    def esperar_bloqueo(self, patron="%FOR UPDATE%"):
        limite = time.monotonic() + ESPERA
        with connection.cursor() as cursor:
            while time.monotonic() < limite:
                cursor.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                    "AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' "
                    "AND query ILIKE %s",
                    [patron],
                )
                if cursor.fetchone()[0]:
                    return
                time.sleep(0.02)
        self.fail("La segunda transacción no llegó a bloquearse.")

    def test_a_dos_cuentas_mismo_telefono_una_gana(self):
        self.pausar_en(services, "_guardar_datos_personales")
        primera = self.actualizar(self.ana, telefono="87771234", password_actual=PASSWORD)
        segunda = self.actualizar(self.luis, telefono="8777-1234", password_actual=PASSWORD)
        primera.start()
        self.assertTrue(self.dentro.wait(ESPERA), "La primera no llegó al punto de pausa.")
        segunda.start()
        # La segunda espera en el índice único la decisión de la primera, aún sin confirmar.
        self.esperar_bloqueo("UPDATE%accounts_usuario%")
        self.continuar.set()
        for hilo in (primera, segunda):
            hilo.join(ESPERA)
            self.assertFalse(hilo.is_alive())

        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, services.TelefonoYaRegistrado)
        self.assertEqual(Usuario.objects.filter(telefono="87771234").count(), 1)
        self.assertEqual(Usuario.objects.get(telefono="87771234"), self.ana)
        self.assertEqual(Usuario.objects.get(pk=self.luis.pk).telefono, "86661234")

    def test_b_misma_cuenta_se_serializa_sin_perder_cambios(self):
        self.pausar_en(services, "_bloquear_usuario")
        primera, segunda = self.carrera(
            self.actualizar(self.ana, nombre="Ana López"),
            self.actualizar(self.ana, telefono="87771234", password_actual=PASSWORD),
        )
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        ana = Usuario.objects.get(pk=self.ana.pk)
        self.assertEqual((ana.nombre, ana.telefono), ("Ana López", "87771234"))
        self.assertTrue(ana.check_password(PASSWORD))

    def test_b_la_fila_bloqueada_decide_si_el_telefono_cambia(self):
        # La segunda envía el teléfono que la cuenta tenía al empezar, sin contraseña.
        # Tras esperar el lock, la cuenta ya tiene otro: es un cambio efectivo y se rechaza.
        self.pausar_en(services, "_bloquear_usuario")
        primera, segunda = self.carrera(
            self.actualizar(self.ana, telefono="87771234", password_actual=PASSWORD),
            self.actualizar(self.ana, nombre="Ana López", telefono="85551234"),
        )
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, services.PasswordActualRequerido)
        ana = Usuario.objects.get(pk=self.ana.pk)
        self.assertEqual((ana.nombre, ana.telefono), ("Ana Delgado", "87771234"))
