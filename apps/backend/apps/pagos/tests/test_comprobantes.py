"""D-AUD10-04/05: whitelist por contenido, límites y nombre/ruta generados por el servidor."""

from io import BytesIO
from unittest import mock

from django.core.exceptions import SuspiciousFileOperation, ValidationError
from django.test import SimpleTestCase
from PIL import Image
from pypdf import PdfWriter

from apps.pagos import comprobantes
from apps.pagos.comprobantes import (
    EXTENSIONES_PERMITIDAS,
    MAX_BYTES,
    MIME_PERMITIDOS,
    almacenamiento_privado,
    nombre_visible,
    ruta_comprobante,
    validar_comprobante,
)

from .base import archivo, bytes_imagen, bytes_pdf, bytes_pdf_de_tamano, imagen, pdf


class WhitelistTests(SimpleTestCase):
    def assertRechaza(self, subido, codigo):
        with self.assertRaises(ValidationError) as ctx:
            validar_comprobante(subido)
        self.assertEqual(ctx.exception.code, codigo, ctx.exception.messages)

    def test_whitelist_central_exacta(self):
        self.assertEqual(EXTENSIONES_PERMITIDAS, ("jpeg", "jpg", "pdf", "png", "webp"))
        self.assertEqual(
            set(MIME_PERMITIDOS), {"image/jpeg", "image/png", "image/webp", "application/pdf"}
        )
        self.assertEqual(MAX_BYTES, 10 * 1024 * 1024)

    def test_formatos_validos_detectados_por_contenido(self):
        casos = [
            (imagen("JPEG"), "image/jpeg", "jpg"),
            (imagen("JPEG", nombre="pago.JPEG"), "image/jpeg", "jpg"),
            (imagen("PNG"), "image/png", "png"),
            (imagen("WEBP"), "image/webp", "webp"),
            (pdf(), "application/pdf", "pdf"),
        ]
        for subido, mime, extension in casos:
            with self.subTest(subido.name):
                validado = validar_comprobante(subido)
                self.assertEqual((validado.mime, validado.extension), (mime, extension))
                self.assertEqual(len(validado.sha256), 64)
                self.assertEqual(validado.tamano, subido.size)

    def test_mime_ausente_o_generico_no_contradice(self):
        for tipo in ("", "application/octet-stream"):
            with self.subTest(tipo):
                self.assertEqual(validar_comprobante(pdf(tipo=tipo)).mime, "application/pdf")

    def test_formatos_peligrosos_o_fuera_de_whitelist(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        html = b"<!doctype html><script>alert(1)</script>"
        for nombre, contenido, tipo in [
            ("pago.svg", svg, "image/svg+xml"),
            ("pago.html", html, "text/html"),
            ("pago.htm", html, "text/html"),
            ("virus.exe", b"MZ\x90\x00\x03", "application/octet-stream"),
            ("pago.js", b"alert(1)", "text/javascript"),
            ("pago.php", b"<?php echo 1; ?>", "application/x-php"),
            ("pago.sh", b"#!/bin/sh\n", "application/x-sh"),
            ("pago.bat", b"@echo off", "application/x-bat"),
            ("pago.zip", b"PK\x03\x04", "application/zip"),
            ("pago.rar", b"Rar!\x1a\x07", "application/vnd.rar"),
            ("pago.doc", b"\xd0\xcf\x11\xe0", "application/msword"),
            ("pago.docx", b"PK\x03\x04", "application/vnd.openxmlformats"),
            ("pago.gif", bytes_imagen("GIF"), "image/gif"),
            ("pago.tiff", bytes_imagen("TIFF"), "image/tiff"),
            ("pago.heic", b"\x00\x00\x00\x18ftypheic", "image/heic"),
            ("sin_extension", bytes_imagen("PNG"), "image/png"),
        ]:
            with self.subTest(nombre):
                self.assertRechaza(archivo(contenido, nombre, tipo), "comprobante_formato_invalido")

    def test_contenido_no_permitido_con_extension_permitida(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        for nombre, contenido, tipo in [
            ("pago.jpg", b"MZ\x90\x00" + b"\x00" * 64, "image/jpeg"),  # exe renombrado
            ("pago.png", svg, "image/png"),
            ("pago.pdf", b"<!doctype html><p>hola</p>", "application/pdf"),
            ("pago.webp", bytes_imagen("GIF"), "image/webp"),
        ]:
            with self.subTest(nombre):
                self.assertRechaza(archivo(contenido, nombre, tipo), "comprobante_formato_invalido")

    def test_extension_mime_y_contenido_deben_coincidir(self):
        casos = [
            archivo(bytes_imagen("PNG"), "pago.jpg", "image/jpeg"),  # PNG con extensión JPG
            archivo(bytes_pdf(), "pago.png", "image/png"),  # PDF con extensión de imagen
            archivo(bytes_imagen("PNG"), "pago.png", "image/jpeg"),  # MIME declarado distinto
            archivo(bytes_imagen("JPEG"), "pago.jpg", "application/pdf"),
        ]
        for subido in casos:
            with self.subTest(subido.name, tipo=subido.content_type):
                self.assertRechaza(subido, "comprobante_inconsistente")

    def test_archivos_corruptos(self):
        jpeg = bytes_imagen("JPEG", tamano=(200, 200))
        png = bytes_imagen("PNG", tamano=(200, 200), color="blue")
        for subido in [
            archivo(jpeg[: len(jpeg) // 2], "pago.jpg", "image/jpeg"),
            archivo(png[:-40], "pago.png", "image/png"),
            archivo(b"%PDF-1.4\n1 0 obj\n<<>>\n", "pago.pdf", "application/pdf"),  # sin cola
            archivo(b"%PDF-x\n" + bytes_pdf()[8:], "pago.pdf", "application/pdf"),
        ]:
            with self.subTest(subido.name):
                self.assertRechaza(subido, "comprobante_corrupto")

    def test_pdf_estructuralmente_invalido_aunque_tenga_los_marcadores(self):
        """El parser real rechaza lo que el filtro de marcadores dejaría pasar."""
        real = bytes_pdf()
        self.assertTrue(real.startswith(b"%PDF-1."))
        tabla = real.index(b"xref")
        cola = real.rindex(b"startxref")
        primer_objeto = real.index(b"0000000015 00000 n")
        casos = {
            "solo marcadores": b"%PDF-1.4\nstartxref\n0\n%%EOF\n",
            "catálogo sin xref": (
                b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
                b"trailer\n<< /Root 1 0 R >>\nstartxref\n9\n%%EOF\n"
            ),
            "truncado en medio": real[:80] + real[-120:],
            "xref ilegible": real[: tabla + 5] + b"zz basura" + real[tabla + 14 :],
            "startxref erróneo": real[:cola] + b"startxref\n12\n%%EOF\n",
            "offset de objeto erróneo": real[:primer_objeto]
            + b"0000000016 00000 n"
            + real[primer_objeto + 18 :],
        }
        for nombre, contenido in casos.items():
            with self.subTest(nombre):
                for marcador in (b"%PDF-", b"startxref", b"%%EOF"):
                    self.assertIn(marcador, contenido)
                self.assertRechaza(
                    archivo(contenido, "pago.pdf", "application/pdf"), "comprobante_corrupto"
                )

    def test_pdf_protegido_con_contrasena(self):
        def cifrado(contrasena):
            escritor = PdfWriter()
            escritor.add_blank_page(200, 200)
            escritor.encrypt(user_password=contrasena, owner_password="dueno", algorithm="RC4-128")
            salida = BytesIO()
            escritor.write(salida)
            return archivo(salida.getvalue(), "pago.pdf", "application/pdf")

        self.assertRechaza(cifrado("secreta"), "comprobante_protegido")
        # Cifrado sin contraseña de apertura: el artesano puede abrirlo.
        self.assertEqual(validar_comprobante(cifrado("")).mime, "application/pdf")

    def test_vacio_y_tamano_maximo(self):
        self.assertRechaza(archivo(b"", "pago.pdf", "application/pdf"), "comprobante_vacio")
        limite = archivo(bytes_pdf_de_tamano(MAX_BYTES), "pago.pdf", "application/pdf")
        self.assertEqual(limite.size, MAX_BYTES)
        self.assertEqual(validar_comprobante(limite).tamano, MAX_BYTES)
        excedido = archivo(bytes_pdf_de_tamano(MAX_BYTES + 1), "pago.pdf", "application/pdf")
        self.assertRechaza(excedido, "comprobante_demasiado_grande")

    def test_imagen_animada_rechazada(self):
        contenido = BytesIO()
        cuadros = [Image.new("RGB", (4, 4), c) for c in ("red", "blue")]
        cuadros[0].save(contenido, format="WEBP", save_all=True, append_images=cuadros[1:])
        self.assertRechaza(
            archivo(contenido.getvalue(), "pago.webp", "image/webp"), "comprobante_animado"
        )

    def test_limite_tecnico_de_pixeles(self):
        with mock.patch.object(comprobantes, "MAX_PIXELES", 10):
            self.assertRechaza(imagen("PNG"), "comprobante_excede_pixeles")

    def test_nombre_visible_saneado(self):
        self.assertEqual(nombre_visible("../../etc/passwd.pdf", "pdf"), "passwd.pdf")
        self.assertEqual(nombre_visible("C:\\fakepath\\pago.png", "png"), "pago.png")
        self.assertEqual(nombre_visible("pa\u202ego\x00.pdf", "pdf"), "pago.pdf")
        self.assertEqual(nombre_visible("   ", "jpg"), "comprobante.jpg")
        largo = nombre_visible("a" * 300 + ".pdf", "pdf")
        self.assertLessEqual(len(largo), comprobantes.MAX_NOMBRE)
        self.assertTrue(largo.endswith(".pdf"))

    def test_ruta_generada_sin_nombre_original(self):
        class Intento:
            extension_validada = "pdf"

        ruta = ruta_comprobante(Intento(), "../../pago de Ana.pdf")
        self.assertRegex(ruta, r"^pagos/[0-9a-f]{32}/[0-9a-f]{32}\.pdf$")
        Intento.extension_validada = "exe"
        with self.assertRaises(ValidationError):
            ruta_comprobante(Intento(), "virus.exe")

    def test_storage_privado_sin_url_publica(self):
        storage = almacenamiento_privado()
        with self.assertRaises(SuspiciousFileOperation):
            storage.url("pagos/x/y.pdf")
        with self.assertRaises(SuspiciousFileOperation):
            storage.path("../fuera.pdf")
