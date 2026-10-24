"""Smoke HTTP real de AUD-12: WSGI en puerto temporal, JWT, multipart y PostgreSQL.

Ejecutar: uv run python manage.py test apps.pedidos.tests.test_smoke_cumplimiento
El pago se registra y confirma por HTTP (AUD-10); el cumplimiento, por las rutas AUD-12:
A. Stock 5: iniciar preparación → entrega 2 → entrega 3; inventario y transición final.
B. Personalización sobre unidad estándar: la unidad se consume al iniciar; entregar no
   consume otra vez.
C. Personalización desde cero: iniciar y entregar sin tocar inventario estándar.
D. Producción: iniciar y entregar sin entrada ni consumo artificial de stock.
E. Pedido mixto: renglones completados en momentos distintos; entregado con el último.
F. Comprador: confirmación en una entrega y discrepancia en otra, sin tocar inventario.
"""

from datetime import timedelta
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

from .base_cumplimiento import confirmar_pedido_mixto, personalizacion, produccion, stock


@override_settings(
    CSRF_COOKIE_SECURE=False,
    REFRESH_COOKIE_SECURE=False,
    ALLOWED_HOSTS=["localhost", "testserver"],
)
class SmokeCumplimientoTests(LiveServerTestCase):
    peticion = smoke_pagos.SmokePagosTests.peticion
    login = smoke_pagos.SmokePagosTests.login
    registrar = smoke_pagos.SmokePagosTests.registrar
    resolver = smoke_pagos.SmokePagosTests.resolver

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
        inicializar_stock(self.artesano_usuario, self.plato, cantidad=4)
        self.comprador = self.login(self.comprador_usuario)
        self.artesano = self.login(self.artesano_usuario)
        self.assertTrue(self.comprador and self.artesano)

    # --- Ayudas HTTP ---

    def pedido_pagado(self, *renglones):
        pedido = confirmar_pedido_mixto(
            comprador=self.comprador_usuario,
            artesano=self.artesano_usuario,
            renglones=list(renglones),
        )
        codigo, pago = self.registrar(
            self.comprador, pedido, "TRX-AUD12", ("pago.png", bytes_imagen(), "image/png")
        )
        self.assertEqual(codigo, 201, pago)
        codigo, pago = self.resolver(
            self.artesano, pedido, pago["intentos"][-1]["id"], "confirmado"
        )
        self.assertEqual((codigo, pago["estado"]), (200, "confirmado"))
        return pedido, list(pedido.lineas.order_by("posicion").values_list("pk", flat=True))

    def iniciar(self, pedido, linea, esperado=200):
        codigo, cuerpo = self.peticion(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/lineas/{linea}/iniciar/",
            token=self.artesano,
            clave=str(uuid4()),
            datos={},
        )
        self.assertEqual(codigo, esperado, cuerpo)
        return cuerpo

    def entregar(self, pedido, *cantidades, clave=None, esperado=201):
        codigo, cuerpo = self.peticion(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/entregas/",
            token=self.artesano,
            clave=clave or str(uuid4()),
            datos={
                "fecha": timezone.localdate().isoformat(),
                "lineas": [{"linea": linea, "cantidad": q} for linea, q in cantidades],
            },
        )
        self.assertEqual(codigo, esperado, cuerpo)
        return cuerpo

    def inventario(self, producto):
        inv = InventarioProducto.objects.get(producto=producto)
        return inv.existencia_fisica, inv.reservada

    def disponible_publico(self, producto):
        codigo, cuerpo = self.peticion(f"/api/v1/productos/{producto.pk}/")
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["disponible_stock"]

    def consumos(self, pedido):
        return MovimientoInventario.objects.filter(pedido=pedido, tipo="consumo").count()

    # --- Casos ---

    def test_casos_a_f(self):
        # A. Stock parcial.
        a, (linea_a,) = self.pedido_pagado(stock(self.jarron, 5))
        self.assertEqual(self.inventario(self.jarron), (10, 5))
        vista = self.iniciar(a, linea_a)
        self.assertEqual(vista["estado"], "en_cumplimiento")
        self.assertEqual(self.inventario(self.jarron), (10, 5))
        clave = str(uuid4())
        vista = self.entregar(a, (linea_a, 2), clave=clave)
        self.assertEqual(self.inventario(self.jarron), (8, 3))
        self.assertEqual(self.disponible_publico(self.jarron), 5)
        self.assertEqual(vista["lineas"][0]["cantidad_pendiente"], 3)
        self.entregar(a, (linea_a, 2), clave=clave)  # replay: sin efectos
        self.assertEqual(self.inventario(self.jarron), (8, 3))
        self.entregar(a, (linea_a, 4), esperado=409)
        vista = self.entregar(a, (linea_a, 3))
        self.assertEqual(vista["estado"], "entregado")
        self.assertEqual(self.inventario(self.jarron), (5, 0))
        self.assertEqual(self.disponible_publico(self.jarron), 5)
        self.assertEqual(self.consumos(a), 2)

        # B. Personalización sobre unidad estándar.
        b, (linea_b,) = self.pedido_pagado(personalizacion(self.plato, 1))
        self.assertEqual(self.inventario(self.plato), (4, 1))
        self.iniciar(b, linea_b)
        self.assertEqual(self.inventario(self.plato), (3, 0))
        self.assertEqual(self.consumos(b), 1)
        vista = self.entregar(b, (linea_b, 1))
        self.assertEqual((vista["estado"], self.consumos(b)), ("entregado", 1))
        self.assertEqual(self.inventario(self.plato), (3, 0))

        # C. Personalización desde cero.
        antes = (self.inventario(self.jarron), MovimientoInventario.objects.count())
        c, (linea_c,) = self.pedido_pagado(personalizacion(self.jarron, 2, origen="desde_cero"))
        self.iniciar(c, linea_c)
        self.entregar(c, (linea_c, 2))
        self.assertEqual(
            (self.inventario(self.jarron), MovimientoInventario.objects.count()), antes
        )

        # D. Producción.
        d, (linea_d,) = self.pedido_pagado(produccion(self.jarron, 3))
        self.iniciar(d, linea_d)
        self.entregar(d, (linea_d, 1))
        vista = self.entregar(d, (linea_d, 2))
        self.assertEqual(vista["estado"], "entregado")
        self.assertEqual(
            (self.inventario(self.jarron), MovimientoInventario.objects.count()), antes
        )

        # E. Pedido mixto completado en momentos distintos.
        e, (st, pr, dc, ue) = self.pedido_pagado(
            stock(self.jarron, 2),
            produccion(self.jarron, 1),
            personalizacion(self.jarron, 1, origen="desde_cero"),
            personalizacion(self.plato, 1),
        )
        self.iniciar(e, st)
        self.iniciar(e, ue)
        self.assertEqual(self.entregar(e, (st, 1), (ue, 1))["estado"], "en_cumplimiento")
        self.iniciar(e, pr)
        self.entregar(e, (pr, 1), esperado=201)
        self.iniciar(e, dc)
        self.assertEqual(self.entregar(e, (dc, 1))["estado"], "en_cumplimiento")
        vista = self.entregar(e, (st, 1))
        self.assertEqual(vista["estado"], "entregado")
        self.assertEqual({lin["estado"] for lin in vista["lineas"]}, {"entregado"})
        self.assertEqual(self.inventario(self.jarron), (3, 0))
        self.assertEqual(self.inventario(self.plato), (2, 0))

        # F. Evidencia del comprador sobre las dos entregas de A.
        foto = (
            self.inventario(self.jarron),
            self.inventario(self.plato),
            MovimientoInventario.objects.count(),
        )
        codigo, vista = self.peticion(
            f"/api/v1/pedidos/mios/{a.pk}/cumplimiento/", token=self.comprador
        )
        self.assertEqual(codigo, 200, vista)
        primera, segunda = vista["entregas"]
        codigo, vista = self.peticion(
            f"/api/v1/pedidos/mios/{a.pk}/entregas/{primera['id']}/recepcion/",
            token=self.comprador,
            clave=str(uuid4()),
            datos={"resultado": "confirmada"},
        )
        self.assertEqual(codigo, 201, vista)
        codigo, vista = self.peticion(
            f"/api/v1/pedidos/mios/{a.pk}/entregas/{segunda['id']}/recepcion/",
            token=self.comprador,
            clave=str(uuid4()),
            datos={"resultado": "discrepancia", "motivo": "Falta una unidad."},
        )
        self.assertEqual(codigo, 201, vista)
        self.assertEqual(
            [x["recepcion"]["resultado"] for x in vista["entregas"]], ["confirmada", "discrepancia"]
        )
        self.assertEqual(vista["estado"], "entregado")
        self.assertEqual(
            (
                self.inventario(self.jarron),
                self.inventario(self.plato),
                MovimientoInventario.objects.count(),
            ),
            foto,
        )
        codigo, _ = self.peticion(
            f"/api/v1/pedidos/mios/{a.pk}/entregas/{primera['id']}/recepcion/",
            token=self.comprador,
            clave=str(uuid4()),
            datos={"resultado": "confirmada"},
        )
        self.assertEqual(codigo, 409)
        print(
            "\nSMOKE AUD-12 HTTP/JWT/PostgreSQL: stock parcial 2+3 (física 10 a 5, disponible 5), "
            "unidad estándar consumida al iniciar sin segundo consumo, desde cero y producción "
            "sin tocar stock, mixto entregado con el último remanente, confirmación y "
            "discrepancia sin efectos en inventario OK."
        )

    def test_pago_no_confirmado_bloquea(self):
        pedido = confirmar_pedido_mixto(
            comprador=self.comprador_usuario,
            artesano=self.artesano_usuario,
            renglones=[stock(self.jarron, 1)],
        )
        linea = pedido.lineas.get().pk
        cuerpo = self.iniciar(pedido, linea, esperado=409)
        self.assertEqual(cuerpo["codigo"], "pago_no_confirmado")
        hoy = timezone.localdate()
        codigo, cuerpo = self.peticion(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/entregas/",
            token=self.artesano,
            clave=str(uuid4()),
            datos={"fecha": (hoy + timedelta(days=1)).isoformat(), "lineas": []},
        )
        self.assertEqual(codigo, 400, cuerpo)
