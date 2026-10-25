from datetime import timedelta
from uuid import uuid4

from django.utils import timezone

from apps.accounts.tests.base import crear_usuario
from apps.catalogo.tests.base import CatalogoAPITestCase, crear_producto
from apps.solicitudes import services

URL_CREAR = "/api/v1/solicitudes/"
URL_MIAS = URL_CREAR + "mias/"
URL_RECIBIDAS = URL_CREAR + "recibidas/"


def url_mia(solicitud_id):
    return f"{URL_MIAS}{solicitud_id}/"


def url_recibida(solicitud_id):
    return f"{URL_RECIBIDAS}{solicitud_id}/"


STOCK_DE_PRUEBA = 1000


def inicializar_stock(artesano, *productos, cantidad=STOCK_DE_PRUEBA):
    """Inventario inicial explícito: sin él, la disponibilidad desde stock es 0."""
    from apps.inventario import services as inventario

    for producto in productos:
        inventario.establecer_inventario_inicial(
            artesano=artesano, producto_id=producto.pk, cantidad=cantidad
        )


def datos_renglon(producto_base, **cambios):
    return {"producto": producto_base.pk, "modalidad": "stock", "cantidad": 1} | cambios


class SolicitudesAPITestCase(CatalogoAPITestCase):
    # Sin inventario inicializado la disponibilidad desde stock es 0: los escenarios que
    # necesitan stock lo declaran. Las pruebas de inventario lo desactivan.
    stock_inicial = True

    def setUp(self):
        super().setUp()
        self.comprador = crear_usuario("86666666")
        self.otro_comprador = crear_usuario("87777777", nombre="Otro comprador")
        self.producto = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            permite_produccion=True,
            permite_personalizacion=True,
        )
        self.otro_producto = crear_producto(
            self.taller,
            self.otra_categoria,
            publicado=True,
            nombre="Hamaca",
        )
        self.producto_ajeno = crear_producto(self.taller_ajeno, self.categoria, publicado=True)
        if self.stock_inicial:
            inicializar_stock(self.artesano, self.producto, self.otro_producto)
            inicializar_stock(self.artesano_ajeno, self.producto_ajeno)
        self.fecha = timezone.localdate() + timedelta(days=7)
        self.autenticar(self.comprador)

    def crear(self, *renglones, comprador=None):
        return services.crear_solicitud(
            comprador=comprador or self.comprador,
            renglones=list(renglones) or [datos_renglon(self.producto)],
        )

    def enviar(self, *renglones, clave=None):
        return self.publicar({"renglones": list(renglones)}, clave=clave)

    def publicar(self, datos, *, clave=None):
        """Cada envío es una operación nueva salvo que se repita la clave (AUD-08)."""
        return self.client.post(
            URL_CREAR, datos, format="json", HTTP_IDEMPOTENCY_KEY=clave or str(uuid4())
        )
