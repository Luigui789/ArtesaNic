"""Migraciones de AUD-14 sobre una base con datos del esquema AUD-13 (``develop``).

Crea usuarios, talleres, productos publicados y despublicados, una solicitud pendiente,
pedidos con pago confirmado, entregas, cancelación con reembolso, clasificación de
inventario y pagos registrados. Después retrocede a las migraciones de AUD-13 (sin
``ModeracionProducto`` ni ``configuracion``) y vuelve a aplicar todo. Los productos,
el snapshot contractual, los pagos, las entregas y el inventario no cambian; no aparecen
moderaciones inventadas y la configuración nace sin tasa (D-AUD14-05).
"""

import hashlib
import json

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.models import Usuario
from apps.accounts.tests.base import crear_usuario
from apps.catalogo import services as catalogo
from apps.catalogo.models import ModeracionProducto, Producto
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.configuracion.models import CambioTasaCambio, ConfiguracionPlataforma
from apps.inventario.models import (
    ClasificacionInventario,
    InventarioProducto,
    MovimientoInventario,
    ObligacionClasificacionInventario,
    ReservaInventario,
)
from apps.pagos.models import IntentoPago, Pago, RevisionIntentoPago
from apps.pedidos import clasificacion, cumplimiento, resolucion
from apps.pedidos.models import (
    CancelacionPedido,
    CargoPedido,
    DistribucionEconomicaLineaPedido,
    EntregaPedido,
    EstadoOperativoPedido,
    LineaEntrega,
    LineaPedido,
    Pedido,
    ReembolsoPedido,
)
from apps.pedidos.tests.base_cumplimiento import (
    confirmar_pedido_mixto,
    llevar_pago_a,
    personalizacion,
    stock,
)
from apps.pedidos.tests.base_resolucion import confirmar_con_cargos
from apps.propuestas.models import LineaPropuesta, Propuesta
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import RenglonSolicitud, Solicitud
from apps.solicitudes.tests.base import inicializar_stock
from apps.talleres import services as talleres
from apps.talleres.models import Taller
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

ESQUEMA_AUD13 = [
    ("catalogo", "0002_producto_fotografia_principal"),
    ("configuracion", None),
]

MODELOS_INTACTOS = (
    Usuario,
    Taller,
    Producto,
    Solicitud,
    RenglonSolicitud,
    Propuesta,
    LineaPropuesta,
    Pedido,
    LineaPedido,
    CargoPedido,
    DistribucionEconomicaLineaPedido,
    EstadoOperativoPedido,
    Pago,
    IntentoPago,
    RevisionIntentoPago,
    EntregaPedido,
    LineaEntrega,
    CancelacionPedido,
    ReembolsoPedido,
    InventarioProducto,
    ReservaInventario,
    MovimientoInventario,
    ObligacionClasificacionInventario,
    ClasificacionInventario,
)


def migrar(destino):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(destino)


def ultimas():
    return MigrationExecutor(connection).loader.graph.leaf_nodes()


def huella(modelo) -> str:
    filas = list(modelo.objects.order_by("pk").values())
    return hashlib.sha256(json.dumps(filas, default=str, sort_keys=True).encode()).hexdigest()


class MigracionAUD14Tests(TransactionTestCase):
    def setUp(self):
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        crear_artesano_con_taller("83333333", nombre="Pendiente")
        self.artesano = taller.propietario
        self.comprador = crear_usuario("86666666")
        categoria = crear_categoria()
        jarron = crear_producto(taller, categoria, publicado=True, permite_personalizacion=True)
        plato = crear_producto(
            taller, categoria, publicado=True, nombre="Plato", permite_personalizacion=True
        )
        borrador = crear_producto(taller, categoria, nombre="Borrador")
        catalogo.despublicar_producto(crear_producto(taller, categoria, nombre="Retirado"))
        self.assertFalse(borrador.publicado)
        inicializar_stock(self.artesano, jarron, plato, cantidad=20)
        # Pagado con cargos y entrega parcial.
        parcial = confirmar_con_cargos(
            comprador=self.comprador,
            artesano=self.artesano,
            renglones=[stock(jarron, 5), personalizacion(plato, 3)],
            costo_entrega="35.00",
            otros_cargos=[("10.00", None), ("7.50", 1)],
        )
        llevar_pago_a(parcial, "confirmado", comprador=self.comprador, artesano=self.artesano)
        st, _ = parcial.lineas.order_by("posicion")
        cumplimiento.iniciar_linea(artesano=self.artesano, pedido_id=parcial.pk, linea_id=st.pk)
        cumplimiento.registrar_entrega(
            artesano=self.artesano,
            pedido_id=parcial.pk,
            fecha=timezone.localdate(),
            lineas=[{"linea": st.pk, "cantidad": 2}],
        )
        # Pagado, unidad base consumida y cancelado: reembolso total y clasificación.
        cancelado = confirmar_pedido_mixto(
            comprador=self.comprador, artesano=self.artesano, renglones=[personalizacion(plato, 1)]
        )
        llevar_pago_a(cancelado, "confirmado", comprador=self.comprador, artesano=self.artesano)
        linea = cancelado.lineas.get()
        cumplimiento.iniciar_linea(
            artesano=self.artesano, pedido_id=cancelado.pk, linea_id=linea.pk
        )
        resolucion.cancelar_pedido(
            artesano=self.artesano, pedido_id=cancelado.pk, motivo="Sin material"
        )
        obligacion = ObligacionClasificacionInventario.objects.get()
        clasificacion.clasificar_inventario(
            artesano=self.artesano,
            pedido_id=cancelado.pk,
            clasificaciones=[
                {
                    "obligacion": obligacion.pk,
                    "resultado": "reutilizable",
                    "cantidad": 1,
                    "motivo": "Intacta",
                }
            ],
        )
        # Pago solo registrado y una solicitud pendiente.
        registrado = confirmar_pedido_mixto(
            comprador=self.comprador, artesano=self.artesano, renglones=[stock(jarron, 1)]
        )
        llevar_pago_a(registrado, "registrado", comprador=self.comprador, artesano=self.artesano)
        solicitudes.crear_solicitud(
            comprador=self.comprador,
            renglones=[{"producto": plato.pk, "modalidad": "stock", "cantidad": 1}],
        )

    def tearDown(self):
        migrar(ultimas())

    def huellas(self):
        return {modelo.__name__: huella(modelo) for modelo in MODELOS_INTACTOS}

    def test_aplicar_aud14_sobre_datos_aud13(self):
        for modelo in (Pedido, ReembolsoPedido, ClasificacionInventario, Solicitud, Pago):
            self.assertTrue(modelo.objects.exists(), modelo.__name__)
        publicados = dict(Producto.objects.values_list("pk", "publicado"))
        self.assertEqual(sorted(publicados.values()), [False, False, True, True])
        antes = self.huellas()

        migrar(ESQUEMA_AUD13)
        with connection.cursor() as cursor:
            tablas = connection.introspection.table_names(cursor)
        for tabla in (
            "catalogo_moderacionproducto",
            "configuracion_configuracionplataforma",
            "configuracion_cambiotasacambio",
        ):
            self.assertNotIn(tabla, tablas)

        migrar(ultimas())
        self.assertEqual(self.huellas(), antes, "productos, snapshots, pagos e inventario intactos")
        self.assertEqual(dict(Producto.objects.values_list("pk", "publicado")), publicados)
        self.assertFalse(ModeracionProducto.objects.exists(), "sin moderaciones inventadas")
        configuracion = ConfiguracionPlataforma.objects.get()
        self.assertEqual(configuracion.pk, 1)
        self.assertIsNone(configuracion.tasa_cambio_usd_nio)
        self.assertIsNone(configuracion.actualizada_por)
        self.assertIsNone(configuracion.actualizada_en)
        self.assertFalse(CambioTasaCambio.objects.exists())
        # Los productos visibles siguen siéndolo: la moderación no aparece sola.
        self.assertEqual(
            set(Producto.objects.catalogo().values_list("pk", flat=True)),
            {pk for pk, publicado in publicados.items() if publicado},
        )
