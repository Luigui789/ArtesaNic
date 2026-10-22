"""AUD-07: existencias iniciales, entradas, ajustes, historial append-only, permisos,
idempotencia, constraints PostgreSQL y esquema OpenAPI de inventario."""

from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_producto
from apps.inventario import services
from apps.inventario.models import (
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.propuestas import services as propuestas
from apps.propuestas.tests.base import PropuestaAPITestCase
from apps.solicitudes.tests.base import SolicitudesAPITestCase


def url_mi_inventario():
    return "/api/v1/inventario/"


def url_inventario_producto(producto_id: int):
    return f"/api/v1/inventario/productos/{producto_id}/"


def url_inicial(producto_id: int):
    return f"/api/v1/inventario/productos/{producto_id}/inicial/"


def url_entradas(producto_id: int):
    return f"/api/v1/inventario/productos/{producto_id}/entradas/"


def url_ajustes(producto_id: int):
    return f"/api/v1/inventario/productos/{producto_id}/ajustes/"


def url_movimientos(producto_id: int):
    return f"/api/v1/inventario/productos/{producto_id}/movimientos/"


class InventarioBaseAPITestCase(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.autenticar(self.artesano)

    def inicializar(self, producto=None, cantidad=10, *, clave=None):
        producto = producto or self.producto
        return self.client.post(
            url_inicial(producto.pk),
            {"cantidad": cantidad},
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )

    def entrada(self, producto=None, cantidad=5, motivo="", *, clave=None):
        producto = producto or self.producto
        datos = {"cantidad": cantidad}
        if motivo:
            datos["motivo"] = motivo
        return self.client.post(
            url_entradas(producto.pk),
            datos,
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )

    def ajustar(self, producto=None, delta=2, motivo="Recuento físico", *, clave=None):
        producto = producto or self.producto
        return self.client.post(
            url_ajustes(producto.pk),
            {"delta": delta, "motivo": motivo},
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )


class OperacionesInventarioTests(InventarioBaseAPITestCase):
    def test_existencia_inicial_positiva_y_cero(self):
        respuesta = self.inicializar(cantidad=12)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(
            (
                respuesta.data["existencia_fisica"],
                respuesta.data["reservada"],
                respuesta.data["disponible"],
            ),
            (12, 0, 12),
        )
        otro = crear_producto(self.taller, self.categoria, publicado=True, nombre="Cero")
        r_cero = self.inicializar(producto=otro, cantidad=0)
        self.assertEqual(r_cero.status_code, 201, r_cero.data)
        self.assertEqual(
            (
                r_cero.data["existencia_fisica"],
                r_cero.data["reservada"],
                r_cero.data["disponible"],
            ),
            (0, 0, 0),
        )
        mov = MovimientoInventario.objects.get(producto=otro)
        self.assertEqual(
            (
                mov.tipo,
                mov.cantidad,
                mov.existencia_antes,
                mov.existencia_despues,
                mov.reservada_antes,
                mov.reservada_despues,
                mov.actor_id,
            ),
            (TipoMovimientoInventario.EXISTENCIA_INICIAL, 0, 0, 0, 0, 0, self.artesano.pk),
        )

    def test_segunda_inicializacion_con_otra_clave_es_409_sin_efectos(self):
        self.assertEqual(self.inicializar(cantidad=8).status_code, 201)
        segunda = self.inicializar(cantidad=20)
        self.assertEqual(segunda.status_code, 409)
        self.assertEqual(segunda.data["codigo"], "inventario_ya_inicializado")
        inv = InventarioProducto.objects.get(producto=self.producto)
        self.assertEqual(inv.existencia_fisica, 8)
        self.assertEqual(MovimientoInventario.objects.count(), 1)

    def test_entrada_aumenta_existencia_y_disponibilidad(self):
        self.inicializar(cantidad=4)
        respuesta = self.entrada(cantidad=6, motivo="Horneada semanal")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(
            (
                respuesta.data["existencia_fisica"],
                respuesta.data["reservada"],
                respuesta.data["disponible"],
            ),
            (10, 0, 10),
        )
        mov = MovimientoInventario.objects.filter(
            producto=self.producto, tipo=TipoMovimientoInventario.ENTRADA
        ).get()
        self.assertEqual(
            (mov.cantidad, mov.existencia_antes, mov.existencia_despues, mov.motivo),
            (6, 4, 10, "Horneada semanal"),
        )

    def test_ajuste_positivo_y_negativo_con_motivo(self):
        self.inicializar(cantidad=10)
        pos = self.ajustar(delta=3, motivo="Piezas halladas en bodega")
        self.assertEqual(pos.status_code, 200)
        self.assertEqual(pos.data["existencia_fisica"], 13)

        neg = self.ajustar(delta=-5, motivo="Rotura en secado")
        self.assertEqual(neg.status_code, 200)
        self.assertEqual(
            (neg.data["existencia_fisica"], neg.data["reservada"], neg.data["disponible"]),
            (8, 0, 8),
        )
        tipos = list(
            MovimientoInventario.objects.filter(producto=self.producto).values_list(
                "tipo", "cantidad", "existencia_antes", "existencia_despues"
            )
        )
        self.assertEqual(
            tipos,
            [
                ("ajuste_negativo", 5, 13, 8),
                ("ajuste_positivo", 3, 10, 13),
                ("existencia_inicial", 10, 0, 10),
            ],
        )

    def test_ajuste_negativo_bajo_comprometido_o_bajo_cero_es_409_sin_efectos(self):
        self.inicializar(cantidad=5)
        InventarioProducto.objects.filter(producto=self.producto).update(reservada=3)
        bajo_reserva = self.ajustar(delta=-3, motivo="Intento inválido")
        self.assertEqual(bajo_reserva.status_code, 409)
        self.assertEqual(bajo_reserva.data["codigo"], "ajuste_bajo_comprometido")
        inv = InventarioProducto.objects.get(producto=self.producto)
        self.assertEqual((inv.existencia_fisica, inv.reservada, inv.disponible), (5, 3, 2))
        self.assertEqual(MovimientoInventario.objects.count(), 1)

        # Ajuste exacto hasta la cantidad reservada sí es válido (disponible pasa a 0).
        exacto = self.ajustar(delta=-2, motivo="Baja de excedente libre")
        self.assertEqual(exacto.status_code, 200)
        self.assertEqual(
            (exacto.data["existencia_fisica"], exacto.data["reservada"], exacto.data["disponible"]),
            (3, 3, 0),
        )

    def test_operaciones_sin_inicializar_responden_409(self):
        r_ent = self.entrada(cantidad=2)
        self.assertEqual(
            (r_ent.status_code, r_ent.data["codigo"]), (409, "inventario_no_inicializado")
        )
        r_aj = self.ajustar(delta=1, motivo="Ajuste previo")
        self.assertEqual(
            (r_aj.status_code, r_aj.data["codigo"]), (409, "inventario_no_inicializado")
        )
        self.assertFalse(MovimientoInventario.objects.exists())

    def test_validaciones_de_entrada_400(self):
        self.assertEqual(self.inicializar(cantidad=-1).status_code, 400)
        self.assertEqual(self.inicializar(cantidad=True).status_code, 400)
        self.inicializar(cantidad=5)
        self.assertEqual(self.entrada(cantidad=0).status_code, 400)
        self.assertEqual(self.entrada(cantidad=-2).status_code, 400)
        self.assertEqual(self.ajustar(delta=0, motivo="Cero").status_code, 400)
        self.assertEqual(self.ajustar(delta=1, motivo="   ").status_code, 400)
        # Campos desconocidos rechazados con 400.
        for ruta, extra in (
            (url_inicial(self.producto.pk), {"cantidad": 1, "reservada": 0}),
            (url_entradas(self.producto.pk), {"cantidad": 1, "actor": self.artesano.pk}),
            (url_ajustes(self.producto.pk), {"delta": 1, "motivo": "ok", "existencia_fisica": 10}),
        ):
            with self.subTest(ruta=ruta):
                r = self.client.post(ruta, extra, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
                self.assertEqual(r.status_code, 400)


class IdempotenciaInventarioTests(InventarioBaseAPITestCase):
    def test_replay_y_recuperacion_aud08_en_inicial_entrada_y_ajuste(self):
        c_ini = str(uuid4())
        r1 = self.inicializar(cantidad=10, clave=c_ini)
        r2 = self.inicializar(cantidad=10, clave=c_ini)
        self.assertEqual((r1.status_code, r2.status_code), (201, 201))
        self.assertEqual(r2["Idempotency-Replayed"], "true")
        self.assertEqual(r1.data["id"], r2.data["id"])
        # Misma clave con otra cantidad => 409 clave_idempotencia_reutilizada
        conf = self.inicializar(cantidad=99, clave=c_ini)
        self.assertEqual(
            (conf.status_code, conf.data["codigo"]), (409, "clave_idempotencia_reutilizada")
        )

        c_ent = str(uuid4())
        e1 = self.entrada(cantidad=4, motivo="Lote A", clave=c_ent)
        e2 = self.entrada(cantidad=4, motivo="Lote A", clave=c_ent)
        self.assertEqual((e1.status_code, e2.status_code), (200, 200))
        self.assertEqual(e2["Idempotency-Replayed"], "true")
        self.assertEqual(e2.data["existencia_fisica"], 14)

        c_aj = str(uuid4())
        a1 = self.ajustar(delta=-2, motivo="Merma", clave=c_aj)
        a2 = self.ajustar(delta=-2, motivo="Merma", clave=c_aj)
        self.assertEqual((a1.status_code, a2.status_code), (200, 200))
        self.assertEqual(a2["Idempotency-Replayed"], "true")
        self.assertEqual(a2.data["existencia_fisica"], 12)
        self.assertEqual(MovimientoInventario.objects.count(), 3)

        # Recuperación mediante GET /api/v1/operaciones/{tipo}/{clave}/
        for tipo, clave, modelo in (
            (TipoOperacion.ESTABLECER_INVENTARIO_INICIAL, c_ini, "inventarioproducto"),
            (TipoOperacion.REGISTRAR_ENTRADA_INVENTARIO, c_ent, "movimientoinventario"),
            (TipoOperacion.AJUSTAR_INVENTARIO, c_aj, "movimientoinventario"),
        ):
            with self.subTest(tipo=tipo):
                rec = self.client.get(f"/api/v1/operaciones/{tipo}/{clave}/")
                self.assertEqual(rec.status_code, 200)
                self.assertEqual(rec.data["recurso"]["tipo"], modelo)
        self.assertEqual(OperacionIdempotente.objects.count(), 3)


class HistorialYPermisosInventarioTests(InventarioBaseAPITestCase):
    def test_historial_append_only_y_listado_ordenado(self):
        self.inicializar(cantidad=5)
        self.entrada(cantidad=3, motivo="Entrada 1")
        self.ajustar(delta=-1, motivo="Ajuste 1")

        mov = MovimientoInventario.objects.first()
        with self.assertRaises(ValidationError):
            mov.save()
        with self.assertRaises(ValidationError):
            mov.delete()

        r = self.client.get(url_movimientos(self.producto.pk))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 3)
        self.assertEqual(
            [m["tipo"] for m in r.data["results"]],
            ["ajuste_negativo", "entrada", "existencia_inicial"],
        )

    def test_permisos_y_aislamiento_entre_talleres_y_roles(self):
        self.inicializar(cantidad=7)
        # Artesano propietario ve su listado y su producto
        lista = self.client.get(url_mi_inventario())
        self.assertEqual((lista.status_code, lista.data["count"]), (200, 1))
        detalle = self.client.get(url_inventario_producto(self.producto.pk))
        self.assertEqual((detalle.status_code, detalle.data["disponible"]), (200, 7))

        # Otro artesano aprobado: listado vacío y 404 para producto ajeno
        self.autenticar(self.artesano_ajeno)
        self.assertEqual(self.client.get(url_mi_inventario()).data["count"], 0)
        for ruta in (
            url_inventario_producto(self.producto.pk),
            url_movimientos(self.producto.pk),
        ):
            self.assertEqual(self.client.get(ruta).status_code, 404)
        for ruta, datos in (
            (url_inicial(self.producto.pk), {"cantidad": 1}),
            (url_entradas(self.producto.pk), {"cantidad": 1}),
            (url_ajustes(self.producto.pk), {"delta": 1, "motivo": "x"}),
        ):
            self.assertEqual(
                self.client.post(
                    ruta, datos, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4())
                ).status_code,
                404,
            )

        # Comprador, artesano pendiente/rechazado y sin taller reciben 403; admin y anónimo 401
        for usuario, esperado in (
            (self.comprador, 403),
            (self.taller_pendiente.propietario, 403),
            (self.taller_rechazado.propietario, 403),
            (crear_usuario("81111199", rol=Rol.ARTESANO), 403),
            (self.admin, 401),
        ):
            with self.subTest(usuario=usuario.telefono):
                self.autenticar(usuario)
                self.assertEqual(self.client.get(url_mi_inventario()).status_code, esperado)
                self.assertEqual(
                    self.client.post(
                        url_inicial(self.producto.pk),
                        {"cantidad": 1},
                        format="json",
                        HTTP_IDEMPOTENCY_KEY=str(uuid4()),
                    ).status_code,
                    esperado,
                )
        self.anonimo()
        self.assertEqual(self.client.get(url_mi_inventario()).status_code, 401)


class ConstraintsInventarioBDTests(PropuestaAPITestCase):
    def setUp(self):
        super().setUp()
        services.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.p_stock.pk, cantidad=5
        )
        services.establecer_inventario_inicial(
            artesano=self.artesano, producto_id=self.p_pers.pk, cantidad=2
        )
        self.revisar()
        self.emitir()
        propuestas.decidir_propuesta(
            comprador=self.comprador, solicitud_id=self.solicitud.pk, decision="aceptar"
        )
        self.inv = InventarioProducto.objects.get(producto=self.p_stock)
        self.reserva = ReservaInventario.objects.get(producto=self.p_stock)
        self.mov = MovimientoInventario.objects.filter(
            producto=self.p_stock, tipo=TipoMovimientoInventario.RESERVA
        ).get()

    def test_constraints_de_inventario_producto(self):
        # reservada > existencia_fisica imposible en PostgreSQL
        for cambios in (
            {"reservada": 6},
            {"existencia_fisica": 2},
        ):
            with (
                self.subTest(cambios=cambios),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                InventarioProducto.objects.filter(pk=self.inv.pk).update(**cambios)

    def test_constraints_de_reserva_y_movimientos(self):
        for cambios in (
            {"cantidad": 0},
            {"estado": "invalido"},
        ):
            with (
                self.subTest(reserva=cambios),
                self.assertRaises(IntegrityError),
                transaction.atomic(),
            ):
                ReservaInventario.objects.filter(pk=self.reserva.pk).update(**cambios)

        for cambios in (
            {"tipo": "invalido"},
            {"cantidad": 0},
            {"reservada_despues": 99},
            {"existencia_despues": 4},
            {"pedido": None},
            {"reserva": None},
            {"tipo": TipoMovimientoInventario.AJUSTE_NEGATIVO, "motivo": "   "},
        ):
            with self.subTest(mov=cambios), self.assertRaises(IntegrityError), transaction.atomic():
                MovimientoInventario.objects.filter(pk=self.mov.pk).update(**cambios)


class EsquemaInventarioTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)
        cls.componentes = cls.esquema["components"]["schemas"]

    def test_rutas_y_operaciones_de_inventario_documentadas(self):
        rutas = self.esquema["paths"]
        self.assertIn("/api/v1/inventario/", rutas)
        self.assertIn("/api/v1/inventario/productos/{producto_id}/", rutas)
        for sufijo, codigo in (
            ("inicial/", "201"),
            ("entradas/", "200"),
            ("ajustes/", "200"),
        ):
            ruta = f"/api/v1/inventario/productos/{{producto_id}}/{sufijo}"
            self.assertIn(ruta, rutas)
            op = rutas[ruta]["post"]
            clave = next(p for p in op["parameters"] if p["name"] == "Idempotency-Key")
            self.assertTrue(clave["required"])
            self.assertIn("Idempotency-Replayed", op["responses"][codigo]["headers"])
            self.assertTrue({"400", "401", "403", "404", "409"} <= set(op["responses"]))
        self.assertEqual(
            set(self.componentes["CodigoConflictoInventarioEnum"]["enum"]),
            {
                "inventario_ya_inicializado",
                "inventario_no_inicializado",
                "ajuste_bajo_comprometido",
                "clave_idempotencia_reutilizada",
            },
        )
