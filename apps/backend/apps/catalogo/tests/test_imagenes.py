"""RF-001 / RNF-004/005: archivos reales en media temporal, sin fixtures binarias."""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from django.test import override_settings

from apps.accounts.tests.base import crear_usuario
from apps.catalogo import services
from apps.catalogo.models import Producto

from .base import (
    URL_MIS_PRODUCTOS,
    CatalogoAPITestCase,
    crear_producto,
    cuerpo_producto,
    imagen_prueba,
    url_despublicar,
    url_mi_producto,
    url_producto,
    url_publicar,
)


class FotografiaTests(CatalogoAPITestCase):
    def setUp(self):
        super().setUp()
        self.temporal = TemporaryDirectory(prefix="dr01-")
        self.addCleanup(self.temporal.cleanup)
        configuracion = override_settings(MEDIA_ROOT=self.temporal.name)
        configuracion.enable()
        self.addCleanup(configuracion.disable)
        self.autenticar(self.artesano)

    def crear(self, archivo):
        return self.client.post(
            URL_MIS_PRODUCTOS,
            cuerpo_producto(fotografia_principal=archivo),
            format="multipart",
        )

    def producto_con_foto(self):
        respuesta = self.crear(imagen_prueba())
        self.assertEqual(respuesta.status_code, 201, respuesta.content)
        return Producto.objects.get(pk=respuesta.json()["id"])

    def test_formatos_reales_y_nombre_canonico_independiente_del_cliente(self):
        for formato, extension in (("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp")):
            with self.subTest(formato=formato):
                # Extensión y MIME falsos: se decide por los bytes decodificados.
                respuesta = self.crear(imagen_prueba(formato, "foto.php.jpg"))
                self.assertEqual(respuesta.status_code, 201, respuesta.content)
                producto = Producto.objects.get(pk=respuesta.json()["id"])
                foto = producto.fotografia_principal
                self.assertRegex(
                    foto.name, rf"^productos/[a-f0-9]{{32}}/principal/[a-f0-9]{{32}}\.{extension}$"
                )
                self.assertTrue(Path(foto.path).is_file())
                referencia = Producto.objects.values_list("fotografia_principal", flat=True).get(
                    pk=producto.pk
                )
                self.assertEqual(referencia, foto.name)
                self.assertLess(len(referencia), 200)
                self.assertEqual(respuesta.json()["fotografia_url"], foto.url)
                self.assertTrue(foto.url.startswith("/media/productos/"))
                self.assertNotIn(self.temporal.name, foto.url)

    def test_rechaza_gif_svg_bmp_tiff_pdf_ejecutable_y_corruptos(self):
        archivos = [imagen_prueba(f) for f in ("GIF", "BMP", "TIFF")]
        for contenido in (
            b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
            b"%PDF-1.7",
            b"MZ executable",
            b"no soy jpg",
            b"\x89PNG\r\n\x1a\ncorrupto",
        ):
            archivos.append(SimpleUploadedFile("inocente.jpg", contenido, "image/jpeg"))
        archivos.append(
            SimpleUploadedFile("truncada.png", imagen_prueba().read()[:40], "image/png")
        )
        for archivo in archivos:
            with self.subTest(nombre=archivo.name, contenido=archivo.read()[:12]):
                archivo.seek(0)
                respuesta = self.crear(archivo)
                self.assertEqual(respuesta.status_code, 400, respuesta.content)
                self.assertIn("fotografia_principal", respuesta.json())
        self.assertFalse(Producto.objects.exists())
        self.assertEqual(list(Path(self.temporal.name).rglob("*")), [])

    def test_rechaza_mas_de_5_mib_y_admite_limite_exacto(self):
        contenido = imagen_prueba().read()
        limite = 5 * 1024 * 1024
        respuesta = self.crear(
            SimpleUploadedFile("a.png", contenido + b"0" * (limite + 1 - len(contenido)))
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(
            respuesta.json()["fotografia_principal"], ["El archivo no puede superar 5 MiB."]
        )
        respuesta = self.crear(
            SimpleUploadedFile("a.png", contenido + b"0" * (limite - len(contenido)))
        )
        self.assertEqual(respuesta.status_code, 201, respuesta.content)

    def test_editar_conserva_y_reemplazar_elimina_solo_despues_del_commit(self):
        producto = self.producto_con_foto()
        anterior = producto.fotografia_principal.path
        respuesta = self.client.patch(url_mi_producto(producto.pk), {"precio": "123.45"})
        self.assertEqual(respuesta.status_code, 200)
        producto.refresh_from_db()
        self.assertEqual(producto.fotografia_principal.path, anterior)
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            respuesta = self.client.patch(
                url_mi_producto(producto.pk),
                {"fotografia_principal": imagen_prueba("WEBP")},
                format="multipart",
            )
            self.assertEqual(respuesta.status_code, 200, respuesta.content)
            self.assertTrue(Path(anterior).exists())
        self.assertEqual(len(callbacks), 1)
        producto.refresh_from_db()
        self.assertFalse(Path(anterior).exists())
        self.assertTrue(Path(producto.fotografia_principal.path).exists())

    def test_reemplazo_invalido_y_fallo_sql_conservan_anterior(self):
        producto = self.producto_con_foto()
        anterior = producto.fotografia_principal.path
        respuesta = self.client.patch(
            url_mi_producto(producto.pk),
            {"fotografia_principal": SimpleUploadedFile("x.jpg", b"invalida")},
            format="multipart",
        )
        self.assertEqual(respuesta.status_code, 400)
        # El INSERT/UPDATE falla después de que ImageField escribió el archivo nuevo.
        with patch.object(Producto, "_save_table", side_effect=DatabaseError("fallo simulado")):
            with self.assertRaises(DatabaseError):
                services.actualizar_producto(producto, fotografia_principal=imagen_prueba())
        producto.refresh_from_db()
        self.assertEqual(producto.fotografia_principal.path, anterior)
        self.assertTrue(Path(anterior).exists())
        self.assertEqual(len([p for p in Path(self.temporal.name).rglob("*") if p.is_file()]), 1)

    def test_publicacion_foto_obligatoria_y_despublicacion_conserva_archivo(self):
        producto = crear_producto(self.taller, self.categoria)
        respuesta = self.client.post(url_publicar(producto.pk))
        self.assertEqual(respuesta.status_code, 409)
        self.assertEqual(respuesta.json()["codigo"], "producto_sin_fotografia")
        producto = self.producto_con_foto()
        self.assertEqual(self.client.post(url_publicar(producto.pk)).status_code, 200)
        respuesta = self.client.get(url_producto(producto.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()["fotografia_url"], producto.fotografia_principal.url)
        respuesta = self.client.patch(
            url_mi_producto(producto.pk), {"fotografia_principal": None}, format="json"
        )
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(self.client.post(url_despublicar(producto.pk)).status_code, 200)
        self.assertTrue(Path(producto.fotografia_principal.path).exists())
        self.assertEqual(self.client.get(url_producto(producto.pk)).status_code, 404)
        with self.captureOnCommitCallbacks(execute=True):
            respuesta = self.client.patch(
                url_mi_producto(producto.pk), {"fotografia_principal": None}, format="json"
            )
        self.assertEqual(respuesta.status_code, 200)
        self.assertFalse(Path(producto.fotografia_principal.path).exists())

    def test_historico_sin_foto_es_legible_pero_no_republicable(self):
        producto = crear_producto(self.taller, self.categoria, publicado=True)
        respuesta = self.client.get(url_producto(producto.pk))
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(respuesta.json()["fotografia_url"])
        self.assertEqual(self.client.post(url_publicar(producto.pk)).status_code, 409)

    def test_no_acepta_rutas_arbitrarias(self):
        producto = self.producto_con_foto()
        for valor in ("/etc/passwd", "../../foto.jpg", "data:image/png;base64,abc"):
            respuesta = self.client.patch(
                url_mi_producto(producto.pk), {"fotografia_principal": valor}, format="json"
            )
            self.assertEqual(respuesta.status_code, 400)

    def test_ownership_y_rol_no_pueden_reemplazar(self):
        producto = self.producto_con_foto()
        nombre = producto.fotografia_principal.name
        for usuario, codigo in (
            (self.artesano_ajeno, 404),
            (crear_usuario("86666666"), 403),
            (self.admin, 401),
        ):
            self.autenticar(usuario)
            respuesta = self.client.patch(
                url_mi_producto(producto.pk),
                {"fotografia_principal": imagen_prueba()},
                format="multipart",
            )
            self.assertEqual(respuesta.status_code, codigo, respuesta.content)
        producto.refresh_from_db()
        self.assertEqual(producto.fotografia_principal.name, nombre)
