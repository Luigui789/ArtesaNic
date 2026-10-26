"""Modelo append-only y constraints de MensajePedido (AUD-16, D-AUD16-03)."""

from django.core.exceptions import ValidationError
from django.db import DataError, IntegrityError, transaction
from django.db.models import ProtectedError

from apps.mensajes import services
from apps.mensajes.models import MAX_TEXTO, MensajePedido
from apps.pagos.tests.base import confirmar_pedido
from apps.solicitudes.tests.base import SolicitudesAPITestCase


class MensajePedidoModelTests(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )

    def crear(self, texto="Hola"):
        return services.enviar_mensaje(actor=self.comprador, pedido_id=self.pedido.pk, texto=texto)

    def test_crea_mensaje_con_autor_pedido_y_fecha(self):
        mensaje = self.crear("  Podemos coordinar mañana.  ")
        mensaje.refresh_from_db()
        self.assertEqual(mensaje.texto, "Podemos coordinar mañana.")
        self.assertEqual(mensaje.autor, self.comprador)
        self.assertEqual(mensaje.pedido, self.pedido)
        self.assertIsNotNone(mensaje.creado_en)

    def test_sin_columnas_duplicadas_de_identidad_ni_estado(self):
        columnas = {f.column for f in MensajePedido._meta.concrete_fields}
        self.assertEqual(columnas, {"id", "pedido_id", "autor_id", "texto", "creado_en"})

    def test_no_se_edita(self):
        mensaje = self.crear()
        mensaje.texto = "Otro"
        with self.assertRaises(ValidationError):
            mensaje.save()
        mensaje.refresh_from_db()
        self.assertEqual(mensaje.texto, "Hola")

    def test_no_se_elimina(self):
        mensaje = self.crear()
        with self.assertRaises(ValidationError):
            mensaje.delete()
        self.assertTrue(MensajePedido.objects.filter(pk=mensaje.pk).exists())

    def test_fks_protegidas(self):
        self.crear()
        with self.assertRaises(ProtectedError):
            self.comprador.delete()

    def test_base_rechaza_texto_en_blanco(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            MensajePedido.objects.create(pedido=self.pedido, autor=self.comprador, texto=" \n\t")

    def test_base_rechaza_texto_largo(self):
        with self.assertRaises(DataError), transaction.atomic():
            MensajePedido.objects.create(
                pedido=self.pedido, autor=self.comprador, texto="x" * (MAX_TEXTO + 1)
            )

    def test_validacion_del_servicio(self):
        for texto in ("", "   ", "\n\n", "x" * (MAX_TEXTO + 1), None, 5):
            with self.subTest(texto=texto), self.assertRaises(services.TextoInvalido):
                self.crear(texto)
        self.assertEqual(self.crear("x" * MAX_TEXTO).texto, "x" * MAX_TEXTO)
        # Recorta antes de medir: 500 caracteres útiles con espacios alrededor son válidos.
        self.assertEqual(len(self.crear(f"  {'y' * MAX_TEXTO}\n").texto), MAX_TEXTO)

    def test_orden_por_id(self):
        ids = [self.crear(f"m{i}").pk for i in range(3)]
        self.assertEqual(list(MensajePedido.objects.values_list("pk", flat=True)), ids)
