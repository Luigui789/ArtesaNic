"""Carreras reales de AUD-10 en PostgreSQL: dos hilos, dos conexiones, claves distintas.

La primera transacción se detiene con el pedido y el pago ya bloqueados; la prueba espera
a ver en ``pg_stat_activity`` que la segunda está esperando ese ``FOR UPDATE`` y solo
entonces deja continuar a la primera. Solo una operación comercial prevalece.
"""

import time
from uuid import uuid4

from django.db import connection

from apps.operaciones.models import OperacionIdempotente
from apps.pagos import services
from apps.pagos.comprobantes import validar_comprobante
from apps.pagos.models import IntentoPago, Pago, RevisionIntentoPago
from apps.propuestas.tests.test_concurrencia import ESPERA, CarreraTestCase, _Hilo

from .base import archivo, archivos_privados, bytes_pdf, confirmar_pedido, imagen


def comprobante(relleno=0):
    return validar_comprobante(archivo(bytes_pdf(relleno), "pago.pdf", "application/pdf"))


class CarrerasDePagoTests(CarreraTestCase):
    # Consulta en la que la segunda transacción debe quedar esperando un lock.
    consulta_bloqueada = "%FOR UPDATE%"

    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )

    def esperar_bloqueo(self):
        limite = time.monotonic() + ESPERA
        with connection.cursor() as cursor:
            while time.monotonic() < limite:
                cursor.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
                    "AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' "
                    "AND query ILIKE %s",
                    [self.consulta_bloqueada],
                )
                if cursor.fetchone()[0]:
                    return
                time.sleep(0.02)
        self.fail("La segunda transacción no llegó a bloquearse.")

    def registrar(self, referencia="TRX-1", clave=None, relleno=0):
        return _Hilo(
            services.registrar_intento_idempotente,
            comprador=self.comprador,
            clave=clave or str(uuid4()),
            pedido_id=self.pedido.pk,
            metodo="transferencia",
            referencia=referencia,
            comprobante=comprobante(relleno),
        )

    def corregir(self, intento_id, referencia):
        return _Hilo(
            services.corregir_intento_idempotente,
            comprador=self.comprador,
            clave=str(uuid4()),
            pedido_id=self.pedido.pk,
            intento_id=intento_id,
            metodo="transferencia",
            referencia=referencia,
            comprobante=comprobante(len(referencia)),
        )

    def resolver(self, intento_id, resultado, motivo=""):
        return _Hilo(
            services.resolver_intento_idempotente,
            artesano=self.artesano,
            clave=str(uuid4()),
            pedido_id=self.pedido.pk,
            intento_id=intento_id,
            resultado=resultado,
            motivo=motivo,
        )

    def intento_registrado(self):
        return services.registrar_intento(
            comprador=self.comprador,
            pedido_id=self.pedido.pk,
            metodo="transferencia",
            referencia="TRX-0",
            comprobante=validar_comprobante(imagen()),
        )

    def assertConflicto(self, hilo, *codigos):
        self.assertIsInstance(hilo.error, services.ConflictoPago)
        self.assertIn(hilo.error.codigo, codigos)

    def test_dos_registros_iniciales_un_solo_intento(self):
        self.pausar_en(services, "_bloquear_pago")
        antes = archivos_privados()
        primera, segunda = self.carrera(self.registrar("A"), self.registrar("B", relleno=3))
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "pago_en_revision")
        self.assertEqual(Pago.objects.count(), 1)
        self.assertEqual(list(IntentoPago.objects.values_list("referencia", flat=True)), ["A"])
        self.assertEqual(len(archivos_privados()) - len(antes), 1, "La perdedora no escribe")
        self.assertEqual(OperacionIdempotente.objects.count(), 1)

    def test_misma_clave_en_paralelo_ejecuta_una_vez(self):
        # Con la misma clave la segunda espera el INSERT único de la operación idempotente.
        self.consulta_bloqueada = "%INSERT INTO%operaciones_operacionidempotente%"
        clave = str(uuid4())
        self.pausar_en(services, "_bloquear_pago")
        primera, segunda = self.carrera(self.registrar(clave=clave), self.registrar(clave=clave))
        self.assertIsNone(primera.error)
        self.assertIsNone(segunda.error)
        self.assertTrue(segunda.resultado.repetida)
        self.assertEqual(IntentoPago.objects.count(), 1)

    def test_dos_correcciones_un_solo_intento_nuevo(self):
        intento = self.intento_registrado()
        services.resolver_intento(
            artesano=self.artesano,
            pedido_id=self.pedido.pk,
            intento_id=intento.pk,
            resultado="observado",
            motivo="Ilegible",
        )
        self.pausar_en(services, "_bloquear_pago")
        primera, segunda = self.carrera(
            self.corregir(intento.pk, "C-1"), self.corregir(intento.pk, "C-22")
        )
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "pago_en_revision")
        self.assertEqual(IntentoPago.objects.count(), 2)
        self.assertEqual(IntentoPago.objects.get(numero=2).referencia, "C-1")
        self.assertEqual(Pago.objects.get().estado, "registrado")

    def test_confirmar_contra_observar_solo_gana_una(self):
        intento = self.intento_registrado()
        self.pausar_en(services, "_bloquear_pago")
        primera, segunda = self.carrera(
            self.resolver(intento.pk, "confirmado"),
            self.resolver(intento.pk, "observado", "Ilegible"),
        )
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "pago_ya_confirmado")
        revision = RevisionIntentoPago.objects.get()
        self.assertEqual(revision.resultado, "confirmado")
        pago = Pago.objects.get()
        self.assertEqual((pago.estado, pago.plazo_hasta), ("confirmado", None))
        self.assertEqual(OperacionIdempotente.objects.count(), 1)

    def test_dos_revisiones_observado_y_no_recibido(self):
        intento = self.intento_registrado()
        self.pausar_en(services, "_bloquear_pago")
        primera, segunda = self.carrera(
            self.resolver(intento.pk, "observado", "Ilegible"),
            self.resolver(intento.pk, "no_recibido", "Sin fondos"),
        )
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "intento_ya_resuelto")
        self.assertEqual(RevisionIntentoPago.objects.get().resultado, "observado")
        self.assertEqual(Pago.objects.get().estado, "observado")

    def test_correccion_mientras_el_artesano_confirma_otro_estado(self):
        """La corrección revalida dentro del lock: si el pago ya no está observado, falla."""
        intento = self.intento_registrado()
        self.pausar_en(services, "_bloquear_pago")
        primera, segunda = self.carrera(
            self.resolver(intento.pk, "confirmado"), self.corregir(intento.pk, "C-1")
        )
        self.assertIsNone(primera.error)
        self.assertConflicto(segunda, "pago_ya_confirmado")
        self.assertEqual(IntentoPago.objects.count(), 1)

    def test_rollback_de_la_primera_deja_ganar_a_la_segunda(self):
        self.fallar_primera = True
        self.pausar_en(services, "_bloquear_pago")
        antes = archivos_privados()
        primera, segunda = self.carrera(self.registrar("A"), self.registrar("B"))
        self.assertIsInstance(primera.error, RuntimeError)
        self.assertIsNone(segunda.error)
        self.assertEqual(list(IntentoPago.objects.values_list("referencia", flat=True)), ["B"])
        self.assertEqual(len(archivos_privados()) - len(antes), 1)
