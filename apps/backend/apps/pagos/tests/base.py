"""Apoyo de las pruebas de pagos: un Pedido confirmado real (AUD-05/06/07) y archivos."""

from contextlib import contextmanager
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from unittest import mock
from uuid import uuid4

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.pedidos.models import Pedido
from apps.propuestas import services as propuestas
from apps.solicitudes import services as solicitudes
from apps.solicitudes.tests.base import SolicitudesAPITestCase

# --- Rutas escritas a mano: las pruebas verifican el contrato publicado ---


def url_mi_pago(pedido_id):
    return f"/api/v1/pedidos/mios/{pedido_id}/pago/"


def url_intentos(pedido_id):
    return f"{url_mi_pago(pedido_id)}intentos/"


def url_corregir(pedido_id, intento_id):
    return f"{url_intentos(pedido_id)}{intento_id}/corregir/"


def url_mi_comprobante(pedido_id, intento_id):
    return f"{url_intentos(pedido_id)}{intento_id}/comprobante/"


def url_pago_recibido(pedido_id):
    return f"/api/v1/pedidos/recibidos/{pedido_id}/pago/"


def url_resolver(pedido_id, intento_id):
    return f"{url_pago_recibido(pedido_id)}intentos/{intento_id}/resolver/"


def url_comprobante_recibido(pedido_id, intento_id):
    return f"{url_pago_recibido(pedido_id)}intentos/{intento_id}/comprobante/"


# --- Archivos ---


def bytes_imagen(formato="PNG", tamano=(8, 6), color="red") -> bytes:
    contenido = BytesIO()
    Image.new("RGB", tamano, color).save(contenido, format=formato)
    return contenido.getvalue()


def bytes_pdf(relleno: int = 0) -> bytes:
    """PDF mínimo con cabecera, objeto, ``startxref`` y ``%%EOF``."""
    return (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
        + b"%" + b"0" * relleno + b"\n"
        + b"trailer\n<< /Root 1 0 R >>\nstartxref\n9\n%%EOF\n"
    )  # fmt: skip


MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def archivo(contenido: bytes, nombre: str, tipo: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(nombre, contenido, content_type=tipo)


def imagen(formato="PNG", nombre=None, tipo=None, **kwargs) -> SimpleUploadedFile:
    extension = {"JPEG": "jpg"}.get(formato, formato.lower())
    return archivo(
        bytes_imagen(formato, **kwargs), nombre or f"pago.{extension}", tipo or MIME[formato]
    )


def pdf(nombre="comprobante.pdf", tipo="application/pdf", relleno=0) -> SimpleUploadedFile:
    return archivo(bytes_pdf(relleno), nombre, tipo)


def archivos_privados() -> list[Path]:
    raiz = Path(settings.PRIVATE_MEDIA_ROOT)
    return sorted(p for p in raiz.rglob("*") if p.is_file())


@contextmanager
def reloj(momento):
    """Congela el reloj de los plazos de pagos (``services.ahora``)."""
    with mock.patch("apps.pagos.services.ahora", return_value=momento):
        yield


# --- Pedido confirmado ---


def confirmar_pedido(*, comprador, artesano, producto, cantidad=2) -> Pedido:
    """Recorre el flujo real: solicitud → revisión → propuesta → aceptación (AUD-07)."""
    solicitud = solicitudes.crear_solicitud(
        comprador=comprador,
        renglones=[{"producto": producto.pk, "modalidad": "stock", "cantidad": cantidad}],
    )
    renglon = solicitud.renglones.get()
    solicitudes.resolver_renglon(
        artesano=artesano,
        solicitud_id=solicitud.pk,
        renglon_id=renglon.pk,
        resolucion="aceptado",
        motivo_rechazo="",
    )
    propuestas.finalizar_propuesta(
        artesano=artesano,
        solicitud_id=solicitud.pk,
        modalidad_entrega="entrega_artesano",
        costo_entrega=Decimal("50.00"),
        lineas=[{"renglon": renglon.pk}],
    )
    propuestas.decidir_propuesta(comprador=comprador, solicitud_id=solicitud.pk, decision="aceptar")
    return Pedido.objects.get(solicitud=solicitud)


class PagosAPITestCase(SolicitudesAPITestCase):
    """Pedido confirmado del comprador en el taller; otro del otro comprador y uno del
    taller ajeno, para verificar ownership."""

    def setUp(self):
        super().setUp()
        self.pedido = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano, producto=self.producto
        )
        self.pedido_otro_comprador = confirmar_pedido(
            comprador=self.otro_comprador, artesano=self.artesano, producto=self.producto
        )
        self.pedido_taller_ajeno = confirmar_pedido(
            comprador=self.comprador, artesano=self.artesano_ajeno, producto=self.producto_ajeno
        )
        self.autenticar(self.comprador)

    def registrar(
        self,
        pedido=None,
        *,
        metodo="transferencia",
        referencia="TRX-123456",
        comprobante=None,
        clave=None,
        extra=None,
    ):
        datos = {"metodo": metodo, "referencia": referencia}
        datos["comprobante"] = imagen() if comprobante is None else comprobante
        if extra:
            datos |= extra
        return self.client.post(
            url_intentos((pedido or self.pedido).pk),
            {k: v for k, v in datos.items() if v is not None},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )

    def corregir(
        self,
        intento_id,
        pedido=None,
        *,
        metodo="transferencia",
        referencia="TRX-123456-B",
        comprobante=None,
        clave=None,
    ):
        return self.client.post(
            url_corregir((pedido or self.pedido).pk, intento_id),
            {"metodo": metodo, "referencia": referencia, "comprobante": comprobante or pdf()},
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )

    def resolver(self, intento_id, estado, motivo=None, *, pedido=None, clave=None, como=None):
        self.autenticar(como or self.artesano)
        cuerpo = {"estado": estado} | ({"motivo": motivo} if motivo is not None else {})
        respuesta = self.client.post(
            url_resolver((pedido or self.pedido).pk, intento_id),
            cuerpo,
            format="json",
            HTTP_IDEMPOTENCY_KEY=clave or str(uuid4()),
        )
        self.autenticar(self.comprador)
        return respuesta

    def intento_vigente(self, respuesta):
        return respuesta.json()["intentos"][-1]["id"]
