"""Smoke HTTP real de AUD-11: WSGI en puerto temporal, JWT, multipart, PostgreSQL y el comando.

Ejecutar: uv run python manage.py test apps.pedidos.tests.test_smoke_vencimiento
Seis pedidos reales con el reloj del servidor congelado (el servidor vivo y el comando lo
comparten) y el comando ``procesar_vencimientos_pago --once`` real:
1. Nunca paga → vence a las 48 h, reservas liberadas y disponibilidad pública restaurada.
2. Pago registrado con más de 48 h → no vence; reservas activas.
3. Observado vigente → no vence; al vencer su plazo, vence.
4. Observado vencido → vence y libera.
5. No recibido: un segundo antes no vence; en el límite vence.
6. Pago confirmado → no vence aunque pase un año.
"""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import LiveServerTestCase, override_settings

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.inventario.models import InventarioProducto, ReservaInventario
from apps.pagos.models import PLAZO
from apps.pagos.tests import test_smoke as smoke_pagos
from apps.pagos.tests.base import bytes_imagen, confirmar_pedido
from apps.solicitudes.tests.base import inicializar_stock
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

UN_SEGUNDO = timedelta(seconds=1)
STOCK = 100


@override_settings(
    CSRF_COOKIE_SECURE=False,
    REFRESH_COOKIE_SECURE=False,
    ALLOWED_HOSTS=["localhost", "testserver"],
)
class SmokeVencimientoTests(LiveServerTestCase):
    # Mismo cliente HTTP que el smoke de AUD-10 (sin heredar sus pruebas).
    peticion = smoke_pagos.SmokePagosTests.peticion
    login = smoke_pagos.SmokePagosTests.login
    registrar = smoke_pagos.SmokePagosTests.registrar
    resolver = smoke_pagos.SmokePagosTests.resolver

    def setUp(self):
        cache.clear()
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=crear_administrador())
        self.artesano = taller.propietario
        self.comprador = crear_usuario("86666661")
        self.producto = crear_producto(taller, crear_categoria(), publicado=True)
        inicializar_stock(self.artesano, self.producto, cantidad=STOCK)
        self.pedidos = [
            confirmar_pedido(
                comprador=self.comprador, artesano=self.artesano, producto=self.producto
            )
            for _ in range(6)
        ]
        self.base = max(p.confirmado_en for p in self.pedidos)

    def reloj(self, momento):
        return mock.patch("apps.pagos.services.ahora", return_value=momento)

    def procesar(self, momento) -> str:
        salida = StringIO()
        with self.reloj(momento):
            call_command("procesar_vencimientos_pago", "--once", stdout=salida)
        return salida.getvalue().strip()

    def estado(self, token, pedido):
        codigo, cuerpo = self.peticion(f"/api/v1/pedidos/mios/{pedido.pk}/", token=token)
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["estado"]

    def disponible_publico(self):
        codigo, cuerpo = self.peticion(f"/api/v1/productos/{self.producto.pk}/")
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["disponible_stock"]

    def intento_con(self, token, pedido, momento, referencia):
        with self.reloj(momento):
            codigo, cuerpo = self.registrar(
                token, pedido, referencia, ("pago.png", bytes_imagen(), "image/png")
            )
        self.assertEqual(codigo, 201, cuerpo)
        return cuerpo["intentos"][-1]["id"]

    def resolver_en(self, token, pedido, intento, momento, estado, motivo=None):
        with self.reloj(momento):
            codigo, cuerpo = self.resolver(token, pedido, intento, estado, motivo)
        self.assertEqual(codigo, 200, cuerpo)

    def test_seis_casos_de_vencimiento(self):
        nunca, registrado, observado_vigente, observado_vencido, no_recibido, confirmado = (
            self.pedidos
        )
        comprador, artesano = self.login(self.comprador), self.login(self.artesano)
        self.assertTrue(comprador and artesano)
        temprano, revision = self.base + timedelta(minutes=30), self.base + timedelta(hours=1)

        self.intento_con(comprador, registrado, temprano, "TRX-REG")
        for pedido, estado in ((observado_vencido, "observado"), (no_recibido, "no_recibido")):
            intento = self.intento_con(comprador, pedido, temprano, f"TRX-{estado}")
            self.resolver_en(artesano, pedido, intento, revision, estado, "Revisar")
        intento = self.intento_con(comprador, observado_vigente, temprano, "TRX-OBS-2")
        self.resolver_en(
            artesano,
            observado_vigente,
            intento,
            self.base + timedelta(hours=40),
            "observado",
            "Ilegible",
        )
        intento = self.intento_con(comprador, confirmado, temprano, "TRX-OK")
        self.resolver_en(artesano, confirmado, intento, revision, "confirmado")
        self.assertEqual(self.disponible_publico(), STOCK - 12)

        # Caso 1 y lado previo del caso 5: solo vence el pedido sin pago.
        plazo = revision + PLAZO
        self.assertEqual(self.procesar(plazo - UN_SEGUNDO), "vencidos=1 no_elegibles=0 errores=0")
        self.assertEqual(self.estado(comprador, nunca), "vencido_falta_pago")
        self.assertEqual(self.estado(comprador, no_recibido), "confirmado")
        self.assertEqual(self.disponible_publico(), STOCK - 10)
        inventario = InventarioProducto.objects.get(producto=self.producto)
        self.assertEqual((inventario.existencia_fisica, inventario.reservada), (STOCK, 10))
        with self.reloj(plazo):
            codigo, cuerpo = self.registrar(
                comprador, nunca, "TRX-TARDE", ("pago.png", bytes_imagen(), "image/png")
            )
        self.assertEqual((codigo, cuerpo["codigo"]), (409, "pedido_vencido"))

        # Casos 4 y 5: observado y no recibido vencidos en el instante exacto.
        self.assertEqual(self.procesar(plazo), "vencidos=2 no_elegibles=0 errores=0")
        for pedido in (observado_vencido, no_recibido):
            self.assertEqual(self.estado(comprador, pedido), "vencido_falta_pago")
            self.assertEqual(ReservaInventario.objects.get(pedido=pedido).estado, "liberada")
        codigo, pago = self.peticion(
            f"/api/v1/pedidos/recibidos/{observado_vencido.pk}/pago/", token=artesano
        )
        self.assertEqual((codigo, pago["estado"], len(pago["intentos"])), (200, "observado", 1))

        # Casos 2, 3 y 6: siguen confirmados con sus reservas activas.
        for pedido in (registrado, observado_vigente, confirmado):
            self.assertEqual(self.estado(comprador, pedido), "confirmado")
            self.assertEqual(ReservaInventario.objects.get(pedido=pedido).estado, "activa")

        # Caso 3 al vencer su plazo; 2 y 6 nunca, aunque pase un año.
        un_ano = self.base + timedelta(days=365)
        self.assertEqual(self.procesar(un_ano), "vencidos=1 no_elegibles=0 errores=0")
        self.assertEqual(self.estado(comprador, observado_vigente), "vencido_falta_pago")
        self.assertEqual(self.procesar(un_ano), "vencidos=0 no_elegibles=0 errores=0")
        self.assertEqual(self.estado(comprador, registrado), "confirmado")
        self.assertEqual(self.estado(comprador, confirmado), "confirmado")
        self.assertEqual(self.disponible_publico(), STOCK - 4)
        codigo, detalle = self.peticion(f"/api/v1/pedidos/recibidos/{nunca.pk}/", token=artesano)
        self.assertEqual((codigo, detalle["estado"]), (200, "vencido_falta_pago"))
        self.assertIsNotNone(detalle["vencido_en"])
        print(
            "\nSMOKE AUD-11 HTTP/JWT/PostgreSQL + comando: nunca paga, observado y no recibido "
            "vencen en el límite exacto; registrado, observado vigente y confirmado no; "
            "reservas liberadas, disponibilidad pública restaurada y 409 pedido_vencido OK."
        )
