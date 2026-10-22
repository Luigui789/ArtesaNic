"""AUD-07: decisión del comprador (aceptar/rechazar), Pedido confirmado, snapshot
contractual inmune a cambios posteriores del catálogo, reservas por modalidad,
agregación por producto, rollback transaccional, permisos, constraints e idempotencia."""

from decimal import Decimal
from unittest import mock
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import ProtectedError
from django.test import SimpleTestCase
from django.test.utils import CaptureQueriesContext
from drf_spectacular.generators import SchemaGenerator

from apps.catalogo import services as catalogo
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
from apps.pedidos.models import CargoPedido, LineaPedido, Pedido
from apps.propuestas.models import DecisionPropuesta, Propuesta
from apps.propuestas.tests.base import (
    PropuestaAPITestCase,
    url_propuesta_mia,
)
from apps.solicitudes.tests.base import datos_renglon


def url_decision_propuesta(solicitud_id: int):
    return f"/api/v1/solicitudes/mias/{solicitud_id}/propuesta/decision/"


def url_mis_pedidos():
    return "/api/v1/pedidos/mios/"


def url_mi_pedido(pedido_id: int):
    return f"/api/v1/pedidos/mios/{pedido_id}/"


def url_pedidos_recibidos():
    return "/api/v1/pedidos/recibidos/"


def url_pedido_recibido(pedido_id: int):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/"


class ConfirmacionBaseTestCase(PropuestaAPITestCase):
    """Extiende el escenario mixto de PropuestaAPITestCase añadiendo también un renglón
    de personalización fabricada desde cero y el inventario inicial necesario."""

    def setUp(self):
        super().setUp()
        self.p_pers_cero = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Máscara tallada",
            precio=Decimal("400.00"),
            permite_personalizacion=True,
        )
        # Inicializamos inventario para los productos que usan unidades estándar.
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.p_stock.pk, cantidad=10
        )
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.p_pers.pk, cantidad=4
        )
        self.revisar()
        self.emitir()
        self.autenticar(self.comprador)

    def decidir(self, decision="aceptar", *, clave=None, solicitud=None, datos=None):
        cuerpo = {"decision": decision} if datos is None else datos
        return self.client.post(
            url_decision_propuesta((solicitud or self.solicitud).pk),
            cuerpo,
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )


class DecisionCompradorTests(ConfirmacionBaseTestCase):
    def test_aceptar_crea_pedido_snapshot_reservas_y_movimientos_en_una_transaccion(self):
        # Antes de decidir, la propuesta figura como pendiente.
        previa = self.client.get(url_propuesta_mia(self.solicitud.pk))
        self.assertEqual(
            (previa.data["decision"], previa.data["decidida_en"], previa.data["pedido_id"]),
            ("pendiente", None, None),
        )

        respuesta = self.decidir("aceptar")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        datos = respuesta.data
        self.assertEqual(datos["decision"], "aceptada")
        self.assertEqual(datos["solicitud"], self.solicitud.pk)
        self.assertIsNotNone(datos["decidida_en"])
        pedido = datos["pedido"]
        self.assertIsNotNone(pedido)
        self.assertEqual(
            (
                pedido["moneda"],
                pedido["modalidad_entrega"],
                pedido["descripcion_entrega"],
                pedido["costo_entrega"],
                pedido["subtotal_productos"],
                pedido["total_personalizacion"],
                pedido["total_otros_cargos"],
                pedido["total"],
            ),
            (
                "NIO",
                "entrega_artesano",
                "Entrega en Masaya centro",
                "120.00",
                "776.50",
                "45.50",
                "35.25",
                "977.25",
            ),
        )
        self.assertEqual(len(pedido["lineas"]), 3)
        self.assertEqual(len(pedido["otros_cargos"]), 2)

        # Reglas por modalidad: stock (3) y personalización/unidad_estandar (1) reservan;
        # producción (7) NO genera reserva ni requiere inventario inicializado.
        reservas = list(ReservaInventario.objects.order_by("linea_pedido__posicion"))
        self.assertEqual(len(reservas), 2)
        self.assertEqual(
            [(r.producto_id, r.cantidad, r.estado) for r in reservas],
            [
                (self.p_stock.pk, 3, EstadoReserva.ACTIVA),
                (self.p_pers.pk, 1, EstadoReserva.ACTIVA),
            ],
        )

        # Reservar NO reduce existencia física: solo incrementa reservada y baja disponible.
        inv_stock = InventarioProducto.objects.get(producto=self.p_stock)
        self.assertEqual(
            (inv_stock.existencia_fisica, inv_stock.reservada, inv_stock.disponible),
            (10, 3, 7),
        )
        inv_pers = InventarioProducto.objects.get(producto=self.p_pers)
        self.assertEqual(
            (inv_pers.existencia_fisica, inv_pers.reservada, inv_pers.disponible),
            (4, 1, 3),
        )
        self.assertFalse(InventarioProducto.objects.filter(producto=self.p_prod).exists())

        movs = list(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.RESERVA).order_by(
                "linea_pedido__posicion"
            )
        )
        self.assertEqual(len(movs), 2)
        self.assertEqual(
            [
                (
                    m.producto_id,
                    m.cantidad,
                    m.existencia_antes,
                    m.existencia_despues,
                    m.reservada_antes,
                    m.reservada_despues,
                    m.actor_id,
                    m.pedido_id,
                )
                for m in movs
            ],
            [
                (self.p_stock.pk, 3, 10, 10, 0, 3, self.comprador.pk, pedido["id"]),
                (self.p_pers.pk, 1, 4, 4, 0, 1, self.comprador.pk, pedido["id"]),
            ],
        )

        # La lectura de la propuesta expone ahora aceptada, fecha y pedido_id.
        despues = self.client.get(url_propuesta_mia(self.solicitud.pk))
        self.assertEqual(
            (despues.data["decision"], despues.data["pedido_id"]),
            ("aceptada", pedido["id"]),
        )
        self.assertIsNotNone(despues.data["decidida_en"])

    def test_personalizacion_desde_cero_confirma_sin_reserva_estandar(self):
        sol = self.crear(
            datos_renglon(
                self.p_pers_cero,
                modalidad="personalizacion",
                cantidad=2,
                caracteristicas="Tallado exclusivo desde bloque nuevo",
                origen_personalizacion="desde_cero",
            )
        )
        renglon = sol.renglones.get()
        self.autenticar(self.artesano)
        self.revisar(sol, rechazados=set())
        self.emitir(
            self.condiciones(
                lineas=[{"renglon": renglon.pk, "cargo_personalizacion": "50.00"}],
                otros_cargos=[],
            ),
            solicitud=sol,
        )
        self.autenticar(self.comprador)
        r = self.decidir("aceptar", solicitud=sol)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNotNone(r.data["pedido"])
        self.assertEqual(ReservaInventario.objects.count(), 0)
        self.assertFalse(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.RESERVA).exists()
        )

    def test_rechazar_propuesta_registra_decision_sin_pedido_ni_reservas(self):
        respuesta = self.decidir("rechazar")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(respuesta.data["decision"], "rechazada")
        self.assertIsNone(respuesta.data["pedido"])
        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(LineaPedido.objects.count(), 0)
        self.assertEqual(CargoPedido.objects.count(), 0)
        self.assertEqual(ReservaInventario.objects.count(), 0)
        self.assertFalse(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.RESERVA).exists()
        )
        inv = InventarioProducto.objects.get(producto=self.p_stock)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (10, 0, 10))

        vista = self.client.get(url_propuesta_mia(self.solicitud.pk))
        self.assertEqual((vista.data["decision"], vista.data["pedido_id"]), ("rechazada", None))
        self.assertIsNotNone(vista.data["decidida_en"])

    def test_propuesta_ya_decidida_no_admite_otra_decision(self):
        self.assertEqual(self.decidir("rechazar").status_code, 200)
        r_aceptar = self.decidir("aceptar")
        self.assertEqual(
            (r_aceptar.status_code, r_aceptar.data["codigo"]),
            (409, "propuesta_ya_decidida"),
        )
        self.assertEqual(Pedido.objects.count(), 0)

    def test_no_se_puede_rechazar_despues_de_aceptar(self):
        self.assertEqual(self.decidir("aceptar").status_code, 200)
        r_rechazar = self.decidir("rechazar")
        self.assertEqual(
            (r_rechazar.status_code, r_rechazar.data["codigo"]),
            (409, "propuesta_ya_decidida"),
        )
        self.assertEqual(Pedido.objects.count(), 1)

    def test_idempotencia_y_recuperacion_de_decision(self):
        clave = str(uuid4())
        r1 = self.decidir("aceptar", clave=clave)
        r2 = self.decidir("aceptar", clave=clave)
        self.assertEqual((r1.status_code, r2.status_code), (200, 200))
        self.assertEqual(r2["Idempotency-Replayed"], "true")
        self.assertEqual(r1.data["id"], r2.data["id"])
        self.assertEqual(r1.data["pedido"]["id"], r2.data["pedido"]["id"])
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(DecisionPropuesta.objects.count(), 1)

        # Misma clave con otra decisión => 409 clave_idempotencia_reutilizada
        r_otra = self.decidir("rechazar", clave=clave)
        self.assertEqual(
            (r_otra.status_code, r_otra.data["codigo"]),
            (409, "clave_idempotencia_reutilizada"),
        )

        # Consulta de operación AUD-08
        op = self.client.get(f"/api/v1/operaciones/{TipoOperacion.DECIDIR_PROPUESTA}/{clave}/")
        self.assertEqual(op.status_code, 200)
        self.assertEqual(
            op.data["recurso"],
            {"tipo": "decisionpropuesta", "id": r1.data["id"]},
        )


class AgregacionYRollbackTests(ConfirmacionBaseTestCase):
    def test_agregacion_por_producto_evita_confirmacion_parcial(self):
        """§15 y §34: existencia P = 3. Misma propuesta contiene:
        línea stock P cantidad 2 + línea personalización P unidad_estandar cantidad 2 (total 4).
        Debe responder 409 stock_insuficiente sin crear Pedido, Decisión, Reserva ni Movimiento."""
        prod = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Hamaca doble",
            precio=Decimal("500.00"),
            permite_stock=True,
            permite_personalizacion=True,
        )
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=prod.pk, cantidad=3
        )
        sol = self.crear(
            datos_renglon(prod, modalidad="stock", cantidad=2),
            datos_renglon(
                prod,
                modalidad="personalizacion",
                cantidad=2,
                caracteristicas="Iniciales bordadas",
                origen_personalizacion="unidad_estandar",
            ),
        )
        r_a, r_b = sol.renglones.order_by("posicion")
        self.autenticar(self.artesano)
        self.revisar(sol, rechazados=set())
        self.emitir(
            self.condiciones(
                lineas=[
                    {"renglon": r_a.pk},
                    {"renglon": r_b.pk, "cargo_personalizacion": "30.00"},
                ],
                otros_cargos=[],
            ),
            solicitud=sol,
        )
        self.autenticar(self.comprador)
        respuesta = self.decidir("aceptar", solicitud=sol)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "stock_insuficiente")

        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(DecisionPropuesta.objects.count(), 0)
        self.assertEqual(ReservaInventario.objects.count(), 0)
        self.assertFalse(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.RESERVA).exists()
        )
        inv = InventarioProducto.objects.get(producto=prod)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (3, 0, 3))

    def test_agregacion_exitosa_cuando_disponible_cubre_suma_total(self):
        prod = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Hamaca familiar",
            precio=Decimal("500.00"),
            permite_stock=True,
            permite_personalizacion=True,
        )
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=prod.pk, cantidad=5
        )
        sol = self.crear(
            datos_renglon(prod, modalidad="stock", cantidad=2),
            datos_renglon(
                prod,
                modalidad="personalizacion",
                cantidad=3,
                caracteristicas="Franja roja",
                origen_personalizacion="unidad_estandar",
            ),
        )
        r_a, r_b = sol.renglones.order_by("posicion")
        self.autenticar(self.artesano)
        self.revisar(sol, rechazados=set())
        self.emitir(
            self.condiciones(
                lineas=[{"renglon": r_a.pk}, {"renglon": r_b.pk}],
                otros_cargos=[],
            ),
            solicitud=sol,
        )
        self.autenticar(self.comprador)
        respuesta = self.decidir("aceptar", solicitud=sol)
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        inv = InventarioProducto.objects.get(producto=prod)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (5, 5, 0))
        self.assertEqual(ReservaInventario.objects.filter(producto=prod).count(), 2)
        self.assertEqual(
            MovimientoInventario.objects.filter(
                producto=prod, tipo=TipoMovimientoInventario.RESERVA
            ).count(),
            2,
        )

    def test_rollback_transaccional_completo_y_reintento_con_misma_clave(self):
        """§35: provocar un fallo controlado después de haber creado Pedido y reservas;
        verificar que se revierte todo y que la misma clave puede reintentarse después."""
        clave = str(uuid4())
        with mock.patch.object(
            MovimientoInventario.objects,
            "create",
            side_effect=RuntimeError("fallo simulado al registrar movimiento de reserva"),
        ):
            with self.assertRaises(RuntimeError):
                self.decidir("aceptar", clave=clave)

        self.assertEqual(Pedido.objects.count(), 0)
        self.assertEqual(LineaPedido.objects.count(), 0)
        self.assertEqual(CargoPedido.objects.count(), 0)
        self.assertEqual(DecisionPropuesta.objects.count(), 0)
        self.assertEqual(ReservaInventario.objects.count(), 0)
        self.assertFalse(
            MovimientoInventario.objects.filter(tipo=TipoMovimientoInventario.RESERVA).exists()
        )
        inv = InventarioProducto.objects.get(producto=self.p_stock)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (10, 0, 10))
        self.assertFalse(
            OperacionIdempotente.objects.filter(tipo=TipoOperacion.DECIDIR_PROPUESTA).exists()
        )

        # Una vez corregido el fallo, la misma Idempotency-Key funciona en el reintento.
        reintento = self.decidir("aceptar", clave=clave)
        self.assertEqual(reintento.status_code, 200, reintento.data)
        self.assertEqual(Pedido.objects.count(), 1)
        inv.refresh_from_db()
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (10, 3, 7))


class SnapshotYDespublicacionTests(ConfirmacionBaseTestCase):
    def test_snapshot_congelado_ante_cambios_de_precio_nombre_categoria_y_despublicacion(self):
        """§11, §12, §29 y §46:
        1. Producto a C$100.00, stock 5; solicitud de 2 unidades; propuesta emitida a C$100.00.
        2. Cambiar Producto.precio a C$150.00 y despublicar producto.
        3. Comprador acepta: confirma aunque esté despublicado; precio_unitario = C$100.00.
        4. Cambiar nuevamente precio, nombre y categoría del producto.
        5. Consultar Pedido (comprador y artesano): mantiene C$100/C$200, nombre y categoría."""
        p = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Vasija precolombina",
            precio=Decimal("100.00"),
            permite_stock=True,
        )
        inventario.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=p.pk, cantidad=5
        )
        sol = self.crear(datos_renglon(p, modalidad="stock", cantidad=2))
        renglon = sol.renglones.get()
        self.autenticar(self.artesano)
        self.revisar(sol, rechazados=set())
        self.emitir(
            self.condiciones(
                modalidad_entrega="retiro_taller",
                descripcion_entrega="",
                costo_entrega="0.00",
                lineas=[{"renglon": renglon.pk}],
                otros_cargos=[],
            ),
            solicitud=sol,
        )

        # Cambio de precio a C$150 y despublicación antes de que el comprador decida.
        catalogo.actualizar_producto(p, precio=Decimal("150.00"))
        catalogo.despublicar_producto(p)

        self.autenticar(self.comprador)
        r = self.decidir("aceptar", solicitud=sol)
        self.assertEqual(r.status_code, 200, r.data)
        pedido_id = r.data["pedido"]["id"]
        linea = r.data["pedido"]["lineas"][0]
        self.assertEqual(
            (linea["precio_unitario"], linea["cantidad"], linea["subtotal"]),
            ("100.00", 2, "200.00"),
        )
        self.assertEqual(r.data["pedido"]["total"], "200.00")

        inv = InventarioProducto.objects.get(producto=p)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (5, 2, 3))

        # Cambiar otra vez precio, nombre y categoría en el catálogo vivo.
        otra_cat = crear_categoria(codigo="madera_tallada", nombre="Madera tallada")
        catalogo.actualizar_producto(
            p,
            nombre="Vasija renombrada",
            precio=Decimal("250.00"),
            categoria=otra_cat,
        )

        # Lectura del comprador y del artesano: el snapshot contractual permanece intacto.
        lectura_c = self.client.get(url_mi_pedido(pedido_id))
        self.assertEqual(lectura_c.status_code, 200)
        lc = lectura_c.data["lineas"][0]
        self.assertEqual((lc["precio_unitario"], lc["subtotal"]), ("100.00", "200.00"))
        self.assertEqual(lc["producto"]["nombre"], "Vasija precolombina")
        self.assertEqual(lc["producto"]["categoria"]["codigo"], self.categoria.codigo)
        self.assertEqual(lc["producto"]["categoria"]["nombre"], self.categoria.nombre)

        self.autenticar(self.artesano)
        lectura_a = self.client.get(url_pedido_recibido(pedido_id))
        self.assertEqual(lectura_a.status_code, 200)
        self.assertEqual(lectura_a.data["lineas"][0]["precio_unitario"], "100.00")
        self.assertEqual(lectura_a.data["comprador"]["id"], self.comprador.pk)
        self.assertNotIn("telefono", lectura_a.data["comprador"])


class PermisosYConsultasPedidosTests(ConfirmacionBaseTestCase):
    def test_permisos_de_decision(self):
        # Sin sesión -> 401
        self.anonimo()
        self.assertEqual(self.decidir("aceptar").status_code, 401)
        # Artesano, comprador ajeno, admin
        for usuario, esperado in (
            (self.artesano, 403),
            (self.artesano_ajeno, 403),
            (self.admin, 401),
            (self.otro_comprador, 404),
        ):
            with self.subTest(usuario=usuario.telefono):
                self.autenticar(usuario)
                self.assertEqual(self.decidir("aceptar").status_code, esperado)
        self.assertEqual(DecisionPropuesta.objects.count(), 0)

        # Solicitud propia sin propuesta -> 404
        self.autenticar(self.comprador)
        sin_propuesta = self.crear(datos_renglon(self.p_stock))
        self.assertEqual(self.decidir("aceptar", solicitud=sin_propuesta).status_code, 404)

        # Campos no permitidos en el cuerpo -> 400
        for extra in (
            {"decision": "aceptar", "comprador": self.comprador.pk},
            {"decision": "aceptar", "taller": self.taller.pk},
            {"decision": "aceptar", "total": "1.00"},
            {"decision": "aceptar", "precio_unitario": "1.00"},
            {"decision": "aceptar", "cantidad": 1},
            {"decision": "aceptar", "pedido": 1},
            {"decision": "invalida"},
        ):
            with self.subTest(extra=extra):
                self.assertEqual(self.decidir(datos=extra).status_code, 400)

    def test_permisos_y_consultas_de_pedidos_sin_n_mas_uno(self):
        r = self.decidir("aceptar")
        pedido_id = r.data["pedido"]["id"]

        # Comprador propietario
        lista_c = self.client.get(url_mis_pedidos())
        self.assertEqual((lista_c.status_code, lista_c.data["count"]), (200, 1))
        with CaptureQueriesContext(connection) as consultas:
            det_c = self.client.get(url_mi_pedido(pedido_id))
        self.assertEqual(det_c.status_code, 200)
        # No debe consultar catalogo_producto ni catalogo_categoria al leer el pedido.
        sql_total = " ".join(q["sql"] for q in consultas)
        self.assertNotIn("catalogo_producto", sql_total)
        self.assertNotIn("catalogo_categoria", sql_total)

        # Otro comprador: lista vacía y 404 en detalle
        self.autenticar(self.otro_comprador)
        self.assertEqual(self.client.get(url_mis_pedidos()).data["count"], 0)
        self.assertEqual(self.client.get(url_mi_pedido(pedido_id)).status_code, 404)
        self.assertEqual(self.client.get(url_pedidos_recibidos()).status_code, 403)

        # Artesano propietario aprobado
        self.autenticar(self.artesano)
        lista_a = self.client.get(url_pedidos_recibidos())
        self.assertEqual((lista_a.status_code, lista_a.data["count"]), (200, 1))
        self.assertEqual(self.client.get(url_pedido_recibido(pedido_id)).status_code, 200)
        self.assertEqual(self.client.get(url_mis_pedidos()).status_code, 403)

        # Otro artesano: 404
        self.autenticar(self.artesano_ajeno)
        self.assertEqual(self.client.get(url_pedidos_recibidos()).data["count"], 0)
        self.assertEqual(self.client.get(url_pedido_recibido(pedido_id)).status_code, 404)

        # Artesano pendiente/rechazado: 403
        for u in (self.taller_pendiente.propietario, self.taller_rechazado.propietario):
            self.autenticar(u)
            self.assertEqual(self.client.get(url_pedidos_recibidos()).status_code, 403)


class ConstraintsPedidosBDTests(ConfirmacionBaseTestCase):
    def setUp(self):
        super().setUp()
        self.decidir("aceptar")
        self.pedido = Pedido.objects.get()
        self.linea = LineaPedido.objects.first()
        self.cargo = CargoPedido.objects.first()
        self.decision = DecisionPropuesta.objects.get()

    def test_inmutabilidad_y_protect_de_pedido_lineas_cargos_y_decision(self):
        for obj in (self.pedido, self.linea, self.cargo, self.decision):
            with self.subTest(modelo=type(obj).__name__):
                with self.assertRaises(ValidationError):
                    obj.save()
                with self.assertRaises(ValidationError):
                    obj.delete()
        with self.assertRaises(ProtectedError):
            Propuesta.objects.filter(pk=self.pedido.propuesta_id).delete()

    def test_constraints_postgresql_de_pedido_linea_cargo_y_decision(self):
        for cambios in (
            {"total": Decimal("1.00")},
            {"costo_entrega": Decimal("-1.00")},
            {"moneda": "USD"},
            {"modalidad_entrega": "otra", "descripcion_entrega": "  "},
        ):
            with (
                self.subTest(pedido=cambios),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                Pedido.objects.filter(pk=self.pedido.pk).update(**cambios)

        for cambios in (
            {"subtotal": Decimal("1.00")},
            {"precio_unitario": Decimal("0.00")},
            {"cantidad": 0},
            {"cargo_personalizacion": Decimal("10.00")},
            {"producto_nombre": "   "},
        ):
            with (
                self.subTest(linea=cambios),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                LineaPedido.objects.filter(pk=self.linea.pk).update(**cambios)

        for cambios in (
            {"monto": Decimal("-1.00")},
            {"descripcion": "   "},
        ):
            with (
                self.subTest(cargo=cambios),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                CargoPedido.objects.filter(pk=self.cargo.pk).update(**cambios)

        with self.assertRaises(IntegrityError), transaction.atomic():
            DecisionPropuesta.objects.filter(pk=self.decision.pk).update(decision="invalida")


class EsquemaPedidosTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)
        cls.componentes = cls.esquema["components"]["schemas"]

    def test_rutas_y_snapshot_de_pedidos_documentados(self):
        rutas = self.esquema["paths"]
        for ruta in (
            "/api/v1/pedidos/mios/",
            "/api/v1/pedidos/mios/{pedido_id}/",
            "/api/v1/pedidos/recibidos/",
            "/api/v1/pedidos/recibidos/{pedido_id}/",
        ):
            self.assertIn(ruta, rutas)
            self.assertEqual(set(rutas[ruta]), {"get"})
        pedido = self.componentes["PedidoComprador"]["properties"]
        self.assertTrue(
            {
                "id",
                "solicitud",
                "propuesta",
                "taller",
                "confirmado_en",
                "moneda",
                "modalidad_entrega",
                "descripcion_entrega",
                "lineas",
                "otros_cargos",
                "costo_entrega",
                "subtotal_productos",
                "total_personalizacion",
                "total_otros_cargos",
                "total",
            }
            <= set(pedido)
        )
