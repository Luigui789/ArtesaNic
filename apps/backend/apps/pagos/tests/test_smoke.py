"""Smoke HTTP real de AUD-10: WSGI en puerto temporal, login JWT, multipart y PostgreSQL.

Ejecutar: uv run python manage.py test apps.pagos.tests.test_smoke
1. Pago correcto: registro con transferencia + comprobante; el artesano lo abre y confirma.
2. Observado: motivo y plazo de 48 h; corrección que conserva el intento anterior; confirmado.
3. No recibido: motivo y plazo de 48 h; nuevo intento completo; historial; confirmado.
4. Privacidad: otro comprador, otro artesano y la administración no obtienen el archivo.
"""

import json
from datetime import datetime, timedelta
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

from django.core.cache import cache
from django.test import LiveServerTestCase, override_settings

from apps.accounts.tests.base import PASSWORD, crear_usuario
from apps.catalogo.tests.base import crear_categoria, crear_producto
from apps.solicitudes.tests.base import inicializar_stock
from apps.talleres import services as talleres
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from .base import bytes_imagen, bytes_pdf, confirmar_pedido


def multipart(campos: dict, archivo: tuple[str, bytes, str]) -> tuple[bytes, str]:
    limite = uuid4().hex
    partes = [
        f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        for k, v in campos.items()
    ]
    nombre, contenido, tipo = archivo
    partes.append(
        f'--{limite}\r\nContent-Disposition: form-data; name="comprobante"; '
        f'filename="{nombre}"\r\nContent-Type: {tipo}\r\n\r\n'.encode()
        + contenido
        + b"\r\n"
    )
    partes.append(f"--{limite}--\r\n".encode())
    return b"".join(partes), f"multipart/form-data; boundary={limite}"


@override_settings(
    CSRF_COOKIE_SECURE=False,
    REFRESH_COOKIE_SECURE=False,
    ALLOWED_HOSTS=["localhost", "testserver"],
)
class SmokePagosTests(LiveServerTestCase):
    def setUp(self):
        cache.clear()
        self.admin = crear_administrador()
        taller = crear_artesano_con_taller("82222222")
        talleres.aprobar_taller(taller, revisor=self.admin)
        ajeno = crear_artesano_con_taller("83333333")
        talleres.aprobar_taller(ajeno, revisor=self.admin)
        self.artesano, self.artesano_ajeno = taller.propietario, ajeno.propietario
        self.comprador = crear_usuario("86666661")
        self.otro_comprador = crear_usuario("86666662")
        producto = crear_producto(taller, crear_categoria(), publicado=True)
        inicializar_stock(self.artesano, producto)
        self.pedidos = [
            confirmar_pedido(comprador=self.comprador, artesano=self.artesano, producto=producto)
            for _ in range(3)
        ]

    def peticion(self, ruta, *, token=None, datos=None, archivo=None, clave=None, binario=False):
        cabeceras = {"Accept": "application/json"}
        if token:
            cabeceras["Authorization"] = f"Bearer {token}"
        if clave:
            cabeceras["Idempotency-Key"] = clave
        cuerpo = None
        if archivo is not None:
            cuerpo, cabeceras["Content-Type"] = multipart(datos, archivo)
        elif datos is not None:
            cuerpo, cabeceras["Content-Type"] = json.dumps(datos).encode(), "application/json"
        request = Request(
            self.live_server_url + ruta,
            data=cuerpo,
            headers=cabeceras,
            method="POST" if cuerpo is not None else "GET",
        )
        try:
            with build_opener().open(request, timeout=20) as respuesta:
                contenido = respuesta.read()
                return respuesta.status, contenido if binario else json.loads(contenido)
        except HTTPError as exc:
            return exc.code, json.loads(exc.read() or b"{}")

    def login(self, usuario):
        cliente = build_opener(HTTPCookieProcessor(CookieJar()))

        def abrir(ruta, datos=None, csrf=None):
            cabeceras = {"Accept": "application/json", "Content-Type": "application/json"}
            if csrf:
                cabeceras["X-CSRFToken"] = csrf
            cuerpo = json.dumps(datos).encode() if datos is not None else None
            request = Request(self.live_server_url + ruta, data=cuerpo, headers=cabeceras)
            try:
                with cliente.open(request, timeout=20) as respuesta:
                    return respuesta.status, json.load(respuesta)
            except HTTPError as exc:
                return exc.code, json.load(exc)

        _, csrf = abrir("/api/v1/auth/csrf/")
        codigo, cuerpo = abrir(
            "/api/v1/auth/login/",
            {"telefono": usuario.telefono, "password": PASSWORD},
            csrf["csrf_token"],
        )
        return cuerpo.get("access") if codigo == 200 else None

    def registrar(self, token, pedido, referencia, archivo, *, corrige=None):
        ruta = f"/api/v1/pedidos/mios/{pedido.pk}/pago/intentos/"
        if corrige:
            ruta += f"{corrige}/corregir/"
        return self.peticion(
            ruta,
            token=token,
            clave=str(uuid4()),
            datos={"metodo": "transferencia", "referencia": referencia},
            archivo=archivo,
        )

    def resolver(self, token, pedido, intento, estado, motivo=None):
        datos = {"estado": estado} | ({"motivo": motivo} if motivo else {})
        return self.peticion(
            f"/api/v1/pedidos/recibidos/{pedido.pk}/pago/intentos/{intento}/resolver/",
            token=token,
            clave=str(uuid4()),
            datos=datos,
        )

    def test_flujos_reales_de_pago_y_privacidad(self):
        comprador = self.login(self.comprador)
        artesano = self.login(self.artesano)
        pdf, png = bytes_pdf(relleno=20), bytes_imagen("PNG")

        # 1. Pago correcto.
        p1 = self.pedidos[0]
        codigo, pago = self.peticion(f"/api/v1/pedidos/mios/{p1.pk}/pago/", token=comprador)
        self.assertEqual((codigo, pago["estado"]), (200, "pendiente"))
        codigo, pago = self.registrar(
            comprador, p1, "TRX-987654", ("transferencia.pdf", pdf, "application/pdf")
        )
        self.assertEqual((codigo, pago["estado"]), (201, "registrado"), pago)
        i1 = pago["intentos"][0]["id"]
        codigo, visto = self.peticion(f"/api/v1/pedidos/recibidos/{p1.pk}/pago/", token=artesano)
        self.assertEqual(
            (codigo, visto["total"], visto["estado"]), (200, str(p1.total), "registrado")
        )
        url_archivo = "/api/v1" + visto["intentos"][0]["comprobante"]["url"]
        self.assertEqual(self.peticion(url_archivo, token=artesano, binario=True), (200, pdf))
        codigo, pago = self.resolver(artesano, p1, i1, "confirmado")
        self.assertEqual((codigo, pago["estado"]), (200, "confirmado"))
        codigo, pago = self.peticion(f"/api/v1/pedidos/mios/{p1.pk}/pago/", token=comprador)
        self.assertEqual(pago["estado"], "confirmado")

        # 2. Observado → corrección → confirmado.
        p2 = self.pedidos[1]
        _, pago = self.registrar(comprador, p2, "ABC123", ("captura.png", png, "image/png"))
        i1 = pago["intentos"][0]["id"]
        codigo, pago = self.resolver(artesano, p2, i1, "observado", "Referencia ilegible.")
        self.assertEqual((codigo, pago["estado"]), (200, "observado"))
        resolucion = pago["intentos"][0]["resolucion"]
        revisado = datetime.fromisoformat(resolucion["revisado_en"])
        plazo = datetime.fromisoformat(resolucion["plazo_hasta"])
        self.assertEqual(plazo - revisado, timedelta(hours=48))
        _, lectura = self.peticion(f"/api/v1/pedidos/mios/{p2.pk}/pago/", token=comprador)
        self.assertEqual(lectura["intentos"][0]["resolucion"]["motivo"], "Referencia ilegible.")
        self.assertEqual(lectura["registrable_hasta"], resolucion["plazo_hasta"])
        codigo, pago = self.registrar(
            comprador, p2, "ABC123", ("nuevo.pdf", pdf, "application/pdf"), corrige=i1
        )
        self.assertEqual(codigo, 201, pago)
        self.assertEqual([i["origen"] for i in pago["intentos"]], ["inicial", "correccion"])
        url_anterior = f"/api/v1/pedidos/mios/{p2.pk}/pago/intentos/{i1}/comprobante/"
        self.assertEqual(self.peticion(url_anterior, token=comprador, binario=True), (200, png))
        _, pago = self.resolver(artesano, p2, pago["intentos"][1]["id"], "confirmado")
        self.assertEqual(pago["estado"], "confirmado")

        # 3. No recibido → nuevo intento completo → confirmado.
        p3 = self.pedidos[2]
        _, pago = self.registrar(comprador, p3, "XYZ999", ("t.pdf", pdf, "application/pdf"))
        i1 = pago["intentos"][0]["id"]
        _, pago = self.resolver(artesano, p3, i1, "no_recibido", "Fondos no acreditados.")
        self.assertEqual(pago["estado"], "no_recibido")
        self.assertIsNotNone(pago["registrable_hasta"])
        codigo, pago = self.registrar(comprador, p3, "XYZ1000", ("t2.png", png, "image/png"))
        self.assertEqual(codigo, 201, pago)
        self.assertEqual(
            [(i["origen"], i["referencia"]) for i in pago["intentos"]],
            [("inicial", "XYZ999"), ("nuevo_tras_no_recibido", "XYZ1000")],
        )
        _, pago = self.resolver(artesano, p3, pago["intentos"][1]["id"], "confirmado")
        self.assertEqual(pago["estado"], "confirmado")

        # 4. Privacidad del comprobante.
        mio = f"/api/v1/pedidos/mios/{p3.pk}/pago/intentos/{i1}/comprobante/"
        recibido = f"/api/v1/pedidos/recibidos/{p3.pk}/pago/intentos/{i1}/comprobante/"
        otro = self.login(self.otro_comprador)
        ajeno = self.login(self.artesano_ajeno)
        self.assertIsNone(self.login(self.admin), "La administración no inicia sesión en la API")
        self.assertEqual(self.peticion(mio, token=otro)[0], 404)
        self.assertEqual(self.peticion(recibido, token=ajeno)[0], 404)
        self.assertEqual(self.peticion(mio)[0], 401)
        print(
            "SMOKE AUD-10 HTTP/JWT/multipart/PostgreSQL: pago confirmado, observado con "
            "corrección, no recibido con nuevo intento, historial y comprobantes privados OK."
        )
