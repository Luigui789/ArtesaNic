"""Apoyo de las pruebas de mensajería del pedido (AUD-16)."""

from django.utils import timezone

from apps.pagos.tests.base import confirmar_pedido
from apps.pedidos.models import EstadoOperativoPedido, EstadoPedido
from apps.solicitudes.tests.base import SolicitudesAPITestCase

TERMINALES = (
    EstadoPedido.ENTREGADO,
    EstadoPedido.VENCIDO_FALTA_PAGO,
    EstadoPedido.CANCELADO_ARTESANO,
    EstadoPedido.CERRADO_PARCIAL,
)


def url_mensajes(pedido_id) -> str:
    return f"/api/v1/pedidos/{pedido_id}/mensajes/"


def llevar_estado(pedido, estado) -> None:
    """Fija el estado operativo sin recorrer el flujo: las transiciones reales se prueban en
    sus dominios y en las carreras de ``test_concurrencia``."""
    EstadoOperativoPedido.objects.filter(pedido=pedido).update(
        estado=estado,
        vencido_en=timezone.now() if estado == EstadoPedido.VENCIDO_FALTA_PAGO else None,
    )


class MensajesAPITestCase(SolicitudesAPITestCase):
    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        self.url = url_mensajes(self.pedido.pk)

    def enviar(self, texto="Hola", *, como=None, url=None, **extra):
        if como is not None:
            self.autenticar(como)
        return self.client.post(url or self.url, {"texto": texto, **extra}, format="json")

    def leer(self, despues_de=None, *, como=None, url=None):
        if como is not None:
            self.autenticar(como)
        params = {} if despues_de is None else {"despues_de": despues_de}
        return self.client.get(url or self.url, params)
