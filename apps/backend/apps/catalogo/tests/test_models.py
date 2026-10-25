"""Integridad del catálogo en PostgreSQL y reglas de los servicios (RN-002, RN-003, RN-004)."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from apps.catalogo import services
from apps.catalogo.models import Categoria, Producto
from apps.talleres import services as servicios_taller
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

from .base import crear_categoria, crear_producto, datos_producto, imagen_prueba


class CatalogoModelTestCase(TestCase):
    def setUp(self):
        self.categoria = crear_categoria()
        self.taller = crear_artesano_con_taller()
        servicios_taller.aprobar_taller(self.taller, revisor=crear_administrador())


class RestriccionesDeProductoTests(CatalogoModelTestCase):
    """PostgreSQL rechaza lo que la API ya valida, aunque se escriba sin pasar por ella."""

    def insertar(self, **cambios):
        datos = datos_producto(self.categoria, permite_stock=False) | cambios
        with transaction.atomic():
            Producto.objects.create(taller=self.taller, **datos)

    def test_rechaza_un_producto_sin_modalidades(self):
        with self.assertRaisesMessage(IntegrityError, "producto_al_menos_una_modalidad"):
            self.insertar()

    def test_admite_cada_combinacion_de_modalidades(self):
        combinaciones = [
            (s, p, c)
            for s in (False, True)
            for p in (False, True)
            for c in (False, True)
            if s or p or c
        ]
        for s, p, c in combinaciones:
            self.insertar(permite_stock=s, permite_produccion=p, permite_personalizacion=c)
        self.assertEqual(Producto.objects.count(), 7)

    def test_rechaza_precio_cero_o_negativo(self):
        for precio in (Decimal("0"), Decimal("-1")):
            with self.subTest(precio=precio):
                with self.assertRaisesMessage(IntegrityError, "producto_precio_positivo"):
                    self.insertar(permite_stock=True, precio=precio)

    def test_rechaza_nombre_o_descripcion_en_blanco(self):
        for campo in ("nombre", "descripcion"):
            with self.subTest(campo=campo):
                with self.assertRaisesMessage(IntegrityError, "producto_datos_minimos"):
                    self.insertar(permite_stock=True, **{campo: "   "})

    def test_el_precio_se_guarda_como_decimal_exacto(self):
        self.insertar(permite_stock=True, precio=Decimal("1234.56"))
        precio = Producto.objects.get().precio
        self.assertIsInstance(precio, Decimal)
        self.assertEqual(precio, Decimal("1234.56"))

    def test_las_modalidades_salen_en_orden_canonico(self):
        producto = crear_producto(
            self.taller, self.categoria, permite_personalizacion=True, permite_stock=True
        )
        self.assertEqual(producto.modalidades, ["stock", "personalizacion"])


class ReferenciasProtegidasTests(CatalogoModelTestCase):
    def test_no_se_borra_una_categoria_con_productos(self):
        crear_producto(self.taller, self.categoria)
        with self.assertRaises(ProtectedError):
            self.categoria.delete()

    def test_no_se_borra_un_taller_con_productos(self):
        crear_producto(self.taller, self.categoria)
        with self.assertRaises(ProtectedError):
            self.taller.delete()

    def test_codigo_de_categoria_valido(self):
        for codigo in ("Cuero", "cuero y calzado", "cuero-calzado", "_cuero", "cuero__x", ""):
            with self.subTest(codigo=codigo):
                with self.assertRaises(IntegrityError), transaction.atomic():
                    Categoria.objects.create(codigo=codigo, nombre=f"Nombre {codigo!r}")

    def test_codigo_y_nombre_de_categoria_unicos(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            crear_categoria("cuero_y_calzado", "Otro nombre")
        with self.assertRaises(IntegrityError), transaction.atomic():
            crear_categoria("otro_codigo", "Cuero y calzado")


class ServiciosDeProductoTests(CatalogoModelTestCase):
    def test_crear_deja_el_producto_sin_publicar(self):
        producto = crear_producto(self.taller, self.categoria)
        self.assertFalse(producto.publicado)
        self.assertEqual(producto.taller, self.taller)

    def test_un_taller_no_aprobado_no_crea_productos(self):
        pendiente = crear_artesano_con_taller("83333333")
        with self.assertRaises(services.TallerNoHabilitado):
            services.crear_producto(pendiente, **datos_producto(self.categoria))
        self.assertFalse(Producto.objects.exists())

    def test_crear_valida_antes_de_guardar(self):
        with self.assertRaises(ValidationError) as contexto:
            services.crear_producto(
                self.taller, **datos_producto(self.categoria, permite_stock=False)
            )
        self.assertEqual(
            contexto.exception.messages,
            ["El producto debe admitir al menos una modalidad de venta."],
        )
        self.assertFalse(Producto.objects.exists())

    def test_actualizar_no_admite_campos_ajenos_al_producto(self):
        producto = crear_producto(self.taller, self.categoria)
        for campo in ("taller", "publicado", "creado_en"):
            with self.subTest(campo=campo), self.assertRaises(ValueError):
                services.actualizar_producto(producto, **{campo: None})

    def test_actualizar_no_puede_dejar_el_producto_sin_modalidades(self):
        producto = crear_producto(self.taller, self.categoria)
        with self.assertRaises(ValidationError):
            services.actualizar_producto(producto, permite_stock=False)
        producto.refresh_from_db()
        self.assertTrue(producto.permite_stock)

    def test_publicar_y_despublicar_son_idempotentes(self):
        producto = crear_producto(self.taller, self.categoria, fotografia_principal=imagen_prueba())
        self.assertTrue(services.publicar_producto(producto))
        self.assertFalse(services.publicar_producto(producto))
        self.assertTrue(services.despublicar_producto(producto))
        self.assertFalse(services.despublicar_producto(producto))
        producto.refresh_from_db()
        self.assertFalse(producto.publicado)

    def test_despublicar_conserva_la_fila(self):
        producto = crear_producto(self.taller, self.categoria, publicado=True)
        services.despublicar_producto(producto)
        self.assertTrue(Producto.objects.filter(pk=producto.pk).exists())

    def test_catalogo_excluye_talleres_no_aprobados_aunque_esten_publicados(self):
        visible = crear_producto(self.taller, self.categoria, publicado=True)
        pendiente = crear_artesano_con_taller("83333333")
        # Dato incoherente escrito sin pasar por los servicios.
        Producto.objects.create(taller=pendiente, publicado=True, **datos_producto(self.categoria))
        self.assertEqual(list(Producto.objects.catalogo()), [visible])
