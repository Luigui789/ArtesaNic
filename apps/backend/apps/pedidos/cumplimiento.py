"""Cumplimiento por renglón, entregas y evidencia del comprador (AUD-12; RF-010, RF-017,
RF-022, RF-023; RN-015, RN-018, RN-021, RN-022, RN-023).

Toda acción exige ``Pago.estado = confirmado``, comprobado dentro de la transacción y después
de los locks (D-AUD12-02). El trabajo se inicia por renglón (D-AUD12-01/04):

- ``stock``: iniciar no toca inventario; cada entrega consume la parte entregada de su reserva.
- ``produccion`` y ``personalizacion`` ``desde_cero``: nunca tocan el inventario estándar.
- ``personalizacion`` ``unidad_estandar``: iniciar la transformación consume toda la reserva;
  entregarla después ya no consume otra vez.

Orden de locks, compatible con AUD-10 y AUD-11 (D-AUD12-14):
``Pedido → Pago → EstadoOperativoPedido → CumplimientoLineaPedido → ReservaInventario →
InventarioProducto`` (los inventarios por ``producto_id`` ascendente). El lock del ``Pedido``
serializa entregas concurrentes, inicios repetidos y la carrera con el vencimiento automático:
cada transacción revalida estado, pago y cantidades después de obtenerlo.

Sin signals: las transiciones son explícitas y los puntos de integración de AUD-20 se emiten
con ``transaction.on_commit``.
"""

import logging
from collections import Counter
from datetime import date
from http import HTTPStatus

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.catalogo.models import Modalidad
from apps.inventario import services as inventario
from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.pagos import services as pagos
from apps.pagos.models import EstadoPago, Pago
from apps.solicitudes.models import OrigenPersonalizacion
from apps.solicitudes.services import verificar_artesano_habilitado, verificar_comprador_activo

from .errores import CodigoConflictoResolucion
from .models import (
    MAX_MOTIVO_DISCREPANCIA,
    CierreParcialPedido,
    CumplimientoLineaPedido,
    EntregaPedido,
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    LineaEntrega,
    LineaPedido,
    Pedido,
    RecepcionEntrega,
    ResultadoRecepcion,
    TipoEventoPedido,
)

logger = logging.getLogger(__name__)

# Nombres estables de los puntos de integración para notificaciones (AUD-20, RN-020).
EVENTO_EN_CUMPLIMIENTO = "pedido_en_cumplimiento"
EVENTO_ENTREGA = "entrega_registrada"
EVENTO_ENTREGADO = "pedido_entregado"
EVENTO_RECEPCION = {
    ResultadoRecepcion.CONFIRMADA: "recepcion_confirmada",
    ResultadoRecepcion.DISCREPANCIA: "discrepancia_entrega",
}
MAX_CANTIDAD = 2147483647


class PedidoNoEncontrado(Exception):
    """El pedido no existe o no pertenece a esta parte (404, sin revelar existencia)."""


class LineaNoEncontrada(Exception):
    """La línea no pertenece al pedido de la URL (404)."""


class EntregaNoEncontrada(Exception):
    """La entrega no pertenece al pedido de la URL (404)."""


class EntradaInvalida(Exception):
    def __init__(self, errores: dict):
        self.errores = errores
        super().__init__(errores)


class CodigoConflictoCumplimiento:
    """Códigos estables de los ``409`` de cumplimiento."""

    PEDIDO_VENCIDO = "pedido_vencido"
    PEDIDO_ENTREGADO = "pedido_entregado"
    # AUD-13: mismos códigos y mensajes que la resolución del pedido.
    PEDIDO_FINALIZADO = CodigoConflictoResolucion.PEDIDO_FINALIZADO
    CIERRE_PARCIAL_PENDIENTE = CodigoConflictoResolucion.CIERRE_PARCIAL_PENDIENTE
    PAGO_NO_CONFIRMADO = "pago_no_confirmado"
    LINEA_YA_INICIADA = "linea_ya_iniciada"
    LINEA_NO_INICIADA = "linea_no_iniciada"
    CANTIDAD_ENTREGA_EXCEDE_PENDIENTE = "cantidad_entrega_excede_pendiente"
    RECEPCION_YA_REGISTRADA = "recepcion_ya_registrada"

    MENSAJES = {
        PEDIDO_VENCIDO: "El pedido venció por falta de pago y no admite cumplimiento.",
        PEDIDO_ENTREGADO: "El pedido ya fue entregado por completo.",
        PAGO_NO_CONFIRMADO: (
            "El trabajo y las entregas solo pueden registrarse con el pago confirmado."
        ),
        LINEA_YA_INICIADA: "Este producto del pedido ya fue iniciado.",
        LINEA_NO_INICIADA: "Inicia el trabajo de cada producto antes de registrar su entrega.",
        CANTIDAD_ENTREGA_EXCEDE_PENDIENTE: (
            "La cantidad indicada supera lo que falta por entregar de ese producto."
        ),
        RECEPCION_YA_REGISTRADA: "Ya registraste tu respuesta sobre esta entrega.",
        PEDIDO_FINALIZADO: CodigoConflictoResolucion.MENSAJES[PEDIDO_FINALIZADO],
        CIERRE_PARCIAL_PENDIENTE: CodigoConflictoResolucion.MENSAJES[CIERRE_PARCIAL_PENDIENTE],
    }


class CumplimientoInconsistente(Exception):
    """Una invariante previa no se cumple (p. ej. línea que requiere reserva sin reserva
    activa). Se registra ``CRITICAL`` y la transacción completa se revierte; no se repara."""


class ConflictoCumplimiento(Exception):
    """Acción incompatible con el estado actual; no produce ningún efecto."""

    def __init__(self, codigo: str, lineas: list[int] | None = None):
        self.codigo = codigo
        self.mensaje = CodigoConflictoCumplimiento.MENSAJES[codigo]
        # Líneas afectadas (si aplica): ayudan a la interfaz a señalar el renglón.
        self.lineas = lineas or []
        super().__init__(self.mensaje)


# --- Reloj y fecha local (D-AUD12-16): reloj del servidor, nunca el del navegador ---


def hoy_local() -> date:
    """Fecha actual en ``TIME_ZONE`` (America/Managua) según el reloj del servidor."""
    return timezone.localdate(pagos.ahora())


def consume_al_iniciar(linea: LineaPedido) -> bool:
    """RN-023: la unidad estándar base se consume al comenzar su transformación."""
    return (
        linea.modalidad == Modalidad.PERSONALIZACION
        and linea.origen_personalizacion == OrigenPersonalizacion.UNIDAD_ESTANDAR
    )


def consume_al_entregar(linea: LineaPedido) -> bool:
    """RN-022: el stock normal se descuenta físicamente al registrar la entrega."""
    return linea.modalidad == Modalidad.STOCK


# --- Locks con ownership en SQL ---


def _bloquear_pedido(pedido_id: int, **ownership) -> Pedido:
    pedido = Pedido.objects.select_for_update(of=("self",)).filter(pk=pedido_id, **ownership)
    pedido = pedido.first()
    if pedido is None:
        raise PedidoNoEncontrado
    return pedido


def _bloquear_pago_y_estado(pedido: Pedido) -> tuple[Pago | None, EstadoOperativoPedido]:
    pago = Pago.objects.select_for_update().filter(pedido=pedido).first()
    estado = EstadoOperativoPedido.objects.select_for_update().get(pedido=pedido)
    return pago, estado


def _verificar_pago_confirmado(pago: Pago | None) -> None:
    if pago is None or pago.estado != EstadoPago.CONFIRMADO:
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.PAGO_NO_CONFIRMADO)


def _verificar_operable(pago: Pago | None, estado: EstadoOperativoPedido) -> None:
    """Iniciar y entregar: pedido vivo, no entregado ni finalizado (AUD-13), con Pago
    confirmado (RN-015) y sin una propuesta de cierre parcial pendiente (D-AUD13-05)."""
    if estado.estado == EstadoPedido.VENCIDO_FALTA_PAGO:
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.PEDIDO_VENCIDO)
    if estado.estado == EstadoPedido.ENTREGADO:
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.PEDIDO_ENTREGADO)
    if estado.estado in (EstadoPedido.CANCELADO_ARTESANO, EstadoPedido.CERRADO_PARCIAL):
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.PEDIDO_FINALIZADO)
    _verificar_pago_confirmado(pago)
    # Con el Pedido bloqueado: el cierre y la entrega se serializan; el snapshot económico
    # de un cierre pendiente nunca queda desactualizado.
    if cierre_pendiente(estado.pedido_id) is not None:
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.CIERRE_PARCIAL_PENDIENTE)


def cierre_pendiente(pedido_id: int) -> CierreParcialPedido | None:
    """Propuesta de cierre parcial sin respuesta del comprador (como mucho una)."""
    return (
        CierreParcialPedido.objects.filter(pedido_id=pedido_id, decision__isnull=True)
        .order_by("-numero")
        .first()
    )


def _transicion(estado: EstadoOperativoPedido, nuevo: str, actor, momento) -> None:
    """Cambia el estado global y deja su evento manual con el artesano real (D-AUD12-03)."""
    anterior = estado.estado
    estado.estado = nuevo
    estado.actualizado_en = momento
    estado.save(update_fields=["estado", "actualizado_en"])
    EventoEstadoPedido.objects.create(
        pedido_id=estado.pedido_id,
        estado_anterior=anterior,
        estado_nuevo=nuevo,
        tipo=TipoEventoPedido.ARTESANO,
        actor=actor,
        creado_en=momento,
    )


def cantidades_entregadas(pedido: Pedido) -> Counter:
    """Suma de ``LineaEntrega.cantidad`` por ``linea_pedido_id`` (fuente: el ledger)."""
    entregadas = Counter()
    for linea_id, cantidad in LineaEntrega.objects.filter(entrega__pedido=pedido).values_list(
        "linea_pedido_id", "cantidad"
    ):
        entregadas[linea_id] += cantidad
    return entregadas


def _notificar(evento: str, **datos) -> None:
    """Se ejecuta tras el COMMIT. AUD-20 enganchará aquí la notificación persistente."""
    logger.info(
        "%s %s", evento, " ".join(f"{clave}={valor}" for clave, valor in sorted(datos.items()))
    )


# --- Iniciar el trabajo de un renglón ---


@transaction.atomic
def iniciar_linea(*, artesano, pedido_id: int, linea_id: int) -> CumplimientoLineaPedido:
    """Registra el inicio de preparación, producción o personalización de un renglón.

    En ``personalizacion`` sobre ``unidad_estandar`` consume en el acto toda la reserva de
    la línea (RN-023). El primer inicio lleva el pedido de ``confirmado`` a
    ``en_cumplimiento``; los siguientes no generan otro evento global.
    """
    verificar_artesano_habilitado(artesano)
    pedido = _bloquear_pedido(pedido_id, taller__propietario=artesano)
    pago, estado = _bloquear_pago_y_estado(pedido)
    linea = LineaPedido.objects.filter(pk=linea_id, pedido=pedido).first()
    if linea is None:
        raise LineaNoEncontrada
    _verificar_operable(pago, estado)
    cumplimiento = CumplimientoLineaPedido.objects.select_for_update().get(linea_pedido=linea)
    if cumplimiento.iniciado_en is not None:
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.LINEA_YA_INICIADA, [linea.pk])
    momento = pagos.ahora()
    if consume_al_iniciar(linea):
        reserva, inv = _reserva_bloqueada(linea)
        _consumir(
            reserva,
            inv,
            reserva.cantidad_pendiente,
            artesano,
            inventario.motivo_consumo_transformacion(pedido.pk),
        )
    cumplimiento.iniciado_en = momento
    cumplimiento.iniciado_por = artesano
    cumplimiento.actualizado_en = momento
    cumplimiento.save(update_fields=["iniciado_en", "iniciado_por", "actualizado_en"])
    if estado.estado == EstadoPedido.CONFIRMADO:
        _transicion(estado, EstadoPedido.EN_CUMPLIMIENTO, artesano, momento)
        transaction.on_commit(
            lambda: _notificar(EVENTO_EN_CUMPLIMIENTO, pedido_id=pedido.pk, linea_id=linea.pk)
        )
    return cumplimiento


def _reserva_bloqueada(linea: LineaPedido, bloqueadas=None):
    """Reserva de la línea e inventario de su producto, ya bloqueados (o bloquea ahora)."""
    reserva_id = getattr(getattr(linea, "reserva", None), "pk", None)
    if bloqueadas is None:
        bloqueadas = inventario.bloquear_reservas_e_inventarios([reserva_id] if reserva_id else [])
    reservas, inventarios = bloqueadas
    reserva = reservas.get(reserva_id)
    if reserva is None:
        logger.critical(
            "Cumplimiento abortado: línea sin reserva estándar pedido_id=%s linea_id=%s",
            linea.pedido_id,
            linea.pk,
        )
        raise CumplimientoInconsistente(f"La línea #{linea.pk} no tiene reserva estándar.")
    return reserva, inventarios.get(reserva.producto_id)


def _consumir(reserva, inv, cantidad, actor, motivo):
    try:
        return inventario.consumir_reserva(
            reserva=reserva, inventario=inv, cantidad=cantidad, actor=actor, motivo=motivo
        )
    except inventario.ConsumoInvalido as exc:
        logger.critical(
            "Cumplimiento abortado: reserva inconsistente pedido_id=%s reserva_id=%s estado=%s",
            reserva.pedido_id,
            exc.reserva_id,
            exc.estado,
        )
        raise CumplimientoInconsistente(str(exc)) from exc


# --- Registrar una entrega ---


def _es_entero(valor: object) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool)


def normalizar_entrega(fecha, lineas) -> tuple[date, list[dict]]:
    """Valida la forma de la entrada (400) y ordena las líneas por id (huella estable)."""
    errores: dict[str, list] = {}
    if not isinstance(fecha, date):
        errores["fecha"] = ["Indica la fecha de la entrega (AAAA-MM-DD)."]
    elif fecha > hoy_local():
        errores["fecha"] = ["La fecha de entrega no puede ser posterior a hoy."]
    if not isinstance(lineas, list) or not lineas:
        errores["lineas"] = ["Incluye al menos un producto con su cantidad entregada."]
    else:
        vistos: set[int] = set()
        for item in lineas:
            linea = item.get("linea") if isinstance(item, dict) else None
            cantidad = item.get("cantidad") if isinstance(item, dict) else None
            if not _es_entero(linea) or linea < 1:
                errores["lineas"] = ["Cada producto debe indicar su línea."]
                break
            if not _es_entero(cantidad) or cantidad < 1 or cantidad > MAX_CANTIDAD:
                errores["lineas"] = ["Cada cantidad entregada debe ser un entero mayor que 0."]
                break
            if linea in vistos:
                errores["lineas"] = ["Cada producto puede aparecer una sola vez por entrega."]
                break
            vistos.add(linea)
    if errores:
        raise EntradaInvalida(errores)
    normalizadas = sorted(
        ({"linea": i["linea"], "cantidad": i["cantidad"]} for i in lineas),
        key=lambda i: i["linea"],
    )
    return fecha, normalizadas


@transaction.atomic
def registrar_entrega(*, artesano, pedido_id: int, fecha, lineas) -> EntregaPedido:
    """Registra una entrega con cantidades por renglón (RN-018) de forma atómica.

    Valida todas las líneas antes de escribir: pertenencia al pedido, inicio y cantidad no
    mayor que lo pendiente. Después crea la entrega, consume la reserva de cada línea de
    ``stock`` por lo entregado (RN-022) y, si todos los renglones quedan completos, lleva el
    pedido a ``entregado``. Cualquier fallo revierte todo.
    """
    verificar_artesano_habilitado(artesano)
    fecha, lineas = normalizar_entrega(fecha, lineas)
    pedido = _bloquear_pedido(pedido_id, taller__propietario=artesano)
    pago, estado = _bloquear_pago_y_estado(pedido)
    _verificar_operable(pago, estado)
    lineas_pedido = {linea.pk: linea for linea in pedido.lineas.select_related("reserva")}
    ajenas = [i["linea"] for i in lineas if i["linea"] not in lineas_pedido]
    if ajenas:
        raise EntradaInvalida({"lineas": ["Algún producto indicado no pertenece a este pedido."]})
    solicitadas = {i["linea"]: i["cantidad"] for i in lineas}
    cumplimientos = {
        c.linea_pedido_id: c
        for c in CumplimientoLineaPedido.objects.select_for_update()
        .filter(linea_pedido_id__in=list(solicitadas))
        .order_by("id")
    }
    no_iniciadas = [lid for lid in solicitadas if cumplimientos[lid].iniciado_en is None]
    if no_iniciadas:
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.LINEA_NO_INICIADA, no_iniciadas)
    entregadas = cantidades_entregadas(pedido)
    excedidas = [
        lid
        for lid, cantidad in solicitadas.items()
        if entregadas[lid] + cantidad > lineas_pedido[lid].cantidad
    ]
    if excedidas:
        raise ConflictoCumplimiento(
            CodigoConflictoCumplimiento.CANTIDAD_ENTREGA_EXCEDE_PENDIENTE, excedidas
        )
    con_consumo = [lineas_pedido[lid] for lid in solicitadas]
    con_consumo = [linea for linea in con_consumo if consume_al_entregar(linea)]
    bloqueadas = inventario.bloquear_reservas_e_inventarios(
        linea.reserva.pk for linea in con_consumo if getattr(linea, "reserva", None)
    )

    momento = pagos.ahora()
    # El lock del pedido serializa la numeración; el UNIQUE (pedido, numero) la respalda.
    numero = (pedido.entregas.aggregate(maximo=Max("numero"))["maximo"] or 0) + 1
    entrega = EntregaPedido.objects.create(
        pedido=pedido, numero=numero, fecha=fecha, registrado_por=artesano, registrado_en=momento
    )
    LineaEntrega.objects.bulk_create(
        LineaEntrega(entrega=entrega, linea_pedido_id=lid, cantidad=cantidad)
        for lid, cantidad in solicitadas.items()
    )
    motivo = inventario.motivo_consumo_entrega(numero, pedido.pk)
    for linea in con_consumo:
        reserva, inv = _reserva_bloqueada(linea, bloqueadas)
        _consumir(reserva, inv, solicitadas[linea.pk], artesano, motivo)
    for lid in solicitadas:
        cumplimientos[lid].actualizado_en = momento
    CumplimientoLineaPedido.objects.bulk_update(cumplimientos.values(), ["actualizado_en"])

    for lid, cantidad in solicitadas.items():
        entregadas[lid] += cantidad
    completo = all(entregadas[lid] == linea.cantidad for lid, linea in lineas_pedido.items())
    if completo:
        _transicion(estado, EstadoPedido.ENTREGADO, artesano, momento)
    transaction.on_commit(lambda: _notificar(EVENTO_ENTREGA, pedido_id=pedido.pk, entrega=numero))
    if completo:
        transaction.on_commit(lambda: _notificar(EVENTO_ENTREGADO, pedido_id=pedido.pk))
    return entrega


# --- Evidencia del comprador ---


def normalizar_recepcion(resultado, motivo) -> tuple[str, str]:
    """``confirmada`` sin motivo; ``discrepancia`` con motivo recortado no vacío (400)."""
    if resultado not in ResultadoRecepcion.values:
        raise EntradaInvalida({"resultado": ["Elige confirmada o discrepancia."]})
    motivo = motivo.strip() if isinstance(motivo, str) else ""
    if resultado == ResultadoRecepcion.CONFIRMADA:
        if motivo:
            raise EntradaInvalida({"motivo": ["Confirmar la recepción no lleva motivo."]})
    elif not motivo:
        raise EntradaInvalida({"motivo": ["Describe la discrepancia."]})
    elif len(motivo) > MAX_MOTIVO_DISCREPANCIA:
        raise EntradaInvalida(
            {"motivo": [f"El motivo admite hasta {MAX_MOTIVO_DISCREPANCIA} caracteres."]}
        )
    return resultado, motivo


@transaction.atomic
def registrar_recepcion(
    *, comprador, pedido_id: int, entrega_id: int, resultado: str, motivo: str = ""
) -> RecepcionEntrega:
    """Confirmación o discrepancia del comprador sobre una entrega (RN-018).

    Es solo evidencia histórica (D-AUD12-11/12): no repone inventario, no reabre reservas,
    no revierte la entrega ni cambia el estado del pedido, y se admite aunque el pedido ya
    esté ``entregado``. Una sola respuesta por entrega.
    """
    verificar_comprador_activo(comprador)
    resultado, motivo = normalizar_recepcion(resultado, motivo)
    pedido = _bloquear_pedido(pedido_id, comprador=comprador)
    pago = Pago.objects.select_for_update().filter(pedido=pedido).first()
    entrega = EntregaPedido.objects.filter(pk=entrega_id, pedido=pedido).first()
    if entrega is None:
        raise EntregaNoEncontrada
    # Defensa: una entrega solo existe con Pago confirmado, que es terminal (D-AUD10-14).
    _verificar_pago_confirmado(pago)
    if RecepcionEntrega.objects.filter(entrega=entrega).exists():
        raise ConflictoCumplimiento(CodigoConflictoCumplimiento.RECEPCION_YA_REGISTRADA)
    recepcion = RecepcionEntrega.objects.create(
        entrega=entrega,
        resultado=resultado,
        motivo=motivo,
        registrado_por=comprador,
        registrado_en=pagos.ahora(),
    )
    transaction.on_commit(
        lambda: _notificar(EVENTO_RECEPCION[resultado], pedido_id=pedido.pk, entrega=entrega.numero)
    )
    return recepcion


# --- Idempotencia (AUD-08, D-AUD12-13): huellas normalizadas con el recurso destino ---


def iniciar_linea_idempotente(
    *, artesano, clave: str, pedido_id: int, linea_id: int
) -> operaciones.ResultadoIdempotente:
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.INICIAR_CUMPLIMIENTO_LINEA,
        clave=clave,
        datos={"pedido_id": pedido_id, "linea_id": linea_id},
        operacion=lambda: iniciar_linea(artesano=artesano, pedido_id=pedido_id, linea_id=linea_id),
        codigo_http=HTTPStatus.OK,
    )


def registrar_entrega_idempotente(
    *, artesano, clave: str, pedido_id: int, fecha, lineas
) -> operaciones.ResultadoIdempotente:
    # La forma se valida antes de huellar: el orden de ``lineas`` no cambia la operación.
    fecha, lineas = normalizar_entrega(fecha, lineas)
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.REGISTRAR_ENTREGA_PEDIDO,
        clave=clave,
        datos={"pedido_id": pedido_id, "fecha": fecha, "lineas": lineas},
        operacion=lambda: registrar_entrega(
            artesano=artesano, pedido_id=pedido_id, fecha=fecha, lineas=lineas
        ),
        codigo_http=HTTPStatus.CREATED,
    )


def registrar_recepcion_idempotente(
    *, comprador, clave: str, pedido_id: int, entrega_id: int, resultado: str, motivo: str = ""
) -> operaciones.ResultadoIdempotente:
    resultado, motivo = normalizar_recepcion(resultado, motivo)
    return operaciones.ejecutar_idempotente(
        actor=comprador,
        tipo=TipoOperacion.REGISTRAR_RECEPCION_ENTREGA,
        clave=clave,
        datos={
            "pedido_id": pedido_id,
            "entrega_id": entrega_id,
            "resultado": resultado,
            "motivo": motivo,
        },
        operacion=lambda: registrar_recepcion(
            comprador=comprador,
            pedido_id=pedido_id,
            entrega_id=entrega_id,
            resultado=resultado,
            motivo=motivo,
        ),
        codigo_http=HTTPStatus.CREATED,
    )
