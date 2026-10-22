from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.utils import timezone

from apps.catalogo.tests.base import crear_producto
from apps.solicitudes import services as solicitudes
from apps.solicitudes.tests.base import SolicitudesAPITestCase, datos_renglon


def url_propuesta_recibida(solicitud_id):
    return f"/api/v1/solicitudes/recibidas/{solicitud_id}/propuesta/"


def url_propuesta_mia(solicitud_id):
    return f"/api/v1/solicitudes/mias/{solicitud_id}/propuesta/"


class PropuestaAPITestCase(SolicitudesAPITestCase):
    """Solicitud mixta: stock (aceptado), producción (aceptado), personalización
    (aceptado) y stock (rechazado). Precios distintos para verificar el cálculo."""

    def setUp(self):
        super().setUp()
        self.p_stock = crear_producto(
            self.taller, self.categoria, publicado=True, nombre="Jarrón", precio=Decimal("100.50")
        )
        self.p_prod = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Taza",
            precio=Decimal("25.00"),
            permite_stock=False,
            permite_produccion=True,
        )
        self.p_pers = crear_producto(
            self.taller,
            self.categoria,
            publicado=True,
            nombre="Plato grabado",
            precio=Decimal("300.00"),
            permite_personalizacion=True,
        )
        self.comprometida = timezone.localdate() + timedelta(days=20)
        self.solicitud = self.crear(
            datos_renglon(self.p_stock, cantidad=3),
            datos_renglon(
                self.p_prod, modalidad="produccion", cantidad=7, fecha_solicitada=self.fecha
            ),
            datos_renglon(
                self.p_pers,
                modalidad="personalizacion",
                caracteristicas="Nombre en azul",
                origen_personalizacion="unidad_estandar",
            ),
            datos_renglon(self.p_stock, cantidad=1),
        )
        self.r1, self.r2, self.r3, self.r4 = self.solicitud.renglones.order_by("posicion")
        self.autenticar(self.artesano)

    def revisar(self, solicitud=None, *, rechazados=None):
        solicitud = solicitud or self.solicitud
        rechazados = {self.r4.pk} if rechazados is None else rechazados
        for renglon in solicitud.renglones.order_by("posicion"):
            solicitudes.resolver_renglon(
                artesano=self.artesano,
                solicitud_id=solicitud.pk,
                renglon_id=renglon.pk,
                resolucion="rechazado" if renglon.pk in rechazados else "aceptado",
                motivo_rechazo="No disponible" if renglon.pk in rechazados else "",
            )
        solicitud.refresh_from_db()

    def condiciones(self, **cambios):
        return {
            "modalidad_entrega": "entrega_artesano",
            "descripcion_entrega": "Entrega en Masaya centro",
            "costo_entrega": "120.00",
            "lineas": [
                {"renglon": self.r1.pk},
                {"renglon": self.r2.pk, "fecha_comprometida": self.comprometida.isoformat()},
                {"renglon": self.r3.pk, "cargo_personalizacion": "45.50"},
            ],
            "otros_cargos": [
                {"descripcion": "Empaque de regalo", "monto": "20.00"},
                {"descripcion": "Barniz especial", "monto": "15.25", "renglon": self.r3.pk},
            ],
        } | cambios

    def emitir(self, datos=None, *, clave=None, solicitud=None):
        return self.client.post(
            url_propuesta_recibida((solicitud or self.solicitud).pk),
            self.condiciones() if datos is None else datos,
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )
