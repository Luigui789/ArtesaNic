"""Apoyo compartido por las pruebas del catálogo."""

from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.api.tokens import emitir_tokens
from apps.catalogo import services
from apps.catalogo.models import Categoria, Producto
from apps.talleres import services as servicios_taller
from apps.talleres.tests.base import crear_administrador, crear_artesano_con_taller

# Rutas escritas a mano a propósito: las pruebas verifican el contrato publicado.
URL_CATEGORIAS = "/api/v1/categorias/"
URL_CATALOGO = "/api/v1/productos/"
URL_MIS_PRODUCTOS = "/api/v1/productos/mios/"


def url_producto(producto_id: int) -> str:
    return f"{URL_CATALOGO}{producto_id}/"


def url_mi_producto(producto_id: int) -> str:
    return f"{URL_MIS_PRODUCTOS}{producto_id}/"


def url_publicar(producto_id: int) -> str:
    return f"{url_mi_producto(producto_id)}publicar/"


def url_despublicar(producto_id: int) -> str:
    return f"{url_mi_producto(producto_id)}despublicar/"


def crear_categoria(codigo="cuero_y_calzado", nombre="Cuero y calzado") -> Categoria:
    return Categoria.objects.create(codigo=codigo, nombre=nombre)


def datos_producto(categoria: Categoria, **cambios) -> dict:
    """Datos del modelo para el servicio (modalidades como booleanos)."""
    return {
        "nombre": "Sandalias de cuero natural",
        "descripcion": "Sandalias cosidas a mano en cuero curtido al vegetal.",
        "precio": Decimal("850.00"),
        "categoria": categoria,
        "permite_stock": True,
    } | cambios


def cuerpo_producto(categoria="cuero_y_calzado", **cambios) -> dict:
    """Cuerpo JSON de la API (categoría por código, modalidades como lista)."""
    return {
        "nombre": "Sandalias de cuero natural",
        "descripcion": "Sandalias cosidas a mano en cuero curtido al vegetal.",
        "precio": "850.00",
        "categoria": categoria,
        "modalidades": ["stock"],
    } | cambios


def crear_producto(taller, categoria, *, publicado=False, **cambios) -> Producto:
    producto = services.crear_producto(taller, **datos_producto(categoria, **cambios))
    if publicado:
        services.publicar_producto(producto)
    return producto


class CatalogoAPITestCase(APITestCase):
    """Un taller aprobado con su artesano, otro aprobado ajeno, uno pendiente y uno rechazado."""

    def setUp(self):
        self.admin = crear_administrador()
        self.categoria = crear_categoria()
        self.otra_categoria = crear_categoria("hamacas", "Hamacas")

        self.taller = crear_artesano_con_taller("82222222", nombre="Barro y Sombra")
        servicios_taller.aprobar_taller(self.taller, revisor=self.admin)
        self.artesano = self.taller.propietario

        self.taller_ajeno = crear_artesano_con_taller("83333333", nombre="Hamacas Membreño")
        servicios_taller.aprobar_taller(self.taller_ajeno, revisor=self.admin)
        self.artesano_ajeno = self.taller_ajeno.propietario

        self.taller_pendiente = crear_artesano_con_taller("84444444", nombre="Pendiente")
        self.taller_rechazado = crear_artesano_con_taller("85555555", nombre="Rechazado")
        servicios_taller.rechazar_taller(self.taller_rechazado, revisor=self.admin)

    def autenticar(self, usuario) -> None:
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {emitir_tokens(usuario)[0]}")

    def anonimo(self) -> None:
        self.client.credentials()
