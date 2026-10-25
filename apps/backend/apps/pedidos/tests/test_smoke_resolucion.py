"""Smoke HTTP real de AUD-13: WSGI en puerto temporal, JWT, multipart y PostgreSQL.

Ejecutar: uv run python manage.py test apps.pedidos.tests.test_smoke_resolucion
Pago por HTTP (AUD-10), cumplimiento por HTTP (AUD-12) y resolución por las rutas AUD-13:
A. Cancelación sin pago: cancelado, reservas liberadas, sin reembolso.
B. Cancelación pagada: reembolso total pendiente; devolución registrada → realizado.
C. Cancelación con personalización base iniciada: reembolso total, obligación y
   reutilizable con reincorporación.
D. Cierre parcial aceptado en pedido mixto: cerrado_parcial, reembolso parcial, remanentes
   liberados y obligación de la personalización.
E. Cierre objetado: sigue en cumplimiento, sin reembolso ni liberaciones; otra entrega
   funciona.
F. Baja de una unidad base manipulada: sin doble descuento físico y movimiento histórico.
"""

from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.inventario.models import InventarioProducto, MovimientoInventario
from apps.pagos.tests import test_smoke as smoke_pagos
from apps.pagos.tests.base import bytes_imagen
from apps.solicitudes.tests.base import inicializar_stock
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from . import test_smoke_cumplimiento as smoke_cumplimiento
from .base_cumplimiento import confirmar_pedido_mixto, personalizacion, produccion, stock

D = Decimal


@override_settings(
    CSRF_COOKIE_SECURE=False,
    REFRESH_COOKIE_SECURE=False,
    ALLOWED_HOSTS=["localhost", "testserver"],
)
class SmokeResolucionTests(LiveServerTestCase):
    peticion = smoke_pagos.SmokePagosTests.peticion
    login = smoke_pagos.SmokePagosTests.login
    registrar = smoke_pagos.SmokePagosTests.registrar
    resolver = smoke_pagos.SmokePagosTests.resolver
    pedido_pagado = smoke_cumplimiento.SmokeCumplimientoTests.pedido_pagado
    iniciar = smoke_cumplimiento.SmokeCumplimientoTests.iniciar
    entregar = smoke_cumplimiento.SmokeCumplimientoTests.entregar
    inventario = smoke_cumplimiento.SmokeCumplimientoTests.inventario
    disponible_publico = smoke_cumplimiento.SmokeCumplimientoTests.disponible_publico

    def setUp(self):
        cache.clear()
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        self.artesano_usuario = taller.propietario
        self.comprador_usuario = crear_usuario("86666661")
        categoria = crear_categoria()
        self.jarron = crear_producto(
            taller,
            categoria,
            publicado=True,
            nombre="Jarrón",
            permite_produccion=True,
            permite_personalizacion=True,
        )
        self.plato = crear_producto(
            taller, categoria, publicado=True, nombre="Plato", permite_personalizacion=True
        )
        inicializar_stock(self.artesano_usuario, self.jarron, cantidad=10)
        inicializar_stock(self.artesano_usuario, self.plato, cantidad=10)
        self.comprador = self.login(self.comprador_usuario)
        self.artesano = self.login(self.artesano_usuario)
        self.assertTrue(self.comprador and self.artesano)

    # --- Ayudas HTTP ---

    def post(self, ruta, datos, *, token, esperado=201):
        codigo, cuerpo = self.peticion(ruta, token=token, clave=str(uuid4()), datos=datos)
        self.assertEqual(codigo, esperado, cuerpo)
        return cuerpo

    def cancelar(self, pedido, esperado=201):
        return self.post(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/cancelacion/",
            {"motivo": "No es posible completar el pedido."},
            token=self.artesano,
            esperado=esperado,
        )

    def proponer(self, pedido):
        return self.post(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/cierres-parciales/",
            {"motivo": "No será posible completar las cantidades restantes."},
            token=self.artesano,
        )

    def responder(self, pedido, cierre, datos):
        return self.post(
            f"/api/v1/pedidos/mios/{pedido.pk}/cierres-parciales/{cierre}/respuesta/",
            datos,
            token=self.comprador,
        )

    def clasificaciones(self, pedido):
        codigo, cuerpo = self.peticion(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/clasificaciones/", token=self.artesano
        )
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["obligaciones"]

    def clasificar(self, pedido, obligacion, cantidad, resultado, motivo):
        return self.post(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/clasificaciones/",
            {
                "clasificaciones": [
                    {
                        "obligacion": obligacion,
                        "cantidad": cantidad,
                        "resultado": resultado,
                        "motivo": motivo,
                    }
                ]
            },
            token=self.artesano,
        )

    def resolucion(self, pedido, token):
        ruta = "recibidos" if token == self.artesano else "mios"
        codigo, cuerpo = self.peticion(
            f"/api/v1/pedidos/{ruta}/{pedido.pk}/resolucion/", token=token
        )
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo

    def movimientos(self, pedido, tipo):
        return MovimientoInventario.objects.filter(pedido=pedido, tipo=tipo)

    # --- Casos ---

    def test_casos_a_f(self):
        # A. Cancelación sin pago.
        a = confirmar_pedido_mixto(
            comprador=self.comprador_usuario,
            artesano=self.artesano_usuario,
            renglones=[stock(self.jarron, 3)],
        )
        self.assertEqual(self.disponible_publico(self.jarron), 7)
        vista = self.cancelar(a)
        self.assertEqual((vista["estado"], vista["reembolso"]), ("cancelado_artesano", None))
        self.assertEqual(self.inventario(self.jarron), (10, 0))
        self.assertEqual(self.disponible_publico(self.jarron), 10)
        codigo, cuerpo = self.registrar(
            self.comprador, a, "TRX-A", ("pago.png", bytes_imagen(), "image/png")
        )
        self.assertEqual((codigo, cuerpo["codigo"]), (409, "pedido_finalizado"))

        # B. Cancelación pagada y devolución registrada.
        b, _ = self.pedido_pagado(stock(self.jarron, 2))
        vista = self.cancelar(b)
        reembolso = vista["reembolso"]
        self.assertEqual(
            (reembolso["tipo"], D(reembolso["monto"]), reembolso["estado"]),
            ("total", b.total, "pendiente"),
        )
        self.assertEqual(self.resolucion(b, self.comprador)["reembolso"]["estado"], "pendiente")
        vista = self.post(
            f"/api/v1/pedidos/recibidos/{b.pk}/reembolso/realizacion/",
            {"fecha": timezone.localdate().isoformat(), "referencia": "Transferencia BAC 12345"},
            token=self.artesano,
        )
        self.assertEqual(vista["reembolso"]["estado"], "realizado")
        self.assertEqual(D(vista["reembolso"]["devolucion"]["monto"]), b.total)
        self.assertEqual(self.resolucion(b, self.comprador)["reembolso"]["estado"], "realizado")

        # C. Personalización base iniciada, cancelación pagada y reutilizable.
        c, (linea_c,) = self.pedido_pagado(personalizacion(self.plato, 2))
        self.iniciar(c, linea_c)
        self.assertEqual(self.inventario(self.plato), (8, 0))
        vista = self.cancelar(c)
        self.assertEqual(vista["reembolso"]["tipo"], "total")
        (obligacion,) = self.clasificaciones(c)
        self.assertEqual((obligacion["cantidad"], obligacion["cantidad_pendiente"]), (2, 2))
        codigo, _ = self.peticion(
            f"/api/v1/pedidos/recibidos/{c.pk}/clasificaciones/", token=self.comprador
        )
        self.assertEqual(codigo, 403, "el comprador no ve la clasificación interna")
        self.clasificar(c, obligacion["id"], 2, "reutilizable", "Sin alteraciones visibles.")
        self.assertEqual(self.inventario(self.plato), (10, 0))
        self.assertEqual(self.movimientos(c, "reincorporacion").get().cantidad, 2)

        # D. Cierre parcial aceptado en pedido mixto.
        d, (st, pe, pr) = self.pedido_pagado(
            stock(self.jarron, 4), personalizacion(self.plato, 3), produccion(self.jarron, 1)
        )
        for linea in (st, pe):
            self.iniciar(d, linea)
        self.entregar(d, (st, 1), (pe, 1))
        self.assertEqual(self.inventario(self.jarron), (9, 3))
        self.assertEqual(self.inventario(self.plato), (7, 0))
        estimado = self.resolucion(d, self.artesano)["estimacion_cierre"]
        vista = self.proponer(d)
        cierre = vista["cierres_parciales"][0]
        self.assertEqual(cierre["monto_reembolso"], estimado["monto_reembolso"])
        vista = self.responder(d, cierre["id"], {"decision": "aceptado"})
        self.assertEqual(vista["estado"], "cerrado_parcial")
        self.assertEqual(
            (vista["reembolso"]["tipo"], vista["reembolso"]["monto"]),
            ("parcial", cierre["monto_reembolso"]),
        )
        self.assertTrue(0 < D(cierre["monto_reembolso"]) < d.total)
        self.assertEqual(self.inventario(self.jarron), (9, 0))
        self.assertEqual(self.movimientos(d, "liberacion").get().cantidad, 3)
        (obligacion,) = self.clasificaciones(d)
        self.assertEqual(obligacion["cantidad"], 2)
        self.entregar(d, (pr, 1), esperado=409)

        # E. Cierre objetado y nueva entrega.
        e, (linea_e,) = self.pedido_pagado(stock(self.jarron, 3))
        self.iniciar(e, linea_e)
        self.entregar(e, (linea_e, 1))
        antes = (self.inventario(self.jarron), MovimientoInventario.objects.count())
        cierre = self.proponer(e)["cierres_parciales"][0]
        vista = self.responder(
            e, cierre["id"], {"decision": "objetado", "motivo": "Prefiero esperar."}
        )
        self.assertEqual((vista["estado"], vista["reembolso"]), ("en_cumplimiento", None))
        self.assertEqual(
            (self.inventario(self.jarron), MovimientoInventario.objects.count()), antes
        )
        self.assertEqual(self.entregar(e, (linea_e, 2))["estado"], "entregado")

        # F. Baja de unidad base manipulada (la obligación de D).
        antes = self.inventario(self.plato)
        self.clasificar(d, obligacion["id"], 1, "baja", "La transformación impide revenderla.")
        self.assertEqual(self.inventario(self.plato), antes, "sin doble descuento físico")
        baja = self.movimientos(d, "baja").get()
        self.assertEqual((baja.existencia_antes, baja.existencia_despues), (antes[0], antes[0]))
        self.assertEqual(self.clasificaciones(d)[0]["cantidad_pendiente"], 1)
        self.assertEqual(
            InventarioProducto.objects.get(producto=self.plato).existencia_fisica, antes[0]
        )
        print(
            "\nSMOKE AUD-13 HTTP/JWT/PostgreSQL: cancelación sin pago con liberación, cancelación "
            "pagada con reembolso total y devolución realizada, personalización base cancelada "
            "y reincorporada, cierre parcial aceptado con reembolso exacto y remanentes "
            "liberados, objeción sin efectos y nueva entrega, baja sin doble descuento OK."
        )
