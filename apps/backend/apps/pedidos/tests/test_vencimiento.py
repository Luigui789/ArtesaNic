"""AUD-11: vencimiento automático por falta de pago (RN-013/014/015, RN-021).

Plazos exactos con reloj congelado, estados de pago que suspenden o habilitan el vencimiento,
liberación atómica de reservas, idempotencia natural, inconsistencias, bloqueo de pagos tras
vencer, lectura API y estado operativo inicial."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.apps import apps as registro_apps
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.utils.dateparse import parse_datetime

from apps.inventario.models import (
    EstadoReserva,
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)
from apps.pagos.models import IntentoPago, Pago, RevisionIntentoPago
from apps.pagos.tests.base import archivos_privados, url_mi_pago, url_pago_recibido
from apps.pedidos import vencimiento
from apps.pedidos.models import (
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    Pedido,
)
from apps.propuestas import services as propuestas
from apps.solicitudes import services as solicitudes
from apps.solicitudes.tests.base import datos_renglon

from .base_vencimiento import UN_SEGUNDO, VencimientoTestCase, confirmar_pedido_con
from .test_confirmacion_y_pedidos import (
    url_mi_pedido,
    url_mis_pedidos,
    url_pedido_recibido,
    url_pedidos_recibidos,
)

UN_DIA = timedelta(days=1)


def migracion_estado_inicial():
    from importlib import import_module

    return import_module("apps.pedidos.migrations.0004_estado_inicial_pedidos_existentes")


class PlazoInicialTests(VencimientoTestCase):
    """Caso A: nunca registró pago; límite = confirmado_en + 48 h (D-AUD11-03/08)."""

    def test_un_segundo_antes_no_vence(self):
        resultado = self.procesar(self.limite - UN_SEGUNDO)
        self.assertEqual(resultado.vencidos, 0)
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)
        self.assertIsNone(self.pedido.estado_operativo.vencido_en)

    def test_instante_exacto_vence(self):
        resultado = self.procesar(self.limite)
        self.assertEqual((resultado.vencidos, resultado.errores), (1, 0))
        self.assertEqual(self.estado(), EstadoPedido.VENCIDO_FALTA_PAGO)
        self.assertEqual(self.pedido.estado_operativo.vencido_en, self.limite)

    def test_un_segundo_despues_vence_y_registra_evento_del_sistema(self):
        momento = self.limite + UN_SEGUNDO
        self.procesar(momento)
        self.assertEqual(self.estado(), EstadoPedido.VENCIDO_FALTA_PAGO)
        evento = EventoEstadoPedido.objects.get(pedido=self.pedido)
        self.assertEqual(
            (evento.estado_anterior, evento.estado_nuevo, evento.tipo, evento.actor_id),
            ("confirmado", "vencido_falta_pago", "automatico", None),
        )
        self.assertEqual(evento.creado_en, momento)
        self.assertFalse(Pago.objects.filter(pedido=self.pedido).exists(), "Sin fila Pago")

    def test_log_de_vencimiento_tras_el_commit(self):
        with self.assertLogs("apps.pedidos.vencimiento", "INFO") as logs:
            with self.captureOnCommitCallbacks(execute=True):
                self.procesar(self.limite)
        (linea,) = logs.output
        self.assertIn(f"pedido_vencido_falta_pago pedido_id={self.pedido.pk}", linea)
        self.assertIn("reservas_liberadas=1", linea)


class EstadosDePagoTests(VencimientoTestCase):
    def test_registrado_no_vence_aunque_pasen_dias(self):
        r = self.registrar_en(self.limite - timedelta(hours=1))
        self.assertEqual(r.status_code, 201, r.data)
        resultado = self.procesar(self.pedido.confirmado_en + timedelta(days=5))
        self.assertEqual(resultado.vencidos, 0)
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)
        self.assertEqual(self.pedido.reservas.get().estado, EstadoReserva.ACTIVA)
        self.assertFalse(vencimiento.vencer_pedido(self.pedido.pk), "Revalidación directa")

    def test_confirmado_jamas_vence(self):
        r = self.registrar_en(self.limite - timedelta(hours=1))
        self.assertEqual(
            self.resolver_en(self.limite, self.intento_vigente(r), "confirmado").status_code, 200
        )
        self.assertEqual(self.procesar(self.limite + timedelta(days=365)).vencidos, 0)
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)
        self.assertEqual(self.pedido.reservas.get().estado, EstadoReserva.ACTIVA)

    def test_observado_respeta_su_plazo_exacto(self):
        revision = self.limite - timedelta(hours=2)
        self.con_resolucion("observado", revision)
        plazo = revision + vencimiento.PLAZO
        self.assertEqual(self.procesar(plazo - UN_SEGUNDO).vencidos, 0)
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)
        self.assertEqual(self.procesar(plazo).vencidos, 1)
        self.assertEqual(self.estado(), EstadoPedido.VENCIDO_FALTA_PAGO)

    def test_observado_vigente_suspende_aunque_pase_el_plazo_inicial(self):
        self.con_resolucion("observado", self.limite - UN_SEGUNDO)
        self.assertEqual(self.procesar(self.limite + UN_DIA).vencidos, 0)

    def test_correccion_valida_antes_del_limite_impide_vencer(self):
        revision = self.limite - timedelta(hours=2)
        intento = self.con_resolucion("observado", revision)
        plazo = revision + vencimiento.PLAZO
        r = self.corregir_en(plazo - UN_SEGUNDO, intento)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.procesar(plazo + UN_DIA).vencidos, 0)
        self.assertEqual(Pago.objects.get(pedido=self.pedido).estado, "registrado")
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)

    def test_no_recibido_respeta_su_plazo_exacto(self):
        revision = self.limite - timedelta(hours=2)
        self.con_resolucion("no_recibido", revision)
        plazo = revision + vencimiento.PLAZO
        self.assertEqual(self.procesar(plazo - UN_SEGUNDO).vencidos, 0)
        self.assertEqual(self.procesar(plazo).vencidos, 1)
        self.assertEqual(self.estado(), EstadoPedido.VENCIDO_FALTA_PAGO)

    def test_nuevo_intento_tras_no_recibido_impide_vencer(self):
        revision = self.limite - timedelta(hours=2)
        self.con_resolucion("no_recibido", revision)
        plazo = revision + vencimiento.PLAZO
        r = self.registrar_en(plazo - UN_SEGUNDO)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.procesar(plazo + UN_DIA).vencidos, 0)
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)

    def test_vencer_conserva_pago_intentos_revisiones_y_comprobantes(self):
        revision = self.limite - timedelta(hours=2)
        self.con_resolucion("observado", revision)
        archivos = archivos_privados()
        self.procesar(revision + vencimiento.PLAZO)
        pago = Pago.objects.get(pedido=self.pedido)
        self.assertEqual(pago.estado, "observado", "El Pago no gana un estado «vencido»")
        self.assertEqual(IntentoPago.objects.filter(pago=pago).count(), 1)
        self.assertEqual(RevisionIntentoPago.objects.filter(intento__pago=pago).count(), 1)
        self.assertEqual(archivos_privados(), archivos)


class PagoBloqueadoTrasVencerTests(VencimientoTestCase):
    """D-AUD11-17: 409 pedido_vencido en registrar, corregir y resolver; lectura intacta."""

    def assertPedidoVencido(self, respuesta):
        self.assertEqual(respuesta.status_code, 409, respuesta.data)
        self.assertEqual(respuesta.data["codigo"], "pedido_vencido")

    def test_registrar_tras_vencer(self):
        self.procesar(self.limite)
        self.assertPedidoVencido(self.registrar_en(self.limite + UN_DIA))
        self.assertFalse(Pago.objects.filter(pedido=self.pedido).exists())

    def test_corregir_y_resolver_tras_vencer_y_lectura_disponible(self):
        revision = self.limite - timedelta(hours=2)
        intento = self.con_resolucion("observado", revision)
        plazo = revision + vencimiento.PLAZO
        self.procesar(plazo)
        self.assertPedidoVencido(self.corregir_en(plazo + UN_SEGUNDO, intento))
        self.assertPedidoVencido(self.resolver_en(plazo + UN_SEGUNDO, intento, "confirmado"))
        self.assertEqual(IntentoPago.objects.count(), 3, "Ningún intento nuevo")
        comprador = self.client.get(url_mi_pago(self.pedido.pk))
        self.assertEqual(comprador.status_code, 200)
        self.assertEqual(comprador.data["estado"], "observado")
        self.assertEqual(len(comprador.data["intentos"]), 1)
        self.autenticar(self.artesano)
        self.assertEqual(
            len(self.client.get(url_pago_recibido(self.pedido.pk)).data["intentos"]), 1
        )

    def test_no_recibido_vencido_rechaza_nuevo_intento(self):
        revision = self.limite - timedelta(hours=2)
        self.con_resolucion("no_recibido", revision)
        self.procesar(revision + vencimiento.PLAZO)
        self.assertPedidoVencido(self.registrar_en(revision + vencimiento.PLAZO + UN_SEGUNDO))


class LiberacionTests(VencimientoTestCase):
    def pedido_de(self, *renglones):
        return confirmar_pedido_con(
            comprador=self.comprador, artesano=self.artesano, renglones=list(renglones)
        )

    def vencer(self, pedido):
        momento = pedido.confirmado_en + vencimiento.PLAZO + UN_DIA
        with mock.patch("apps.pagos.services.ahora", return_value=momento):
            return vencimiento.vencer_pedido(pedido.pk)

    def test_libera_reserva_sin_tocar_existencia_fisica(self):
        producto = self.producto_con_stock(10)
        pedido = self.pedido_de(datos_renglon(producto, cantidad=4))
        inv = InventarioProducto.objects.get(producto=producto)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (10, 4, 6))
        self.assertTrue(self.vencer(pedido))
        inv.refresh_from_db()
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (10, 0, 10))
        reserva = ReservaInventario.objects.get(pedido=pedido)
        self.assertEqual(reserva.estado, EstadoReserva.LIBERADA)
        mov = MovimientoInventario.objects.get(tipo=TipoMovimientoInventario.LIBERACION)
        self.assertEqual(
            (
                mov.cantidad,
                mov.existencia_antes,
                mov.existencia_despues,
                mov.reservada_antes,
                mov.reservada_despues,
            ),
            (4, 10, 10, 4, 0),
        )
        self.assertEqual(
            (mov.producto_id, mov.pedido_id, mov.linea_pedido_id, mov.reserva_id, mov.actor_id),
            (producto.pk, pedido.pk, reserva.linea_pedido_id, reserva.pk, None),
        )
        self.assertEqual(mov.motivo, "Vencimiento automático por falta de pago.")

    def test_varias_lineas_del_mismo_producto(self):
        producto = self.producto_con_stock(10)
        pedido = self.pedido_de(
            datos_renglon(producto, cantidad=3), datos_renglon(producto, cantidad=2)
        )
        self.assertEqual(InventarioProducto.objects.get(producto=producto).reservada, 5)
        self.assertTrue(self.vencer(pedido))
        inv = InventarioProducto.objects.get(producto=producto)
        self.assertEqual((inv.existencia_fisica, inv.reservada), (10, 0))
        movs = MovimientoInventario.objects.filter(
            tipo=TipoMovimientoInventario.LIBERACION
        ).order_by("id")
        self.assertEqual([(m.reservada_antes, m.reservada_despues) for m in movs], [(5, 2), (2, 0)])

    def test_varias_lineas_de_distintos_productos_bloquea_en_orden(self):
        a = self.producto_con_stock(10, permite_personalizacion=True)
        b = self.producto_con_stock(6)
        pedido = self.pedido_de(
            datos_renglon(b, cantidad=2),
            datos_renglon(a, cantidad=3),
            datos_renglon(
                a,
                modalidad="personalizacion",
                cantidad=1,
                caracteristicas="Iniciales",
                origen_personalizacion="unidad_estandar",
            ),
        )
        with CaptureQueriesContext(connection) as consultas:
            self.assertTrue(self.vencer(pedido))
        (bloqueo,) = [
            q["sql"]
            for q in consultas.captured_queries
            if q["sql"].startswith('SELECT "inventario_inventarioproducto"')
            and "FOR UPDATE" in q["sql"]
        ]
        self.assertIn('ORDER BY "inventario_inventarioproducto"."producto_id" ASC', bloqueo)
        saldos = dict(
            InventarioProducto.objects.filter(producto__in=[a, b]).values_list(
                "producto_id", "reservada"
            )
        )
        self.assertEqual(saldos, {a.pk: 0, b.pk: 0})
        self.assertEqual(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.LIBERACION).count(),
            3,
        )

    def test_pedido_sin_reservas_vence_sin_movimientos(self):
        producto = self.producto_con_stock(0, permite_personalizacion=True)
        pedido = self.pedido_de(
            datos_renglon(
                producto,
                modalidad="personalizacion",
                cantidad=2,
                caracteristicas="Desde cero",
                origen_personalizacion="desde_cero",
            )
        )
        self.assertFalse(ReservaInventario.objects.filter(pedido=pedido).exists())
        self.assertTrue(self.vencer(pedido))
        self.assertEqual(self.estado(pedido), EstadoPedido.VENCIDO_FALTA_PAGO)
        self.assertFalse(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.LIBERACION).exists()
        )

    def test_reejecucion_no_duplica_efectos(self):
        self.procesar(self.limite)
        self.assertEqual(self.procesar(self.limite + UN_DIA).vencidos, 0)
        self.assertFalse(vencimiento.vencer_pedido(self.pedido.pk))
        self.assertEqual(EventoEstadoPedido.objects.filter(pedido=self.pedido).count(), 1)
        self.assertEqual(
            MovimientoInventario.objects.filter(
                pedido=self.pedido, tipo=TipoMovimientoInventario.LIBERACION
            ).count(),
            1,
        )
        inv = InventarioProducto.objects.get(producto=self.producto)
        # Queda la reserva activa del pedido del otro comprador.
        self.assertEqual(inv.reservada, 2)

    def test_disponibilidad_publica_refleja_la_liberacion(self):
        producto = self.producto_con_stock(10)
        pedido = self.pedido_de(datos_renglon(producto, cantidad=4))
        url = f"/api/v1/productos/{producto.pk}/"
        self.assertEqual(self.client.get(url).data["disponible_stock"], 6)
        self.vencer(pedido)
        self.assertEqual(self.client.get(url).data["disponible_stock"], 10)


class InconsistenciaTests(VencimientoTestCase):
    """D-AUD11-11: una reserva consumida sin Pago confirmado aborta todo el vencimiento."""

    def test_reserva_consumida_aborta_y_revierte(self):
        producto = self.producto_con_stock(10)
        pedido = confirmar_pedido_con(
            comprador=self.comprador,
            artesano=self.artesano,
            renglones=[datos_renglon(producto, cantidad=1), datos_renglon(producto, cantidad=2)],
        )
        primera, segunda = ReservaInventario.objects.filter(pedido=pedido).order_by("id")
        ReservaInventario.objects.filter(pk=segunda.pk).update(estado=EstadoReserva.CONSUMIDA)
        momento = pedido.confirmado_en + vencimiento.PLAZO
        with self.assertLogs("apps.pedidos.vencimiento", "CRITICAL") as logs:
            resultado = self.procesar(momento + UN_DIA)
        self.assertEqual(resultado.errores, 1)
        self.assertEqual(resultado.vencidos, 1, "self.pedido sí vence; el anómalo no")
        self.assertIn(
            f"pedido_id={pedido.pk} reserva_id={segunda.pk} estado=consumida", logs.output[0]
        )
        self.assertEqual(self.estado(pedido), EstadoPedido.CONFIRMADO)
        primera.refresh_from_db()
        self.assertEqual(primera.estado, EstadoReserva.ACTIVA, "Nada se libera parcialmente")
        self.assertEqual(InventarioProducto.objects.get(producto=producto).reservada, 3)
        self.assertFalse(
            MovimientoInventario.objects.filter(
                pedido=pedido, tipo=TipoMovimientoInventario.LIBERACION
            ).exists()
        )
        self.assertFalse(EventoEstadoPedido.objects.filter(pedido=pedido).exists())

    def test_fallo_tras_liberar_revierte_todo(self):
        with mock.patch.object(
            EventoEstadoPedido.objects, "create", side_effect=IntegrityError("simulado")
        ):
            resultado = self.procesar(self.limite)
        self.assertEqual(resultado.errores, 1)
        self.assertEqual(self.estado(), EstadoPedido.CONFIRMADO)
        self.assertEqual(self.pedido.reservas.get().estado, EstadoReserva.ACTIVA)
        self.assertEqual(InventarioProducto.objects.get(producto=self.producto).reservada, 4)
        self.assertFalse(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.LIBERACION).exists()
        )


class InvariantesTests(VencimientoTestCase):
    def test_movimiento_liberacion_coherente_en_postgresql(self):
        reserva = self.pedido.reservas.get()
        base = dict(
            producto_id=reserva.producto_id,
            tipo=TipoMovimientoInventario.LIBERACION,
            cantidad=2,
            existencia_antes=10,
            existencia_despues=10,
            reservada_antes=2,
            reservada_despues=0,
            pedido=self.pedido,
            linea_pedido_id=reserva.linea_pedido_id,
            reserva=reserva,
        )
        for cambios in (
            {"existencia_despues": 8},
            {"reservada_despues": 1},
            {"reserva": None},
            {"pedido": None},
        ):
            with self.subTest(cambios=cambios), self.assertRaises(IntegrityError):
                with transaction.atomic():
                    MovimientoInventario.objects.create(**(base | cambios))
        MovimientoInventario.objects.create(**base)
        with self.assertRaises(IntegrityError), transaction.atomic():
            MovimientoInventario.objects.create(**base)

    def test_evento_append_only_y_vencimiento_unico(self):
        self.procesar(self.limite)
        evento = EventoEstadoPedido.objects.get()
        with self.assertRaises(ValidationError):
            evento.save()
        with self.assertRaises(ValidationError):
            evento.delete()
        with self.assertRaises(IntegrityError), transaction.atomic():
            EventoEstadoPedido.objects.create(
                pedido=self.pedido,
                estado_anterior="confirmado",
                estado_nuevo="vencido_falta_pago",
                tipo="automatico",
            )

    def test_estado_operativo_coherente_y_no_eliminable(self):
        estado = self.pedido.estado_operativo
        with self.assertRaises(ValidationError):
            estado.delete()
        with self.assertRaises(IntegrityError), transaction.atomic():
            EstadoOperativoPedido.objects.filter(pk=estado.pk).update(estado="vencido_falta_pago")
        with self.assertRaises(IntegrityError), transaction.atomic():
            EventoEstadoPedido.objects.create(
                pedido=self.pedido,
                estado_anterior="confirmado",
                estado_nuevo="vencido_falta_pago",
                tipo="automatico",
                actor=self.comprador,
            )

    def test_snapshot_del_pedido_sigue_inmutable(self):
        self.procesar(self.limite)
        pedido = Pedido.objects.get(pk=self.pedido.pk)
        with self.assertRaises(ValidationError):
            pedido.save()


class EstadoInicialTests(VencimientoTestCase):
    def test_nuevo_pedido_nace_confirmado_en_la_misma_transaccion(self):
        estado = self.pedido.estado_operativo
        self.assertEqual((estado.estado, estado.vencido_en), ("confirmado", None))
        self.assertEqual(estado.actualizado_en, self.pedido.confirmado_en)

    def test_fallo_al_crear_estado_revierte_la_confirmacion(self):
        producto = self.producto_con_stock(5)
        solicitud = solicitudes.crear_solicitud(
            comprador=self.comprador, renglones=[datos_renglon(producto, cantidad=2)]
        )
        renglon = solicitud.renglones.get()
        solicitudes.resolver_renglon(
            artesano=self.artesano,
            solicitud_id=solicitud.pk,
            renglon_id=renglon.pk,
            resolucion="aceptado",
            motivo_rechazo="",
        )
        propuestas.finalizar_propuesta(
            artesano=self.artesano,
            solicitud_id=solicitud.pk,
            modalidad_entrega="retiro_taller",
            costo_entrega=Decimal("0.00"),
            lineas=[{"renglon": renglon.pk}],
        )
        pedidos, reservas = Pedido.objects.count(), ReservaInventario.objects.count()
        with (
            mock.patch.object(
                EstadoOperativoPedido.objects, "create", side_effect=IntegrityError("simulado")
            ),
            self.assertRaises(IntegrityError),
        ):
            propuestas.decidir_propuesta(
                comprador=self.comprador, solicitud_id=solicitud.pk, decision="aceptar"
            )
        self.assertEqual(
            (Pedido.objects.count(), ReservaInventario.objects.count()), (pedidos, reservas)
        )
        self.assertEqual(InventarioProducto.objects.get(producto=producto).reservada, 0)

    def test_migracion_asigna_confirmado_sin_vencer_ni_tocar_reservas(self):
        EstadoOperativoPedido.objects.filter(pedido=self.pedido).delete()
        reservas = list(ReservaInventario.objects.values_list("id", "estado").order_by("id"))
        with mock.patch("apps.pagos.services.ahora", return_value=self.limite + UN_DIA * 30):
            migracion_estado_inicial().crear_estados_iniciales(registro_apps, None)
            migracion_estado_inicial().crear_estados_iniciales(registro_apps, None)
        estado = EstadoOperativoPedido.objects.get(pedido=self.pedido)
        self.assertEqual((estado.estado, estado.vencido_en), ("confirmado", None))
        self.assertEqual(EstadoOperativoPedido.objects.count(), Pedido.objects.count())
        self.assertFalse(EventoEstadoPedido.objects.exists())
        self.assertEqual(
            list(ReservaInventario.objects.values_list("id", "estado").order_by("id")), reservas
        )


class LecturaAPITests(VencimientoTestCase):
    def test_comprador_y_artesano_ven_estado_y_fecha(self):
        self.procesar(self.limite)
        vencido_en = self.limite
        for usuario, url in (
            (self.comprador, url_mi_pedido(self.pedido.pk)),
            (self.artesano, url_pedido_recibido(self.pedido.pk)),
        ):
            with self.subTest(url=url):
                self.autenticar(usuario)
                r = self.client.get(url)
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.data["estado"], "vencido_falta_pago")
                self.assertEqual(parse_datetime(r.data["vencido_en"]), vencido_en)
                self.assertNotIn("pago", r.data, "Estado del pedido ≠ estado del pago")

    def test_listados_exponen_el_estado(self):
        self.procesar(self.limite)
        estados = {p["id"]: p["estado"] for p in self.client.get(url_mis_pedidos()).data["results"]}
        self.assertEqual(estados[self.pedido.pk], "vencido_falta_pago")
        self.assertEqual(estados[self.pedido_taller_ajeno.pk], "confirmado")
        self.autenticar(self.artesano)
        recibidos = self.client.get(url_pedidos_recibidos()).data["results"]
        self.assertEqual(
            {p["id"]: p["estado"] for p in recibidos}[self.pedido.pk], "vencido_falta_pago"
        )

    def test_ajenos_no_ven_el_pedido(self):
        self.procesar(self.limite)
        self.autenticar(self.otro_comprador)
        self.assertEqual(self.client.get(url_mi_pedido(self.pedido.pk)).status_code, 404)
        self.autenticar(self.artesano_ajeno)
        self.assertEqual(self.client.get(url_pedido_recibido(self.pedido.pk)).status_code, 404)

    def test_confirmado_expone_estado_inicial(self):
        r = self.client.get(url_mi_pedido(self.pedido.pk))
        self.assertEqual((r.data["estado"], r.data["vencido_en"]), ("confirmado", None))

    def test_no_hay_endpoint_para_forzar_el_vencimiento(self):
        for metodo in ("post", "patch", "put"):
            with self.subTest(metodo=metodo):
                r = getattr(self.client, metodo)(url_mi_pedido(self.pedido.pk), {}, format="json")
                self.assertEqual(r.status_code, 405)


class ComandoTests(VencimientoTestCase):
    def ejecutar(self, momento, *args):
        salida = StringIO()
        with mock.patch("apps.pagos.services.ahora", return_value=momento):
            call_command("procesar_vencimientos_pago", *args, stdout=salida)
        return salida.getvalue()

    def test_escenarios_de_una_iteracion(self):
        self.assertIn("vencidos=0", self.ejecutar(self.limite - UN_SEGUNDO, "--once"))
        self.assertIn("vencidos=1", self.ejecutar(self.limite, "--once"))
        self.assertIn("vencidos=0", self.ejecutar(self.limite + UN_DIA, "--once"), "Ya vencido")

    def test_observado_y_no_recibido(self):
        otro = confirmar_pedido_con(
            comprador=self.comprador,
            artesano=self.artesano,
            renglones=[datos_renglon(self.producto, cantidad=1)],
        )
        revision = self.limite - timedelta(hours=2)
        self.con_resolucion("observado", revision)
        r = self.registrar_en(revision - timedelta(hours=1), otro)
        self.resolver_en(
            revision, self.intento_vigente(r), "no_recibido", "Sin fondos", pedido=otro
        )
        plazo = revision + vencimiento.PLAZO
        self.assertIn("vencidos=0", self.ejecutar(plazo - UN_SEGUNDO, "--once"))
        self.assertIn("vencidos=2", self.ejecutar(plazo, "--once"))

    def test_procesa_por_lotes_todos_los_candidatos(self):
        extra = [
            confirmar_pedido_con(
                comprador=self.comprador,
                artesano=self.artesano,
                renglones=[datos_renglon(self.producto, cantidad=1)],
            )
            for _ in range(2)
        ]
        momento = max(p.confirmado_en for p in extra) + vencimiento.PLAZO
        with mock.patch.object(vencimiento, "candidatos", wraps=vencimiento.candidatos) as espia:
            salida = self.ejecutar(momento, "--once", "--batch-size", "1")
        self.assertIn("vencidos=3", salida)
        self.assertEqual(espia.call_count, 4, "Tres lotes de 1 y una consulta vacía")
        self.assertTrue(all(c.kwargs["limite"] == 1 for c in espia.call_args_list))

    def test_modo_continuo_sin_dormir_de_verdad(self):
        from apps.pedidos.management.commands import procesar_vencimientos_pago as comando

        with mock.patch.object(comando.Command, "dormir") as dormir:
            salida = self.ejecutar(self.limite, "--interval", "60", "--max-iterations", "2")
        self.assertEqual(salida.count("vencidos="), 2)
        self.assertIn("vencidos=1", salida.splitlines()[0])
        dormir.assert_called_once_with(60)

    def test_argumentos_invalidos(self):
        from django.core.management import CommandError

        for args in (("--interval", "0"), ("--batch-size", "0")):
            with self.subTest(args=args), self.assertRaises(CommandError):
                self.ejecutar(self.limite, *args, "--max-iterations", "1")
