"""Registro y verificación manual del pago externo (AUD-10; RF-011, RN-012/014/015).

Cada mutación bloquea la fila del ``Pedido`` (``SELECT … FOR UPDATE``) y después la del
``Pago``, siempre en ese orden, y valida estado y plazos **dentro** del lock con el reloj del
servidor. Así dos registros, dos correcciones o dos revisiones simultáneas se serializan: la
segunda ve el resultado de la primera y termina en ``409``. Los ``UNIQUE`` (pago por pedido,
número por pago, una revisión por intento, una corrección por intento) son la última garantía.

Ningún servicio toca inventario, reservas ni el estado del pedido: «Pago confirmado» solo
deja disponible la autoridad para las fases siguientes (RN-015). El vencimiento automático y
la liberación de reservas viven en ``apps.pedidos.vencimiento`` (AUD-11), que toma los mismos
locks en el mismo orden; un pedido vencido rechaza toda mutación de pago (``pedido_vencido``).
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from http import HTTPStatus

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.pedidos.models import EstadoOperativoPedido, EstadoPedido, Pedido
from apps.solicitudes.services import verificar_artesano_habilitado, verificar_comprador_activo

from .comprobantes import ComprobanteValidado
from .models import (
    ESTADOS_CON_PLAZO,
    MAX_MOTIVO,
    MAX_REFERENCIA,
    PLAZO,
    EstadoPago,
    IntentoPago,
    MetodoPago,
    OrigenIntento,
    Pago,
    ResultadoRevision,
    RevisionIntentoPago,
)

logger = logging.getLogger(__name__)


class PedidoNoEncontrado(Exception):
    """El pedido no existe o no pertenece a esta parte (404, sin revelar existencia)."""


class IntentoNoEncontrado(Exception):
    """El intento no existe en el pago de este pedido (404)."""


class EntradaInvalida(Exception):
    def __init__(self, errores: dict):
        self.errores = errores
        super().__init__(errores)


class CodigoConflictoPago:
    """Códigos estables de los ``409`` de negocio de pagos."""

    PAGO_YA_CONFIRMADO = "pago_ya_confirmado"
    PAGO_EN_REVISION = "pago_en_revision"
    CORRECCION_PENDIENTE = "correccion_pendiente"
    CORRECCION_NO_PERMITIDA = "correccion_no_permitida"
    INTENTO_YA_RESUELTO = "intento_ya_resuelto"
    PLAZO_PAGO_VENCIDO = "plazo_pago_vencido"
    CORRECCION_FUERA_PLAZO = "correccion_fuera_plazo"
    NUEVO_INTENTO_FUERA_PLAZO = "nuevo_intento_fuera_plazo"
    PEDIDO_VENCIDO = "pedido_vencido"

    MENSAJES = {
        PAGO_YA_CONFIRMADO: "El pago de este pedido ya fue confirmado y no admite cambios.",
        PAGO_EN_REVISION: "Hay un pago registrado pendiente de revisión del taller.",
        CORRECCION_PENDIENTE: (
            "El pago fue observado: registra la corrección del intento observado."
        ),
        CORRECCION_NO_PERMITIDA: "Solo se puede corregir el intento observado más reciente.",
        INTENTO_YA_RESUELTO: "Este intento de pago ya tiene una resolución y no se modifica.",
        PLAZO_PAGO_VENCIDO: "Venció el plazo de 48 horas para registrar el pago.",
        CORRECCION_FUERA_PLAZO: "Venció el plazo de 48 horas para corregir el pago observado.",
        NUEVO_INTENTO_FUERA_PLAZO: (
            "Venció el plazo de 48 horas para registrar un nuevo intento de pago."
        ),
        PEDIDO_VENCIDO: "El pedido venció por falta de pago y ya no admite cambios en el pago.",
    }


class ConflictoPago(Exception):
    """Transición incompatible con el estado actual; nunca sobrescribe el historial."""

    def __init__(self, codigo: str):
        self.codigo = codigo
        self.mensaje = CodigoConflictoPago.MENSAJES[codigo]
        super().__init__(self.mensaje)


# --- Plazos (D-AUD10-10/13/19): reloj del servidor; el instante límite ya está vencido ---


def ahora() -> datetime:
    """Reloj del servidor: única fuente de tiempo de los plazos (nunca el del navegador)."""
    return timezone.now()


def limite_inicial(pedido: Pedido) -> datetime:
    return pedido.confirmado_en + PLAZO


def vencido(limite: datetime, momento: datetime) -> bool:
    return momento >= limite


@dataclass(frozen=True)
class SituacionPago:
    """Lectura derivada que también consumirá AUD-11 (vencimiento por falta de pago)."""

    estado: str
    # Hasta cuándo el comprador puede registrar, corregir o volver a intentar; None si no aplica.
    registrable_hasta: datetime | None
    plazo_vencido: bool
    # True si hay un intento registrado esperando al artesano: no es falta de pago (RN-013).
    revision_pendiente: bool


def situacion_pago(pedido: Pedido, pago: Pago | None, momento: datetime | None = None):
    momento = momento or ahora()
    if pago is None:
        limite = limite_inicial(pedido)
        return SituacionPago(EstadoPago.PENDIENTE, limite, vencido(limite, momento), False)
    if pago.estado in ESTADOS_CON_PLAZO:
        limite = pago.plazo_hasta
        return SituacionPago(pago.estado, limite, vencido(limite, momento), False)
    return SituacionPago(pago.estado, None, False, pago.estado == EstadoPago.REGISTRADO)


# --- Bloqueos con ownership en SQL ---


def _bloquear_pedido_del_comprador(comprador, pedido_id: int) -> Pedido:
    pedido = (
        Pedido.objects.select_for_update(of=("self",))
        .filter(pk=pedido_id, comprador=comprador)
        .first()
    )
    if pedido is None:
        raise PedidoNoEncontrado
    return pedido


def _bloquear_pedido_del_taller(artesano, pedido_id: int) -> Pedido:
    pedido = (
        Pedido.objects.select_for_update(of=("self",))
        .filter(pk=pedido_id, taller__propietario=artesano)
        .first()
    )
    if pedido is None:
        raise PedidoNoEncontrado
    return pedido


def _bloquear_pago(pedido: Pedido) -> Pago | None:
    return Pago.objects.select_for_update().filter(pedido=pedido).first()


def _verificar_pedido_no_vencido(pedido: Pedido) -> None:
    """Defensa explícita de AUD-11 (D-AUD11-17), además de los plazos.

    Se consulta con el ``Pedido`` ya bloqueado: el vencimiento toma el mismo lock antes de
    cambiar el estado operativo, así que esta lectura ve siempre el resultado confirmado.
    """
    if EstadoOperativoPedido.objects.filter(
        pedido=pedido, estado=EstadoPedido.VENCIDO_FALTA_PAGO
    ).exists():
        raise ConflictoPago(CodigoConflictoPago.PEDIDO_VENCIDO)


# --- Validación de entrada (defensa además del serializer) ---


def _datos_intento(metodo, referencia) -> tuple[str, str]:
    errores = {}
    if metodo not in MetodoPago.values:
        errores["metodo"] = ["Elige transferencia u otro método."]
    referencia = referencia.strip() if isinstance(referencia, str) else ""
    if not referencia:
        errores["referencia"] = ["Indica la referencia del pago."]
    elif len(referencia) > MAX_REFERENCIA:
        errores["referencia"] = [f"La referencia admite hasta {MAX_REFERENCIA} caracteres."]
    if errores:
        raise EntradaInvalida(errores)
    return metodo, referencia


def _datos_revision(resultado, motivo) -> tuple[str, str]:
    if resultado not in ResultadoRevision.values:
        raise EntradaInvalida({"estado": ["Elige confirmado, observado o no_recibido."]})
    motivo = motivo.strip() if isinstance(motivo, str) else ""
    if resultado in ESTADOS_CON_PLAZO:
        if not motivo:
            raise EntradaInvalida({"motivo": ["Indica el motivo."]})
        if len(motivo) > MAX_MOTIVO:
            raise EntradaInvalida({"motivo": [f"El motivo admite hasta {MAX_MOTIVO} caracteres."]})
    elif motivo:
        raise EntradaInvalida({"motivo": ["Confirmar el pago no lleva motivo."]})
    return resultado, motivo


# --- Escritura ---


def _eliminar_archivo(storage, nombre: str) -> None:
    try:
        storage.delete(nombre)
    except OSError:
        logger.exception("No se pudo limpiar un comprobante no persistido: %s", nombre)


def _crear_intento(
    *,
    pago: Pago,
    origen: str,
    intento_previo: IntentoPago | None,
    metodo: str,
    referencia: str,
    comprobante: ComprobanteValidado,
    actor,
    momento,
) -> IntentoPago:
    """Escribe el archivo y la fila; si la base de datos falla, limpia el archivo nuevo.

    Storage y PostgreSQL no comparten transacción: una caída del proceso o un rollback
    posterior de la transacción externa puede dejar un archivo huérfano (nunca una fila sin
    archivo). Ningún comprobante ya confirmado se elimina (D-AUD10-17).
    """
    # El lock del pedido serializa la numeración; el UNIQUE (pago, numero) la respalda.
    ultimo = pago.intentos.aggregate(maximo=Max("numero"))["maximo"] or 0
    intento = IntentoPago(
        pago=pago,
        numero=ultimo + 1,
        origen=origen,
        intento_previo=intento_previo,
        metodo=metodo,
        referencia=referencia,
        comprobante_nombre=comprobante.nombre,
        comprobante_tipo=comprobante.mime,
        comprobante_tamano=comprobante.tamano,
        comprobante_sha256=comprobante.sha256,
        registrado_por=actor,
        registrado_en=momento,
    )
    intento.extension_validada = comprobante.extension
    intento.comprobante = comprobante.archivo
    try:
        intento.save()
        pago.estado = EstadoPago.REGISTRADO
        pago.plazo_hasta = None
        pago.actualizado_en = momento
        pago.save(update_fields=["estado", "plazo_hasta", "actualizado_en"])
    except Exception:
        archivo = intento.comprobante
        if archivo and archivo._committed and archivo.name:
            _eliminar_archivo(archivo.storage, archivo.name)
        raise
    return intento


@transaction.atomic
def registrar_intento(
    *, comprador, pedido_id: int, metodo: str, referencia: str, comprobante: ComprobanteValidado
) -> IntentoPago:
    """Registro inicial (pendiente) o nuevo intento tras «no recibido».

    El total, la moneda, el comprador y el taller proceden del ``Pedido`` confirmado; el
    cliente solo declara método, referencia y comprobante.
    """
    verificar_comprador_activo(comprador)
    metodo, referencia = _datos_intento(metodo, referencia)
    pedido = _bloquear_pedido_del_comprador(comprador, pedido_id)
    pago = _bloquear_pago(pedido)
    _verificar_pedido_no_vencido(pedido)
    momento = ahora()
    if pago is None:
        if vencido(limite_inicial(pedido), momento):
            raise ConflictoPago(CodigoConflictoPago.PLAZO_PAGO_VENCIDO)
        pago = Pago.objects.create(
            pedido=pedido,
            estado=EstadoPago.REGISTRADO,
            moneda=pedido.moneda,
            total=pedido.total,
            creado_en=momento,
            actualizado_en=momento,
        )
        origen, previo = OrigenIntento.INICIAL, None
    else:
        if pago.estado == EstadoPago.CONFIRMADO:
            raise ConflictoPago(CodigoConflictoPago.PAGO_YA_CONFIRMADO)
        if pago.estado == EstadoPago.REGISTRADO:
            raise ConflictoPago(CodigoConflictoPago.PAGO_EN_REVISION)
        if pago.estado == EstadoPago.OBSERVADO:
            raise ConflictoPago(CodigoConflictoPago.CORRECCION_PENDIENTE)
        if vencido(pago.plazo_hasta, momento):
            raise ConflictoPago(CodigoConflictoPago.NUEVO_INTENTO_FUERA_PLAZO)
        origen, previo = OrigenIntento.NUEVO_TRAS_NO_RECIBIDO, pago.intentos.order_by("-numero")[0]
    return _crear_intento(
        pago=pago,
        origen=origen,
        intento_previo=previo,
        metodo=metodo,
        referencia=referencia,
        comprobante=comprobante,
        actor=comprador,
        momento=momento,
    )


@transaction.atomic
def corregir_intento(
    *,
    comprador,
    pedido_id: int,
    intento_id: int,
    metodo: str,
    referencia: str,
    comprobante: ComprobanteValidado,
) -> IntentoPago:
    """Nuevo intento vinculado al intento observado; el observado no se edita (RN-014)."""
    verificar_comprador_activo(comprador)
    metodo, referencia = _datos_intento(metodo, referencia)
    pedido = _bloquear_pedido_del_comprador(comprador, pedido_id)
    pago = _bloquear_pago(pedido)
    _verificar_pedido_no_vencido(pedido)
    previo = pago.intentos.filter(pk=intento_id).first() if pago else None
    if previo is None:
        raise IntentoNoEncontrado
    if pago.estado == EstadoPago.CONFIRMADO:
        raise ConflictoPago(CodigoConflictoPago.PAGO_YA_CONFIRMADO)
    if pago.estado == EstadoPago.REGISTRADO:
        raise ConflictoPago(CodigoConflictoPago.PAGO_EN_REVISION)
    vigente = pago.intentos.order_by("-numero")[0]
    if pago.estado != EstadoPago.OBSERVADO or previo.pk != vigente.pk:
        raise ConflictoPago(CodigoConflictoPago.CORRECCION_NO_PERMITIDA)
    momento = ahora()
    if vencido(pago.plazo_hasta, momento):
        raise ConflictoPago(CodigoConflictoPago.CORRECCION_FUERA_PLAZO)
    return _crear_intento(
        pago=pago,
        origen=OrigenIntento.CORRECCION,
        intento_previo=previo,
        metodo=metodo,
        referencia=referencia,
        comprobante=comprobante,
        actor=comprador,
        momento=momento,
    )


@transaction.atomic
def resolver_intento(
    *, artesano, pedido_id: int, intento_id: int, resultado: str, motivo: str = ""
) -> RevisionIntentoPago:
    """Resolución única del artesano: confirmado (terminal), observado o no recibido."""
    verificar_artesano_habilitado(artesano)
    resultado, motivo = _datos_revision(resultado, motivo)
    pedido = _bloquear_pedido_del_taller(artesano, pedido_id)
    pago = _bloquear_pago(pedido)
    _verificar_pedido_no_vencido(pedido)
    intento = pago.intentos.filter(pk=intento_id).first() if pago else None
    if intento is None:
        raise IntentoNoEncontrado
    if pago.estado == EstadoPago.CONFIRMADO:
        raise ConflictoPago(CodigoConflictoPago.PAGO_YA_CONFIRMADO)
    if RevisionIntentoPago.objects.filter(intento=intento).exists():
        raise ConflictoPago(CodigoConflictoPago.INTENTO_YA_RESUELTO)
    momento = ahora()
    plazo = momento + PLAZO if resultado in ESTADOS_CON_PLAZO else None
    revision = RevisionIntentoPago.objects.create(
        intento=intento,
        resultado=resultado,
        motivo=motivo,
        revisado_por=artesano,
        revisado_en=momento,
        plazo_hasta=plazo,
    )
    pago.estado = resultado
    pago.plazo_hasta = plazo
    pago.confirmado_en = momento if resultado == ResultadoRevision.CONFIRMADO else None
    pago.actualizado_en = momento
    pago.save(update_fields=["estado", "plazo_hasta", "confirmado_en", "actualizado_en"])
    return revision


# --- Idempotencia (AUD-08): huellas con destino, datos comerciales y hash del archivo ---


def _huella_intento(pedido_id, metodo, referencia, comprobante: ComprobanteValidado, **extra):
    """El contenido del archivo (SHA-256) identifica el comprobante, nunca su nombre."""
    return {
        "pedido_id": pedido_id,
        "metodo": metodo,
        "referencia": referencia.strip() if isinstance(referencia, str) else referencia,
        "comprobante_sha256": comprobante.sha256,
        **extra,
    }


def registrar_intento_idempotente(
    *, comprador, clave: str, pedido_id: int, metodo, referencia, comprobante
) -> operaciones.ResultadoIdempotente:
    return operaciones.ejecutar_idempotente(
        actor=comprador,
        tipo=TipoOperacion.REGISTRAR_INTENTO_PAGO,
        clave=clave,
        datos=_huella_intento(pedido_id, metodo, referencia, comprobante),
        operacion=lambda: registrar_intento(
            comprador=comprador,
            pedido_id=pedido_id,
            metodo=metodo,
            referencia=referencia,
            comprobante=comprobante,
        ),
        codigo_http=HTTPStatus.CREATED,
    )


def corregir_intento_idempotente(
    *, comprador, clave: str, pedido_id: int, intento_id: int, metodo, referencia, comprobante
) -> operaciones.ResultadoIdempotente:
    return operaciones.ejecutar_idempotente(
        actor=comprador,
        tipo=TipoOperacion.CORREGIR_INTENTO_PAGO,
        clave=clave,
        datos=_huella_intento(
            pedido_id, metodo, referencia, comprobante, intento_previo_id=intento_id
        ),
        operacion=lambda: corregir_intento(
            comprador=comprador,
            pedido_id=pedido_id,
            intento_id=intento_id,
            metodo=metodo,
            referencia=referencia,
            comprobante=comprobante,
        ),
        codigo_http=HTTPStatus.CREATED,
    )


def resolver_intento_idempotente(
    *, artesano, clave: str, pedido_id: int, intento_id: int, resultado: str, motivo: str = ""
) -> operaciones.ResultadoIdempotente:
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.RESOLVER_INTENTO_PAGO,
        clave=clave,
        datos={
            "pedido_id": pedido_id,
            "intento_id": intento_id,
            "estado": resultado,
            "motivo": motivo.strip() if isinstance(motivo, str) else motivo,
        },
        operacion=lambda: resolver_intento(
            artesano=artesano,
            pedido_id=pedido_id,
            intento_id=intento_id,
            resultado=resultado,
            motivo=motivo,
        ),
        codigo_http=HTTPStatus.OK,
    )
