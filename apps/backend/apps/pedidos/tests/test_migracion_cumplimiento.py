"""Migraciones de AUD-12 sobre una base con datos del esquema de ``develop`` (AUD-11).

Retrocede a ``pedidos.0004`` / ``inventario.0002`` / ``operaciones.0004`` con pedidos,
reservas y pagos reales, y vuelve a aplicar todo: el snapshot y las reservas no cambian,
``cantidad_consumida`` nace en 0, cada línea tiene su cumplimiento pendiente y no aparecen
entregas ni movimientos inventados.
"""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.inventario.models import MovimientoInventario, ReservaInventario
from apps.pagos.models import Pago
from apps.pedidos.models import (
    CumplimientoLineaPedido,
    EntregaPedido,
    EstadoOperativoPedido,
    LineaPedido,
    Pedido,
)
from apps.solicitudes.tests.base import inicializar_stock
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from .base_cumplimiento import confirmar_pedido_mixto, llevar_pago_a, personalizacion, stock

ESQUEMA_DEVELOP = [
    ("pedidos", "0004_estado_inicial_pedidos_existentes"),
    ("inventario", "0002_movimiento_liberacion"),
    ("operaciones", "0004_tipos_pagos"),
]


def migrar(destino):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(destino)


def ultimas():
    executor = MigrationExecutor(connection)
    return executor.loader.graph.leaf_nodes()


class MigracionCumplimientoTests(TransactionTestCase):
    def setUp(self):
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        self.artesano = taller.propietario
        self.comprador = crear_usuario("86666666")
        producto = crear_producto(
            taller, crear_categoria(), publicado=True, permite_personalizacion=True
        )
        inicializar_stock(self.artesano, producto, cantidad=10)
        self.confirmado = confirmar_pedido_mixto(
            comprador=self.comprador, artesano=self.artesano, renglones=[stock(producto, 3)]
        )
        llevar_pago_a(
            self.confirmado, "confirmado", comprador=self.comprador, artesano=self.artesano
        )
        self.sin_pago = confirmar_pedido_mixto(
            comprador=self.comprador,
            artesano=self.artesano,
            renglones=[personalizacion(producto, 2), stock(producto, 1)],
        )

    def tearDown(self):
        migrar(ultimas())

    def foto(self):
        return {
            "pedidos": list(Pedido.objects.order_by("pk").values()),
            "lineas": list(LineaPedido.objects.order_by("pk").values()),
            "estados": list(
                EstadoOperativoPedido.objects.order_by("pk").values_list("pedido_id", "estado")
            ),
            "reservas": list(
                ReservaInventario.objects.order_by("pk").values_list(
                    "pk", "linea_pedido_id", "cantidad", "estado"
                )
            ),
            "movimientos": list(
                MovimientoInventario.objects.order_by("pk").values_list(
                    "pk", "tipo", "cantidad", "existencia_despues", "reservada_despues"
                )
            ),
            "pagos": list(Pago.objects.order_by("pk").values_list("pk", "estado", "total")),
        }

    def test_aplicar_migraciones_sobre_datos_existentes(self):
        antes = self.foto()
        lineas = LineaPedido.objects.count()
        self.assertEqual(lineas, 3)

        migrar(ESQUEMA_DEVELOP)
        with connection.cursor() as cursor:
            tablas = connection.introspection.table_names(cursor)
        self.assertNotIn("pedidos_cumplimientolineapedido", tablas)
        self.assertNotIn("pedidos_entregapedido", tablas)

        migrar(ultimas())
        self.assertEqual(self.foto(), antes, "snapshot, reservas, movimientos y pagos intactos")
        self.assertEqual(
            set(ReservaInventario.objects.values_list("cantidad_consumida", flat=True)), {0}
        )
        cumplimientos = CumplimientoLineaPedido.objects.all()
        self.assertEqual(cumplimientos.count(), lineas)
        self.assertFalse(cumplimientos.filter(iniciado_en__isnull=False).exists())
        self.assertFalse(cumplimientos.filter(iniciado_por__isnull=False).exists())
        self.assertFalse(EntregaPedido.objects.exists())
        self.assertEqual(
            set(EstadoOperativoPedido.objects.values_list("estado", flat=True)), {"confirmado"}
        )
