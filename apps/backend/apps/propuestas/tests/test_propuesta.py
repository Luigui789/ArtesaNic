"""AUD-06: emisión de la propuesta final, cotización servidor, permisos e idempotencia."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.apps import apps
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.models import Rol
from apps.accounts.tests.base import crear_usuario
from apps.catalogo import services as catalogo
from apps.catalogo.tests.base import crear_producto
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.propuestas import services
from apps.propuestas.api.serializers import PropuestaSerializer
from apps.propuestas.models import CargoPropuesta, LineaPropuesta, Propuesta
from apps.propuestas.selectors import propuestas_con_detalle
from apps.solicitudes.models import EstadoSolicitud, RenglonSolicitud
from apps.solicitudes.tests.base import datos_renglon

from .base import PropuestaAPITestCase, url_propuesta_mia, url_propuesta_recibida


class EmisionTests(PropuestaAPITestCase):
    def setUp(self):
        super().setUp()
        self.revisar()

    def test_emite_propuesta_con_desglose_calculado_por_el_servidor(self):
        respuesta = self.emitir()
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        datos = respuesta.data
        self.assertEqual(datos["moneda"], "NIO")
        self.assertEqual(datos["solicitud"], self.solicitud.pk)
        self.assertEqual(
            [
                (linea["renglon"], linea["precio_unitario"], linea["cantidad"], linea["subtotal"])
                for linea in datos["lineas"]
            ],
            [
                (self.r1.pk, "100.50", 3, "301.50"),
                (self.r2.pk, "25.00", 7, "175.00"),
                (self.r3.pk, "300.00", 1, "300.00"),
            ],
        )
        self.assertEqual(
            [linea["cargo_personalizacion"] for linea in datos["lineas"]], ["0.00", "0.00", "45.50"]
        )
        self.assertEqual(datos["lineas"][1]["fecha_comprometida"], self.comprometida.isoformat())
        self.assertEqual(datos["lineas"][1]["fecha_solicitada"], self.fecha.isoformat())
        self.assertIsNone(datos["lineas"][0]["fecha_comprometida"])
        self.assertEqual(
            datos["otros_cargos"],
            [
                {
                    "posicion": 1,
                    "descripcion": "Empaque de regalo",
                    "monto": "20.00",
                    "renglon": None,
                },
                {
                    "posicion": 2,
                    "descripcion": "Barniz especial",
                    "monto": "15.25",
                    "renglon": self.r3.pk,
                },
            ],
        )
        self.assertEqual(
            (
                datos["modalidad_entrega"],
                datos["descripcion_entrega"],
                datos["costo_entrega"],
                datos["subtotal_productos"],
                datos["total_personalizacion"],
                datos["total_otros_cargos"],
                datos["total"],
            ),
            (
                "entrega_artesano",
                "Entrega en Masaya centro",
                "120.00",
                "776.50",
                "45.50",
                "35.25",
                "977.25",
            ),
        )
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, EstadoSolicitud.PROPUESTA_EMITIDA)
        propuesta = Propuesta.objects.get()
        self.assertEqual(propuesta.emitida_por, self.artesano)
        self.assertIsInstance(propuesta.total, Decimal)

    def test_propuesta_solo_incluye_aceptados_y_rechazados_siguen_en_la_solicitud(self):
        self.emitir()
        self.assertEqual(
            set(LineaPropuesta.objects.values_list("renglon", flat=True)),
            {self.r1.pk, self.r2.pk, self.r3.pk},
        )
        self.r4.refresh_from_db()
        self.assertEqual(
            (self.r4.resolucion, self.r4.motivo_rechazo), ("rechazado", "No disponible")
        )
        self.assertEqual(self.solicitud.renglones.count(), 4)

    def test_renglon_rechazado_ajeno_repetido_o_faltante_es_400(self):
        otra = self.crear(datos_renglon(self.p_stock))
        base = self.condiciones()["lineas"]
        casos = {
            "rechazado": [*base, {"renglon": self.r4.pk}],
            "ajeno": [*base, {"renglon": otra.renglones.get().pk}],
            "repetido": [*base, {"renglon": self.r1.pk}],
            "faltante": base[:2],
        }
        for nombre, lineas in casos.items():
            with self.subTest(caso=nombre):
                respuesta = self.emitir(self.condiciones(lineas=lineas))
                self.assertEqual(respuesta.status_code, 400, respuesta.data)
        self.assertFalse(Propuesta.objects.exists())
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, EstadoSolicitud.LISTA_PROPUESTA)

    def test_cliente_no_puede_enviar_precios_totales_ni_identidad(self):
        for campo, valor in (
            ("total", "1.00"),
            ("subtotal_productos", "1.00"),
            ("comprador", self.otro_comprador.pk),
            ("taller", self.taller_ajeno.pk),
            ("estado", "propuesta_emitida"),
            ("pedido", 1),
            ("reserva", 1),
            ("moneda", "USD"),
        ):
            with self.subTest(campo=campo):
                self.assertEqual(self.emitir(self.condiciones(**{campo: valor})).status_code, 400)
        for campo in ("precio_unitario", "subtotal", "cantidad", "modalidad", "producto"):
            with self.subTest(linea=campo):
                lineas = self.condiciones()["lineas"]
                lineas[0] = lineas[0] | {campo: "1"}
                respuesta = self.emitir(self.condiciones(lineas=lineas))
                self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Propuesta.objects.exists())

    def test_precio_unitario_procede_del_producto_vigente_y_queda_estable(self):
        catalogo.actualizar_producto(self.p_stock, precio=Decimal("111.11"))
        self.emitir()
        linea = LineaPropuesta.objects.get(renglon=self.r1)
        self.assertEqual(linea.precio_unitario, Decimal("111.11"))
        self.assertEqual(linea.subtotal, Decimal("333.33"))
        # Un cambio posterior del catálogo no recalcula la propuesta emitida.
        catalogo.actualizar_producto(self.p_stock, precio=Decimal("999.00"))
        catalogo.despublicar_producto(self.p_stock)
        respuesta = self.client.get(url_propuesta_recibida(self.solicitud.pk))
        self.assertEqual(respuesta.data["lineas"][0]["precio_unitario"], "111.11")
        self.assertEqual(respuesta.data["subtotal_productos"], "808.33")

    def test_importes_negativos_o_con_mas_de_dos_decimales_se_rechazan(self):
        lineas = self.condiciones()["lineas"]
        casos = (
            {"costo_entrega": "-1.00"},
            {"costo_entrega": "10.001"},
            {"costo_entrega": "abc"},
            {"costo_entrega": True},
            {"otros_cargos": [{"descripcion": "x", "monto": "-0.01"}]},
            {"lineas": [lineas[0], lineas[1], lineas[2] | {"cargo_personalizacion": "-5"}]},
            {"costo_entrega": "100000000.00"},
        )
        for datos in casos:
            with self.subTest(datos=datos):
                self.assertEqual(self.emitir(self.condiciones(**datos)).status_code, 400)
        self.assertFalse(Propuesta.objects.exists())

    def test_cargos_y_entrega_en_cero_son_validos(self):
        lineas = self.condiciones()["lineas"]
        lineas[2] = {"renglon": self.r3.pk}
        respuesta = self.emitir(
            self.condiciones(
                modalidad_entrega="retiro_taller",
                descripcion_entrega="",
                costo_entrega="0",
                lineas=lineas,
                otros_cargos=[],
            )
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(
            (respuesta.data["costo_entrega"], respuesta.data["total"]), ("0.00", "776.50")
        )

    def test_cargo_de_personalizacion_solo_en_renglones_de_personalizacion(self):
        lineas = self.condiciones()["lineas"]
        lineas[0] = lineas[0] | {"cargo_personalizacion": "10.00"}
        respuesta = self.emitir(self.condiciones(lineas=lineas))
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("cargo_personalizacion", respuesta.data["lineas"][0])

    def test_otros_cargos_exigen_descripcion_y_renglon_aceptado(self):
        for cargo in (
            {"descripcion": "", "monto": "1.00"},
            {"descripcion": "   ", "monto": "1.00"},
            {"monto": "1.00"},
            {"descripcion": "x", "monto": "1.00", "renglon": self.r4.pk},
            {"descripcion": "x", "monto": "1.00", "tipo": "entrega"},
        ):
            with self.subTest(cargo=cargo):
                self.assertEqual(
                    self.emitir(self.condiciones(otros_cargos=[cargo])).status_code, 400
                )

    def test_modalidad_de_entrega_valida_y_otra_exige_descripcion(self):
        for datos in (
            {"modalidad_entrega": "dron"},
            {"modalidad_entrega": "otra", "descripcion_entrega": ""},
            {"modalidad_entrega": "otra", "descripcion_entrega": "   "},
        ):
            with self.subTest(datos=datos):
                self.assertEqual(self.emitir(self.condiciones(**datos)).status_code, 400)
        respuesta = self.emitir(
            self.condiciones(modalidad_entrega="otra", descripcion_entrega="Encomienda")
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.data)

    def test_produccion_exige_fecha_comprometida_y_otras_modalidades_no_la_admiten(self):
        lineas = self.condiciones()["lineas"]
        sin_fecha = [lineas[0], {"renglon": self.r2.pk}, lineas[2]]
        pasada = [
            lineas[0],
            {
                "renglon": self.r2.pk,
                "fecha_comprometida": (timezone.localdate() - timedelta(days=1)).isoformat(),
            },
            lineas[2],
        ]
        en_stock = [lineas[0] | {"fecha_comprometida": self.comprometida.isoformat()}, *lineas[1:]]
        mal_formato = [
            lineas[0],
            {"renglon": self.r2.pk, "fecha_comprometida": "2026-02-30"},
            lineas[2],
        ]
        for nombre, valor in (
            ("sin", sin_fecha),
            ("pasada", pasada),
            ("stock", en_stock),
            ("formato", mal_formato),
        ):
            with self.subTest(caso=nombre):
                self.assertEqual(self.emitir(self.condiciones(lineas=valor)).status_code, 400)
        # No se exige fecha comprometida >= fecha solicitada: ninguna regla lo dice.
        antes = [
            lineas[0],
            {"renglon": self.r2.pk, "fecha_comprometida": timezone.localdate().isoformat()},
            lineas[2],
        ]
        self.assertEqual(self.emitir(self.condiciones(lineas=antes)).status_code, 201)

    def test_solo_una_propuesta_por_solicitud(self):
        self.assertEqual(self.emitir().status_code, 201)
        respuesta = self.emitir()
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "propuesta_ya_emitida")
        self.assertEqual(Propuesta.objects.count(), 1)
        self.assertEqual(LineaPropuesta.objects.count(), 3)

    def test_propuesta_no_crea_pedido_reserva_ni_toca_otros_dominios(self):
        modelos = [
            m
            for m in apps.get_models()
            if m._meta.app_label in {"accounts", "talleres", "catalogo"}
        ]
        antes = {m._meta.label: m.objects.count() for m in modelos}
        self.emitir()
        self.assertEqual(antes, {m._meta.label: m.objects.count() for m in modelos})
        etiquetas = {m._meta.app_label for m in apps.get_models()}
        self.assertFalse({"pedidos", "inventario", "reservas", "pagos"} & etiquetas)
        self.assertEqual(
            {m.__name__ for m in apps.get_app_config("propuestas").get_models()},
            {"Propuesta", "LineaPropuesta", "CargoPropuesta"},
        )


class EstadoPreviosTests(PropuestaAPITestCase):
    def test_no_emite_con_renglones_pendientes(self):
        respuesta = self.emitir()
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "solicitud_con_renglones_pendientes")
        self.assertFalse(Propuesta.objects.exists())

    def test_no_emite_rechazada_por_dr03(self):
        self.revisar(rechazados={self.r1.pk, self.r2.pk, self.r3.pk, self.r4.pk})
        self.assertEqual(self.solicitud.estado, EstadoSolicitud.RECHAZADA)
        respuesta = self.emitir()
        self.assertEqual(respuesta.data["codigo"], "solicitud_rechazada")
        self.assertFalse(Propuesta.objects.exists())

    def test_servicio_exige_al_menos_un_aceptado_aunque_el_estado_este_corrupto(self):
        self.revisar(rechazados={self.r1.pk, self.r2.pk, self.r3.pk, self.r4.pk})
        type(self.solicitud).objects.filter(pk=self.solicitud.pk).update(estado="lista_propuesta")
        with self.assertRaises(services.ConflictoSolicitud) as error:
            services.finalizar_propuesta(
                artesano=self.artesano,
                solicitud_id=self.solicitud.pk,
                modalidad_entrega="retiro_taller",
                costo_entrega=Decimal("0"),
                lineas=[],
            )
        self.assertEqual(error.exception.codigo, "solicitud_sin_renglones_aceptados")

    def test_no_se_puede_resolver_despues_de_emitir(self):
        self.revisar()
        self.emitir()
        respuesta = self.client.post(
            f"/api/v1/solicitudes/recibidas/{self.solicitud.pk}/renglones/{self.r1.pk}/resolver/",
            {"resolucion": "rechazado", "motivo_rechazo": "x"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(respuesta.data["codigo"], "renglon_ya_resuelto")


class PermisosPropuestaTests(PropuestaAPITestCase):
    def setUp(self):
        super().setUp()
        self.revisar()

    def test_emision_exige_artesano_aprobado_y_propietario(self):
        self.anonimo()
        self.assertEqual(self.emitir().status_code, 401)
        for usuario, codigo in (
            (self.comprador, 403),
            (self.taller_pendiente.propietario, 403),
            (self.taller_rechazado.propietario, 403),
            (crear_usuario("81111111", rol=Rol.ARTESANO), 403),
            (self.admin, 401),
            (self.artesano_ajeno, 404),
        ):
            with self.subTest(usuario=usuario.telefono):
                self.autenticar(usuario)
                self.assertEqual(self.emitir().status_code, codigo)
        self.assertFalse(Propuesta.objects.exists())

    def test_lectura_por_las_partes_y_404_para_ajenos(self):
        self.emitir()
        self.assertEqual(
            self.client.get(url_propuesta_recibida(self.solicitud.pk)).status_code, 200
        )
        self.autenticar(self.comprador)
        respuesta = self.client.get(url_propuesta_mia(self.solicitud.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["total"], "977.25")
        self.assertEqual(
            self.client.get(url_propuesta_recibida(self.solicitud.pk)).status_code, 403
        )
        self.autenticar(self.otro_comprador)
        self.assertEqual(self.client.get(url_propuesta_mia(self.solicitud.pk)).status_code, 404)
        self.autenticar(self.artesano_ajeno)
        self.assertEqual(
            self.client.get(url_propuesta_recibida(self.solicitud.pk)).status_code, 404
        )
        self.anonimo()
        self.assertEqual(self.client.get(url_propuesta_mia(self.solicitud.pk)).status_code, 401)

    def test_lectura_antes_de_emitir_es_404(self):
        self.assertEqual(
            self.client.get(url_propuesta_recibida(self.solicitud.pk)).status_code, 404
        )
        self.autenticar(self.comprador)
        self.assertEqual(self.client.get(url_propuesta_mia(self.solicitud.pk)).status_code, 404)

    def test_metodos_no_soportados_405(self):
        self.emitir()
        for metodo in ("put", "patch", "delete"):
            with self.subTest(metodo=metodo):
                ruta = url_propuesta_recibida(self.solicitud.pk)
                self.assertEqual(getattr(self.client, metodo)(ruta).status_code, 405)
        self.autenticar(self.comprador)
        for metodo in ("post", "put", "patch", "delete"):
            with self.subTest(comprador=metodo):
                ruta = url_propuesta_mia(self.solicitud.pk)
                self.assertEqual(getattr(self.client, metodo)(ruta).status_code, 405)


class IdempotenciaPropuestaTests(PropuestaAPITestCase):
    def setUp(self):
        super().setUp()
        self.revisar()

    def test_misma_clave_devuelve_la_misma_propuesta_sin_duplicar(self):
        clave = str(uuid4())
        primera = self.emitir(clave=clave)
        segunda = self.emitir(clave=clave)
        self.assertEqual((primera.status_code, segunda.status_code), (201, 201))
        self.assertEqual(primera.data["id"], segunda.data["id"])
        self.assertEqual(segunda["Idempotency-Replayed"], "true")
        self.assertEqual(
            (
                Propuesta.objects.count(),
                LineaPropuesta.objects.count(),
                CargoPropuesta.objects.count(),
            ),
            (1, 3, 2),
        )
        operacion = OperacionIdempotente.objects.get(tipo=TipoOperacion.FINALIZAR_PROPUESTA)
        self.assertEqual(
            (operacion.recurso_tipo, operacion.recurso_id),
            ("propuestas.propuesta", primera.data["id"]),
        )

    def test_misma_clave_con_otras_condiciones_es_409(self):
        clave = str(uuid4())
        self.emitir(clave=clave)
        respuesta = self.emitir(self.condiciones(costo_entrega="121.00"), clave=clave)
        self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")

    def test_misma_clave_en_otra_solicitud_es_409_y_no_emite(self):
        clave = str(uuid4())
        self.emitir(clave=clave)
        otra = self.crear(datos_renglon(self.p_stock))
        self.revisar(otra, rechazados=set())
        respuesta = self.emitir(
            self.condiciones(lineas=[{"renglon": otra.renglones.get().pk}], otros_cargos=[]),
            clave=clave,
            solicitud=otra,
        )
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.data["codigo"], "clave_idempotencia_reutilizada")
        self.assertFalse(Propuesta.objects.filter(solicitud=otra).exists())

    def test_error_de_entrada_no_registra_la_clave(self):
        clave = str(uuid4())
        self.assertEqual(
            self.emitir(
                self.condiciones(lineas=[{"renglon": self.r1.pk}]), clave=clave
            ).status_code,
            400,
        )
        self.assertFalse(
            OperacionIdempotente.objects.filter(tipo=TipoOperacion.FINALIZAR_PROPUESTA).exists()
        )
        self.assertEqual(self.emitir(clave=clave).status_code, 201)


class InvariantesBDTests(PropuestaAPITestCase):
    def setUp(self):
        super().setUp()
        self.revisar()
        self.emitir()
        self.propuesta = Propuesta.objects.get()

    def violar(self, modelo, **cambios):
        with self.assertRaises(IntegrityError), transaction.atomic():
            modelo.objects.filter(pk=self._pk(modelo)).update(**cambios)

    def _pk(self, modelo):
        return {
            Propuesta: self.propuesta.pk,
            LineaPropuesta: LineaPropuesta.objects.get(renglon=self.r1).pk,
            CargoPropuesta: CargoPropuesta.objects.get(posicion=1).pk,
        }[modelo]

    def test_constraints_de_propuesta(self):
        for cambios in (
            {"total": Decimal("1.00")},
            {"costo_entrega": Decimal("-1.00")},
            {"modalidad_entrega": "dron"},
            {"modalidad_entrega": "otra", "descripcion_entrega": ""},
        ):
            with self.subTest(cambios=cambios):
                self.violar(Propuesta, **cambios)

    def test_constraints_de_linea_y_cargo(self):
        for cambios in (
            {"subtotal": Decimal("1.00")},
            {"precio_unitario": Decimal("0")},
            {"cargo_personalizacion": Decimal("1.00")},
            {"fecha_comprometida": timezone.localdate()},
            {"modalidad": "produccion"},
        ):
            with self.subTest(linea=cambios):
                self.violar(LineaPropuesta, **cambios)
        for cambios in ({"monto": Decimal("-1")}, {"descripcion": " "}, {"posicion": 2}):
            with self.subTest(cargo=cambios):
                self.violar(CargoPropuesta, **cambios)

    def test_una_propuesta_y_una_linea_por_renglon_en_bd(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Propuesta.objects.create(
                solicitud=self.solicitud,
                emitida_por=self.artesano,
                modalidad_entrega="retiro_taller",
                costo_entrega=0,
                subtotal_productos=1,
                total_personalizacion=0,
                total_otros_cargos=0,
                total=1,
            )
        linea = LineaPropuesta.objects.get(renglon=self.r1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            LineaPropuesta.objects.create(
                propuesta=self.propuesta,
                renglon=self.r1,
                modalidad="stock",
                cantidad=linea.cantidad,
                precio_unitario=linea.precio_unitario,
                subtotal=linea.subtotal,
            )

    def test_propuesta_lineas_y_cargos_son_inmutables_y_protegidos(self):
        for objeto in (
            self.propuesta,
            LineaPropuesta.objects.first(),
            CargoPropuesta.objects.first(),
        ):
            with self.subTest(modelo=type(objeto).__name__):
                with self.assertRaises(ValidationError):
                    objeto.save()
                with self.assertRaises(ValidationError):
                    objeto.delete()
        from django.db.models import ProtectedError

        with self.assertRaises(ProtectedError):
            RenglonSolicitud.objects.filter(pk=self.r1.pk).delete()

    def test_decimal_conserva_dos_decimales(self):
        for campo in ("costo_entrega", "subtotal_productos", "total"):
            valor = getattr(self.propuesta, campo)
            self.assertEqual(valor.as_tuple().exponent, -2)


class ConsultasPropuestaTests(PropuestaAPITestCase):
    def test_lectura_usa_tres_consultas_sin_importar_lineas_o_cargos(self):
        self.revisar()
        self.emitir()
        with self.assertNumQueries(3):
            propuesta = propuestas_con_detalle().get()
            datos = PropuestaSerializer(propuesta).data
        self.assertEqual((len(datos["lineas"]), len(datos["otros_cargos"])), (3, 2))

    def test_api_comprador_no_crece_con_lineas(self):
        grande = self.crear(*[datos_renglon(self.p_stock) for _ in range(6)])
        chica = self.crear(datos_renglon(self.p_stock))
        cantidades = []
        for solicitud in (chica, grande):
            self.autenticar(self.artesano)
            self.revisar(solicitud, rechazados=set())
            lineas = [{"renglon": r.pk} for r in solicitud.renglones.order_by("posicion")]
            self.emitir(self.condiciones(lineas=lineas, otros_cargos=[]), solicitud=solicitud)
            self.autenticar(self.comprador)
            with CaptureQueriesContext(connection) as consultas:
                self.assertEqual(self.client.get(url_propuesta_mia(solicitud.pk)).status_code, 200)
            cantidades.append(len(consultas))
        self.assertEqual(cantidades[0], cantidades[1])


class LimitesTests(PropuestaAPITestCase):
    def test_importe_que_excede_el_maximo_tecnico_es_400_sin_efectos(self):
        enorme = crear_producto(
            self.taller, self.categoria, publicado=True, precio=Decimal("99999999.99")
        )
        solicitud = self.crear(datos_renglon(enorme, cantidad=2147483647))
        self.revisar(solicitud, rechazados=set())
        respuesta = self.emitir(
            self.condiciones(lineas=[{"renglon": solicitud.renglones.get().pk}], otros_cargos=[]),
            solicitud=solicitud,
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertFalse(Propuesta.objects.exists())
