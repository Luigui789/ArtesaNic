"""Smoke HTTP real de AUD-07: WSGI en puerto temporal, login JWT, CSRF y PostgreSQL.

Ejecutar: uv run python manage.py test apps.pedidos.tests.test_smoke
Cubre §45 y §46:
1. Comprador A, Comprador B y Artesano con taller aprobado;
2. Producto publicado a C$100.00 y existencia inicial = 5;
3. Solicitudes de Comprador A (2 unidades stock) y Comprador B (1 unidad stock);
4. Resolución de renglones y emisión de propuestas;
5. Cambio del precio en catálogo a C$150.00;
6. Comprador A acepta la propuesta -> Pedido confirmado a C$100.00 / C$200.00,
   existencia_fisica=5, reservada=2, disponible=3, movimiento de reserva=2;
7. Replay de Idempotency-Key devuelve 200 + Idempotency-Replayed: true;
8. Segundo cambio de precio a C$250.00 y lectura del Pedido -> sigue en C$100.00 / C$200.00;
9. Comprador B rechaza su propuesta -> decisión rechazada, sin Pedido ni reserva;
10. Artesano consulta movimientos de inventario por HTTP.
"""

import json
from decimal import Decimal
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings

from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller


@override_settings(
    CSRF_COOKIE_SECURE=False,
    REFRESH_COOKIE_SECURE=False,
    ALLOWED_HOSTS=["localhost", "testserver"],
)
class SmokeConfirmacionReservasTests(LiveServerTestCase):
    def setUp(self):
        cache.clear()
        self.taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(self.taller, revisor=crear_administrador())
        self.comprador_a = crear_usuario("86666661")
        self.comprador_b = crear_usuario("86666662")
        self.categoria = crear_categoria()
        self.producto = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Jarrón de barro negro",
            precio=Decimal("100.00"),
        )

    def peticion(
        self, ruta, *, metodo=None, datos=None, token=None, csrf=None, clave=None, cliente=None
    ):
        cabeceras = {"Accept": "application/json"}
        if token:
            cabeceras["Authorization"] = f"Bearer {token}"
        if csrf:
            cabeceras["X-CSRFToken"] = csrf
        if clave:
            cabeceras["Idempotency-Key"] = clave
        cuerpo = None if datos is None else json.dumps(datos).encode()
        if cuerpo is not None:
            cabeceras["Content-Type"] = "application/json"
        request = Request(
            self.live_server_url + ruta,
            data=cuerpo,
            headers=cabeceras,
            method=metodo or ("POST" if cuerpo is not None else "GET"),
        )
        try:
            with (cliente or build_opener()).open(request, timeout=20) as respuesta:
                return respuesta.status, json.load(respuesta), respuesta.headers
        except HTTPError as exc:
            return exc.code, json.load(exc), exc.headers

    def login(self, usuario):
        cliente = build_opener(HTTPCookieProcessor(CookieJar()))
        _, cuerpo, _ = self.peticion("/api/v1/auth/csrf/", cliente=cliente)
        codigo, cuerpo, _ = self.peticion(
            "/api/v1/auth/login/",
            cliente=cliente,
            csrf=cuerpo["csrf_token"],
            datos={"telefono": usuario.telefono, "password": PASSWORD},
        )
        self.assertEqual(codigo, 200, cuerpo)
        return cuerpo["access"]

    def test_flujo_http_completo_aud07_snapshot_reservas_movimientos_y_replay(self):
        token_a = self.login(self.taller.propietario)
        token_ca = self.login(self.comprador_a)
        token_cb = self.login(self.comprador_b)

        # 5. Producto publicado a C$100.00.
        pid = self.producto.pk

        # 6. Registrar inventario inicial = 5 por HTTP.
        codigo, inv, _ = self.peticion(
            f"/api/v1/inventario/productos/{pid}/inicial/",
            token=token_a,
            clave=str(uuid4()),
            datos={"cantidad": 5},
        )
        self.assertEqual(codigo, 201, inv)
        self.assertEqual((inv["existencia_fisica"], inv["reservada"], inv["disponible"]), (5, 0, 5))

        # 7–9. Comprador A solicita 2 unidades stock; artesano acepta y emite propuesta.
        codigo, sol_a, _ = self.peticion(
            "/api/v1/solicitudes/",
            token=token_ca,
            clave=str(uuid4()),
            datos={"renglones": [{"producto": pid, "modalidad": "stock", "cantidad": 2}]},
        )
        self.assertEqual(codigo, 201, sol_a)
        sid_a = sol_a["id"]
        rid_a = sol_a["renglones"][0]["id"]
        self.assertEqual(
            self.peticion(
                f"/api/v1/solicitudes/recibidas/{sid_a}/renglones/{rid_a}/resolver/",
                token=token_a,
                clave=str(uuid4()),
                datos={"resolucion": "aceptado"},
            )[0],
            200,
        )
        codigo, prop_a, _ = self.peticion(
            f"/api/v1/solicitudes/recibidas/{sid_a}/propuesta/",
            token=token_a,
            clave=str(uuid4()),
            datos={
                "modalidad_entrega": "retiro_taller",
                "descripcion_entrega": "",
                "costo_entrega": "0.00",
                "lineas": [{"renglon": rid_a}],
                "otros_cargos": [],
            },
        )
        self.assertEqual(codigo, 201, prop_a)

        # Comprador B solicita 1 unidad stock; artesano acepta y emite propuesta.
        _, sol_b, _ = self.peticion(
            "/api/v1/solicitudes/",
            token=token_cb,
            clave=str(uuid4()),
            datos={"renglones": [{"producto": pid, "modalidad": "stock", "cantidad": 1}]},
        )
        sid_b = sol_b["id"]
        rid_b = sol_b["renglones"][0]["id"]
        self.peticion(
            f"/api/v1/solicitudes/recibidas/{sid_b}/renglones/{rid_b}/resolver/",
            token=token_a,
            clave=str(uuid4()),
            datos={"resolucion": "aceptado"},
        )
        self.peticion(
            f"/api/v1/solicitudes/recibidas/{sid_b}/propuesta/",
            token=token_a,
            clave=str(uuid4()),
            datos={
                "modalidad_entrega": "retiro_taller",
                "costo_entrega": "0.00",
                "lineas": [{"renglon": rid_b}],
            },
        )

        # Cambiar Producto.precio a C$150.00 antes de que el comprador A acepte (§46).
        codigo, editado, _ = self.peticion(
            f"/api/v1/productos/mios/{pid}/",
            metodo="PATCH",
            token=token_a,
            datos={"precio": "150.00"},
        )
        self.assertEqual((codigo, editado["precio"]), (200, "150.00"))

        # 10. Comprador A acepta la propuesta.
        clave_dec_a = str(uuid4())
        codigo, dec_a, cabeceras = self.peticion(
            f"/api/v1/solicitudes/mias/{sid_a}/propuesta/decision/",
            token=token_ca,
            clave=clave_dec_a,
            datos={"decision": "aceptar"},
        )
        self.assertEqual(codigo, 200, dec_a)
        self.assertIsNone(cabeceras.get("Idempotency-Replayed"))
        self.assertEqual(dec_a["decision"], "aceptada")
        pedido = dec_a["pedido"]
        self.assertEqual(
            (
                pedido["lineas"][0]["precio_unitario"],
                pedido["lineas"][0]["cantidad"],
                pedido["lineas"][0]["subtotal"],
                pedido["total"],
            ),
            ("100.00", 2, "200.00", "200.00"),
        )

        # 13. Comprobar replay de Idempotency-Key.
        codigo, replay_a, cab_replay = self.peticion(
            f"/api/v1/solicitudes/mias/{sid_a}/propuesta/decision/",
            token=token_ca,
            clave=clave_dec_a,
            datos={"decision": "aceptar"},
        )
        self.assertEqual((codigo, replay_a["id"]), (200, dec_a["id"]))
        self.assertEqual(cab_replay.get("Idempotency-Replayed"), "true")

        # 11. Modificar precio otra vez a C$250.00 y consultar Pedido (comprador y artesano).
        self.peticion(
            f"/api/v1/productos/mios/{pid}/",
            metodo="PATCH",
            token=token_a,
            datos={"precio": "250.00"},
        )
        codigo, ped_c, _ = self.peticion(f"/api/v1/pedidos/mios/{pedido['id']}/", token=token_ca)
        self.assertEqual(codigo, 200, ped_c)
        self.assertEqual(
            (ped_c["lineas"][0]["precio_unitario"], ped_c["lineas"][0]["subtotal"]),
            ("100.00", "200.00"),
        )
        codigo, ped_a, _ = self.peticion(
            f"/api/v1/pedidos/recibidos/{pedido['id']}/", token=token_a
        )
        self.assertEqual((codigo, ped_a["total"]), (200, "200.00"))

        # Comprador B rechaza su propuesta: sin pedido ni reserva adicional.
        codigo, dec_b, _ = self.peticion(
            f"/api/v1/solicitudes/mias/{sid_b}/propuesta/decision/",
            token=token_cb,
            clave=str(uuid4()),
            datos={"decision": "rechazar"},
        )
        self.assertEqual((codigo, dec_b["decision"], dec_b["pedido"]), (200, "rechazada", None))

        # 12. Consultar inventario y movimientos por HTTP.
        codigo, inv_despues, _ = self.peticion(
            f"/api/v1/inventario/productos/{pid}/", token=token_a
        )
        self.assertEqual(codigo, 200)
        self.assertEqual(
            (
                inv_despues["existencia_fisica"],
                inv_despues["reservada"],
                inv_despues["disponible"],
            ),
            (5, 2, 3),
        )
        codigo, movs, _ = self.peticion(
            f"/api/v1/inventario/productos/{pid}/movimientos/", token=token_a
        )
        self.assertEqual((codigo, movs["count"]), (200, 2))
        self.assertEqual(
            [(m["tipo"], m["cantidad"]) for m in movs["results"]],
            [("reserva", 2), ("existencia_inicial", 5)],
        )
        print(
            "SMOKE AUD-07 HTTP/JWT/PostgreSQL: inventario inicial, solicitud, propuesta, "
            "cambio de precio en catálogo, aceptación con snapshot C$100/C$200, reserva=2 "
            "(física=5, disponible=3), replay idempotente, rechazo sin pedido y movimientos OK."
        )
