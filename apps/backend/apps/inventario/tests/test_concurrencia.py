"""Carreras reales de AUD-07 en PostgreSQL: última unidad, ajuste negativo vs confirmación
y doble decisión simultánea con claves distintas.

Cada prueba usa ``TransactionTestCase``, dos hilos con conexiones PostgreSQL reales e
inspección de ``pg_stat_activity`` para garantizar que la segunda transacción realmente
se bloquea en ``SELECT … FOR UPDATE`` antes de liberar la primera.
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
from apps.inventario import services as inventario
from apps.inventario.models import (
    EstadoReserva,
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.pedidos import services as pedidos
from apps.pedidos.models import Pedido
from apps.propuestas import services as propuestas
from apps.propuestas.models import DecisionPropuesta, ResultadoDecisionPropuesta
from apps.solicitudes import services as solicitudes
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
        except Exception as exc:
            self.error = exc
        finally:
            connections.close_all()


class CarreraConfirmacionTestCase(TransactionTestCase):
    def setUp(self):
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        self.artesano = taller.propietario
        self.categoria = crear_categoria()
        self.producto = crear_producto(
            taller, self.categoria, publicado=True, precio=Decimal("100.00")
        )
        self.comprador_a = crear_usuario("86666661")
        self.comprador_b = crear_usuario("86666662")
        self.dentro = threading.Event()
        self.continuar = threading.Event()
        self.llamadas = 0

    def pausar_en(self, modulo, nombre):
        original = getattr(modulo, nombre)

        def pausada(*args, **kwargs):
            self.llamadas += 1
            resultado = original(*args, **kwargs)
            if self.llamadas == 1:
                self.dentro.set()
                if not self.continuar.wait(ESPERA):
                    raise TimeoutError("La prueba no liberó la primera transacción.")
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
        self.fail("La segunda transacción no llegó a bloquearse en PostgreSQL.")

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

    def preparar_propuesta(self, comprador, cantidad=1):
        sol = solicitudes.crear_solicitud(
            comprador=comprador,
            renglones=[{"producto": self.producto.pk, "modalidad": "stock", "cantidad": cantidad}],
        )
        renglon = sol.renglones.get()
        solicitudes.resolver_renglon(
            artesano=self.artesano,
            solicitud_id=sol.pk,
            renglon_id=renglon.pk,
            resolucion="aceptado",
        )
        propuestas.finalizar_propuesta(
            artesano=self.artesano,
            solicitud_id=sol.pk,
            modalidad_entrega="retiro_taller",
            costo_entrega=Decimal("0.00"),
            lineas=[{"renglon": renglon.pk}],
        )
        return sol


class CarreraUltimaUnidadTests(CarreraConfirmacionTestCase):
    def test_confirmacion_concurrente_de_ultima_unidad_no_sobrevende(self):
        """Caso crítico AUD-07 (§16 y §33): existencia = 1, reservada = 0.
        Comprador A y Comprador B aceptan simultáneamente propuestas que requieren 1 unidad.
        Exactamente uno confirma y el otro recibe 409 stock_insuficiente."""
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.producto.pk, cantidad=1
        )
        sol_a = self.preparar_propuesta(self.comprador_a, cantidad=1)
        sol_b = self.preparar_propuesta(self.comprador_b, cantidad=1)

        # La primera transacción ya adquirió el lock sobre InventarioProducto; la segunda
        # queda bloqueada en SELECT ... FOR UPDATE sobre esa misma fila.
        self.pausar_en(inventario, "bloquear_y_validar_disponibilidad")

        hilo_a = _Hilo(
            propuestas.decidir_propuesta_idempotente,
            comprador=self.comprador_a,
            clave=str(uuid4()),
            solicitud_id=sol_a.pk,
            decision="aceptar",
        )
        hilo_b = _Hilo(
            propuestas.decidir_propuesta_idempotente,
            comprador=self.comprador_b,
            clave=str(uuid4()),
            solicitud_id=sol_b.pk,
            decision="aceptar",
        )
        self.carrera(hilo_a, hilo_b)

        errores = [h.error for h in (hilo_a, hilo_b) if h.error is not None]
        exitos = [h.resultado for h in (hilo_a, hilo_b) if h.resultado is not None]
        self.assertEqual(len(exitos), 1)
        self.assertEqual(len(errores), 1)
        self.assertIsInstance(errores[0], solicitudes.ConflictoSolicitud)
        self.assertEqual(errores[0].codigo, "stock_insuficiente")

        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(
            DecisionPropuesta.objects.filter(decision=ResultadoDecisionPropuesta.ACEPTADA).count(),
            1,
        )
        self.assertEqual(ReservaInventario.objects.filter(estado=EstadoReserva.ACTIVA).count(), 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.RESERVA).count(),
            1,
        )
        inv = InventarioProducto.objects.get(producto=self.producto)
        self.assertEqual(
            (inv.existencia_fisica, inv.reservada, inv.disponible),
            (1, 1, 0),
        )
        self.assertEqual(
            OperacionIdempotente.objects.filter(tipo=TipoOperacion.DECIDIR_PROPUESTA).count(),
            1,
        )


class CarreraAjusteVsConfirmacionTests(CarreraConfirmacionTestCase):
    def test_confirmacion_gana_lock_y_ajuste_negativo_concurrente_falla(self):
        """§36: existencia 5, reservado 0. Confirmación requiere 4; ajuste intenta -3.
        Cuando la confirmación toma primero el lock, el ajuste ve reservada=4 y falla con
        409 ajuste_bajo_comprometido."""
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.producto.pk, cantidad=5
        )
        sol = self.preparar_propuesta(self.comprador_a, cantidad=4)
        self.pausar_en(pedidos, "crear_pedido_desde_propuesta")

        hilo_confirmar = _Hilo(
            propuestas.decidir_propuesta_idempotente,
            comprador=self.comprador_a,
            clave=str(uuid4()),
            solicitud_id=sol.pk,
            decision="aceptar",
        )
        hilo_ajuste = _Hilo(
            inventario.ajustar_inventario_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            producto_id=self.producto.pk,
            delta=-3,
            motivo="Merma en almacén",
        )
        self.carrera(hilo_confirmar, hilo_ajuste)

        self.assertIsNone(hilo_confirmar.error)
        self.assertIsInstance(hilo_ajuste.error, inventario.ConflictoInventario)
        self.assertEqual(hilo_ajuste.error.codigo, "ajuste_bajo_comprometido")

        inv = InventarioProducto.objects.get(producto=self.producto)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (5, 4, 1))
        self.assertEqual(Pedido.objects.count(), 1)

    def test_ajuste_negativo_gana_lock_y_confirmacion_concurrente_falla(self):
        """§36 inverso: cuando el ajuste (-3) toma primero el lock sobre existencia 5,
        deja existencia=2, reservada=0; la confirmación concurrente (requiere 4) despierta
        y falla con 409 stock_insuficiente sin crear pedido ni reserva."""
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.producto.pk, cantidad=5
        )
        sol = self.preparar_propuesta(self.comprador_a, cantidad=4)
        self.pausar_en(inventario, "_bloquear_inventario_propio")

        hilo_ajuste = _Hilo(
            inventario.ajustar_inventario_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            producto_id=self.producto.pk,
            delta=-3,
            motivo="Merma en almacén",
        )
        hilo_confirmar = _Hilo(
            propuestas.decidir_propuesta_idempotente,
            comprador=self.comprador_a,
            clave=str(uuid4()),
            solicitud_id=sol.pk,
            decision="aceptar",
        )
        self.carrera(hilo_ajuste, hilo_confirmar)

        self.assertIsNone(hilo_ajuste.error)
        self.assertIsInstance(hilo_confirmar.error, solicitudes.ConflictoSolicitud)
        self.assertEqual(hilo_confirmar.error.codigo, "stock_insuficiente")

        inv = InventarioProducto.objects.get(producto=self.producto)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (2, 0, 2))
        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(ReservaInventario.objects.count(), 0)


class CarreraDobleDecisionMismaPropuestaTests(CarreraConfirmacionTestCase):
    def test_aceptar_y_rechazar_simultaneos_dejan_una_sola_decision(self):
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.producto.pk, cantidad=2
        )
        sol = self.preparar_propuesta(self.comprador_a, cantidad=1)
        self.pausar_en(propuestas, "_bloquear_propuesta_de_solicitud")

        hilo_aceptar = _Hilo(
            propuestas.decidir_propuesta_idempotente,
            comprador=self.comprador_a,
            clave=str(uuid4()),
            solicitud_id=sol.pk,
            decision="aceptar",
        )
        hilo_rechazar = _Hilo(
            propuestas.decidir_propuesta_idempotente,
            comprador=self.comprador_a,
            clave=str(uuid4()),
            solicitud_id=sol.pk,
            decision="rechazar",
        )
        self.carrera(hilo_aceptar, hilo_rechazar)

        self.assertIsNone(hilo_aceptar.error)
        self.assertIsInstance(hilo_rechazar.error, solicitudes.ConflictoSolicitud)
        self.assertEqual(hilo_rechazar.error.codigo, "propuesta_ya_decidida")
        self.assertEqual(DecisionPropuesta.objects.count(), 1)
        self.assertEqual(
            DecisionPropuesta.objects.get().decision, ResultadoDecisionPropuesta.ACEPTADA
        )
        self.assertEqual(Pedido.objects.count(), 1)
