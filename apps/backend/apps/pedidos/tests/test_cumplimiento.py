"""AUD-12: cumplimiento por renglón, entregas parciales y evidencia del comprador.

RF-010, RF-017, RF-022, RF-023; RN-015, RN-018, RN-021, RN-022, RN-023. Cada prueba recorre el
flujo real (solicitud → propuesta → pedido → pago) y comprueba efectos en PostgreSQL.
"""

from datetime import UTC, date, datetime, timedelta
from importlib import import_module
from unittest import mock

from django.apps import apps as registro_apps
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.inventario import services as inventario
from apps.inventario.models import EstadoReserva, ReservaInventario
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.pagos.tests.base import reloj
from apps.pedidos import cumplimiento, selectors
from apps.pedidos.models import (
    CumplimientoLineaPedido,
    EntregaPedido,
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    LineaEntrega,
    RecepcionEntrega,
    TipoEventoPedido,
)

from .base_cumplimiento import (
    CumplimientoTestCase,
    consumos,
    foto_inventario,
    personalizacion,
    produccion,
    stock,
    url_cumplimiento,
    url_entregas,
    url_iniciar,
    url_recepcion,
)

ESTADOS_PAGO_BLOQUEANTES = [None, "registrado", "observado", "no_recibido"]


def migracion_cumplimiento_inicial():
    return import_module("apps.pedidos.migrations.0006_cumplimiento_inicial_lineas_existentes")


class PagoConfirmadoTests(CumplimientoTestCase):
    """RN-015 / D-AUD12-02: sin Pago confirmado no se inicia ni se entrega nada."""

    def setUp(self):
        super().setUp()
        # Muchos pedidos por prueba: existencia holgada para que todos puedan reservar.
        self.base = self.producto_con_stock(
            100, nombre="Base holgada", permite_produccion=True, permite_personalizacion=True
        )

    def renglones(self):
        return {
            "stock": stock(self.base, 2),
            "produccion": produccion(self.base, 2),
            "desde_cero": personalizacion(self.base, 1, origen="desde_cero"),
            "unidad_estandar": personalizacion(self.base, 1),
        }

    def test_pago_no_confirmado_bloquea_iniciar_en_las_tres_modalidades(self):
        for modalidad, renglon in self.renglones().items():
            for estado_pago in ESTADOS_PAGO_BLOQUEANTES:
                with self.subTest(modalidad=modalidad, pago=estado_pago):
                    pedido = self.pedido(renglon, pago=estado_pago)
                    antes = foto_inventario(pedido)
                    r = self.iniciar(pedido, self.lineas(pedido)[0])
                    self.assertEqual(r.status_code, 409, r.data)
                    self.assertEqual(r.data["codigo"], "pago_no_confirmado")
                    self.assertEqual(foto_inventario(pedido), antes)
                    self.assertIsNone(self.lineas(pedido)[0].cumplimiento.iniciado_en)
                    self.assertEqual(self.estado(pedido), EstadoPedido.CONFIRMADO)

    def test_pago_confirmado_permite_iniciar_en_las_tres_modalidades(self):
        for modalidad, renglon in self.renglones().items():
            with self.subTest(modalidad=modalidad):
                pedido = self.pedido(renglon)
                r = self.iniciar(pedido, self.lineas(pedido)[0])
                self.assertEqual(r.status_code, 200, r.data)
                self.assertEqual(r.data["estado"], EstadoPedido.EN_CUMPLIMIENTO)

    def test_pago_no_confirmado_bloquea_entregas(self):
        for estado_pago in ESTADOS_PAGO_BLOQUEANTES:
            with self.subTest(pago=estado_pago):
                pedido = self.pedido(stock(self.base, 1), pago=estado_pago)
                antes = foto_inventario(pedido)
                r = self.entregar(pedido, (self.lineas(pedido)[0], 1))
                self.assertEqual(r.status_code, 409, r.data)
                self.assertEqual(r.data["codigo"], "pago_no_confirmado")
                self.assertEqual(foto_inventario(pedido), antes)

    def test_servicio_rechaza_aunque_se_salte_la_vista(self):
        pedido = self.pedido(stock(self.base, 1), pago="registrado")
        with self.assertRaises(cumplimiento.ConflictoCumplimiento) as ctx:
            cumplimiento.iniciar_linea(
                artesano=self.artesano, pedido_id=pedido.pk, linea_id=self.lineas(pedido)[0].pk
            )
        self.assertEqual(ctx.exception.codigo, "pago_no_confirmado")


class InicioTests(CumplimientoTestCase):
    def test_stock_marca_inicio_sin_tocar_inventario(self):
        pedido = self.pedido(stock(self.base, 3))
        (linea,) = self.lineas(pedido)
        self.assertEqual(self.inventario_de(self.base), (10, 3))
        r = self.iniciar(pedido, linea)
        self.assertEqual(r.status_code, 200, r.data)
        cumpl = CumplimientoLineaPedido.objects.get(linea_pedido=linea)
        self.assertIsNotNone(cumpl.iniciado_en)
        self.assertEqual(cumpl.iniciado_por, self.artesano)
        self.assertEqual(self.estado(pedido), EstadoPedido.EN_CUMPLIMIENTO)
        self.assertEqual(self.inventario_de(self.base), (10, 3), "la reserva sigue comprometida")
        self.assertFalse(consumos(pedido).exists())
        reserva = ReservaInventario.objects.get(linea_pedido=linea)
        self.assertEqual((reserva.estado, reserva.cantidad_consumida), (EstadoReserva.ACTIVA, 0))
        linea_vista = r.data["lineas"][0]
        self.assertEqual(linea_vista["estado"], "en_cumplimiento")
        self.assertEqual(linea_vista["cantidad_pendiente"], 3)

    def test_primer_inicio_crea_evento_manual_y_los_siguientes_no(self):
        pedido = self.pedido(stock(self.base, 1), produccion(self.base, 1))
        primera, segunda = self.lineas(pedido)
        self.assertEqual(self.iniciar(pedido, primera).status_code, 200)
        self.assertEqual(self.iniciar(pedido, segunda).status_code, 200)
        evento = EventoEstadoPedido.objects.get(pedido=pedido)
        self.assertEqual(
            (evento.estado_anterior, evento.estado_nuevo, evento.tipo, evento.actor),
            (
                EstadoPedido.CONFIRMADO,
                EstadoPedido.EN_CUMPLIMIENTO,
                TipoEventoPedido.ARTESANO,
                self.artesano,
            ),
        )

    def test_produccion_no_toca_inventario(self):
        pedido = self.pedido(produccion(self.base, 4))
        antes = foto_inventario(pedido)
        self.assertEqual(self.iniciar(pedido, self.lineas(pedido)[0]).status_code, 200)
        despues = foto_inventario(pedido)
        self.assertEqual(despues["inventarios"], antes["inventarios"])
        self.assertEqual(despues["movimientos"], antes["movimientos"])
        self.assertFalse(ReservaInventario.objects.filter(pedido=pedido).exists())

    def test_personalizacion_desde_cero_no_consume(self):
        pedido = self.pedido(personalizacion(self.base, 2, origen="desde_cero"))
        antes = foto_inventario(pedido)
        self.assertEqual(self.iniciar(pedido, self.lineas(pedido)[0]).status_code, 200)
        despues = foto_inventario(pedido)
        self.assertEqual(despues["inventarios"], antes["inventarios"])
        self.assertEqual(despues["movimientos"], antes["movimientos"])
        self.assertFalse(consumos(pedido).exists())

    def test_unidad_estandar_consume_toda_la_reserva_al_iniciar(self):
        pedido = self.pedido(personalizacion(self.base, 2))
        (linea,) = self.lineas(pedido)
        reserva = ReservaInventario.objects.get(linea_pedido=linea)
        self.assertEqual(self.inventario_de(self.base), (10, 2))
        self.assertEqual(reserva.cantidad_consumida, 0)
        r = self.iniciar(pedido, linea)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.inventario_de(self.base), (8, 0))
        reserva.refresh_from_db()
        self.assertEqual(reserva.cantidad, 2, "la cantidad original no se reescribe")
        self.assertEqual(reserva.cantidad_consumida, 2)
        self.assertEqual(reserva.estado, EstadoReserva.CONSUMIDA)
        (mov,) = consumos(pedido)
        self.assertEqual(
            (mov.cantidad, mov.existencia_antes, mov.existencia_despues),
            (2, 10, 8),
        )
        self.assertEqual((mov.reservada_antes, mov.reservada_despues), (2, 0))
        self.assertEqual(
            (mov.linea_pedido, mov.reserva, mov.actor), (linea, reserva, self.artesano)
        )
        self.assertEqual(mov.motivo, f"Consumo al iniciar transformación del pedido #{pedido.pk}.")

    def test_unidad_estandar_no_vuelve_a_consumir_al_entregar(self):
        pedido = self.pedido(personalizacion(self.base, 2))
        (linea,) = self.lineas(pedido)
        self.iniciar(pedido, linea)
        r = self.entregar(pedido, (linea, 2))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(consumos(pedido).count(), 1)
        self.assertEqual(self.inventario_de(self.base), (8, 0))
        self.assertEqual(self.estado(pedido), EstadoPedido.ENTREGADO)

    def test_iniciar_dos_veces_con_claves_distintas(self):
        pedido = self.pedido(personalizacion(self.base, 2))
        (linea,) = self.lineas(pedido)
        self.assertEqual(self.iniciar(pedido, linea).status_code, 200)
        r = self.iniciar(pedido, linea)
        self.assertEqual(r.status_code, 409, r.data)
        self.assertEqual(r.data["codigo"], "linea_ya_iniciada")
        self.assertEqual(consumos(pedido).count(), 1, "nunca consume dos veces")

    def test_linea_de_otro_pedido_responde_404(self):
        pedido = self.pedido(stock(self.base, 1))
        otro = self.pedido(stock(self.base, 1))
        r = self.iniciar(pedido, self.lineas(otro)[0])
        self.assertEqual(r.status_code, 404)
        self.assertIsNone(self.lineas(otro)[0].cumplimiento.iniciado_en)

    def test_pedido_vencido_rechaza_iniciar(self):
        pedido = self.pedido(stock(self.base, 1), pago=None)
        EstadoOperativoPedido.objects.filter(pedido=pedido).update(
            estado=EstadoPedido.VENCIDO_FALTA_PAGO, vencido_en=timezone.now()
        )
        r = self.iniciar(pedido, self.lineas(pedido)[0])
        self.assertEqual((r.status_code, r.data["codigo"]), (409, "pedido_vencido"))
        r = self.entregar(pedido, (self.lineas(pedido)[0], 1))
        self.assertEqual((r.status_code, r.data["codigo"]), (409, "pedido_vencido"))

    def test_pedido_entregado_rechaza_iniciar_y_entregar(self):
        pedido = self.pedido(stock(self.base, 1))
        (linea,) = self.lineas(pedido)
        self.iniciar(pedido, linea)
        self.assertEqual(self.entregar(pedido, (linea, 1)).status_code, 201)
        r = self.iniciar(pedido, linea)
        self.assertEqual((r.status_code, r.data["codigo"]), (409, "pedido_entregado"))
        r = self.entregar(pedido, (linea, 1))
        self.assertEqual((r.status_code, r.data["codigo"]), (409, "pedido_entregado"))

    def test_cuerpo_con_campos_no_admitidos(self):
        pedido = self.pedido(stock(self.base, 1))
        self.autenticar(self.artesano)
        r = self.client.post(
            url_iniciar(pedido.pk, self.lineas(pedido)[0].pk),
            {"estado": "en_cumplimiento"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="clave-de-prueba-0001",
        )
        self.assertEqual(r.status_code, 400)

    def test_sin_clave_de_idempotencia(self):
        pedido = self.pedido(stock(self.base, 1))
        self.autenticar(self.artesano)
        r = self.client.post(url_iniciar(pedido.pk, self.lineas(pedido)[0].pk), {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Idempotency-Key", r.data)


class IdempotenciaInicioTests(CumplimientoTestCase):
    def test_replay_y_clave_reutilizada_en_otra_linea(self):
        pedido = self.pedido(personalizacion(self.base, 1), stock(self.base, 1))
        primera, segunda = self.lineas(pedido)
        clave = "inicio-aud12-0000001"
        r1 = self.iniciar(pedido, primera, clave=clave)
        r2 = self.iniciar(pedido, primera, clave=clave)
        self.assertEqual((r1.status_code, r2.status_code), (200, 200))
        self.assertEqual(r2["Idempotency-Replayed"], "true")
        self.assertNotIn("Idempotency-Replayed", r1)
        self.assertEqual(consumos(pedido).count(), 1)
        r3 = self.iniciar(pedido, segunda, clave=clave)
        self.assertEqual(
            (r3.status_code, r3.data["codigo"]), (409, "clave_idempotencia_reutilizada")
        )
        self.assertIsNone(CumplimientoLineaPedido.objects.get(linea_pedido=segunda).iniciado_en)

    def test_recuperacion_generica_del_resultado(self):
        pedido = self.pedido(stock(self.base, 1))
        clave = "inicio-aud12-0000002"
        self.iniciar(pedido, self.lineas(pedido)[0], clave=clave)
        self.autenticar(self.artesano)
        r = self.client.get(f"/api/v1/operaciones/iniciar_cumplimiento_linea/{clave}/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["recurso"]["tipo"], "cumplimientolineapedido")
        self.assertEqual(r.data["codigo_http"], 200)


class EntregaStockTests(CumplimientoTestCase):
    """Ejemplo D-AUD12-05: física 10, reservada 5 → entregas de 2 y de 3."""

    def setUp(self):
        super().setUp()
        self.pedido_stock = self.pedido(stock(self.base, 5))
        (self.linea,) = self.lineas(self.pedido_stock)
        self.reserva = ReservaInventario.objects.get(linea_pedido=self.linea)
        self.iniciar(self.pedido_stock, self.linea)

    def test_entrega_parcial_y_final(self):
        self.assertEqual(self.inventario_de(self.base), (10, 5))
        r = self.entregar(self.pedido_stock, (self.linea, 2))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.inventario_de(self.base), (8, 3), "disponible sigue en 5")
        self.reserva.refresh_from_db()
        self.assertEqual((self.reserva.cantidad_consumida, self.reserva.estado), (2, "activa"))
        self.assertEqual(self.estado(self.pedido_stock), EstadoPedido.EN_CUMPLIMIENTO)
        linea = r.data["lineas"][0]
        self.assertEqual(
            (linea["estado"], linea["cantidad_entregada"], linea["cantidad_pendiente"]),
            ("en_cumplimiento", 2, 3),
        )
        (mov,) = consumos(self.pedido_stock)
        self.assertEqual(
            (mov.cantidad, mov.reserva, mov.linea_pedido), (2, self.reserva, self.linea)
        )
        self.assertEqual(mov.motivo, f"Consumo por entrega #1 del pedido #{self.pedido_stock.pk}.")

        r = self.entregar(self.pedido_stock, (self.linea, 3))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.inventario_de(self.base), (5, 0), "disponible sigue en 5")
        self.reserva.refresh_from_db()
        self.assertEqual(
            (self.reserva.cantidad, self.reserva.cantidad_consumida, self.reserva.estado),
            (5, 5, EstadoReserva.CONSUMIDA),
        )
        self.assertEqual(r.data["estado"], EstadoPedido.ENTREGADO)
        self.assertEqual(r.data["lineas"][0]["estado"], "entregado")
        self.assertEqual(r.data["lineas"][0]["cantidad_pendiente"], 0)
        self.assertEqual([e["numero"] for e in r.data["entregas"]], [1, 2])
        self.assertEqual(consumos(self.pedido_stock).count(), 2)
        final = EventoEstadoPedido.objects.get(
            pedido=self.pedido_stock, estado_nuevo=EstadoPedido.ENTREGADO
        )
        self.assertEqual((final.tipo, final.actor), (TipoEventoPedido.ARTESANO, self.artesano))
        self.assertEqual(
            self.client.get(f"/api/v1/productos/{self.base.pk}/").data["disponible_stock"], 5
        )

    def test_sobreentrega_no_tiene_efectos(self):
        self.assertEqual(self.entregar(self.pedido_stock, (self.linea, 4)).status_code, 201)
        antes = foto_inventario(self.pedido_stock)
        r = self.entregar(self.pedido_stock, (self.linea, 2))
        self.assertEqual(r.status_code, 409, r.data)
        self.assertEqual(r.data["codigo"], "cantidad_entrega_excede_pendiente")
        self.assertEqual(r.data["lineas"], [self.linea.pk])
        self.assertEqual(foto_inventario(self.pedido_stock), antes)

    def test_entrega_mayor_que_lo_acordado_desde_el_inicio(self):
        antes = foto_inventario(self.pedido_stock)
        r = self.entregar(self.pedido_stock, (self.linea, 6))
        self.assertEqual(r.data["codigo"], "cantidad_entrega_excede_pendiente")
        self.assertEqual(foto_inventario(self.pedido_stock), antes)

    def test_entrega_numerada_con_fecha_declarada_y_registro_del_servidor(self):
        ayer = timezone.localdate() - timedelta(days=1)
        r = self.entregar(self.pedido_stock, (self.linea, 1), fecha=ayer)
        entrega = EntregaPedido.objects.get(pedido=self.pedido_stock)
        self.assertEqual((entrega.numero, entrega.fecha), (1, ayer))
        self.assertEqual(entrega.registrado_por, self.artesano)
        self.assertEqual(r.data["entregas"][0]["fecha"], ayer.isoformat())
        self.assertIsNone(r.data["entregas"][0]["recepcion"])


class EntregaValidacionTests(CumplimientoTestCase):
    def setUp(self):
        super().setUp()
        self.p = self.pedido(stock(self.base, 3), produccion(self.base, 2))
        self.a, self.b = self.lineas(self.p)
        self.iniciar(self.p, self.a)

    def assertSinEfectos(self, respuesta, codigo_http, antes):
        self.assertEqual(respuesta.status_code, codigo_http, respuesta.data)
        self.assertEqual(foto_inventario(self.p), antes)

    def test_linea_no_iniciada(self):
        antes = foto_inventario(self.p)
        r = self.entregar(self.p, (self.a, 1), (self.b, 1))
        self.assertSinEfectos(r, 409, antes)
        self.assertEqual((r.data["codigo"], r.data["lineas"]), ("linea_no_iniciada", [self.b.pk]))

    def test_entradas_mal_formadas(self):
        antes = foto_inventario(self.p)
        casos = {
            "sin líneas": self.entregar(self.p),
            "cantidad cero": self.entregar(self.p, (self.a, 0)),
            "cantidad negativa": self.entregar(self.p, (self.a, -1)),
            "línea duplicada": self.entregar(self.p, (self.a, 1), (self.a, 1)),
            "fecha inválida": self.entregar(self.p, (self.a, 1), fecha="24/10/2026"),
            "campo extra": self.entregar(self.p, (self.a, 1), extra={"estado": "entregado"}),
            "línea ajena": self.entregar(self.p, (999999, 1)),
        }
        for caso, respuesta in casos.items():
            with self.subTest(caso):
                self.assertSinEfectos(respuesta, 400, antes)

    def test_fecha_futura_segun_managua(self):
        antes = foto_inventario(self.p)
        hoy = timezone.localdate()
        r = self.entregar(self.p, (self.a, 1), fecha=hoy + timedelta(days=1))
        self.assertSinEfectos(r, 400, antes)
        self.assertIn("fecha", r.data)
        self.assertEqual(self.entregar(self.p, (self.a, 1), fecha=hoy).status_code, 201)

    def test_hoy_se_evalua_en_america_managua(self):
        # 2026-10-25 02:00 UTC es todavía 2026-10-24 en Managua (UTC-6).
        momento = datetime(2026, 10, 25, 2, 0, tzinfo=UTC)
        with reloj(momento):
            self.assertEqual(cumplimiento.hoy_local().isoformat(), "2026-10-24")
            with self.assertRaises(cumplimiento.EntradaInvalida):
                cumplimiento.normalizar_entrega(date(2026, 10, 25), [{"linea": 1, "cantidad": 1}])

    def test_varios_renglones_se_revierten_juntos(self):
        self.iniciar(self.p, self.b)
        antes = foto_inventario(self.p)
        r = self.entregar(self.p, (self.a, 2), (self.b, 3))
        self.assertSinEfectos(r, 409, antes)
        self.assertEqual(r.data["lineas"], [self.b.pk])

    def test_fallo_tras_escribir_revierte_todo(self):
        self.iniciar(self.p, self.b)
        antes = foto_inventario(self.p)
        with mock.patch.object(
            inventario, "consumir_reserva", side_effect=IntegrityError("simulado")
        ):
            with self.assertRaises(IntegrityError):
                cumplimiento.registrar_entrega(
                    artesano=self.artesano,
                    pedido_id=self.p.pk,
                    fecha=timezone.localdate(),
                    lineas=[
                        {"linea": self.a.pk, "cantidad": 1},
                        {"linea": self.b.pk, "cantidad": 1},
                    ],
                )
        self.assertEqual(foto_inventario(self.p), antes)

    def test_entrega_multiple_en_una_transaccion(self):
        self.iniciar(self.p, self.b)
        r = self.entregar(self.p, (self.a, 2), (self.b, 1))
        self.assertEqual(r.status_code, 201, r.data)
        entrega = EntregaPedido.objects.get(pedido=self.p)
        self.assertEqual(
            sorted(entrega.lineas.values_list("linea_pedido_id", "cantidad")),
            sorted([(self.a.pk, 2), (self.b.pk, 1)]),
        )
        self.assertEqual(consumos(self.p).count(), 1, "solo la línea de stock consume")
        self.assertEqual(
            r.data["entregas"][0]["lineas"],
            sorted(
                [{"linea": self.a.pk, "cantidad": 2}, {"linea": self.b.pk, "cantidad": 1}],
                key=lambda i: i["linea"],
            ),
        )


class ProduccionEntregaTests(CumplimientoTestCase):
    def test_produccion_entrega_sin_consumo_ni_entrada_artificial(self):
        pedido = self.pedido(produccion(self.base, 3))
        (linea,) = self.lineas(pedido)
        antes = foto_inventario(pedido)
        self.iniciar(pedido, linea)
        self.assertEqual(self.entregar(pedido, (linea, 1)).status_code, 201)
        self.assertEqual(self.entregar(pedido, (linea, 2)).status_code, 201)
        despues = foto_inventario(pedido)
        self.assertEqual(despues["inventarios"], antes["inventarios"])
        self.assertEqual(despues["movimientos"], antes["movimientos"])
        self.assertEqual(self.estado(pedido), EstadoPedido.ENTREGADO)

    def test_desde_cero_entrega_sin_tocar_inventario(self):
        pedido = self.pedido(personalizacion(self.base, 1, origen="desde_cero"))
        (linea,) = self.lineas(pedido)
        antes = foto_inventario(pedido)
        self.iniciar(pedido, linea)
        self.assertEqual(self.entregar(pedido, (linea, 1)).status_code, 201)
        despues = foto_inventario(pedido)
        self.assertEqual(despues["inventarios"], antes["inventarios"])
        self.assertEqual(despues["movimientos"], antes["movimientos"])


class PedidoMixtoTests(CumplimientoTestCase):
    def test_cada_linea_conserva_su_semantica_y_entregado_al_ultimo_remanente(self):
        otro = self.producto_con_stock(6, nombre="Plato base", permite_personalizacion=True)
        pedido = self.pedido(
            stock(self.base, 3),
            produccion(self.base, 2),
            personalizacion(self.base, 1, origen="desde_cero"),
            personalizacion(otro, 2),
        )
        st, pr, dc, ue = self.lineas(pedido)
        self.assertEqual(self.inventario_de(self.base), (10, 3))
        self.assertEqual(self.inventario_de(otro), (6, 2))

        self.iniciar(pedido, st)
        self.iniciar(pedido, ue)
        self.assertEqual(self.inventario_de(otro), (4, 0), "unidad estándar consumida al iniciar")
        self.assertEqual(self.inventario_de(self.base), (10, 3), "stock no consume al iniciar")
        self.assertEqual(self.entregar(pedido, (st, 1), (ue, 2)).status_code, 201)
        self.assertEqual(self.inventario_de(self.base), (9, 2))
        self.assertEqual(self.inventario_de(otro), (4, 0))

        self.iniciar(pedido, pr)
        self.iniciar(pedido, dc)
        self.assertEqual(self.entregar(pedido, (pr, 2), (dc, 1)).status_code, 201)
        self.assertEqual(self.estado(pedido), EstadoPedido.EN_CUMPLIMIENTO)
        self.assertEqual(self.entregar(pedido, (st, 1)).status_code, 201)
        self.assertEqual(self.estado(pedido), EstadoPedido.EN_CUMPLIMIENTO)

        r = self.entregar(pedido, (st, 1))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.estado(pedido), EstadoPedido.ENTREGADO)
        self.assertEqual(self.inventario_de(self.base), (7, 0))
        self.assertEqual(
            [(lin["modalidad"], lin["estado"]) for lin in r.data["lineas"]],
            [
                ("stock", "entregado"),
                ("produccion", "entregado"),
                ("personalizacion", "entregado"),
                ("personalizacion", "entregado"),
            ],
        )
        self.assertEqual(consumos(pedido).count(), 4, "3 entregas de stock + 1 transformación")
        self.assertEqual(
            list(
                EventoEstadoPedido.objects.filter(pedido=pedido)
                .order_by("id")
                .values_list("estado_nuevo", flat=True)
            ),
            [EstadoPedido.EN_CUMPLIMIENTO, EstadoPedido.ENTREGADO],
        )


class IdempotenciaEntregaTests(CumplimientoTestCase):
    def setUp(self):
        super().setUp()
        self.p = self.pedido(stock(self.base, 3), produccion(self.base, 1))
        self.a, self.b = self.lineas(self.p)
        self.iniciar(self.p, self.a)
        self.iniciar(self.p, self.b)

    def test_replay_no_duplica_aunque_cambie_el_orden_de_lineas(self):
        clave = "entrega-aud12-000001"
        r1 = self.entregar(self.p, (self.a, 2), (self.b, 1), clave=clave)
        r2 = self.entregar(self.p, (self.b, 1), (self.a, 2), clave=clave)
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))
        self.assertEqual(r2["Idempotency-Replayed"], "true")
        self.assertEqual(EntregaPedido.objects.filter(pedido=self.p).count(), 1)
        self.assertEqual(LineaEntrega.objects.filter(entrega__pedido=self.p).count(), 2)
        self.assertEqual(consumos(self.p).count(), 1)
        self.assertEqual(self.inventario_de(self.base), (8, 1))

    def test_misma_clave_con_otros_datos(self):
        clave = "entrega-aud12-000002"
        self.entregar(self.p, (self.a, 1), clave=clave)
        r = self.entregar(self.p, (self.a, 2), clave=clave)
        self.assertEqual((r.status_code, r.data["codigo"]), (409, "clave_idempotencia_reutilizada"))

    def test_clave_nueva_reevalua_las_cantidades(self):
        self.assertEqual(self.entregar(self.p, (self.a, 2)).status_code, 201)
        r = self.entregar(self.p, (self.a, 2))
        self.assertEqual(r.data["codigo"], "cantidad_entrega_excede_pendiente")
        self.assertEqual(EntregaPedido.objects.filter(pedido=self.p).count(), 1)

    def test_recuperacion_generica(self):
        clave = "entrega-aud12-000003"
        self.entregar(self.p, (self.a, 1), clave=clave)
        self.autenticar(self.artesano)
        r = self.client.get(f"/api/v1/operaciones/registrar_entrega_pedido/{clave}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data["recurso"]["tipo"], r.data["codigo_http"]), ("entregapedido", 201))

    def test_huella_normalizada(self):
        self.entregar(self.p, (self.b, 1), (self.a, 1), clave="entrega-aud12-000004")
        operacion = OperacionIdempotente.objects.get(tipo=TipoOperacion.REGISTRAR_ENTREGA_PEDIDO)
        from apps.operaciones.services import calcular_huella

        esperada = calcular_huella(
            {
                "pedido_id": self.p.pk,
                "fecha": timezone.localdate(),
                "lineas": sorted(
                    [{"linea": self.a.pk, "cantidad": 1}, {"linea": self.b.pk, "cantidad": 1}],
                    key=lambda i: i["linea"],
                ),
            }
        )
        self.assertEqual(operacion.huella, esperada)


class RecepcionTests(CumplimientoTestCase):
    def setUp(self):
        super().setUp()
        self.p = self.pedido(stock(self.base, 3))
        (self.linea,) = self.lineas(self.p)
        self.iniciar(self.p, self.linea)
        self.entregar(self.p, (self.linea, 1))
        self.entregar(self.p, (self.linea, 1))
        self.e1, self.e2 = EntregaPedido.objects.filter(pedido=self.p).order_by("numero")

    def test_confirmar_y_discrepar_por_entrega(self):
        r = self.recibir(self.p, self.e1.pk, "confirmada")
        self.assertEqual(r.status_code, 201, r.data)
        r = self.recibir(self.p, self.e2.pk, "discrepancia", "  Falta una unidad.  ")
        self.assertEqual(r.status_code, 201, r.data)
        recepciones = [e["recepcion"] for e in r.data["entregas"]]
        self.assertEqual(recepciones[0]["resultado"], "confirmada")
        self.assertEqual(recepciones[0]["motivo"], "")
        self.assertEqual(recepciones[1]["resultado"], "discrepancia")
        self.assertEqual(recepciones[1]["motivo"], "Falta una unidad.")
        self.assertEqual(
            RecepcionEntrega.objects.get(entrega=self.e2).registrado_por, self.comprador
        )

    def test_validaciones_de_entrada(self):
        casos = {
            "confirmada con motivo": ("confirmada", "texto"),
            "discrepancia sin motivo": ("discrepancia", None),
            "discrepancia en blanco": ("discrepancia", "   "),
            "discrepancia demasiado larga": ("discrepancia", "x" * 1001),
            "resultado desconocido": ("rechazada", None),
        }
        for caso, (resultado, motivo) in casos.items():
            with self.subTest(caso):
                r = self.recibir(self.p, self.e1.pk, resultado, motivo)
                self.assertEqual(r.status_code, 400, r.data)
        self.assertEqual(self.recepciones(self.p), 0)
        self.assertEqual(
            self.recibir(self.p, self.e1.pk, "discrepancia", "x" * 1000).status_code, 201
        )

    def test_segunda_respuesta_a_la_misma_entrega(self):
        self.recibir(self.p, self.e1.pk, "confirmada")
        r = self.recibir(self.p, self.e1.pk, "discrepancia", "Cambié de opinión.")
        self.assertEqual((r.status_code, r.data["codigo"]), (409, "recepcion_ya_registrada"))
        self.assertEqual(RecepcionEntrega.objects.get(entrega=self.e1).resultado, "confirmada")

    def test_discrepancia_no_revierte_nada(self):
        antes = foto_inventario(self.p)
        lectura_antes = self.leer(self.p).data
        r = self.recibir(self.p, self.e1.pk, "discrepancia", "Llegó dañada.")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(foto_inventario(self.p), antes)
        self.assertEqual(r.data["estado"], lectura_antes["estado"])
        self.assertEqual(r.data["lineas"], lectura_antes["lineas"])
        self.assertEqual(self.recepciones(self.p), 1)

    def test_recepcion_admitida_con_pedido_entregado(self):
        self.entregar(self.p, (self.linea, 1))
        self.assertEqual(self.estado(self.p), EstadoPedido.ENTREGADO)
        e3 = EntregaPedido.objects.get(pedido=self.p, numero=3)
        r = self.recibir(self.p, e3.pk, "confirmada")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.estado(self.p), EstadoPedido.ENTREGADO)

    def test_entrega_de_otro_pedido(self):
        otro = self.pedido(stock(self.base, 1))
        self.iniciar(otro, self.lineas(otro)[0])
        self.entregar(otro, (self.lineas(otro)[0], 1))
        ajena = EntregaPedido.objects.get(pedido=otro)
        self.assertEqual(self.recibir(self.p, ajena.pk, "confirmada").status_code, 404)

    def test_replay_y_recuperacion(self):
        clave = "recepcion-aud12-0001"
        r1 = self.recibir(self.p, self.e1.pk, "discrepancia", "Falta una unidad.", clave=clave)
        r2 = self.recibir(self.p, self.e1.pk, "discrepancia", " Falta una unidad. ", clave=clave)
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))
        self.assertEqual(r2["Idempotency-Replayed"], "true")
        self.assertEqual(self.recepciones(self.p), 1)
        r = self.client.get(f"/api/v1/operaciones/registrar_recepcion_entrega/{clave}/")
        self.assertEqual(r.data["recurso"]["tipo"], "recepcionentrega")


class OwnershipTests(CumplimientoTestCase):
    def setUp(self):
        super().setUp()
        self.p = self.pedido(stock(self.base, 2))
        (self.linea,) = self.lineas(self.p)
        self.iniciar(self.p, self.linea)
        self.entregar(self.p, (self.linea, 1))
        self.entrega = EntregaPedido.objects.get(pedido=self.p)

    def test_comprador_ajeno_recibe_404(self):
        self.assertEqual(self.leer(self.p, como=self.otro_comprador).status_code, 404)
        r = self.recibir(self.p, self.entrega.pk, "confirmada", como=self.otro_comprador)
        self.assertEqual(r.status_code, 404)

    def test_artesano_de_otro_taller_recibe_404(self):
        ajeno = self.artesano_ajeno
        self.assertEqual(self.leer(self.p, recibido=True, como=ajeno).status_code, 404)
        self.assertEqual(self.iniciar(self.p, self.linea, como=ajeno).status_code, 404)
        self.assertEqual(self.entregar(self.p, (self.linea, 1), como=ajeno).status_code, 404)

    def test_roles_cruzados_reciben_403(self):
        self.assertEqual(self.leer(self.p, recibido=True, como=self.comprador).status_code, 403)
        self.assertEqual(self.iniciar(self.p, self.linea, como=self.comprador).status_code, 403)
        self.assertEqual(
            self.entregar(self.p, (self.linea, 1), como=self.comprador).status_code, 403
        )
        self.assertEqual(self.leer(self.p, como=self.artesano).status_code, 403)
        r = self.recibir(self.p, self.entrega.pk, "confirmada", como=self.artesano)
        self.assertEqual(r.status_code, 403)

    def test_talleres_no_aprobados_reciben_403(self):
        for taller in (self.taller_pendiente, self.taller_rechazado):
            with self.subTest(taller=taller.estado):
                artesano = taller.propietario
                self.assertEqual(self.leer(self.p, recibido=True, como=artesano).status_code, 403)
                self.assertEqual(self.iniciar(self.p, self.linea, como=artesano).status_code, 403)

    def test_sin_autenticacion_401(self):
        self.client.credentials()
        for url in (url_cumplimiento(self.p.pk), url_cumplimiento(self.p.pk, True)):
            self.assertEqual(self.client.get(url).status_code, 401)
        for url in (
            url_iniciar(self.p.pk, self.linea.pk),
            url_entregas(self.p.pk),
            url_recepcion(self.p.pk, self.entrega.pk),
        ):
            r = self.client.post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY="clave-anonima-0001")
            self.assertEqual(r.status_code, 401)


class LecturaTests(CumplimientoTestCase):
    def test_formato_equivalente_para_ambas_partes(self):
        pedido = self.pedido(stock(self.base, 5), produccion(self.base, 1))
        st, pr = self.lineas(pedido)
        self.iniciar(pedido, st)
        self.entregar(pedido, (st, 2))
        comprador = self.leer(pedido).data
        artesano = self.leer(pedido, recibido=True).data
        self.assertEqual(comprador, artesano)
        self.assertEqual(set(comprador), {"pedido", "estado", "lineas", "entregas"})
        self.assertEqual(comprador["pedido"], pedido.pk)
        self.assertEqual(comprador["estado"], "en_cumplimiento")
        self.assertEqual(
            comprador["lineas"][0] | {"iniciado_en": None},
            {
                "linea": st.pk,
                "posicion": 1,
                "modalidad": "stock",
                "cantidad": 5,
                "estado": "en_cumplimiento",
                "iniciado_en": None,
                "cantidad_entregada": 2,
                "cantidad_pendiente": 3,
            },
        )
        self.assertIsNotNone(comprador["lineas"][0]["iniciado_en"])
        self.assertEqual(
            comprador["lineas"][1],
            {
                "linea": pr.pk,
                "posicion": 2,
                "modalidad": "produccion",
                "cantidad": 1,
                "estado": "pendiente",
                "iniciado_en": None,
                "cantidad_entregada": 0,
                "cantidad_pendiente": 1,
            },
        )
        (entrega,) = comprador["entregas"]
        self.assertEqual(
            set(entrega), {"id", "numero", "fecha", "registrado_en", "lineas", "recepcion"}
        )
        self.assertEqual(entrega["lineas"], [{"linea": st.pk, "cantidad": 2}])
        texto = str(comprador)
        self.assertNotIn("reserva", texto)
        self.assertNotIn("producto", texto)

    def test_consultas_fijas_sin_n_mas_1(self):
        pedido = self.pedido(stock(self.base, 4), produccion(self.base, 2), stock(self.base, 1))
        lineas = self.lineas(pedido)
        for linea in lineas:
            self.iniciar(pedido, linea)
        self.entregar(pedido, (lineas[0], 1), (lineas[1], 1))
        self.entregar(pedido, (lineas[0], 1))
        entrega = EntregaPedido.objects.filter(pedido=pedido).first()
        self.recibir(pedido, entrega.pk, "confirmada")
        with CaptureQueriesContext(connection) as consultas:
            cargado = selectors.cumplimiento_del_comprador(self.comprador, pedido.pk)
            from apps.pedidos.api.serializers import vista_cumplimiento

            vista_cumplimiento(cargado)
        self.assertEqual(len(consultas), 4)

    def test_pedido_existente_sin_actividad_esta_pendiente(self):
        pedido = self.pedido(stock(self.base, 1), pago=None)
        datos = self.leer(pedido).data
        self.assertEqual(datos["estado"], "confirmado")
        self.assertEqual(datos["lineas"][0]["estado"], "pendiente")
        self.assertEqual(datos["entregas"], [])

    def test_detalle_del_pedido_expone_el_estado_global(self):
        pedido = self.pedido(stock(self.base, 1))
        self.iniciar(pedido, self.lineas(pedido)[0])
        r = self.client.get(f"/api/v1/pedidos/mios/{pedido.pk}/")
        self.assertEqual(r.data["estado"], "en_cumplimiento")


class InvariantesTests(CumplimientoTestCase):
    def test_ledger_append_only(self):
        pedido = self.pedido(stock(self.base, 2))
        (linea,) = self.lineas(pedido)
        self.iniciar(pedido, linea)
        self.entregar(pedido, (linea, 1))
        entrega = EntregaPedido.objects.get(pedido=pedido)
        self.recibir(pedido, entrega.pk, "confirmada")
        for objeto in (
            entrega,
            entrega.lineas.get(),
            RecepcionEntrega.objects.get(entrega=entrega),
        ):
            with self.subTest(objeto=type(objeto).__name__):
                with self.assertRaises(ValidationError):
                    objeto.save()
                with self.assertRaises(ValidationError):
                    objeto.delete()
        with self.assertRaises(ValidationError):
            linea.cumplimiento.delete()

    def test_restricciones_en_postgresql(self):
        pedido = self.pedido(stock(self.base, 2))
        (linea,) = self.lineas(pedido)
        reserva = ReservaInventario.objects.get(linea_pedido=linea)
        casos = {
            "consumida > cantidad": lambda: ReservaInventario.objects.filter(pk=reserva.pk).update(
                cantidad_consumida=3
            ),
            "consumida sin agotar": lambda: ReservaInventario.objects.filter(pk=reserva.pk).update(
                estado=EstadoReserva.CONSUMIDA, cantidad_consumida=1
            ),
            "activa agotada": lambda: ReservaInventario.objects.filter(pk=reserva.pk).update(
                cantidad_consumida=2
            ),
            "inicio sin actor": lambda: CumplimientoLineaPedido.objects.filter(
                linea_pedido=linea
            ).update(iniciado_en=timezone.now()),
            "entrega número 0": lambda: EntregaPedido.objects.create(
                pedido=pedido, numero=0, fecha=timezone.localdate(), registrado_por=self.artesano
            ),
            "evento manual sin actor": lambda: EventoEstadoPedido.objects.create(
                pedido=pedido,
                estado_anterior=EstadoPedido.CONFIRMADO,
                estado_nuevo=EstadoPedido.EN_CUMPLIMIENTO,
                tipo=TipoEventoPedido.ARTESANO,
            ),
        }
        for caso, operacion in casos.items():
            with self.subTest(caso), self.assertRaises(IntegrityError), transaction.atomic():
                operacion()

    def test_entrega_y_recepcion_unicas(self):
        pedido = self.pedido(stock(self.base, 2))
        (linea,) = self.lineas(pedido)
        self.iniciar(pedido, linea)
        self.entregar(pedido, (linea, 1))
        entrega = EntregaPedido.objects.get(pedido=pedido)
        with self.assertRaises(IntegrityError), transaction.atomic():
            EntregaPedido.objects.create(
                pedido=pedido, numero=1, fecha=timezone.localdate(), registrado_por=self.artesano
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            LineaEntrega.objects.create(entrega=entrega, linea_pedido=linea, cantidad=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RecepcionEntrega.objects.create(
                entrega=entrega, resultado="confirmada", motivo="x", registrado_por=self.comprador
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RecepcionEntrega.objects.create(
                entrega=entrega, resultado="discrepancia", motivo=" ", registrado_por=self.comprador
            )

    def test_snapshot_contractual_sigue_inmutable(self):
        pedido = self.pedido(stock(self.base, 1))
        (linea,) = self.lineas(pedido)
        self.iniciar(pedido, linea)
        self.entregar(pedido, (linea, 1))
        with self.assertRaises(ValidationError):
            linea.save()
        with self.assertRaises(ValidationError):
            pedido.save()


class CreacionYMigracionTests(CumplimientoTestCase):
    def test_pedido_nuevo_nace_con_cumplimiento_pendiente_por_linea(self):
        pedido = self.pedido(stock(self.base, 1), produccion(self.base, 1), pago=None)
        cumplimientos = CumplimientoLineaPedido.objects.filter(linea_pedido__pedido=pedido)
        self.assertEqual(cumplimientos.count(), 2)
        self.assertFalse(cumplimientos.filter(iniciado_en__isnull=False).exists())

    def test_migracion_de_datos_crea_pendientes_sin_otros_efectos(self):
        pedido = self.pedido(stock(self.base, 2), produccion(self.base, 1), pago=None)
        CumplimientoLineaPedido.objects.filter(linea_pedido__pedido=pedido)._raw_delete(
            CumplimientoLineaPedido.objects.db
        )
        antes = foto_inventario(pedido)
        migracion_cumplimiento_inicial().crear_cumplimientos_pendientes(registro_apps, None)
        migracion_cumplimiento_inicial().crear_cumplimientos_pendientes(registro_apps, None)
        cumplimientos = CumplimientoLineaPedido.objects.filter(linea_pedido__pedido=pedido)
        self.assertEqual(cumplimientos.count(), 2, "idempotente")
        self.assertFalse(cumplimientos.filter(iniciado_en__isnull=False).exists())
        self.assertEqual(foto_inventario(pedido), antes)


class NotificacionesTests(CumplimientoTestCase):
    def test_puntos_de_integracion_tras_el_commit(self):
        pedido = self.pedido(stock(self.base, 1))
        (linea,) = self.lineas(pedido)
        with self.assertLogs("apps.pedidos.cumplimiento", "INFO") as logs:
            with self.captureOnCommitCallbacks(execute=True):
                cumplimiento.iniciar_linea(
                    artesano=self.artesano, pedido_id=pedido.pk, linea_id=linea.pk
                )
            with self.captureOnCommitCallbacks(execute=True):
                entrega = cumplimiento.registrar_entrega(
                    artesano=self.artesano,
                    pedido_id=pedido.pk,
                    fecha=timezone.localdate(),
                    lineas=[{"linea": linea.pk, "cantidad": 1}],
                )
            with self.captureOnCommitCallbacks(execute=True):
                cumplimiento.registrar_recepcion(
                    comprador=self.comprador,
                    pedido_id=pedido.pk,
                    entrega_id=entrega.pk,
                    resultado="discrepancia",
                    motivo="Falta",
                )
        texto = "\n".join(logs.output)
        for evento in (
            "pedido_en_cumplimiento",
            "entrega_registrada",
            "pedido_entregado",
            "discrepancia_entrega",
        ):
            self.assertIn(evento, texto)
