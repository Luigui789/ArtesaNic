"""AUD-13 — cancelación del artesano, cierre parcial, reembolsos externos y clasificación de
unidades (RF-010, RF-015, RF-021, RF-022, RF-023; RN-017, RN-019, RN-021, RN-024).

Pedidos, pagos y entregas reales (AUD-07/10/12); las acciones de AUD-13 por HTTP.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.inventario.models import (
    ClasificacionInventario,
    EstadoReserva,
    MovimientoInventario,
    ReservaInventario,
)
from apps.pagos import services as pagos
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.models import PLAZO
from apps.pagos.tests.base import imagen, reloj
from apps.pedidos import vencimiento
from apps.pedidos.models import (
    CancelacionPedido,
    CargoPedido,
    CierreParcialPedido,
    DevolucionReembolso,
    EstadoPedido,
    EventoEstadoPedido,
    LineaPedido,
    Pedido,
    ReembolsoPedido,
    TipoEventoPedido,
)

from .base_cumplimiento import personalizacion, produccion, stock
from .base_resolucion import (
    BAJA,
    LIBERACION,
    REINCORPORACION,
    ResolucionTestCase,
    foto_resolucion,
    movimientos,
)

D = Decimal


def snapshot(pedido):
    return (
        list(Pedido.objects.filter(pk=pedido.pk).values()),
        list(LineaPedido.objects.filter(pedido=pedido).order_by("pk").values()),
        list(CargoPedido.objects.filter(pedido=pedido).order_by("pk").values()),
    )


class CancelacionTests(ResolucionTestCase):
    def test_sin_pago_cancela_libera_reservas_y_no_crea_reembolso(self):
        pedido = self.pedido(stock(self.base, 3), produccion(self.base, 1), pago=None)
        antes = snapshot(pedido)
        self.assertEqual(self.inventario_de(self.base), (10, 3))
        respuesta = self.cancelar(pedido)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data["estado"], "cancelado_artesano")
        self.assertEqual(
            respuesta.data["cancelacion"]["motivo"], "El horno se dañó y no puedo cumplir."
        )
        self.assertIsNone(respuesta.data["reembolso"])
        self.assertEqual(self.estado(pedido), EstadoPedido.CANCELADO_ARTESANO)
        self.assertEqual(self.inventario_de(self.base), (10, 0))
        reserva = ReservaInventario.objects.get(pedido=pedido)
        self.assertEqual((reserva.estado, reserva.cantidad_consumida), (EstadoReserva.LIBERADA, 0))
        liberacion = movimientos(pedido, LIBERACION).get()
        self.assertEqual((liberacion.cantidad, liberacion.actor), (3, self.artesano))
        self.assertFalse(ReembolsoPedido.objects.filter(pedido=pedido).exists())
        self.assertEqual(self.obligaciones(pedido), [])
        evento = EventoEstadoPedido.objects.get(pedido=pedido, estado_nuevo="cancelado_artesano")
        self.assertEqual(
            (evento.estado_anterior, evento.tipo, evento.actor),
            (EstadoPedido.CONFIRMADO, TipoEventoPedido.ARTESANO, self.artesano),
        )
        self.assertEqual(snapshot(pedido), antes, "el snapshot contractual no cambia")

    def test_pagada_genera_reembolso_total_pendiente_por_el_total_congelado(self):
        pedido = self.pedido(stock(self.base, 2), personalizacion(self.base, 1))
        respuesta = self.cancelar(pedido)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        reembolso = ReembolsoPedido.objects.get(pedido=pedido)
        self.assertEqual(
            (reembolso.tipo, reembolso.monto, reembolso.moneda), ("total", pedido.total, "NIO")
        )
        self.assertEqual(reembolso.cancelacion, CancelacionPedido.objects.get(pedido=pedido))
        datos = respuesta.data["reembolso"]
        self.assertEqual(
            (datos["tipo"], D(datos["monto"]), datos["estado"], datos["origen"]),
            ("total", pedido.total, "pendiente", "cancelacion"),
        )
        self.assertIsNone(datos["devolucion"])
        self.assertEqual(self.inventario_de(self.base), (10, 0))

    def test_en_cumplimiento_sin_entregas_puede_cancelar_y_clasifica_lo_transformado(self):
        pedido = self.pedido(stock(self.base, 2), personalizacion(self.base, 2))
        st, pe = self.lineas(pedido)
        self.iniciar_srv(pedido, st)
        self.iniciar_srv(pedido, pe)  # consume las 2 unidades base
        self.assertEqual(self.inventario_de(self.base), (8, 2))
        respuesta = self.cancelar(pedido)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(self.inventario_de(self.base), (8, 0))
        (obligacion,) = self.obligaciones(pedido)
        self.assertEqual(
            (obligacion.linea_pedido, obligacion.cantidad, obligacion.cierre_parcial),
            (pe, 2, None),
        )
        self.assertEqual(obligacion.cancelacion, CancelacionPedido.objects.get(pedido=pedido))
        self.assertEqual(movimientos(pedido, LIBERACION).get().cantidad, 2)
        self.assertEqual(ReembolsoPedido.objects.get(pedido=pedido).monto, pedido.total)
        evento = EventoEstadoPedido.objects.get(pedido=pedido, estado_nuevo="cancelado_artesano")
        self.assertEqual(evento.estado_anterior, EstadoPedido.EN_CUMPLIMIENTO)

    def test_pago_registrado_u_observado_bloquea_sin_efectos(self):
        for estado_pago in ("registrado", "observado"):
            with self.subTest(pago=estado_pago):
                pedido = self.pedido(stock(self.base, 1), pago=estado_pago)
                antes = foto_resolucion(pedido)
                self.assertConflicto(self.cancelar(pedido), "pago_pendiente_de_resolucion")
                self.assertEqual(foto_resolucion(pedido), antes)

    def test_pago_no_recibido_permite_cancelar_sin_reembolso(self):
        pedido = self.pedido(stock(self.base, 1), pago="no_recibido")
        self.assertEqual(self.cancelar(pedido).status_code, 201)
        self.assertFalse(ReembolsoPedido.objects.filter(pedido=pedido).exists())
        self.assertEqual(self.inventario_de(self.base), (10, 0))

    def test_con_una_entrega_no_se_cancela(self):
        pedido = self.pedido(stock(self.base, 3))
        (linea,) = self.lineas(pedido)
        self.iniciar_srv(pedido, linea)
        self.entregar_srv(pedido, (linea, 1))
        antes = foto_resolucion(pedido)
        self.assertConflicto(self.cancelar(pedido), "cancelacion_requiere_sin_entregas")
        self.assertEqual(foto_resolucion(pedido), antes)

    def test_estados_terminales_y_vencido(self):
        entregado = self.pedido(stock(self.base, 1))
        (linea,) = self.lineas(entregado)
        self.iniciar_srv(entregado, linea)
        self.entregar_srv(entregado, (linea, 1))
        self.assertConflicto(self.cancelar(entregado), "pedido_finalizado")

        vencido = self.pedido(stock(self.base, 1), pago=None)
        with reloj(vencido.confirmado_en + PLAZO):
            self.assertTrue(vencimiento.vencer_pedido(vencido.pk))
        self.assertConflicto(self.cancelar(vencido), "pedido_vencido")

        cancelado = self.pedido(stock(self.base, 1), pago=None)
        self.assertEqual(self.cancelar(cancelado).status_code, 201)
        self.assertConflicto(self.cancelar(cancelado), "pedido_finalizado")

    def test_motivo_obligatorio_y_limites(self):
        pedido = self.pedido(stock(self.base, 1), pago=None)
        for motivo in ("", "   ", None):
            with self.subTest(motivo=motivo):
                respuesta = self.cancelar(pedido, motivo=motivo)
                self.assertEqual(respuesta.status_code, 400, respuesta.data)
                self.assertIn("motivo", respuesta.data)
        self.assertEqual(self.cancelar(pedido, motivo="x" * 1001).status_code, 400)
        self.assertEqual(self.cancelar(pedido, extra={"monto": "1.00"}).status_code, 400)
        self.assertEqual(self.estado(pedido), EstadoPedido.CONFIRMADO)
        self.assertEqual(self.cancelar(pedido, motivo="x" * 1000).status_code, 201)

    def test_idempotencia_replay_clave_reutilizada_y_clave_nueva(self):
        pedido = self.pedido(stock(self.base, 2))
        clave = self.nueva_clave()
        primera = self.cancelar(pedido, motivo="  Sin materia prima.  ", clave=clave)
        self.assertEqual(primera.status_code, 201, primera.data)
        repetida = self.cancelar(pedido, motivo="Sin materia prima.", clave=clave)
        self.assertEqual(repetida.status_code, 201)
        self.assertEqual(repetida["Idempotency-Replayed"], "true")
        self.assertEqual(CancelacionPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(ReembolsoPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(movimientos(pedido, LIBERACION).count(), 1)
        self.assertConflicto(
            self.cancelar(pedido, motivo="Otro motivo", clave=clave),
            "clave_idempotencia_reutilizada",
        )
        self.assertConflicto(
            self.cancelar(pedido, motivo="Sin materia prima."), "pedido_finalizado"
        )

    def test_tras_cancelar_no_admite_cumplimiento_ni_pago(self):
        pedido = self.pedido(stock(self.base, 1), pago=None)
        (linea,) = self.lineas(pedido)
        self.assertEqual(self.cancelar(pedido).status_code, 201)
        with self.assertRaises(pagos.ConflictoPago) as error:
            pagos.registrar_intento(
                comprador=self.comprador,
                pedido_id=pedido.pk,
                metodo="transferencia",
                referencia="TRX-1",
                comprobante=validar_comprobante(imagen()),
            )
        self.assertEqual(error.exception.codigo, "pedido_finalizado")
        pagado = self.pedido(stock(self.base, 1))
        (linea,) = self.lineas(pagado)
        self.assertEqual(self.cancelar(pagado).status_code, 201)
        respuesta = self.iniciar(pagado, linea)
        self.assertEqual(
            (respuesta.status_code, respuesta.data["codigo"]), (409, "pedido_finalizado")
        )
        respuesta = self.entregar(pagado, (linea, 1))
        self.assertEqual(
            (respuesta.status_code, respuesta.data["codigo"]), (409, "pedido_finalizado")
        )
        # El historial sigue legible para ambas partes.
        self.assertEqual(self.leer(pagado).status_code, 200)
        self.assertEqual(self.leer(pagado, recibido=True).data["estado"], "cancelado_artesano")
        self.assertEqual(
            self.client.get(f"/api/v1/pedidos/mios/{pagado.pk}/pago/").status_code, 200
        )

    def test_acciones_de_la_lectura(self):
        pedido = self.pedido(stock(self.base, 2), pago="registrado")
        acciones = self.leer_resolucion(pedido, recibido=True).data["acciones"]
        self.assertEqual(
            acciones["cancelar"], {"disponible": False, "codigo": "pago_pendiente_de_resolucion"}
        )
        self.assertEqual(acciones["proponer_cierre"]["codigo"], "cierre_requiere_entrega_parcial")
        pagado = self.pedido(stock(self.base, 2))
        datos = self.leer_resolucion(pagado).data
        self.assertEqual(datos["acciones"]["cancelar"], {"disponible": True, "codigo": None})
        self.assertIsNone(datos["estimacion_cierre"])


class CierreParcialTests(ResolucionTestCase):
    def setUp(self):
        super().setUp()
        self.otro = self.producto_con_stock(10, nombre="Plato", permite_personalizacion=True)

    def pedido_parcial(self):
        """Línea A acordado 5, entregado 2; línea B acordado 2, entregado 2."""
        pedido = self.pedido(stock(self.base, 5), stock(self.otro, 2))
        a, b = self.lineas(pedido)
        self.iniciar_srv(pedido, a)
        self.iniciar_srv(pedido, b)
        self.entregar_srv(pedido, (a, 2), (b, 2))
        return pedido, a, b

    def test_sin_entregas_o_entregado_no_procede(self):
        pedido = self.pedido(stock(self.base, 2))
        self.assertConflicto(self.proponer(pedido), "cierre_requiere_entrega_parcial")
        (linea,) = self.lineas(pedido)
        self.iniciar_srv(pedido, linea)
        self.assertConflicto(self.proponer(pedido), "cierre_requiere_entrega_parcial")
        self.entregar_srv(pedido, (linea, 2))
        self.assertConflicto(self.proponer(pedido), "pedido_finalizado")
        self.assertFalse(CierreParcialPedido.objects.filter(pedido=pedido).exists())

    def test_congela_cantidades_del_ledger_e_importe_del_servidor(self):
        pedido, a, b = self.pedido_parcial()
        inventario_antes = (self.inventario_de(self.base), self.inventario_de(self.otro))
        estimacion = self.leer_resolucion(pedido, recibido=True).data["estimacion_cierre"]
        respuesta = self.proponer(pedido)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        (cierre,) = respuesta.data["cierres_parciales"]
        self.assertEqual((cierre["numero"], cierre["estado"]), (1, "pendiente"))
        filas = {f["linea"]: f for f in cierre["lineas"]}
        self.assertEqual(
            (
                filas[a.pk]["cantidad_acordada"],
                filas[a.pk]["cantidad_entregada"],
                filas[a.pk]["cantidad_no_entregada"],
            ),
            (5, 2, 3),
        )
        self.assertEqual(
            (filas[b.pk]["cantidad_entregada"], filas[b.pk]["cantidad_no_entregada"]), (2, 0)
        )
        self.assertEqual(D(filas[b.pk]["importe_reembolso"]), D("0.00"))
        # Base A = subtotal + mitad de la entrega asignada; reembolso = base × 3/5.
        base_a = (
            a.subtotal
            + a.distribucion.entrega_asignada
            + a.distribucion.otros_compartidos_asignados
        )
        self.assertEqual(
            D(filas[a.pk]["importe_reembolso"]),
            (base_a * 3 / 5).quantize(D("0.01"), "ROUND_HALF_UP"),
        )
        self.assertEqual(D(cierre["monto_reembolso"]), D(filas[a.pk]["importe_reembolso"]))
        self.assertEqual(cierre["lineas"], estimacion["lineas"], "la estimación coincide")
        # Proponer no toca inventario, reembolso ni estado.
        self.assertEqual(
            (self.inventario_de(self.base), self.inventario_de(self.otro)), inventario_antes
        )
        self.assertEqual(self.estado(pedido), EstadoPedido.EN_CUMPLIMIENTO)
        self.assertFalse(ReembolsoPedido.objects.filter(pedido=pedido).exists())
        self.assertFalse(movimientos(pedido, LIBERACION).exists())

    def test_cierre_pendiente_bloquea_iniciar_entregar_y_otro_cierre(self):
        pedido = self.pedido(stock(self.base, 3), produccion(self.base, 1))
        st, pr = self.lineas(pedido)
        self.iniciar_srv(pedido, st)
        self.entregar_srv(pedido, (st, 1))
        self.assertEqual(self.proponer(pedido).status_code, 201)
        antes = foto_resolucion(pedido)
        for respuesta in (
            self.entregar(pedido, (st, 1)),
            self.iniciar(pedido, pr),
            self.proponer(pedido),
        ):
            self.assertEqual(respuesta.status_code, 409, respuesta.data)
            self.assertEqual(respuesta.data["codigo"], "cierre_parcial_pendiente")
        self.assertEqual(foto_resolucion(pedido), antes)
        self.assertConflicto(self.cancelar(pedido), "cancelacion_requiere_sin_entregas")

    def test_objecion_sin_efectos_y_nuevo_cierre_numerado(self):
        pedido, a, b = self.pedido_parcial()
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        antes = foto_resolucion(pedido)
        respuesta = self.responder(pedido, cierre["id"], "objetado", "Prefiero esperar el resto.")
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        objetado = respuesta.data["cierres_parciales"][0]
        self.assertEqual(
            (objetado["estado"], objetado["decision"]["motivo"]),
            ("objetado", "Prefiero esperar el resto."),
        )
        despues = foto_resolucion(pedido)
        self.assertEqual(despues.pop("decisiones"), 1)
        antes.pop("decisiones")
        self.assertEqual(despues, antes, "objetar no toca estado, reservas ni inventario")
        self.assertEqual(self.estado(pedido), EstadoPedido.EN_CUMPLIMIENTO)
        self.assertIsNone(respuesta.data["reembolso"])
        # Las entregas continúan normalmente.
        self.assertEqual(self.entregar(pedido, (a, 1)).status_code, 201)
        segundo = self.proponer(pedido, motivo="Sigue sin ser posible terminar.")
        self.assertEqual(segundo.status_code, 201, segundo.data)
        primero, nuevo = segundo.data["cierres_parciales"]
        self.assertEqual((primero["numero"], nuevo["numero"]), (1, 2))
        self.assertEqual(primero["lineas"], cierre["lineas"], "el intento previo no cambia")
        filas = {f["linea"]: f for f in nuevo["lineas"]}
        self.assertEqual(
            (filas[a.pk]["cantidad_entregada"], filas[a.pk]["cantidad_no_entregada"]), (3, 2)
        )

    def test_aceptacion_cierra_libera_y_crea_reembolso_parcial(self):
        pedido, a, b = self.pedido_parcial()
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        self.assertEqual(self.inventario_de(self.base), (8, 3))
        respuesta = self.responder(pedido, cierre["id"], "aceptado")
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data["estado"], "cerrado_parcial")
        self.assertEqual(self.estado(pedido), EstadoPedido.CERRADO_PARCIAL)
        reembolso = ReembolsoPedido.objects.get(pedido=pedido)
        self.assertEqual(
            (reembolso.tipo, reembolso.monto, reembolso.cierre_parcial_id),
            ("parcial", D(cierre["monto_reembolso"]), cierre["id"]),
        )
        self.assertTrue(0 < reembolso.monto < pedido.total)
        self.assertEqual(respuesta.data["reembolso"]["estado"], "pendiente")
        # Stock: 2 entregadas consumidas, 3 liberadas; nada que clasificar.
        self.assertEqual(self.inventario_de(self.base), (8, 0))
        liberacion = movimientos(pedido, LIBERACION).get()
        self.assertEqual((liberacion.cantidad, liberacion.actor), (3, self.comprador))
        reserva_a = ReservaInventario.objects.get(linea_pedido=a)
        self.assertEqual(
            (reserva_a.estado, reserva_a.cantidad_consumida), (EstadoReserva.LIBERADA, 2)
        )
        self.assertEqual(
            ReservaInventario.objects.get(linea_pedido=b).estado, EstadoReserva.CONSUMIDA
        )
        self.assertEqual(self.obligaciones(pedido), [])
        evento = EventoEstadoPedido.objects.get(pedido=pedido, estado_nuevo="cerrado_parcial")
        self.assertEqual(
            (evento.estado_anterior, evento.tipo, evento.actor),
            (EstadoPedido.EN_CUMPLIMIENTO, TipoEventoPedido.COMPRADOR, self.comprador),
        )
        # Terminal: sin nuevas entregas, cierres ni cancelación.
        self.assertEqual(self.entregar(pedido, (a, 1)).data["codigo"], "pedido_finalizado")
        self.assertConflicto(self.proponer(pedido), "pedido_finalizado")
        self.assertConflicto(self.cancelar(pedido), "pedido_finalizado")
        self.assertConflicto(
            self.responder(pedido, cierre["id"], "objetado", "x"), "cierre_ya_resuelto"
        )

    def test_personalizacion_base_parcial_crea_obligacion_sin_liberar(self):
        pedido = self.pedido(personalizacion(self.base, 4))
        (linea,) = self.lineas(pedido)
        self.iniciar_srv(pedido, linea)
        self.entregar_srv(pedido, (linea, 1))
        self.assertEqual(self.inventario_de(self.base), (6, 0))
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        self.assertEqual(self.responder(pedido, cierre["id"], "aceptado").status_code, 201)
        self.assertEqual(self.inventario_de(self.base), (6, 0))
        self.assertFalse(movimientos(pedido, LIBERACION).exists())
        (obligacion,) = self.obligaciones(pedido)
        self.assertEqual(
            (obligacion.cantidad, obligacion.linea_pedido, obligacion.cancelacion),
            (3, linea, None),
        )
        self.assertEqual(obligacion.cierre_parcial_id, cierre["id"])

    def test_produccion_y_desde_cero_no_generan_obligaciones(self):
        pedido = self.pedido(
            produccion(self.base, 2), personalizacion(self.otro, 2, origen="desde_cero")
        )
        pr, dc = self.lineas(pedido)
        self.iniciar_srv(pedido, pr)
        self.iniciar_srv(pedido, dc)
        self.entregar_srv(pedido, (pr, 1), (dc, 1))
        movimientos_antes = MovimientoInventario.objects.count()
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        self.assertEqual(self.responder(pedido, cierre["id"], "aceptado").status_code, 201)
        self.assertEqual(self.obligaciones(pedido), [])
        self.assertEqual(MovimientoInventario.objects.count(), movimientos_antes)
        self.assertEqual(
            (self.inventario_de(self.base), self.inventario_de(self.otro)), ((10, 0), (10, 0))
        )

    def test_respuesta_valida_motivo_y_pertenencia(self):
        pedido, _a, _b = self.pedido_parcial()
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        self.assertEqual(
            self.responder(pedido, cierre["id"], "aceptado", "No hace falta").status_code, 400
        )
        self.assertEqual(self.responder(pedido, cierre["id"], "objetado").status_code, 400)
        self.assertEqual(self.responder(pedido, cierre["id"], "objetado", "  ").status_code, 400)
        self.assertEqual(self.responder(pedido, cierre["id"], "otro").status_code, 400)
        self.assertEqual(
            self.responder(pedido, cierre["id"], "objetado", "x" * 1001).status_code, 400
        )
        self.assertEqual(self.responder(pedido, cierre["id"] + 999, "aceptado").status_code, 404)
        otro = self.pedido(stock(self.base, 1))
        self.assertEqual(self.responder(otro, cierre["id"], "aceptado").status_code, 404)
        self.assertEqual(
            self.responder(pedido, cierre["id"], "aceptado", como=self.otro_comprador).status_code,
            404,
        )
        self.assertEqual(
            self.responder(pedido, cierre["id"], "aceptado", como=self.artesano).status_code, 403
        )
        self.assertEqual(self.estado(pedido), EstadoPedido.EN_CUMPLIMIENTO)

    def test_idempotencia_de_propuesta_y_respuesta(self):
        pedido, _a, _b = self.pedido_parcial()
        clave = self.nueva_clave()
        primera = self.proponer(pedido, clave=clave)
        repetida = self.proponer(pedido, clave=clave)
        self.assertEqual((primera.status_code, repetida.status_code), (201, 201))
        self.assertEqual(repetida["Idempotency-Replayed"], "true")
        self.assertEqual(CierreParcialPedido.objects.filter(pedido=pedido).count(), 1)
        cierre_id = primera.data["cierres_parciales"][0]["id"]
        clave = self.nueva_clave()
        self.assertEqual(
            self.responder(pedido, cierre_id, "aceptado", clave=clave).status_code, 201
        )
        repetida = self.responder(pedido, cierre_id, "aceptado", clave=clave)
        self.assertEqual((repetida.status_code, repetida["Idempotency-Replayed"]), (201, "true"))
        self.assertConflicto(
            self.responder(pedido, cierre_id, "objetado", "No", clave=clave),
            "clave_idempotencia_reutilizada",
        )
        self.assertEqual(ReembolsoPedido.objects.filter(pedido=pedido).count(), 1)
        self.assertEqual(movimientos(pedido, LIBERACION).count(), 1)

    def test_pago_tras_cerrar_responde_pedido_finalizado(self):
        pedido, _a, _b = self.pedido_parcial()
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        self.responder(pedido, cierre["id"], "aceptado")
        intento = pedido.pago.intentos.get()
        with self.assertRaises(pagos.ConflictoPago) as error:
            pagos.resolver_intento(
                artesano=self.artesano,
                pedido_id=pedido.pk,
                intento_id=intento.pk,
                resultado="observado",
                motivo="Tarde",
            )
        self.assertEqual(error.exception.codigo, "pedido_finalizado")


class ReembolsoTests(ResolucionTestCase):
    def cancelado_pagado(self):
        pedido = self.pedido(stock(self.base, 2))
        self.assertEqual(self.cancelar(pedido).status_code, 201)
        return pedido

    def test_devolucion_realiza_el_reembolso_con_el_monto_de_la_obligacion(self):
        pedido = self.cancelado_pagado()
        lectura = self.leer_resolucion(pedido).data["reembolso"]
        self.assertEqual(lectura["estado"], "pendiente")
        respuesta = self.devolver(pedido, referencia="  Transferencia BAC 12345  ")
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        reembolso = respuesta.data["reembolso"]
        self.assertEqual(reembolso["estado"], "realizado")
        self.assertEqual(
            (reembolso["devolucion"]["referencia"], D(reembolso["devolucion"]["monto"])),
            ("Transferencia BAC 12345", pedido.total),
        )
        devolucion = DevolucionReembolso.objects.get(reembolso__pedido=pedido)
        self.assertEqual(
            (devolucion.monto, devolucion.registrado_por, devolucion.fecha),
            (pedido.total, self.artesano, timezone.localdate()),
        )
        self.assertEqual(self.leer_resolucion(pedido).data["reembolso"]["estado"], "realizado")

    def test_no_confia_en_montos_del_cliente_y_valida_fecha_y_referencia(self):
        pedido = self.cancelado_pagado()
        for extra in ({"monto": "1.00"}, {"moneda": "USD"}, {"estado": "realizado"}):
            with self.subTest(extra=extra):
                respuesta = self.devolver(pedido, extra=extra)
                self.assertEqual(respuesta.status_code, 400, respuesta.data)
                self.assertIn(next(iter(extra)), respuesta.data)
        manana = timezone.localdate() + timedelta(days=1)
        self.assertIn("fecha", self.devolver(pedido, fecha=manana).data)
        self.assertEqual(self.devolver(pedido, fecha="2026-13-01").status_code, 400)
        self.assertIn("referencia", self.devolver(pedido, referencia="   ").data)
        self.assertEqual(self.devolver(pedido, referencia="x" * 121).status_code, 400)
        self.assertFalse(DevolucionReembolso.objects.exists())
        ayer = timezone.localdate() - timedelta(days=1)
        self.assertEqual(self.devolver(pedido, fecha=ayer, referencia="x" * 120).status_code, 201)

    def test_una_sola_devolucion_replay_y_clave_nueva(self):
        pedido = self.cancelado_pagado()
        clave = self.nueva_clave()
        self.assertEqual(self.devolver(pedido, clave=clave).status_code, 201)
        repetida = self.devolver(pedido, clave=clave)
        self.assertEqual((repetida.status_code, repetida["Idempotency-Replayed"]), (201, "true"))
        self.assertConflicto(self.devolver(pedido), "reembolso_ya_realizado")
        self.assertConflicto(
            self.devolver(pedido, referencia="Otra", clave=clave), "clave_idempotencia_reutilizada"
        )
        self.assertEqual(DevolucionReembolso.objects.count(), 1)
        devolucion = DevolucionReembolso.objects.get()
        with self.assertRaises(ValidationError):
            devolucion.save()
        with self.assertRaises(ValidationError):
            devolucion.delete()

    def test_sin_reembolso_responde_404(self):
        sin_pago = self.pedido(stock(self.base, 1), pago=None)
        self.assertEqual(self.cancelar(sin_pago).status_code, 201)
        self.assertEqual(self.devolver(sin_pago).status_code, 404)
        vivo = self.pedido(stock(self.base, 1))
        self.assertEqual(self.devolver(vivo).status_code, 404)


class ClasificacionTests(ResolucionTestCase):
    def pedido_con_obligacion(self, cantidad=4, entregadas=1):
        """Personalización sobre unidad base: cantidad consumida al iniciar; cierre aceptado
        tras ``entregadas`` → obligación por ``cantidad - entregadas``."""
        pedido = self.pedido(personalizacion(self.base, cantidad))
        (linea,) = self.lineas(pedido)
        self.iniciar_srv(pedido, linea)
        self.entregar_srv(pedido, (linea, entregadas))
        cierre = self.proponer(pedido).data["cierres_parciales"][0]
        self.assertEqual(self.responder(pedido, cierre["id"], "aceptado").status_code, 201)
        (obligacion,) = self.obligaciones(pedido)
        return pedido, obligacion

    def test_reutilizable_reincorpora_existencia(self):
        pedido, obligacion = self.pedido_con_obligacion()
        self.assertEqual(self.inventario_de(self.base), (6, 0))
        respuesta = self.clasificar(
            pedido, (obligacion.pk, 2, "reutilizable", "Se puede vender sin alteraciones.")
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(self.inventario_de(self.base), (8, 0))
        movimiento = movimientos(pedido, REINCORPORACION).get()
        self.assertEqual(
            (
                movimiento.cantidad,
                movimiento.existencia_antes,
                movimiento.existencia_despues,
                movimiento.reservada_antes,
                movimiento.reservada_despues,
                movimiento.reserva_id,
            ),
            (2, 6, 8, 0, 0, obligacion.reserva_id),
        )
        (fila,) = respuesta.data["obligaciones"]
        self.assertEqual(
            (fila["cantidad"], fila["cantidad_clasificada"], fila["cantidad_pendiente"]), (3, 2, 1)
        )
        self.assertEqual(fila["producto"]["nombre"], "Jarrón base")
        self.assertEqual(fila["origen"], "cierre_parcial")
        disponible = self.client.get(f"/api/v1/productos/{self.base.pk}/").data["disponible_stock"]
        self.assertEqual(disponible, 8)

    def test_baja_no_descuenta_dos_veces(self):
        pedido, obligacion = self.pedido_con_obligacion()
        respuesta = self.clasificar(pedido, (obligacion.pk, 1, "baja", "La pieza quedó rayada."))
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(self.inventario_de(self.base), (6, 0))
        clasificacion = ClasificacionInventario.objects.get()
        self.assertEqual((clasificacion.resultado, clasificacion.cantidad), ("baja", 1))
        movimiento = movimientos(pedido, BAJA).get()
        self.assertEqual(clasificacion.movimiento, movimiento)
        self.assertEqual(
            (movimiento.existencia_antes, movimiento.existencia_despues, movimiento.motivo),
            (6, 6, "La pieza quedó rayada."),
        )
        self.assertEqual(movimiento.reservada_antes, movimiento.reservada_despues)

    def test_varios_pasos_y_exceso_sin_efectos(self):
        pedido, obligacion = self.pedido_con_obligacion()
        self.assertEqual(
            self.clasificar(pedido, (obligacion.pk, 2, "reutilizable", "Intacta")).status_code, 201
        )
        antes = (self.inventario_de(self.base), MovimientoInventario.objects.count())
        respuesta = self.clasificar(pedido, (obligacion.pk, 2, "baja", "Rota"))
        self.assertConflicto(respuesta, "clasificacion_excede_pendiente")
        self.assertEqual(respuesta.data["obligaciones"], [obligacion.pk])
        self.assertEqual(
            (self.inventario_de(self.base), MovimientoInventario.objects.count()), antes
        )
        self.assertEqual(ClasificacionInventario.objects.count(), 1)
        self.assertEqual(
            self.clasificar(pedido, (obligacion.pk, 1, "baja", "Rota")).status_code, 201
        )
        fila = self.leer_clasificaciones(pedido).data["obligaciones"][0]
        self.assertEqual((fila["cantidad_pendiente"], len(fila["clasificaciones"])), (0, 2))

    def test_entrada_invalida_y_acceso(self):
        pedido, obligacion = self.pedido_con_obligacion()
        otro, ajena = self.pedido_con_obligacion(cantidad=2, entregadas=1)
        casos = [
            [(ajena.pk, 1, "baja", "x")],
            [(obligacion.pk, 1, "baja", "x"), (obligacion.pk, 1, "reutilizable", "y")],
            [(obligacion.pk, 1, "baja", "   ")],
            [(obligacion.pk, 0, "baja", "x")],
            [(obligacion.pk, 1, "perdida", "x")],
            [(obligacion.pk, 1, "baja", "x" * 501)],
        ]
        for items in casos:
            with self.subTest(items=items):
                self.assertEqual(self.clasificar(pedido, *items).status_code, 400)
        self.assertEqual(
            self._post(
                f"/api/v1/pedidos/recibidos/{pedido.pk}/clasificaciones/",
                {"clasificaciones": []},
                como=self.artesano,
            ).status_code,
            400,
        )
        self.assertFalse(ClasificacionInventario.objects.exists())
        self.assertEqual(self.leer_clasificaciones(pedido, como=self.comprador).status_code, 403)
        self.assertEqual(
            self.leer_clasificaciones(pedido, como=self.artesano_ajeno).status_code, 404
        )
        respuesta = self.clasificar(
            pedido, (obligacion.pk, 1, "baja", "x"), como=self.artesano_ajeno
        )
        self.assertEqual(respuesta.status_code, 404)

    def test_idempotencia_ordena_la_huella(self):
        pedido = self.pedido(personalizacion(self.base, 2), personalizacion(self.base, 2))
        a, b = self.lineas(pedido)
        self.iniciar_srv(pedido, a)
        self.iniciar_srv(pedido, b)
        self.assertEqual(self.cancelar(pedido).status_code, 201)
        o1, o2 = self.obligaciones(pedido)
        clave = self.nueva_clave()
        primera = self.clasificar(
            pedido, (o2.pk, 1, "baja", "Rota"), (o1.pk, 2, "reutilizable", "Intacta"), clave=clave
        )
        self.assertEqual(primera.status_code, 201, primera.data)
        repetida = self.clasificar(
            pedido, (o1.pk, 2, "reutilizable", "Intacta"), (o2.pk, 1, "baja", "Rota"), clave=clave
        )
        self.assertEqual((repetida.status_code, repetida["Idempotency-Replayed"]), (201, "true"))
        self.assertEqual(ClasificacionInventario.objects.count(), 2)
        self.assertEqual(movimientos(pedido, REINCORPORACION).count(), 1)
        self.assertEqual(self.obligaciones(pedido)[0].cancelacion.pedido, pedido)


class AccesoTests(ResolucionTestCase):
    def test_ownership_roles_y_autenticacion(self):
        pedido = self.pedido(stock(self.base, 1))
        self.assertEqual(self.leer_resolucion(pedido).status_code, 200)
        self.assertEqual(self.leer_resolucion(pedido, recibido=True).status_code, 200)
        self.assertEqual(self.leer_resolucion(pedido, como=self.otro_comprador).status_code, 404)
        self.assertEqual(
            self.leer_resolucion(pedido, recibido=True, como=self.artesano_ajeno).status_code, 404
        )
        self.assertEqual(self.leer_resolucion(pedido, como=self.artesano).status_code, 403)
        self.assertEqual(
            self.leer_resolucion(pedido, recibido=True, como=self.comprador).status_code, 403
        )
        base = f"/api/v1/pedidos/recibidos/{pedido.pk}/"
        for ruta, datos in (
            ("cancelacion/", {"motivo": "x"}),
            ("cierres-parciales/", {"motivo": "x"}),
            ("reembolso/realizacion/", {"fecha": "2026-01-01", "referencia": "r"}),
        ):
            with self.subTest(ruta=ruta):
                self.assertEqual(
                    self._post(base + ruta, datos, como=self.comprador).status_code, 403
                )
                self.assertEqual(
                    self._post(base + ruta, datos, como=self.artesano_ajeno).status_code, 404
                )
        self.assertEqual(self.cancelar(pedido, como=self.artesano_ajeno).status_code, 404)
        pendiente = self.taller_pendiente.propietario
        self.assertEqual(self.cancelar(pedido, como=pendiente).status_code, 403)
        self.client.credentials()
        self.assertEqual(
            self.client.get(f"/api/v1/pedidos/mios/{pedido.pk}/resolucion/").status_code, 401
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/pedidos/recibidos/{pedido.pk}/cancelacion/",
                {"motivo": "x"},
                format="json",
                HTTP_IDEMPOTENCY_KEY=self.nueva_clave(),
            ).status_code,
            401,
        )
        self.assertEqual(self.estado(pedido), EstadoPedido.CONFIRMADO)

    def test_idempotency_key_obligatoria(self):
        pedido = self.pedido(stock(self.base, 1))
        self.autenticar(self.artesano)
        respuesta = self.client.post(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/cancelacion/", {"motivo": "x"}, format="json"
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("Idempotency-Key", respuesta.data)
