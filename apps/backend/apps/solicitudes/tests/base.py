from datetime import timedelta

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


def datos_renglon(producto_base, **cambios):
    return {"producto": producto_base.pk, "modalidad": "stock", "cantidad": 1} | cambios


class SolicitudesAPITestCase(CatalogoAPITestCase):
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
        self.fecha = timezone.localdate() + timedelta(days=7)
        self.autenticar(self.comprador)

    def crear(self, *renglones, comprador=None):
        return services.crear_solicitud(
            comprador=comprador or self.comprador,
            renglones=list(renglones) or [datos_renglon(self.producto)],
        )

    def enviar(self, *renglones):
        return self.client.post(URL_CREAR, {"renglones": list(renglones)}, format="json")
