"""Carreras reales de AUD-06 en PostgreSQL: dos hilos y dos conexiones, claves distintas.

AUD-08 no protege aquí (las claves difieren): el árbitro es el ``SELECT … FOR UPDATE``
de la solicitud. La primera transacción se detiene dentro del lock; la prueba espera a
ver en ``pg_stat_activity`` que la segunda está bloqueada en ese lock y solo entonces
deja continuar (o fallar) a la primera. No son llamadas secuenciales.
"""

import threading
import time
from decimal import Decimal
from unittest import mock
from uuid import uuid4

from django.db import connection, connections
from django.test import TransactionTestCase

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.operaciones.models import OperacionIdempotente
from apps.propuestas import services as propuestas
from apps.propuestas.models import CargoPropuesta, LineaPropuesta, Propuesta
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import (
    EstadoSolicitud,
    RenglonSolicitud,
    ResolucionRenglon,
    RevisionRenglonSolicitud,
)
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

ESPERA = 10


class _Hilo(threading.Thread):
    def __init__(self, funcion, **kwargs):
        super().__init__(daemon=True)
        self.funcion, self.kwargs = funcion, kwargs
        self.resultado = self.error = None

    def run(self):
        try:
            self.resultado = self.funcion(**self.kwargs)
        except Exception as exc:  # se inspecciona en la prueba
            self.error = exc
        finally:
            connections.close_all()


class CarreraTestCase(TransactionTestCase):
    def setUp(self):
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        self.artesano = taller.propietario
        self.producto = crear_producto(taller, crear_categoria(), publicado=True)
        self.comprador = crear_usuario("86666666")
        self.dentro = threading.Event()
        self.continuar = threading.Event()
        self.fallar_primera = False
        self.llamadas = 0

    def pausar_en(self, modulo, nombre):
        """La primera llamada a ``modulo.nombre`` (dentro del lock) espera la señal."""
        original = getattr(modulo, nombre)

        def pausada(*args, **kwargs):
            self.llamadas += 1
            resultado = original(*args, **kwargs)
            if self.llamadas == 1:
                self.dentro.set()
                if not self.continuar.wait(ESPERA):
                    raise TimeoutError("La prueba no liberó la primera transacción.")
                if self.fallar_primera:
                    raise RuntimeError("fallo después de escribir dentro del lock")
            return resultado

        parche = mock.patch.object(modulo, nombre, side_effect=pausada)
        parche.start()
        self.addCleanup(parche.stop)

    def esperar_bloqueo(self):
        limite = time.monotonic() + ESPERA
        with connection.cursor() as cursor:
            while time.monotonic() < limite:
                cursor.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                    "AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' "
                    "AND query ILIKE %s",
                    ["%FOR UPDATE%"],
                )
                if cursor.fetchone()[0]:
                    return
                time.sleep(0.02)
        self.fail("La segunda transacción no llegó a bloquearse en la solicitud.")

    def carrera(self, primera, segunda):
        primera.start()
        self.assertTrue(self.dentro.wait(ESPERA), "La primera no llegó al punto de pausa.")
        segunda.start()
        self.esperar_bloqueo()
        self.continuar.set()
        for hilo in (primera, segunda):
            hilo.join(ESPERA)
            self.assertFalse(hilo.is_alive())
        return primera, segunda

    def nueva_solicitud(self, cantidad_renglones=1):
        return solicitudes.crear_solicitud(
            comprador=self.comprador,
            renglones=[
                {"producto": self.producto.pk, "modalidad": "stock", "cantidad": 1}
                for _ in range(cantidad_renglones)
            ],
        )

    def resolver(self, solicitud, renglon, resolucion, motivo=""):
        return _Hilo(
            solicitudes.resolver_renglon_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            solicitud_id=solicitud.pk,
            renglon_id=renglon.pk,
            resolucion=resolucion,
            motivo_rechazo=motivo,
        )


class CarrerasDeRevisionTests(CarreraTestCase):
    def setUp(self):
        super().setUp()
        self.pausar_en(solicitudes, "estado_tras_revision")

    def test_aceptar_y_rechazar_el_mismo_renglon_solo_gana_una(self):
        solicitud = self.nueva_solicitud()
        renglon = solicitud.renglones.get()
        primera, segunda = self.carrera(
            self.resolver(solicitud, renglon, "aceptado"),
            self.resolver(solicitud, renglon, "rechazado", "Sin barro"),
        )
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, solicitudes.ConflictoSolicitud)
        self.assertEqual(segunda.error.codigo, "renglon_ya_resuelto")
        renglon.refresh_from_db()
        self.assertEqual((renglon.resolucion, renglon.motivo_rechazo), ("aceptado", ""))
        self.assertEqual(RevisionRenglonSolicitud.objects.count(), 1)
        # La clave perdedora no queda registrada: el conflicto revirtió su transacción.
        self.assertEqual(OperacionIdempotente.objects.count(), 1)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, EstadoSolicitud.LISTA_PROPUESTA)

    def test_carrera_del_ultimo_renglon_produce_estado_consistente(self):
        solicitud = self.nueva_solicitud(2)
        r1, r2 = solicitud.renglones.order_by("posicion")
        primera, segunda = self.carrera(
            self.resolver(solicitud, r1, "aceptado"),
            self.resolver(solicitud, r2, "rechazado", "Agotado"),
        )
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        solicitud.refresh_from_db()
        # Sin el lock, ambas verían al otro pendiente y quedaría en pendiente_revision.
        self.assertEqual(solicitud.estado, EstadoSolicitud.LISTA_PROPUESTA)
        self.assertEqual(RevisionRenglonSolicitud.objects.count(), 2)

    def test_ultimo_renglon_rechazado_en_carrera_aplica_dr03(self):
        solicitud = self.nueva_solicitud(2)
        r1, r2 = solicitud.renglones.order_by("posicion")
        self.carrera(
            self.resolver(solicitud, r1, "rechazado", "A"),
            self.resolver(solicitud, r2, "rechazado", "B"),
        )
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, EstadoSolicitud.RECHAZADA)
        self.assertFalse(Propuesta.objects.exists())

    def test_rollback_de_la_primera_no_deja_historial_y_la_segunda_gana(self):
        self.fallar_primera = True
        solicitud = self.nueva_solicitud()
        renglon = solicitud.renglones.get()
        primera, segunda = self.carrera(
            self.resolver(solicitud, renglon, "aceptado"),
            self.resolver(solicitud, renglon, "rechazado", "Sin barro"),
        )
        self.assertIsInstance(primera.error, RuntimeError)
        self.assertIsNone(segunda.error)
        revision = RevisionRenglonSolicitud.objects.get()
        self.assertEqual(revision.resolucion, ResolucionRenglon.RECHAZADO)
        self.assertEqual(RenglonSolicitud.objects.get().resolucion, ResolucionRenglon.RECHAZADO)
        self.assertEqual(OperacionIdempotente.objects.count(), 1)


class CarrerasDePropuestaTests(CarreraTestCase):
    def setUp(self):
        super().setUp()
        self.solicitud = self.nueva_solicitud()
        self.renglon = self.solicitud.renglones.get()
        solicitudes.resolver_renglon(
            artesano=self.artesano,
            solicitud_id=self.solicitud.pk,
            renglon_id=self.renglon.pk,
            resolucion="aceptado",
        )
        self.pausar_en(propuestas, "_validar_cargos")

    def emitir(self, costo):
        return _Hilo(
            propuestas.finalizar_propuesta_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            solicitud_id=self.solicitud.pk,
            modalidad_entrega="entrega_artesano",
            costo_entrega=Decimal(costo),
            lineas=[{"renglon": self.renglon.pk}],
            otros_cargos=[{"descripcion": "Empaque", "monto": Decimal("5.00")}],
        )

    def test_dos_emisiones_simultaneas_crean_una_sola_propuesta(self):
        primera, segunda = self.carrera(self.emitir("10.00"), self.emitir("99.00"))
        self.assertIsNone(primera.error)
        self.assertIsInstance(segunda.error, solicitudes.ConflictoSolicitud)
        self.assertEqual(segunda.error.codigo, "propuesta_ya_emitida")
        propuesta = Propuesta.objects.get()
        self.assertEqual(propuesta.costo_entrega, Decimal("10.00"))
        self.assertEqual((LineaPropuesta.objects.count(), CargoPropuesta.objects.count()), (1, 1))
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, EstadoSolicitud.PROPUESTA_EMITIDA)

    def test_rollback_no_deja_propuesta_parcial_y_la_segunda_emite(self):
        self.fallar_primera = True
        primera, segunda = self.carrera(self.emitir("10.00"), self.emitir("99.00"))
        self.assertIsInstance(primera.error, RuntimeError)
        self.assertIsNone(segunda.error)
        self.assertEqual(Propuesta.objects.get().costo_entrega, Decimal("99.00"))
        self.assertEqual((LineaPropuesta.objects.count(), CargoPropuesta.objects.count()), (1, 1))

    def test_fallo_al_final_revierte_propuesta_lineas_cargos_y_estado(self):
        with mock.patch.object(
            type(self.solicitud), "save", side_effect=RuntimeError("fallo al cambiar estado")
        ):
            self.continuar.set()
            with self.assertRaises(RuntimeError):
                propuestas.finalizar_propuesta(
                    artesano=self.artesano,
                    solicitud_id=self.solicitud.pk,
                    modalidad_entrega="entrega_artesano",
                    costo_entrega=Decimal("1.00"),
                    lineas=[{"renglon": self.renglon.pk}],
                    otros_cargos=[{"descripcion": "x", "monto": Decimal("1.00")}],
                )
        self.assertFalse(Propuesta.objects.exists())
        self.assertFalse(LineaPropuesta.objects.exists())
        self.assertFalse(CargoPropuesta.objects.exists())
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, EstadoSolicitud.LISTA_PROPUESTA)
