"""Frontera reutilizable ``ejecutar_idempotente``: huella, clave, registro y transacción."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.models import Categoria
from apps.operaciones import services
from apps.operaciones.models import EstadoOperacion, OperacionIdempotente, TipoOperacion

CREAR = TipoOperacion.CREAR_SOLICITUD


class HuellaTests(TestCase):
    def test_no_depende_del_orden_de_claves(self):
        a = {"renglones": [{"producto": 1, "modalidad": "stock", "cantidad": 2}]}
        b = {"renglones": [{"cantidad": 2, "modalidad": "stock", "producto": 1}]}
        self.assertEqual(services.calcular_huella(a), services.calcular_huella(b))

    def test_distingue_el_orden_de_las_listas(self):
        r1 = {"producto": 1, "modalidad": "stock", "cantidad": 1}
        r2 = {"producto": 2, "modalidad": "stock", "cantidad": 1}
        self.assertNotEqual(
            services.calcular_huella({"renglones": [r1, r2]}),
            services.calcular_huella({"renglones": [r2, r1]}),
        )

    def test_distingue_valores_y_tipos(self):
        base = services.calcular_huella({"cantidad": 1})
        self.assertNotEqual(base, services.calcular_huella({"cantidad": 2}))
        self.assertNotEqual(base, services.calcular_huella({"cantidad": "1"}))

    def test_canoniza_fechas_y_decimales(self):
        self.assertEqual(
            services.calcular_huella({"f": date(2026, 12, 1), "d": Decimal("1.50")}),
            services.calcular_huella({"f": "2026-12-01", "d": "1.50"}),
        )

    def test_es_sha256_hexadecimal_y_determinista(self):
        huella = services.calcular_huella({"x": "ñ"})
        self.assertRegex(huella, r"^[0-9a-f]{64}$")
        self.assertEqual(huella, services.calcular_huella({"x": "ñ"}))

    def test_rechaza_tipos_no_canonicos(self):
        with self.assertRaises(TypeError):
            services.calcular_huella({"x": object()})


class ClaveTests(TestCase):
    def test_validos(self):
        for clave in (str(uuid4()), "A" * 16, "z" * 128, "a.b_c:d~e-f.0123"):
            self.assertEqual(services.validar_clave(clave), clave)

    def test_invalidos(self):
        for clave in (None, 123, b"x" * 20, "", "x" * 15, "x" * 129, "x" * 15 + " ", "á" * 16):
            with self.subTest(clave=clave), self.assertRaises(services.ClaveIdempotenciaInvalida):
                services.validar_clave(clave)


class EjecutarIdempotenteTests(TestCase):
    """La operación de prueba crea categorías: cualquier modelo sirve como resultado."""

    def setUp(self):
        self.actor = crear_usuario("86666666")
        self.otro = crear_usuario("87777777")
        self.clave = str(uuid4())
        self.llamadas = 0

    def operacion(self, codigo="ceramica"):
        def ejecutar():
            self.llamadas += 1
            nombre = f"{codigo}_{self.llamadas}"
            return Categoria.objects.create(codigo=nombre, nombre=nombre)

        return ejecutar

    def ejecutar(self, *, actor=None, clave=None, datos=None, operacion=None):
        return services.ejecutar_idempotente(
            actor=actor or self.actor,
            tipo=CREAR,
            clave=clave or self.clave,
            datos=datos if datos is not None else {"a": 1},
            operacion=operacion or self.operacion(),
        )

    def test_primera_ejecucion_registra_resultado_completo(self):
        resultado = self.ejecutar()
        self.assertFalse(resultado.repetida)
        operacion = OperacionIdempotente.objects.get()
        self.assertEqual(operacion.estado, EstadoOperacion.COMPLETADA)
        self.assertEqual(operacion.recurso_tipo, "catalogo.categoria")
        self.assertEqual(operacion.recurso_id, Categoria.objects.get().pk)
        self.assertEqual(operacion.codigo_http, 201)
        self.assertIsNotNone(operacion.completado_en)

    def test_repeticion_no_vuelve_a_ejecutar(self):
        primera = self.ejecutar()
        segunda = self.ejecutar()
        self.assertTrue(segunda.repetida)
        self.assertEqual(segunda.operacion.pk, primera.operacion.pk)
        self.assertEqual(self.llamadas, 1)

    def test_huella_distinta_es_conflicto_sin_ejecutar(self):
        self.ejecutar()
        with self.assertRaises(services.ClaveIdempotenciaReutilizada):
            self.ejecutar(datos={"a": 2})
        self.assertEqual(self.llamadas, 1)

    def test_claves_distintas_no_se_deduplican(self):
        self.ejecutar()
        self.ejecutar(clave=str(uuid4()))
        self.assertEqual(self.llamadas, 2)
        self.assertEqual(Categoria.objects.count(), 2)

    def test_la_clave_pertenece_al_actor(self):
        self.ejecutar()
        resultado = self.ejecutar(actor=self.otro, datos={"otro": True})
        self.assertFalse(resultado.repetida)
        self.assertEqual(self.llamadas, 2)

    def test_fallo_de_la_operacion_revierte_registro_y_efectos(self):
        def fallar():
            Categoria.objects.create(codigo="parcial", nombre="Parcial")
            raise ValueError("regla de negocio")

        with self.assertRaises(ValueError):
            self.ejecutar(operacion=fallar)
        self.assertFalse(OperacionIdempotente.objects.exists())
        self.assertFalse(Categoria.objects.exists())
        self.assertFalse(self.ejecutar().repetida)

    def test_fallo_dentro_de_transaccion_externa_no_deja_en_progreso(self):
        def fallar():
            raise ValueError

        with transaction.atomic():
            with self.assertRaises(ValueError):
                self.ejecutar(operacion=fallar)
            self.assertFalse(OperacionIdempotente.objects.exists())

    def test_clave_invalida_no_ejecuta(self):
        with self.assertRaises(services.ClaveIdempotenciaInvalida):
            self.ejecutar(clave="corta")
        self.assertEqual(self.llamadas, 0)

    def test_no_hay_completadas_sin_recurso_ni_en_progreso_persistidas(self):
        self.ejecutar()
        self.ejecutar(clave=str(uuid4()))
        self.assertFalse(
            OperacionIdempotente.objects.exclude(estado=EstadoOperacion.COMPLETADA).exists()
        )
        self.assertFalse(OperacionIdempotente.objects.filter(recurso_id__isnull=True).exists())

    def test_otros_errores_de_integridad_no_se_confunden_con_repeticion(self):
        def duplicar():
            Categoria.objects.create(codigo="unica", nombre="A")
            return Categoria.objects.create(codigo="unica", nombre="B")

        with self.assertRaises(IntegrityError):
            self.ejecutar(operacion=duplicar)
        self.assertFalse(OperacionIdempotente.objects.exists())


class RestriccionesTests(TestCase):
    def setUp(self):
        self.actor = crear_usuario("86666666")

    def crear(self, **cambios):
        datos = {
            "actor": self.actor,
            "tipo": CREAR,
            "clave": "clave-de-prueba-0001",
            "huella": "a" * 64,
        } | cambios
        with transaction.atomic():
            return OperacionIdempotente.objects.create(**datos)

    def test_unique_actor_tipo_clave(self):
        self.crear()
        with self.assertRaises(IntegrityError):
            self.crear(huella="b" * 64)
        self.crear(actor=crear_usuario("87777777"))

    def test_checks_de_tipo_clave_y_huella(self):
        for cambios in (
            {"tipo": "tipo_inexistente"},
            {"clave": "corta"},
            {"clave": "con espacio interior"},
            {"huella": "no-hex"},
            {"huella": "A" * 64},
        ):
            with self.subTest(cambios=cambios), self.assertRaises(IntegrityError):
                self.crear(**cambios)

    def test_completada_exige_recurso_codigo_y_fecha(self):
        completa = {
            "estado": EstadoOperacion.COMPLETADA,
            "recurso_tipo": "solicitudes.solicitud",
            "recurso_id": 1,
            "codigo_http": 201,
            "completado_en": timezone.now(),
        }
        for faltante in ("recurso_tipo", "recurso_id", "codigo_http", "completado_en"):
            with self.subTest(faltante=faltante), self.assertRaises(IntegrityError):
                self.crear(**(completa | {faltante: "" if faltante == "recurso_tipo" else None}))
        self.crear(**completa)

    def test_en_progreso_no_admite_resultado(self):
        with self.assertRaises(IntegrityError):
            self.crear(recurso_id=1)
