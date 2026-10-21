"""Carreras reales en PostgreSQL: dos conexiones, la segunda bloqueada por la primera.

No son llamadas secuenciales: cada intento corre en su hilo y conexión. La primera
transacción se detiene dentro de la mutación, con su registro ya insertado; la prueba
espera a ver en ``pg_stat_activity`` que la segunda está bloqueada esperando ese
registro, y solo entonces deja continuar (o fallar) a la primera.
"""

import threading
import time
from unittest import mock
from uuid import uuid4

from django.db import connection, connections
from django.test import TransactionTestCase

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.operaciones import services as operaciones
from apps.operaciones.models import EstadoOperacion, OperacionIdempotente
from apps.solicitudes import services
from apps.solicitudes.models import RenglonSolicitud, Solicitud
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

ESPERA = 10


class _Intento(threading.Thread):
    def __init__(self, **kwargs):
        super().__init__(daemon=True)
        self.kwargs = kwargs
        self.resultado = None
        self.error = None

    def run(self):
        try:
            self.resultado = services.crear_solicitud_idempotente(**self.kwargs)
        except Exception as exc:  # se inspecciona en la prueba
            self.error = exc
        finally:
            connections.close_all()


class ConcurrenciaTests(TransactionTestCase):
    def setUp(self):
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        producto = crear_producto(taller, crear_categoria(), publicado=True)
        self.comprador = crear_usuario("86666666")
        self.clave = str(uuid4())
        self.renglones = [{"producto": producto.pk, "modalidad": "stock", "cantidad": 1}]
        self.dentro = threading.Event()
        self.continuar = threading.Event()
        self.fallar_primera = False
        self.ejecuciones = 0
        original = services.crear_solicitud

        def mutacion_pausada(**kwargs):
            self.ejecuciones += 1
            solicitud = original(**kwargs)
            if self.ejecuciones == 1:
                self.dentro.set()
                if not self.continuar.wait(ESPERA):
                    raise TimeoutError("La prueba no liberó la primera transacción.")
                if self.fallar_primera:
                    raise RuntimeError("fallo después de insertar la solicitud")
            return solicitud

        parche = mock.patch.object(services, "crear_solicitud", side_effect=mutacion_pausada)
        parche.start()
        self.addCleanup(parche.stop)

    def esperar_bloqueo(self):
        """Hasta que otra conexión espere un lock de la primera transacción."""
        limite = time.monotonic() + ESPERA
        with connection.cursor() as cursor:
            while time.monotonic() < limite:
                cursor.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                    "AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' "
                    "AND query ILIKE %s",
                    ['%INSERT INTO "operaciones_operacionidempotente"%'],
                )
                if cursor.fetchone()[0]:
                    return
                time.sleep(0.02)
        self.fail("La segunda transacción no llegó a bloquearse en el registro idempotente.")

    def carrera(self, segundos_renglones=None):
        primera = _Intento(comprador=self.comprador, clave=self.clave, renglones=self.renglones)
        segunda = _Intento(
            comprador=self.comprador,
            clave=self.clave,
            renglones=segundos_renglones or self.renglones,
        )
        primera.start()
        self.assertTrue(self.dentro.wait(ESPERA), "La primera transacción no llegó a la mutación.")
        segunda.start()
        self.esperar_bloqueo()
        # Mientras la primera no confirma, nada es visible para otras conexiones.
        self.assertFalse(OperacionIdempotente.objects.exists())
        self.assertFalse(Solicitud.objects.exists())
        self.continuar.set()
        for intento in (primera, segunda):
            intento.join(ESPERA)
            self.assertFalse(intento.is_alive())
        return primera, segunda

    def test_misma_clave_y_cuerpo_crea_una_sola_solicitud(self):
        primera, segunda = self.carrera()
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        self.assertFalse(primera.resultado.repetida)
        self.assertTrue(segunda.resultado.repetida)
        self.assertEqual(
            primera.resultado.operacion.recurso_id, segunda.resultado.operacion.recurso_id
        )
        self.assertEqual(self.ejecuciones, 1)
        self.assertEqual((Solicitud.objects.count(), RenglonSolicitud.objects.count()), (1, 1))
        self.assertEqual(OperacionIdempotente.objects.get().estado, EstadoOperacion.COMPLETADA)

    def test_misma_clave_y_otro_cuerpo_nunca_ejecuta_dos_veces(self):
        otro = [dict(self.renglones[0], cantidad=9)]
        primera, segunda = self.carrera(otro)
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, operaciones.ClaveIdempotenciaReutilizada)
        self.assertEqual(self.ejecuciones, 1)
        self.assertEqual(Solicitud.objects.get().renglones.get().cantidad, 1)
        self.assertEqual(OperacionIdempotente.objects.count(), 1)

    def test_rollback_de_la_primera_deja_ejecutar_a_la_segunda(self):
        self.fallar_primera = True
        primera, segunda = self.carrera()
        self.assertIsInstance(primera.error, RuntimeError)
        self.assertIsNone(segunda.error)
        self.assertFalse(segunda.resultado.repetida)
        self.assertEqual(self.ejecuciones, 2)
        solicitud = Solicitud.objects.get()
        operacion = OperacionIdempotente.objects.get()
        self.assertEqual(operacion.estado, EstadoOperacion.COMPLETADA)
        self.assertEqual(operacion.recurso_id, solicitud.pk)
        self.assertFalse(
            OperacionIdempotente.objects.filter(estado=EstadoOperacion.EN_PROGRESO).exists()
        )
