"""AUD-08 sobre POST /solicitudes/: replay, conflicto, claves distintas y fronteras (RF-009.7)."""

from unittest import mock
from uuid import uuid4

from apps.accounts.api.tokens import emitir_tokens
from apps.catalogo import services as catalogo
from apps.operaciones.models import EstadoOperacion, OperacionIdempotente, TipoOperacion
from apps.solicitudes.models import RenglonSolicitud, Solicitud

from .base import URL_CREAR, SolicitudesAPITestCase, datos_renglon

URL_OPERACION = "/api/v1/operaciones/crear_solicitud/{}/"


class IdempotenciaCreacionTests(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.clave = str(uuid4())
        self.stock = datos_renglon(self.producto, cantidad=2)
        self.segundo = datos_renglon(self.otro_producto, modalidad="stock", cantidad=3)

    def conteos(self):
        return Solicitud.objects.count(), RenglonSolicitud.objects.count()

    def test_clave_valida_crea_una_solicitud(self):
        respuesta = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(self.conteos(), (1, 1))
        self.assertNotIn("Idempotency-Replayed", respuesta)
        operacion = OperacionIdempotente.objects.get()
        self.assertEqual(
            (operacion.actor, operacion.tipo, operacion.clave, operacion.estado),
            (self.comprador, TipoOperacion.CREAR_SOLICITUD, self.clave, "completada"),
        )
        self.assertEqual(
            (operacion.recurso_tipo, operacion.recurso_id, operacion.codigo_http),
            ("solicitudes.solicitud", respuesta.data["id"], 201),
        )

    def test_replay_devuelve_la_misma_solicitud_sin_duplicar(self):
        primera = self.enviar(self.stock, self.segundo, clave=self.clave)
        conteos = self.conteos()
        segunda = self.enviar(self.stock, self.segundo, clave=self.clave)
        self.assertEqual(segunda.status_code, 201)
        self.assertEqual(segunda["Idempotency-Replayed"], "true")
        self.assertEqual(segunda.data["id"], primera.data["id"])
        self.assertEqual(self.conteos(), conteos)
        self.assertEqual(conteos, (1, 2))
        self.assertEqual(OperacionIdempotente.objects.count(), 1)

    def test_replay_estable_tras_varias_repeticiones(self):
        primera = self.enviar(self.stock, clave=self.clave)
        for _ in range(3):
            repetida = self.enviar(self.stock, clave=self.clave)
            self.assertEqual(repetida.status_code, 201)
            self.assertEqual(repetida.data, primera.data)
        self.assertEqual(self.conteos(), (1, 1))

    def test_replay_tras_respuesta_perdida_no_duplica(self):
        # El servidor confirmó, pero la respuesta no llegó: el cliente reintenta igual.
        with mock.patch(
            "apps.solicitudes.api.views.SolicitudCompradorSerializer.data",
            new_callable=mock.PropertyMock,
            side_effect=ConnectionResetError("respuesta perdida"),
        ):
            with self.assertRaises(ConnectionResetError):
                self.enviar(self.stock, clave=self.clave)
        self.assertEqual(self.conteos(), (1, 1))
        reintento = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(reintento.status_code, 201)
        self.assertEqual(reintento["Idempotency-Replayed"], "true")
        self.assertEqual(reintento.data["id"], Solicitud.objects.get().pk)
        self.assertEqual(self.conteos(), (1, 1))

    def test_replay_no_revalida_cambios_posteriores_del_catalogo(self):
        primera = self.enviar(self.stock, clave=self.clave)
        catalogo.despublicar_producto(self.producto)
        repetida = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(repetida.status_code, 201)
        self.assertEqual(repetida.data["id"], primera.data["id"])

    def test_misma_clave_con_otro_cuerpo_es_conflicto(self):
        self.enviar(self.stock, clave=self.clave)
        conteos = self.conteos()
        respuesta = self.enviar(datos_renglon(self.producto, cantidad=5), clave=self.clave)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")
        self.assertIn("detail", respuesta.data)
        self.assertNotIn("id", respuesta.data)
        self.assertEqual(self.conteos(), conteos)
        self.assertEqual(OperacionIdempotente.objects.count(), 1)

    def test_conflicto_tambien_si_solo_cambia_el_orden_de_renglones(self):
        self.enviar(self.stock, self.segundo, clave=self.clave)
        respuesta = self.enviar(self.segundo, self.stock, clave=self.clave)
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(self.conteos(), (1, 2))

    def test_orden_de_claves_json_no_altera_la_identidad(self):
        self.enviar(self.stock, clave=self.clave)
        invertido = dict(reversed(list(self.stock.items())))
        respuesta = self.enviar(invertido, clave=self.clave)
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta["Idempotency-Replayed"], "true")

    def test_mismo_cuerpo_con_otra_clave_crea_otra_solicitud(self):
        primera = self.enviar(self.stock, clave=self.clave)
        segunda = self.enviar(self.stock, clave=str(uuid4()))
        self.assertEqual(segunda.status_code, 201)
        self.assertNotIn("Idempotency-Replayed", segunda)
        self.assertNotEqual(primera.data["id"], segunda.data["id"])
        self.assertEqual(self.conteos(), (2, 2))

    def test_compradores_distintos_pueden_usar_la_misma_clave(self):
        propia = self.enviar(self.stock, clave=self.clave)
        self.autenticar(self.otro_comprador)
        ajena = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(ajena.status_code, 201)
        self.assertNotIn("Idempotency-Replayed", ajena)
        self.assertNotEqual(propia.data["id"], ajena.data["id"])
        self.assertEqual(Solicitud.objects.get(pk=ajena.data["id"]).comprador, self.otro_comprador)
        # El primer comprador sigue recuperando su propia solicitud con esa clave.
        self.autenticar(self.comprador)
        self.assertEqual(self.enviar(self.stock, clave=self.clave).data["id"], propia.data["id"])

    def test_falta_de_clave_es_400_y_no_crea(self):
        respuesta = self.client.post(URL_CREAR, {"renglones": [self.stock]}, format="json")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("Idempotency-Key", respuesta.data)
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_formatos_de_clave_rechazados(self):
        for clave in (
            "",
            " ",
            "corta",
            "a" * 15,
            "a" * 129,
            "clave-con-espacio interior",
            "clave-con/barra-0001",
            "clave\tcon-tabulador-01",
            "clave-con-ñ-no-ascii-001",
            "clave,separada,por,comas",
        ):
            with self.subTest(clave=clave):
                respuesta = self.client.post(
                    URL_CREAR,
                    {"renglones": [self.stock]},
                    format="json",
                    HTTP_IDEMPOTENCY_KEY=clave,
                )
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("Idempotency-Key", respuesta.data)
        self.assertEqual(self.conteos(), (0, 0))

    def test_caracteres_de_control_rechazados(self):
        for control in ("\x00", "\x1b", "\x7f", "\r"):
            with self.subTest(control=repr(control)):
                respuesta = self.client.post(
                    URL_CREAR,
                    {"renglones": [self.stock]},
                    format="json",
                    HTTP_IDEMPOTENCY_KEY=f"clave-valida-{control}-0001",
                )
                self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(self.conteos(), (0, 0))

    def test_formatos_de_clave_admitidos(self):
        for clave in (
            str(uuid4()),
            str(uuid4()).upper(),
            "01JAZ6W0J8Q2V3K4M5N6P7R8S9",
            "a" * 128,
            "a.b_c:d~e-f.0123",
        ):
            with self.subTest(clave=clave):
                self.assertEqual(self.enviar(self.stock, clave=clave).status_code, 201)

    def test_sin_autenticacion_es_401_antes_que_la_clave(self):
        self.anonimo()
        self.assertEqual(self.client.post(URL_CREAR, {}, format="json").status_code, 401)
        self.assertEqual(self.enviar(self.stock, clave=self.clave).status_code, 401)
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_rol_no_comprador_conserva_su_codigo(self):
        # Artesano: 403 por rol. Administrador: 401, la API comercial no le corresponde
        # (Usuario.puede_usar_api). La clave no cambia ninguno de los dos.
        for usuario, codigo in ((self.artesano, 403), (self.admin, 401)):
            with self.subTest(rol=usuario.rol):
                self.autenticar(usuario)
                self.assertEqual(self.enviar(self.stock, clave=self.clave).status_code, codigo)
                self.assertEqual(self.client.post(URL_CREAR, {}, format="json").status_code, codigo)
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_clave_de_otro_comprador_no_salta_permisos(self):
        self.enviar(self.stock, clave=self.clave)
        self.autenticar(self.artesano)
        respuesta = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(respuesta.status_code, 403)
        self.assertNotIn("id", respuesta.data)

    def test_cuerpo_invalido_no_crea_ni_registra_operacion(self):
        respuesta = self.enviar(datos_renglon(self.producto, cantidad=0), clave=self.clave)
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_misma_clave_tras_rechazo_de_negocio_puede_reutilizarse(self):
        # Contrato: solo se registran éxitos; un rechazo no tiene efecto que proteger.
        mezcla = self.enviar(self.stock, datos_renglon(self.producto_ajeno), clave=self.clave)
        self.assertEqual(mezcla.status_code, 400)
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())
        repetida = self.enviar(self.stock, datos_renglon(self.producto_ajeno), clave=self.clave)
        self.assertEqual(repetida.status_code, 400)
        corregida = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(corregida.status_code, 201)
        self.assertNotIn("Idempotency-Replayed", corregida)
        self.assertEqual(self.conteos(), (1, 1))

    def test_mezcla_de_talleres_conserva_rollback(self):
        respuesta = self.enviar(self.stock, datos_renglon(self.producto_ajeno), clave=self.clave)
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(
            respuesta.data["renglones"][1]["producto"],
            ["Todos los renglones deben pertenecer al mismo taller."],
        )
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_producto_despublicado_conserva_reglas_aud05(self):
        catalogo.despublicar_producto(self.producto)
        respuesta = self.enviar(self.stock, clave=self.clave)
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())

    def test_fallo_de_insercion_no_deja_operacion_completada(self):
        with mock.patch.object(
            RenglonSolicitud.objects, "bulk_create", side_effect=RuntimeError("fallo")
        ):
            with self.assertRaises(RuntimeError):
                self.enviar(self.stock, clave=self.clave)
        self.assertEqual(self.conteos(), (0, 0))
        self.assertFalse(OperacionIdempotente.objects.exists())
        self.assertEqual(self.enviar(self.stock, clave=self.clave).status_code, 201)

    def test_no_guarda_token_ni_cuerpo_en_la_operacion(self):
        token = emitir_tokens(self.comprador)[0]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.enviar(
            datos_renglon(
                self.producto,
                modalidad="personalizacion",
                caracteristicas="Texto privado del comprador",
                origen_personalizacion="desde_cero",
            ),
            clave=self.clave,
        )
        operacion = OperacionIdempotente.objects.values().get()
        guardado = " ".join(str(v) for v in operacion.values())
        for sensible in (token, "Bearer", "Texto privado", "renglones"):
            self.assertNotIn(sensible, guardado)
        self.assertRegex(operacion["huella"], r"^[0-9a-f]{64}$")

    def test_recuperacion_tras_creacion_apunta_a_la_solicitud(self):
        creada = self.enviar(self.stock, clave=self.clave)
        respuesta = self.client.get(URL_OPERACION.format(self.clave))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["estado"], EstadoOperacion.COMPLETADA)
        self.assertEqual(respuesta.data["recurso"], {"tipo": "solicitud", "id": creada.data["id"]})
        detalle = self.client.get(f"{URL_CREAR}mias/{respuesta.data['recurso']['id']}/")
        self.assertEqual(detalle.status_code, 200)
        self.assertEqual(detalle.data["id"], creada.data["id"])

    def test_metodos_no_implementados_en_creacion(self):
        for metodo in ("put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                respuesta = getattr(self.client, metodo)(
                    URL_CREAR, {}, format="json", HTTP_IDEMPOTENCY_KEY=self.clave
                )
                self.assertEqual(respuesta.status_code, 405)
