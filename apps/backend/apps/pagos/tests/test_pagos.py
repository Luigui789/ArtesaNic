"""AUD-10: registro, revisión, corrección, plazos, historial, privacidad e idempotencia del
pago externo (RF-011; RN-006/012/014/015; RNF-004/011/013/014/015)."""

import json
from datetime import timedelta
from pathlib import Path
from unittest import mock
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator

from apps.inventario.models import InventarioProducto, MovimientoInventario, ReservaInventario
from apps.operaciones.models import OperacionIdempotente, TipoOperacion
from apps.pagos.models import (
    PLAZO,
    EstadoPago,
    IntentoPago,
    OrigenIntento,
    Pago,
    RevisionIntentoPago,
)
from apps.pedidos.models import Pedido

from .base import (
    PagosAPITestCase,
    archivo,
    archivos_privados,
    bytes_imagen,
    bytes_pdf,
    bytes_pdf_de_tamano,
    confirmar_pedido,
    imagen,
    pdf,
    reloj,
    url_comprobante_recibido,
    url_intentos,
    url_mi_comprobante,
    url_mi_pago,
    url_pago_recibido,
    url_resolver,
)

UN_SEGUNDO = timedelta(seconds=1)


def leer(respuesta) -> bytes:
    return b"".join(respuesta.streaming_content)


class RegistroInicialTests(PagosAPITestCase):
    def test_comprador_registra_y_el_total_sale_del_pedido(self):
        antes = archivos_privados()
        respuesta = self.registrar(referencia="  TRX-987654  ")
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        datos = respuesta.json()
        self.assertEqual(datos["estado"], "registrado")
        self.assertEqual(datos["moneda"], "NIO")
        self.assertEqual(datos["total"], str(self.pedido.total))
        self.assertIsNone(datos["registrable_hasta"])
        self.assertTrue(datos["revision_pendiente"])
        (intento,) = datos["intentos"]
        self.assertEqual(
            (intento["numero"], intento["origen"], intento["intento_previo"]), (1, "inicial", None)
        )
        self.assertEqual(intento["referencia"], "TRX-987654")
        self.assertIsNone(intento["resolucion"])
        self.assertEqual(intento["comprobante"]["tipo"], "image/png")
        pago = Pago.objects.get(pedido=self.pedido)
        self.assertEqual((pago.total, pago.moneda), (self.pedido.total, "NIO"))
        nuevos = sorted(set(archivos_privados()) - set(antes))
        self.assertEqual(len(nuevos), 1)
        self.assertTrue(nuevos[0].is_relative_to(Path(settings.PRIVATE_MEDIA_ROOT)))
        self.assertFalse(nuevos[0].is_relative_to(Path(settings.MEDIA_ROOT)))
        self.assertNotIn("pago", nuevos[0].name)

    def test_cliente_no_elige_monto_ni_datos_derivados(self):
        for campo, valor in [
            ("monto", "1.00"),
            ("moneda", "USD"),
            ("estado", "confirmado"),
            ("comprador_id", str(self.otro_comprador.pk)),
            ("taller_id", str(self.taller_ajeno.pk)),
            ("pedido_total", "1.00"),
            ("intento_previo", "1"),
        ]:
            with self.subTest(campo):
                respuesta = self.registrar(extra={campo: valor})
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn(campo, respuesta.json())
        self.assertFalse(Pago.objects.exists())

    def test_ownership_roles_y_autenticacion(self):
        self.assertEqual(self.registrar(self.pedido_otro_comprador).status_code, 404)
        self.assertEqual(self.registrar(pedido=Pedido(pk=999999)).status_code, 404)
        self.autenticar(self.artesano)
        self.assertEqual(self.registrar().status_code, 403)
        # La cuenta de administración no usa la API pública (puede_usar_api): 401.
        self.autenticar(self.admin)
        self.assertEqual(self.registrar().status_code, 401)
        self.anonimo()
        self.assertEqual(self.registrar().status_code, 401)
        self.assertFalse(Pago.objects.exists())

    def test_formatos_validos_por_api(self):
        for comprobante, tipo in [
            (imagen("JPEG"), "image/jpeg"),
            (imagen("PNG"), "image/png"),
            (imagen("WEBP"), "image/webp"),
            (pdf(), "application/pdf"),
        ]:
            with self.subTest(tipo):
                pedido = confirmar_pedido(
                    comprador=self.comprador, artesano=self.artesano, producto=self.producto
                )
                respuesta = self.registrar(pedido, comprobante=comprobante)
                self.assertEqual(respuesta.status_code, 201, respuesta.content)
                self.assertEqual(respuesta.json()["intentos"][0]["comprobante"]["tipo"], tipo)

    def test_comprobantes_invalidos_responden_400_sin_efectos(self):
        jpeg = bytes_imagen("JPEG", tamano=(120, 120))
        real = bytes_pdf()
        tabla = real.index(b"xref")
        antes = archivos_privados()
        for nombre, comprobante in [
            (
                "svg",
                archivo(b"<svg xmlns='http://www.w3.org/2000/svg'/>", "a.svg", "image/svg+xml"),
            ),
            ("html", archivo(b"<html><script>x</script></html>", "a.html", "text/html")),
            ("exe como jpg", archivo(b"MZ\x90\x00" * 16, "pago.jpg", "image/jpeg")),
            ("corrupto", archivo(jpeg[: len(jpeg) // 2], "pago.jpg", "image/jpeg")),
            ("vacío", archivo(b"", "pago.pdf", "application/pdf")),
            (
                "> 10 MB",
                archivo(bytes_pdf_de_tamano(10 * 1024 * 1024 + 1), "a.pdf", "application/pdf"),
            ),
            ("inconsistente", archivo(bytes_imagen("PNG"), "pago.pdf", "application/pdf")),
            ("PDF real como imagen", archivo(real, "pago.jpg", "image/jpeg")),
            ("PDF falso", archivo(b"%PDF-1.4\nstartxref\n0\n%%EOF\n", "a.pdf", "application/pdf")),
            ("PDF truncado", archivo(real[:80] + real[-120:], "a.pdf", "application/pdf")),
            (
                "PDF con xref corrupto",
                archivo(real[: tabla + 5] + b"zz" + real[tabla + 7 :], "a.pdf", "application/pdf"),
            ),
        ]:
            with self.subTest(nombre):
                respuesta = self.registrar(comprobante=comprobante)
                self.assertEqual(respuesta.status_code, 400, respuesta.content)
                self.assertIn("comprobante", respuesta.json())
        self.assertFalse(Pago.objects.exists())
        self.assertEqual(archivos_privados(), antes)

    def test_comprobante_obligatorio_y_unico(self):
        respuesta = self.client.post(
            url_intentos(self.pedido.pk),
            {"metodo": "transferencia", "referencia": "TRX-1"},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(respuesta.json()["comprobante"], ["Adjunta el comprobante del pago."])
        respuesta = self.client.post(
            url_intentos(self.pedido.pk),
            {"metodo": "transferencia", "referencia": "TRX-1", "comprobante": [pdf(), imagen()]},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("único", respuesta.json()["comprobante"][0])
        self.assertFalse(Pago.objects.exists())

    def test_metodo_y_referencia(self):
        for metodo in ("tarjeta", "contra_entrega", "paypal", ""):
            with self.subTest(metodo=metodo):
                self.assertEqual(self.registrar(metodo=metodo).status_code, 400)
        for referencia in ("", "   ", "x" * 121):
            with self.subTest(referencia=referencia[:5]):
                respuesta = self.registrar(referencia=referencia)
                self.assertEqual(respuesta.status_code, 400)
                self.assertIn("referencia", respuesta.json())
        respuesta = self.registrar(metodo="otro", referencia=f"  {'x' * 120}  ")
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        self.assertEqual(respuesta.json()["intentos"][0]["referencia"], "x" * 120)

    def test_json_no_es_el_contrato(self):
        respuesta = self.client.post(
            url_intentos(self.pedido.pk),
            {"metodo": "transferencia", "referencia": "X"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(respuesta.status_code, 415)

    def test_registrado_no_admite_otro_registro(self):
        self.registrar()
        respuesta = self.registrar(referencia="OTRA")
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()["codigo"], "pago_en_revision")
        intento = IntentoPago.objects.get()
        self.assertEqual(self.corregir(intento.pk).json()["codigo"], "pago_en_revision")
        self.assertEqual(IntentoPago.objects.count(), 1)


class LecturaTests(PagosAPITestCase):
    def test_sin_registro_esta_pendiente_con_plazo_inicial(self):
        respuesta = self.client.get(url_mi_pago(self.pedido.pk))
        self.assertEqual(respuesta.status_code, 200)
        datos = respuesta.json()
        self.assertEqual(datos["estado"], "pendiente")
        self.assertEqual(datos["intentos"], [])
        self.assertIsNone(datos["confirmado_en"])
        self.assertFalse(datos["plazo_vencido"])
        limite = self.pedido.confirmado_en + PLAZO
        self.assertEqual(datos["registrable_hasta"], limite.astimezone().isoformat())
        self.assertFalse(Pago.objects.exists(), "Leer no crea el pago")

    def test_partes_y_ajenos(self):
        self.autenticar(self.artesano)
        self.assertEqual(self.client.get(url_pago_recibido(self.pedido.pk)).status_code, 200)
        self.assertEqual(
            self.client.get(url_pago_recibido(self.pedido_taller_ajeno.pk)).status_code, 404
        )
        self.assertEqual(self.client.get(url_mi_pago(self.pedido.pk)).status_code, 403)
        self.autenticar(self.comprador)
        self.assertEqual(
            self.client.get(url_mi_pago(self.pedido_otro_comprador.pk)).status_code, 404
        )
        self.assertEqual(self.client.get(url_pago_recibido(self.pedido.pk)).status_code, 403)
        self.autenticar(self.admin)
        self.assertEqual(self.client.get(url_mi_pago(self.pedido.pk)).status_code, 401)
        self.assertEqual(self.client.get(url_pago_recibido(self.pedido.pk)).status_code, 401)
        self.anonimo()
        self.assertEqual(self.client.get(url_mi_pago(self.pedido.pk)).status_code, 401)

    def test_no_expone_rutas_fisicas_ni_storage(self):
        self.registrar()
        intento = IntentoPago.objects.get()
        for url, usuario, lado in [
            (url_mi_pago(self.pedido.pk), self.comprador, "mios"),
            (url_pago_recibido(self.pedido.pk), self.artesano, "recibidos"),
        ]:
            self.autenticar(usuario)
            texto = self.client.get(url).content.decode()
            self.assertNotIn(intento.comprobante.name, texto)
            self.assertNotIn(str(settings.PRIVATE_MEDIA_ROOT).replace("\\", "\\\\"), texto)
            self.assertNotIn("/media/", texto)
            comprobante = json.loads(texto)["intentos"][0]["comprobante"]
            self.assertEqual(set(comprobante), {"nombre", "tipo", "tamano", "url"})
            self.assertEqual(
                comprobante["url"],
                f"/pedidos/{lado}/{self.pedido.pk}/pago/intentos/{intento.pk}/comprobante/",
            )


class RevisionTests(PagosAPITestCase):
    def setUp(self):
        super().setUp()
        self.intento = self.intento_vigente(self.registrar())

    def test_confirmar_es_terminal(self):
        respuesta = self.resolver(self.intento, "confirmado")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        datos = respuesta.json()
        self.assertEqual(datos["estado"], "confirmado")
        self.assertIsNotNone(datos["confirmado_en"])
        self.assertEqual(datos["intentos"][0]["resolucion"]["motivo"], "")
        revision = RevisionIntentoPago.objects.get()
        self.assertEqual(revision.revisado_por, self.artesano)
        self.assertIsNone(revision.plazo_hasta)
        for estado, motivo in [
            ("confirmado", None),
            ("observado", "x"),
            ("no_recibido", "x"),
        ]:
            with self.subTest(estado):
                respuesta = self.resolver(self.intento, estado, motivo)
                self.assertEqual(respuesta.status_code, 409)
                self.assertEqual(respuesta.json()["codigo"], "pago_ya_confirmado")
        self.assertEqual(self.registrar().json()["codigo"], "pago_ya_confirmado")
        self.assertEqual(self.corregir(self.intento).json()["codigo"], "pago_ya_confirmado")
        self.assertEqual(IntentoPago.objects.count(), 1)
        self.assertEqual(RevisionIntentoPago.objects.count(), 1)

    def test_confirmar_no_lleva_motivo(self):
        respuesta = self.resolver(self.intento, "confirmado", "Gracias")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("motivo", respuesta.json())
        self.assertFalse(RevisionIntentoPago.objects.exists())

    def test_observado_y_no_recibido_exigen_motivo(self):
        for estado in ("observado", "no_recibido"):
            for motivo in (None, "", "    ", "x" * 1001):
                with self.subTest(estado=estado, motivo=(motivo or "")[:4]):
                    respuesta = self.resolver(self.intento, estado, motivo)
                    self.assertEqual(respuesta.status_code, 400)
                    self.assertIn("motivo", respuesta.json())
        self.assertFalse(RevisionIntentoPago.objects.exists())
        respuesta = self.resolver(self.intento, "observado", f"  {'m' * 1000}  ")
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(RevisionIntentoPago.objects.get().motivo, "m" * 1000)

    def test_estado_invalido(self):
        for estado in ("pendiente", "registrado", "entregado", ""):
            with self.subTest(estado):
                self.assertEqual(self.resolver(self.intento, estado).status_code, 400)

    def test_observado_abre_48_h_para_corregir(self):
        momento = self.pedido.confirmado_en + timedelta(hours=1)
        with reloj(momento):
            respuesta = self.resolver(self.intento, "observado", "Referencia ilegible.")
        datos = respuesta.json()
        self.assertEqual(datos["estado"], "observado")
        resolucion = datos["intentos"][0]["resolucion"]
        self.assertEqual(resolucion["motivo"], "Referencia ilegible.")
        revision = RevisionIntentoPago.objects.get()
        self.assertEqual(revision.revisado_en, momento)
        self.assertEqual(revision.plazo_hasta, momento + timedelta(hours=48))
        self.assertEqual(Pago.objects.get().plazo_hasta, revision.plazo_hasta)
        # Observado se corrige; registrar un intento independiente no corresponde.
        with reloj(momento):
            respuesta = self.registrar()
        self.assertEqual(respuesta.json()["codigo"], "correccion_pendiente")

    def test_no_recibido_abre_48_h_para_un_nuevo_intento(self):
        momento = self.pedido.confirmado_en + timedelta(hours=2)
        with reloj(momento):
            respuesta = self.resolver(self.intento, "no_recibido", "Fondos no acreditados.")
        self.assertEqual(respuesta.json()["estado"], "no_recibido")
        self.assertEqual(RevisionIntentoPago.objects.get().plazo_hasta, momento + PLAZO)
        with reloj(momento):
            respuesta = self.corregir(self.intento)
        self.assertEqual(respuesta.json()["codigo"], "correccion_no_permitida")

    def test_un_intento_se_resuelve_una_sola_vez(self):
        self.resolver(self.intento, "observado", "Captura incompleta.")
        for estado, motivo in [("confirmado", None), ("no_recibido", "x"), ("observado", "y")]:
            with self.subTest(estado):
                respuesta = self.resolver(self.intento, estado, motivo)
                self.assertEqual(respuesta.status_code, 409)
                self.assertEqual(respuesta.json()["codigo"], "intento_ya_resuelto")

    def test_ownership_de_la_resolucion(self):
        respuesta = self.resolver(self.intento, "confirmado", como=self.artesano_ajeno)
        self.assertEqual(respuesta.status_code, 404)
        self.assertEqual(self.resolver(999999, "confirmado").status_code, 404)
        self.autenticar(self.otro_comprador)
        otro = self.intento_vigente(self.registrar(self.pedido_otro_comprador, comprobante=pdf()))
        self.autenticar(self.comprador)
        # Un intento existente pero de otro pedido no se resuelve desde esta URL.
        self.assertEqual(self.resolver(otro, "confirmado").status_code, 404)
        respuesta = self.client.post(
            url_resolver(self.pedido.pk, self.intento),
            {"estado": "confirmado"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(respuesta.status_code, 403, "El comprador no revisa su propio pago")
        self.assertEqual(
            self.resolver(self.intento, "confirmado", como=self.admin).status_code, 401
        )
        self.assertFalse(RevisionIntentoPago.objects.exists())


class PlazosTests(PagosAPITestCase):
    """D-AUD10-19: reloj del servidor; el instante exacto del límite ya está vencido."""

    def test_registro_inicial(self):
        limite = self.pedido.confirmado_en + PLAZO
        for desfase, esperado in [(-UN_SEGUNDO, 201), (timedelta(0), 409), (UN_SEGUNDO, 409)]:
            pedido = confirmar_pedido(
                comprador=self.comprador, artesano=self.artesano, producto=self.producto
            )
            Pedido.objects.filter(pk=pedido.pk).update(confirmado_en=self.pedido.confirmado_en)
            with self.subTest(desfase=desfase), reloj(limite + desfase):
                respuesta = self.registrar(pedido)
                self.assertEqual(respuesta.status_code, esperado, respuesta.content)
                if esperado == 409:
                    self.assertEqual(respuesta.json()["codigo"], "plazo_pago_vencido")
                    lectura = self.client.get(url_mi_pago(pedido.pk)).json()
                    self.assertTrue(lectura["plazo_vencido"])
                    self.assertEqual(lectura["estado"], "pendiente")

    def _resuelto(self, estado, momento):
        pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        with reloj(pedido.confirmado_en):
            intento = self.intento_vigente(self.registrar(pedido))
        with reloj(momento):
            self.resolver(intento, estado, "Motivo", pedido=pedido)
        return pedido, intento

    def test_correccion_de_observado(self):
        momento = self.pedido.confirmado_en + timedelta(hours=10)
        limite = momento + PLAZO
        for desfase, esperado in [(-UN_SEGUNDO, 201), (timedelta(0), 409), (UN_SEGUNDO, 409)]:
            pedido, intento = self._resuelto("observado", momento)
            with self.subTest(desfase=desfase), reloj(limite + desfase):
                respuesta = self.corregir(intento, pedido)
                self.assertEqual(respuesta.status_code, esperado, respuesta.content)
                if esperado == 409:
                    self.assertEqual(respuesta.json()["codigo"], "correccion_fuera_plazo")

    def test_nuevo_intento_tras_no_recibido(self):
        momento = self.pedido.confirmado_en + timedelta(hours=60)  # después del plazo inicial
        limite = momento + PLAZO
        for desfase, esperado in [(-UN_SEGUNDO, 201), (timedelta(0), 409), (UN_SEGUNDO, 409)]:
            pedido, _ = self._resuelto("no_recibido", momento)
            with self.subTest(desfase=desfase), reloj(limite + desfase):
                respuesta = self.registrar(pedido, referencia="TRX-NUEVA")
                self.assertEqual(respuesta.status_code, esperado, respuesta.content)
                if esperado == 409:
                    self.assertEqual(respuesta.json()["codigo"], "nuevo_intento_fuera_plazo")

    def test_revision_pendiente_no_vence(self):
        """Un intento registrado espera al artesano aunque pase el plazo inicial (RN-013)."""
        intento = self.intento_vigente(self.registrar())
        with reloj(self.pedido.confirmado_en + timedelta(days=10)):
            lectura = self.client.get(url_mi_pago(self.pedido.pk)).json()
            self.assertEqual(lectura["estado"], "registrado")
            self.assertTrue(lectura["revision_pendiente"])
            self.assertFalse(lectura["plazo_vencido"])
            self.assertEqual(self.resolver(intento, "confirmado").status_code, 200)


class HistorialTests(PagosAPITestCase):
    def estado_inventario(self):
        return (
            list(InventarioProducto.objects.order_by("pk").values()),
            list(ReservaInventario.objects.order_by("pk").values()),
            MovimientoInventario.objects.count(),
        )

    def descargar(self, intento_id):
        return leer(self.client.get(url_mi_comprobante(self.pedido.pk, intento_id)))

    def test_observado_correccion_confirmado(self):
        inventario = self.estado_inventario()
        pedido = Pedido.objects.filter(pk=self.pedido.pk).values().get()
        primero = imagen("JPEG")
        contenido_1 = primero.read()
        primero.seek(0)
        i1 = self.intento_vigente(self.registrar(comprobante=primero, referencia="ABC123"))
        self.resolver(i1, "observado", "Referencia ilegible.")
        respuesta = self.corregir(i1, referencia="ABC123", comprobante=pdf("comprobante-2.pdf"))
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        i2 = self.intento_vigente(respuesta)
        self.assertEqual(self.resolver(i2, "confirmado").json()["estado"], "confirmado")

        intentos = self.client.get(url_mi_pago(self.pedido.pk)).json()["intentos"]
        self.assertEqual([i["numero"] for i in intentos], [1, 2])
        self.assertEqual(intentos[0]["resolucion"]["estado"], "observado")
        self.assertEqual(intentos[0]["resolucion"]["motivo"], "Referencia ilegible.")
        self.assertEqual(intentos[0]["comprobante"]["tipo"], "image/jpeg")
        self.assertEqual((intentos[1]["origen"], intentos[1]["intento_previo"]), ("correccion", i1))
        self.assertEqual(intentos[1]["resolucion"]["estado"], "confirmado")
        self.assertEqual(self.descargar(i1), contenido_1)
        self.assertEqual(self.descargar(i2), bytes_pdf())
        # Ni el inventario ni el snapshot del pedido cambian por el pago (RN-015, AUD-07).
        self.assertEqual(self.estado_inventario(), inventario)
        self.assertEqual(Pedido.objects.filter(pk=self.pedido.pk).values().get(), pedido)

    def test_no_recibido_nuevo_intento_confirmado(self):
        inventario = self.estado_inventario()
        i1 = self.intento_vigente(self.registrar(referencia="XYZ999", comprobante=pdf()))
        self.resolver(i1, "no_recibido", "Los fondos no aparecen acreditados.")
        lectura = self.client.get(url_mi_pago(self.pedido.pk)).json()
        self.assertEqual(lectura["estado"], "no_recibido")
        self.assertIsNotNone(lectura["registrable_hasta"])
        respuesta = self.registrar(referencia="XYZ1000", comprobante=imagen("WEBP"))
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        i2 = self.intento_vigente(respuesta)
        self.resolver(i2, "confirmado")
        intentos = self.client.get(url_mi_pago(self.pedido.pk)).json()["intentos"]
        self.assertEqual(
            [(i["origen"], i["referencia"], i["resolucion"]["estado"]) for i in intentos],
            [
                ("inicial", "XYZ999", "no_recibido"),
                ("nuevo_tras_no_recibido", "XYZ1000", "confirmado"),
            ],
        )
        self.assertEqual(intentos[1]["intento_previo"], i1)
        self.assertEqual(self.descargar(i1), bytes_pdf())
        self.assertEqual(self.estado_inventario(), inventario)

    def test_sin_limite_numerico_de_intentos(self):
        anterior = self.intento_vigente(self.registrar())
        for numero in range(2, 7):
            self.resolver(anterior, "observado" if numero % 2 else "no_recibido", "Revisar")
            respuesta = (
                self.corregir(anterior)
                if numero % 2
                else self.registrar(referencia=f"TRX-{numero}")
            )
            self.assertEqual(respuesta.status_code, 201, respuesta.content)
            anterior = self.intento_vigente(respuesta)
        self.assertEqual(IntentoPago.objects.count(), 6)
        self.assertEqual(
            list(IntentoPago.objects.values_list("numero", flat=True)), [1, 2, 3, 4, 5, 6]
        )

    def test_solo_el_intento_observado_vigente_se_corrige(self):
        i1 = self.intento_vigente(self.registrar())
        self.resolver(i1, "observado", "Ilegible")
        i2 = self.intento_vigente(self.corregir(i1))
        self.resolver(i2, "observado", "Sigue ilegible")
        respuesta = self.corregir(i1)
        self.assertEqual(respuesta.json()["codigo"], "correccion_no_permitida")
        self.assertEqual(self.corregir(i2).status_code, 201)
        self.assertEqual(self.corregir(999999).status_code, 404)

    def test_historial_append_only(self):
        i1 = self.intento_vigente(self.registrar())
        self.resolver(i1, "observado", "Ilegible")
        intento, revision, pago = (
            IntentoPago.objects.get(),
            RevisionIntentoPago.objects.get(),
            Pago.objects.get(),
        )
        intento.referencia = "EDITADA"
        for accion in (intento.save, intento.delete, revision.save, revision.delete, pago.delete):
            with self.subTest(accion.__qualname__), self.assertRaises(ValidationError):
                accion()
        self.assertEqual(IntentoPago.objects.get().referencia, "TRX-123456")


class PrivacidadComprobanteTests(PagosAPITestCase):
    def setUp(self):
        super().setUp()
        self.contenido = bytes_pdf(relleno=50)
        self.intento = self.intento_vigente(
            self.registrar(
                comprobante=archivo(self.contenido, "Mi pago Ana.pdf", "application/pdf")
            )
        )
        self.mio = url_mi_comprobante(self.pedido.pk, self.intento)
        self.recibido = url_comprobante_recibido(self.pedido.pk, self.intento)

    def test_comprador_y_artesano_del_pedido_descargan_el_binario(self):
        for usuario, url in [(self.comprador, self.mio), (self.artesano, self.recibido)]:
            with self.subTest(usuario.rol):
                self.autenticar(usuario)
                respuesta = self.client.get(url, HTTP_ACCEPT="application/pdf")
                self.assertEqual(respuesta.status_code, 200)
                self.assertEqual(leer(respuesta), self.contenido)
                self.assertEqual(respuesta["Content-Type"], "application/pdf")
                self.assertEqual(respuesta["X-Content-Type-Options"], "nosniff")
                self.assertIn("no-store", respuesta["Cache-Control"])
                self.assertEqual(
                    respuesta["Content-Disposition"],
                    f'attachment; filename="comprobante-pedido-{self.pedido.pk}-intento-1.pdf"',
                )

    def test_terceros_no_acceden(self):
        casos = [
            (self.otro_comprador, self.mio, 404),
            (self.artesano_ajeno, self.recibido, 404),
            (self.admin, self.mio, 401),
            (self.admin, self.recibido, 401),
            (self.artesano, self.mio, 403),
            (self.comprador, self.recibido, 403),
        ]
        for usuario, url, esperado in casos:
            with self.subTest(usuario=usuario.nombre, url=url):
                self.autenticar(usuario)
                respuesta = self.client.get(url)
                self.assertEqual(respuesta.status_code, esperado)
                self.assertNotIn(self.contenido, respuesta.content)
        self.anonimo()
        self.assertEqual(self.client.get(self.mio).status_code, 401)
        self.assertEqual(self.client.get(self.recibido).status_code, 401)

    def test_superusuario_administrador_tampoco(self):
        self.admin.is_superuser = True
        self.admin.save(update_fields=["is_superuser"])
        self.autenticar(self.admin)
        self.assertEqual(self.client.get(self.mio).status_code, 401)
        self.assertEqual(self.client.get(self.recibido).status_code, 401)

    def test_otro_rol_autenticado_sin_acceso(self):
        # Un rol público distinto (403) nunca recibe el binario, aunque conozca la URL.
        self.autenticar(self.artesano_ajeno)
        respuesta = self.client.get(self.mio)
        self.assertEqual(respuesta.status_code, 403)
        self.assertNotIn(self.contenido, respuesta.content)

    def test_intento_de_otro_pedido_por_la_url_propia(self):
        otro = self.intento_vigente(
            self.registrar(self.pedido_taller_ajeno, comprobante=pdf("otro.pdf"))
        )
        self.assertEqual(self.client.get(url_mi_comprobante(self.pedido.pk, otro)).status_code, 404)
        self.autenticar(self.artesano)
        self.assertEqual(
            self.client.get(
                url_comprobante_recibido(self.pedido_taller_ajeno.pk, otro)
            ).status_code,
            404,
        )

    def test_no_hay_ruta_publica_al_archivo(self):
        nombre = IntentoPago.objects.get(pk=self.intento).comprobante.name
        self.assertNotIn("Ana", nombre)
        self.assertFalse((Path(settings.MEDIA_ROOT) / nombre).exists())
        self.assertTrue((Path(settings.PRIVATE_MEDIA_ROOT) / nombre).exists())
        self.anonimo()
        self.assertEqual(self.client.get(f"{settings.MEDIA_URL}{nombre}").status_code, 404)

    def test_archivo_ausente_responde_404(self):
        intento = IntentoPago.objects.get(pk=self.intento)
        intento.comprobante.storage.delete(intento.comprobante.name)
        with self.assertLogs("apps.pagos.api.views", "ERROR"):
            self.assertEqual(self.client.get(self.mio).status_code, 404)


class IdempotenciaTests(PagosAPITestCase):
    def test_misma_clave_mismo_archivo_y_cuerpo_repite(self):
        clave = str(uuid4())
        antes = archivos_privados()
        primera = self.registrar(clave=clave, comprobante=pdf())
        repetida = self.registrar(
            clave=clave, comprobante=pdf("otro-nombre.pdf"), referencia=" TRX-123456 "
        )
        self.assertEqual(primera.status_code, 201)
        self.assertEqual(repetida.status_code, 201)
        self.assertEqual(repetida["Idempotency-Replayed"], "true")
        self.assertEqual(primera.json()["intentos"], repetida.json()["intentos"])
        self.assertEqual(IntentoPago.objects.count(), 1)
        self.assertEqual(len(archivos_privados()) - len(antes), 1)
        recuperada = self.client.get(f"/api/v1/operaciones/registrar_intento_pago/{clave}/")
        self.assertEqual(
            recuperada.json()["recurso"],
            {"tipo": "intentopago", "id": IntentoPago.objects.get().pk},
        )

    def test_misma_clave_con_otro_archivo_u_otra_referencia_es_conflicto(self):
        clave = str(uuid4())
        self.registrar(clave=clave, comprobante=pdf("pago.pdf"))
        otro_pdf = archivo(bytes_pdf(relleno=7), "pago.pdf", "application/pdf")
        for nombre, respuesta in [
            ("archivo", self.registrar(clave=clave, comprobante=otro_pdf)),
            (
                "referencia",
                self.registrar(clave=clave, comprobante=pdf("pago.pdf"), referencia="OTRA"),
            ),
            ("método", self.registrar(clave=clave, comprobante=pdf("pago.pdf"), metodo="otro")),
        ]:
            with self.subTest(nombre):
                self.assertEqual(respuesta.status_code, 409)
                self.assertEqual(respuesta.json()["codigo"], "clave_idempotencia_reutilizada")
        self.assertEqual(IntentoPago.objects.count(), 1)

    def test_misma_clave_en_otro_pedido_es_conflicto(self):
        clave = str(uuid4())
        self.registrar(clave=clave, comprobante=pdf())
        respuesta = self.registrar(self.pedido_taller_ajeno, clave=clave, comprobante=pdf())
        self.assertEqual(respuesta.json()["codigo"], "clave_idempotencia_reutilizada")

    def test_clave_obligatoria(self):
        respuesta = self.client.post(
            url_intentos(self.pedido.pk),
            {"metodo": "transferencia", "referencia": "X", "comprobante": pdf()},
            format="multipart",
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("Idempotency-Key", respuesta.json())
        self.assertFalse(Pago.objects.exists())

    def test_correccion_y_resolucion_repetidas_no_duplican(self):
        i1 = self.intento_vigente(self.registrar())
        clave_r = str(uuid4())
        self.resolver(i1, "observado", " Ilegible ", clave=clave_r)
        repetida = self.resolver(i1, "observado", "Ilegible", clave=clave_r)
        self.assertEqual(repetida.status_code, 200)
        self.assertEqual(repetida["Idempotency-Replayed"], "true")
        self.assertEqual(RevisionIntentoPago.objects.count(), 1)
        distinta = self.resolver(i1, "observado", "Otro motivo", clave=clave_r)
        self.assertEqual(distinta.json()["codigo"], "clave_idempotencia_reutilizada")

        clave_c = str(uuid4())
        self.assertEqual(self.corregir(i1, clave=clave_c).status_code, 201)
        repetida = self.corregir(i1, clave=clave_c)
        self.assertEqual(repetida.status_code, 201)
        self.assertEqual(repetida["Idempotency-Replayed"], "true")
        self.assertEqual(IntentoPago.objects.count(), 2)

        i2 = IntentoPago.objects.get(numero=2).pk
        clave_c2 = str(uuid4())
        self.resolver(i2, "confirmado", clave=clave_c2)
        # Retry tras respuesta perdida: el artesano repite y obtiene la misma resolución.
        repetida = self.resolver(i2, "confirmado", clave=clave_c2)
        self.assertEqual((repetida.status_code, repetida["Idempotency-Replayed"]), (200, "true"))
        self.assertEqual(RevisionIntentoPago.objects.count(), 2)
        self.assertEqual(
            set(OperacionIdempotente.objects.values_list("tipo", flat=True)),
            {
                TipoOperacion.REGISTRAR_INTENTO_PAGO,
                TipoOperacion.CORREGIR_INTENTO_PAGO,
                TipoOperacion.RESOLVER_INTENTO_PAGO,
            },
        )

    def test_conflicto_de_negocio_no_deja_registro_idempotente(self):
        self.registrar()
        clave = str(uuid4())
        self.assertEqual(self.registrar(clave=clave).status_code, 409)
        self.assertFalse(OperacionIdempotente.objects.filter(clave=clave).exists())


class ConsistenciaTests(PagosAPITestCase):
    def test_un_pago_por_pedido_y_numeros_unicos(self):
        self.registrar()
        pago = Pago.objects.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Pago.objects.create(
                pedido=self.pedido, estado=EstadoPago.REGISTRADO, total=self.pedido.total
            )
        intento = IntentoPago.objects.get()
        duplicado = IntentoPago(
            pago=pago,
            numero=1,
            origen=OrigenIntento.INICIAL,
            metodo="otro",
            referencia="X",
            comprobante=intento.comprobante.name,
            comprobante_nombre="x.pdf",
            comprobante_tipo="application/pdf",
            comprobante_tamano=1,
            comprobante_sha256="0" * 64,
            registrado_por=self.comprador,
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            duplicado.save()

    def test_checks_de_estado_y_revision(self):
        self.registrar()
        pago, intento = Pago.objects.get(), IntentoPago.objects.get()
        for cambios in [
            {"estado": EstadoPago.PENDIENTE},
            {"estado": EstadoPago.OBSERVADO},  # sin plazo
            {"estado": EstadoPago.CONFIRMADO},  # sin confirmado_en
            {"total": -1},
        ]:
            with self.subTest(cambios), self.assertRaises(IntegrityError), transaction.atomic():
                Pago.objects.filter(pk=pago.pk).update(**cambios)
        for datos in [
            {"resultado": "observado", "motivo": ""},
            {"resultado": "observado", "motivo": "x"},  # sin plazo
            {"resultado": "confirmado", "motivo": "x"},
        ]:
            with self.subTest(datos), self.assertRaises(IntegrityError), transaction.atomic():
                RevisionIntentoPago.objects.create(
                    intento=intento, revisado_por=self.artesano, **datos
                )

    def test_fallo_de_base_de_datos_limpia_el_archivo_nuevo(self):
        antes = archivos_privados()
        with mock.patch.object(Pago, "save", side_effect=IntegrityError("simulado")):
            with self.assertRaises(IntegrityError):
                self.registrar()
        self.assertEqual(archivos_privados(), antes)
        self.assertFalse(IntentoPago.objects.exists())


class EsquemaPagosTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.esquema = SchemaGenerator().get_schema(request=None, public=True)

    def test_rutas_y_contrato(self):
        rutas = self.esquema["paths"]
        registro = rutas["/api/v1/pedidos/mios/{pedido_id}/pago/intentos/"]["post"]
        self.assertEqual(list(registro["requestBody"]["content"]), ["multipart/form-data"])
        esquema = registro["requestBody"]["content"]["multipart/form-data"]["schema"]["$ref"]
        entrada = self.esquema["components"]["schemas"][esquema.rpartition("/")[2]]
        self.assertEqual(set(entrada["properties"]), {"metodo", "referencia", "comprobante"})
        self.assertEqual(registro["tags"], ["Pagos"])
        self.assertIn("Idempotency-Key", [p["name"] for p in registro["parameters"]])
        resolver = rutas[
            "/api/v1/pedidos/recibidos/{pedido_id}/pago/intentos/{intento_id}/resolver/"
        ]
        self.assertTrue(
            {"200", "400", "401", "403", "404", "409"} <= set(resolver["post"]["responses"])
        )
        codigos = self.esquema["components"]["schemas"]["CodigoConflictoPagoEnum"]["enum"]
        self.assertIn("pago_ya_confirmado", codigos)
        self.assertIn("clave_idempotencia_reutilizada", codigos)
        self.assertEqual(
            self.esquema["components"]["schemas"]["EstadoPagoEnum"]["enum"],
            ["pendiente", "registrado", "observado", "confirmado", "no_recibido"],
        )
