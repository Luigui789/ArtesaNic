"""API de la conversación del pedido: ownership, estados, cursor y contrato (AUD-16)."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.mensajes.models import MensajePedido
from apps.pagos.tests.base import confirmar_pedido
from apps.pedidos.models import EstadoPedido
from apps.talleres.models import EstadoTaller, Taller
from apps.talleres.tests.base import crear_administrador

from .base import TERMINALES, MensajesAPITestCase, llevar_estado, url_mensajes

MENSAJE_CERRADA = "Este pedido ya finalizó. La conversación está disponible solo para consulta."


class LecturaYEnvioTests(MensajesAPITestCase):
    def test_conversacion_vacia(self):
        for parte in (self.comprador, self.artesano):
            respuesta = self.leer(como=parte)
            self.assertEqual(respuesta.status_code, 200)
            self.assertEqual(respuesta.json(), {"mensajes": [], "cursor": 0, "solo_lectura": False})

    def test_comprador_envia_y_artesano_lee(self):
        respuesta = self.enviar("  Hola, ¿cuándo entregan?  ", como=self.comprador)
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        cuerpo = respuesta.json()
        self.assertEqual(set(cuerpo), {"id", "autor", "texto", "creado_en"})
        autor = {"id": self.comprador.pk, "nombre": self.comprador.nombre}
        self.assertEqual(cuerpo["autor"], autor)
        self.assertEqual(cuerpo["texto"], "Hola, ¿cuándo entregan?")
        lectura = self.leer(como=self.artesano).json()
        self.assertEqual([m["id"] for m in lectura["mensajes"]], [cuerpo["id"]])
        self.assertEqual(lectura["cursor"], cuerpo["id"])

    def test_artesano_envia_y_comprador_lee(self):
        mensaje = self.enviar("Podemos el sábado.", como=self.artesano).json()
        self.assertEqual(mensaje["autor"]["id"], self.artesano.pk)
        lectura = self.leer(como=self.comprador).json()
        self.assertEqual(lectura["mensajes"][0]["texto"], "Podemos el sábado.")

    def test_saltos_de_linea_se_conservan(self):
        texto = "Línea 1\nLínea 2\n\nLínea 4"
        self.assertEqual(self.enviar(texto, como=self.comprador).json()["texto"], texto)

    def test_autor_sale_del_token(self):
        self.enviar("Hola", como=self.artesano)
        self.assertEqual(MensajePedido.objects.get().autor, self.artesano)

    def test_nombre_vigente_del_autor(self):
        self.enviar("Hola", como=self.comprador)
        self.comprador.nombre = "Ana Renombrada"
        self.comprador.save(update_fields=["nombre"])
        autor = self.leer(como=self.artesano).json()["mensajes"][0]["autor"]
        self.assertEqual(autor, {"id": self.comprador.pk, "nombre": "Ana Renombrada"})

    def test_campos_no_permitidos(self):
        self.autenticar(self.comprador)
        for extra in ({"autor": 999}, {"rol": "administrador"}, {"autor_nombre": "X"}):
            with self.subTest(extra=extra):
                respuesta = self.client.post(self.url, {"texto": "Hola", **extra}, format="json")
                self.assertEqual(respuesta.status_code, 400)
                campo = next(iter(extra))
                self.assertEqual(respuesta.json(), {campo: ["Campo no permitido."]})
        self.assertFalse(MensajePedido.objects.exists())

    def test_texto_invalido(self):
        self.autenticar(self.comprador)
        invalidos = ({"texto": ""}, {"texto": "   \n "}, {"texto": "x" * 501}, {}, {"texto": None})
        for cuerpo in invalidos:
            with self.subTest(cuerpo=str(cuerpo)[:30]):
                respuesta = self.client.post(self.url, cuerpo, format="json")
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("texto", respuesta.json())
        self.assertFalse(MensajePedido.objects.exists())
        self.assertEqual(self.enviar("x" * 500).status_code, 201)

    def test_estados_activos_permiten_escribir(self):
        for estado in (EstadoPedido.CONFIRMADO, EstadoPedido.EN_CUMPLIMIENTO):
            with self.subTest(estado=estado):
                llevar_estado(self.pedido, estado)
                self.assertEqual(self.enviar(estado, como=self.comprador).status_code, 201)
                self.assertEqual(self.enviar(estado, como=self.artesano).status_code, 201)
                self.assertFalse(self.leer().json()["solo_lectura"])

    def test_estados_terminales_son_de_solo_lectura(self):
        previo = self.enviar("Antes del cierre", como=self.comprador).json()
        for estado in TERMINALES:
            with self.subTest(estado=estado):
                llevar_estado(self.pedido, estado)
                for parte in (self.comprador, self.artesano):
                    respuesta = self.enviar("Después", como=parte)
                    self.assertEqual(respuesta.status_code, 409)
                    self.assertEqual(
                        respuesta.json(),
                        {"detail": MENSAJE_CERRADA, "codigo": "conversacion_cerrada"},
                    )
                    lectura = self.leer(como=parte)
                    self.assertEqual(lectura.status_code, 200)
                    self.assertTrue(lectura.json()["solo_lectura"])
                    self.assertEqual([m["id"] for m in lectura.json()["mensajes"]], [previo["id"]])
        self.assertEqual(MensajePedido.objects.count(), 1)

    def test_sin_rutas_de_edicion_ni_por_mensaje(self):
        mensaje = self.enviar("Hola", como=self.comprador).json()
        for metodo in ("put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                self.assertEqual(getattr(self.client, metodo)(self.url).status_code, 405)
        self.assertEqual(self.client.get(f"{self.url}{mensaje['id']}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/mensajes/{mensaje['id']}/").status_code, 404)

    def test_respuestas_privadas_sin_cache(self):
        for respuesta in (self.leer(como=self.comprador), self.enviar("Hola")):
            self.assertIn("no-store", respuesta["Cache-Control"])
            self.assertIn("private", respuesta["Cache-Control"])


class CursorTests(MensajesAPITestCase):
    def poblar(self, n=3):
        partes = (self.comprador, self.artesano)
        return [self.enviar(f"m{i}", como=partes[i % 2]).json()["id"] for i in range(n)]

    def test_historial_completo_en_orden_de_id(self):
        ids = self.poblar(4)
        lectura = self.leer(como=self.comprador).json()
        self.assertEqual([m["id"] for m in lectura["mensajes"]], ids)
        self.assertEqual(ids, sorted(ids))
        self.assertEqual(lectura["cursor"], ids[-1])

    def test_delta_solo_ids_posteriores(self):
        ids = self.poblar(4)
        lectura = self.leer(ids[1], como=self.comprador).json()
        self.assertEqual([m["id"] for m in lectura["mensajes"]], ids[2:])
        self.assertEqual(lectura["cursor"], ids[-1])

    def test_sin_novedades_el_cursor_no_retrocede(self):
        ids = self.poblar(2)
        self.assertEqual(
            self.leer(ids[-1], como=self.artesano).json(),
            {"mensajes": [], "cursor": ids[-1], "solo_lectura": False},
        )
        adelantado = ids[-1] + 1000
        self.assertEqual(self.leer(adelantado).json()["cursor"], adelantado)

    def test_delta_no_mezcla_otros_pedidos(self):
        otro = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        (mio,) = self.poblar(1)
        ajeno = self.enviar("otro pedido", url=url_mensajes(otro.pk)).json()["id"]
        siguiente = self.enviar("siguiente").json()["id"]
        self.assertEqual([m["id"] for m in self.leer(mio).json()["mensajes"]], [siguiente])
        self.assertNotIn(ajeno, [m["id"] for m in self.leer().json()["mensajes"]])

    def test_cursor_invalido(self):
        self.autenticar(self.comprador)
        for valor in ("-1", "abc", "1.5", str(2**63)):
            with self.subTest(valor=valor):
                respuesta = self.client.get(self.url, {"despues_de": valor})
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("despues_de", respuesta.json())

    def test_historial_sobrevive_al_cierre(self):
        ids = self.poblar(3)
        llevar_estado(self.pedido, EstadoPedido.ENTREGADO)
        lectura = self.leer(como=self.artesano).json()
        self.assertEqual([m["id"] for m in lectura["mensajes"]], ids)
        self.assertTrue(lectura["solo_lectura"])

    def test_lectura_sin_n_mas_uno(self):
        self.poblar(1)

        def consultas():
            with CaptureQueriesContext(connection) as capturadas:
                self.assertEqual(self.leer(como=self.comprador).status_code, 200)
            return len(capturadas)

        uno = consultas()
        self.poblar(5)
        self.assertEqual(consultas(), uno)


class AccesoTests(MensajesAPITestCase):
    def test_anonimo_401(self):
        self.anonimo()
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.post(self.url, {"texto": "x"}, format="json").status_code, 401)

    def test_otro_comprador_y_otro_artesano_404(self):
        self.enviar("Privado", como=self.comprador)
        for ajeno in (self.otro_comprador, self.artesano_ajeno):
            with self.subTest(ajeno=ajeno.nombre):
                self.assertEqual(self.leer(como=ajeno).status_code, 404)
                self.assertEqual(self.enviar("Intruso", como=ajeno).status_code, 404)
        self.assertEqual(MensajePedido.objects.count(), 1)

    def test_pedido_inexistente_igual_que_ajeno(self):
        inexistente = self.leer(como=self.comprador, url=url_mensajes(self.pedido.pk + 10_000))
        ajeno = self.leer(como=self.otro_comprador)
        self.assertEqual(inexistente.status_code, 404)
        self.assertEqual(inexistente.json(), ajeno.json())

    def test_artesano_sin_taller_aprobado_403(self):
        for taller in (self.taller_pendiente, self.taller_rechazado):
            with self.subTest(taller=taller.nombre):
                self.assertEqual(self.leer(como=taller.propietario).status_code, 403)
                self.assertEqual(self.enviar("x", como=taller.propietario).status_code, 403)

    def test_taller_no_habilitado_pierde_acceso(self):
        self.enviar("Hola", como=self.comprador)
        Taller.objects.filter(pk=self.taller.pk).update(estado=EstadoTaller.RECHAZADO)
        self.assertEqual(self.leer(como=self.artesano).status_code, 403)

    def test_administrador_sin_acceso(self):
        admin = crear_administrador("88889999")
        # Su token no autentica la API (ADR-007): 401.
        self.autenticar(admin)
        self.assertEqual(self.client.get(self.url).status_code, 401)
        # Aunque llegara autenticado, no es parte del pedido: 403 sin datos.
        self.client.credentials()
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, {"texto": "x"}, format="json").status_code, 403)
        self.assertFalse(MensajePedido.objects.exists())

    def test_solicitud_pendiente_no_tiene_conversacion(self):
        solicitud = self.crear()
        self.assertFalse(hasattr(solicitud, "pedido"))
        respuesta = self.client.get(f"/api/v1/solicitudes/mias/{solicitud.pk}/mensajes/")
        self.assertEqual(respuesta.status_code, 404)
