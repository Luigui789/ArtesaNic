"""Migraciones de AUD-13 sobre una base con datos del esquema de ``develop`` (AUD-12).

Crea pedidos reales con pago confirmado, cargos globales y de línea, entregas parciales y
reservas parcialmente consumidas; retrocede a las migraciones de ``develop`` y vuelve a
aplicar todo. El snapshot, los pagos, las entregas, las reservas y los movimientos no
cambian; las distribuciones se recrean con exactamente los mismos importes y no aparecen
cancelaciones, cierres, reembolsos ni obligaciones inventadas.
"""

from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.inventario.models import (
    MovimientoInventario,
    ObligacionClasificacionInventario,
    ReservaInventario,
)
from apps.pagos.models import IntentoPago, Pago
from apps.pedidos import cumplimiento, reembolsos
from apps.pedidos.models import (
    CancelacionPedido,
    CargoPedido,
    CierreParcialPedido,
    DistribucionEconomicaLineaPedido,
    EntregaPedido,
    EstadoOperativoPedido,
    EventoEstadoPedido,
    LineaEntrega,
    LineaPedido,
    Pedido,
    ReembolsoPedido,
)
from apps.propuestas.models import DistribucionEconomicaLineaPropuesta
from apps.solicitudes.tests.base import inicializar_stock
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from .base_cumplimiento import confirmar_pedido_mixto, llevar_pago_a, personalizacion, stock
from .base_resolucion import confirmar_con_cargos

ESQUEMA_DEVELOP = [
    ("pedidos", "0006_cumplimiento_inicial_lineas_existentes"),
    ("propuestas", "0003_propuesta_retiro_taller_sin_costo"),
    ("inventario", "0003_consumo_parcial_reservas"),
    ("operaciones", "0005_tipos_cumplimiento"),
]


def migrar(destino):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(destino)


def ultimas():
    executor = MigrationExecutor(connection)
    return executor.loader.graph.leaf_nodes()


class MigracionResolucionTests(TransactionTestCase):
    def setUp(self):
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        self.artesano = taller.propietario
        self.comprador = crear_usuario("86666666")
        categoria = crear_categoria()
        jarron = crear_producto(taller, categoria, publicado=True, permite_personalizacion=True)
        plato = crear_producto(
            taller, categoria, publicado=True, nombre="Plato", permite_personalizacion=True
        )
        inicializar_stock(self.artesano, jarron, plato, cantidad=20)
        # Pagado, cargos global y de línea, stock parcialmente entregado y personalización
        # sobre unidad base iniciada (reserva consumida) sin entregar.
        self.parcial = confirmar_con_cargos(
            comprador=self.comprador,
            artesano=self.artesano,
            renglones=[stock(jarron, 5), personalizacion(plato, 3)],
            costo_entrega="35.00",
            otros_cargos=[("10.00", None), ("7.50", 1)],
        )
        llevar_pago_a(self.parcial, "confirmado", comprador=self.comprador, artesano=self.artesano)
        st, pe = self.parcial.lineas.order_by("posicion")
        for linea in (st, pe):
            cumplimiento.iniciar_linea(
                artesano=self.artesano, pedido_id=self.parcial.pk, linea_id=linea.pk
            )
        cumplimiento.registrar_entrega(
            artesano=self.artesano,
            pedido_id=self.parcial.pk,
            fecha=timezone.localdate(),
            lineas=[{"linea": st.pk, "cantidad": 2}],
        )
        # Pago solo registrado y otro sin pago.
        self.registrado = confirmar_pedido_mixto(
            comprador=self.comprador, artesano=self.artesano, renglones=[stock(jarron, 1)]
        )
        llevar_pago_a(
            self.registrado, "registrado", comprador=self.comprador, artesano=self.artesano
        )
        self.sin_pago = confirmar_pedido_mixto(
            comprador=self.comprador, artesano=self.artesano, renglones=[stock(plato, 2)]
        )

    def tearDown(self):
        migrar(ultimas())

    def foto(self):
        return {
            "pedidos": list(Pedido.objects.order_by("pk").values()),
            "lineas": list(LineaPedido.objects.order_by("pk").values()),
            "cargos": list(CargoPedido.objects.order_by("pk").values()),
            "estados": list(
                EstadoOperativoPedido.objects.order_by("pk").values_list("pedido_id", "estado")
            ),
            "eventos": list(EventoEstadoPedido.objects.order_by("pk").values()),
            "reservas": list(
                ReservaInventario.objects.order_by("pk").values_list(
                    "pk", "linea_pedido_id", "cantidad", "cantidad_consumida", "estado"
                )
            ),
            "movimientos": list(MovimientoInventario.objects.order_by("pk").values()),
            "pagos": list(Pago.objects.order_by("pk").values()),
            "intentos": list(IntentoPago.objects.order_by("pk").values_list("pk", "numero")),
            "entregas": list(EntregaPedido.objects.order_by("pk").values()),
            "lineas_entrega": list(LineaEntrega.objects.order_by("pk").values()),
        }

    def distribuciones(self):
        return {
            "propuesta": sorted(
                DistribucionEconomicaLineaPropuesta.objects.values_list(
                    "linea_propuesta_id", "otros_compartidos_asignados", "entrega_asignada"
                )
            ),
            "pedido": sorted(
                DistribucionEconomicaLineaPedido.objects.values_list(
                    "linea_pedido_id", "otros_compartidos_asignados", "entrega_asignada"
                )
            ),
        }

    def test_aplicar_aud13_sobre_datos_aud12(self):
        antes = self.foto()
        distribuciones = self.distribuciones()
        self.assertEqual(len(distribuciones["pedido"]), 4)
        reserva_base = ReservaInventario.objects.get(linea_pedido__pedido=self.parcial, cantidad=3)
        self.assertEqual(reserva_base.cantidad_consumida, 3)

        migrar(ESQUEMA_DEVELOP)
        with connection.cursor() as cursor:
            tablas = connection.introspection.table_names(cursor)
        for tabla in (
            "pedidos_cancelacionpedido",
            "pedidos_reembolsopedido",
            "pedidos_distribucioneconomicalineapedido",
            "propuestas_distribucioneconomicalineapropuesta",
            "inventario_obligacionclasificacioninventario",
        ):
            self.assertNotIn(tabla, tablas)

        migrar(ultimas())
        self.assertEqual(self.foto(), antes, "snapshot, pagos, entregas e inventario intactos")
        self.assertEqual(self.distribuciones(), distribuciones, "mismo algoritmo, mismos importes")
        for modelo in (
            CancelacionPedido,
            CierreParcialPedido,
            ReembolsoPedido,
            ObligacionClasificacionInventario,
        ):
            self.assertFalse(modelo.objects.exists(), modelo.__name__)
        # Cada pedido: la base reembolsable suma exactamente su total.
        for pedido in Pedido.objects.all():
            lineas = list(pedido.lineas.select_related("distribucion"))
            self.assertEqual(
                sum(reembolsos.bases_reembolsables(pedido, lineas).values(), Decimal("0")),
                pedido.total,
            )
