"""Cancelación del artesano y cierre parcial del pedido (AUD-13; RF-010, RF-015, RF-021,
RF-022; RN-017, RN-019, RN-024; D-AUD13-01..07, D-AUD13-14..20).

- **Cancelación** (artesano propietario): solo desde ``confirmado`` o ``en_cumplimiento`` y
  sin ninguna ``EntregaPedido``; con un pago ``registrado`` u ``observado`` sin resolver se
  rechaza (``pago_pendiente_de_resolucion``). Con Pago confirmado genera reembolso total.
- **Cierre parcial**: el artesano lo propone con ``0 < entregado < acordado`` (por renglón,
  desde el ledger AUD-12); el servidor congela cantidades e importes. Mientras está pendiente
  bloquea iniciar, entregar y otra propuesta. El comprador lo acepta (``cerrado_parcial`` y
  reembolso parcial) u objeta (sin ningún efecto lateral; puede proponerse otro).

Ambas finalizaciones liberan solo el remanente no manipulado de las reservas y crean una
obligación de clasificación por las unidades estándar consumidas y no entregadas; reembolso y
clasificación pueden quedar pendientes después del cierre comercial.

Locks, con el prefijo de AUD-10/11/12: ``Pedido → Pago → EstadoOperativoPedido →
CierreParcialPedido → ReservaInventario → InventarioProducto`` (inventarios por
``producto_id`` ascendente). El lock del ``Pedido`` serializa la carrera con entregas,
registro de pago y vencimiento: cada transacción revalida dentro de él. Sin signals.
"""

import logging
from http import HTTPStatus

from django.db import transaction
from django.db.models import Max

from apps.inventario import services as inventario
from apps.inventario.models import ObligacionClasificacionInventario
from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.pagos import services as pagos
from apps.pagos.models import EstadoPago, Pago
from apps.solicitudes.services import verificar_artesano_habilitado, verificar_comprador_activo

from . import cumplimiento, reembolsos
from .errores import (
    CierreNoEncontrado,
    CodigoConflictoResolucion,
    ConflictoResolucion,
    ResolucionInconsistente,
)
from .models import (
    ESTADOS_TERMINALES,
    MAX_MOTIVO_CANCELACION,
    MAX_MOTIVO_CIERRE,
    MAX_MOTIVO_OBJECION,
    CancelacionPedido,
    CierreParcialPedido,
    DecisionCierreParcial,
    EntregaPedido,
    EstadoOperativoPedido,
    EstadoPedido,
    EventoEstadoPedido,
    LineaCierreParcial,
    Pedido,
    ResultadoCierreParcial,
    TipoEventoPedido,
)

logger = logging.getLogger(__name__)

# Nombres estables de los puntos de integración para notificaciones (AUD-20, RN-020).
EVENTO_CANCELADO = "pedido_cancelado_artesano"
EVENTO_CIERRE_PROPUESTO = "cierre_parcial_propuesto"
EVENTO_CIERRE_OBJETADO = "cierre_parcial_objetado"
EVENTO_CERRADO = "pedido_cerrado_parcial"

# Pago con evidencia esperando resolución: bloquea la cancelación (D-AUD13-03).
PAGOS_SIN_RESOLVER = frozenset({EstadoPago.REGISTRADO, EstadoPago.OBSERVADO})

C = CodigoConflictoResolucion


def _notificar(evento: str, **datos) -> None:
    """Se ejecuta tras el COMMIT. AUD-20 enganchará aquí la notificación persistente."""
    logger.info(
        "%s %s", evento, " ".join(f"{clave}={valor}" for clave, valor in sorted(datos.items()))
    )


# --- Validación de entrada (400) ---


def normalizar_motivo(motivo, maximo: int, vacio: str) -> str:
    motivo = motivo.strip() if isinstance(motivo, str) else ""
    if not motivo:
        raise cumplimiento.EntradaInvalida({"motivo": [vacio]})
    if len(motivo) > maximo:
        raise cumplimiento.EntradaInvalida(
            {"motivo": [f"El motivo admite hasta {maximo} caracteres."]}
        )
    return motivo


def normalizar_motivo_cancelacion(motivo) -> str:
    return normalizar_motivo(motivo, MAX_MOTIVO_CANCELACION, "Explica por qué no puedes cumplir.")


def normalizar_motivo_cierre(motivo) -> str:
    return normalizar_motivo(
        motivo, MAX_MOTIVO_CIERRE, "Explica por qué no podrás completar el pedido."
    )


def normalizar_respuesta(decision, motivo) -> tuple[str, str]:
    """``aceptado`` sin motivo; ``objetado`` con motivo recortado de 1 a 1000 caracteres."""
    if decision not in ResultadoCierreParcial.values:
        raise cumplimiento.EntradaInvalida({"decision": ["Elige aceptado u objetado."]})
    if decision == ResultadoCierreParcial.ACEPTADO:
        if isinstance(motivo, str) and motivo.strip():
            raise cumplimiento.EntradaInvalida({"motivo": ["Aceptar el cierre no lleva motivo."]})
        return decision, ""
    return decision, normalizar_motivo(
        motivo, MAX_MOTIVO_OBJECION, "Explica por qué objetas el cierre."
    )


# --- Reglas (también las usa la lectura para anunciar qué acciones proceden) ---


def _conflicto_estado(estado: str) -> str | None:
    if estado == EstadoPedido.VENCIDO_FALTA_PAGO:
        return C.PEDIDO_VENCIDO
    if estado in ESTADOS_TERMINALES:
        return C.PEDIDO_FINALIZADO
    return None


def conflicto_cancelacion(estado: str, pago: Pago | None, hay_entregas: bool) -> str | None:
    """``None`` si el artesano puede cancelar ahora (D-AUD13-02/03)."""
    if codigo := _conflicto_estado(estado):
        return codigo
    if hay_entregas:
        return C.CANCELACION_REQUIERE_SIN_ENTREGAS
    if pago is not None and pago.estado in PAGOS_SIN_RESOLVER:
        return C.PAGO_PENDIENTE_DE_RESOLUCION
    return None


def conflicto_cierre(
    estado: str, hay_cierre_pendiente: bool, acordadas: dict[int, int], entregadas
) -> str | None:
    """``None`` si el artesano puede proponer un cierre parcial ahora (D-AUD13-04/05)."""
    if codigo := _conflicto_estado(estado):
        return codigo
    if hay_cierre_pendiente:
        return C.CIERRE_PARCIAL_PENDIENTE
    entregado = sum(entregadas[linea] for linea in acordadas)
    pendiente = any(entregadas[linea] < cantidad for linea, cantidad in acordadas.items())
    if entregado == 0 or not pendiente:
        return C.CIERRE_REQUIERE_ENTREGA_PARCIAL
    return None


# --- Piezas comunes de la finalización ---


def _transicion(estado: EstadoOperativoPedido, nuevo: str, *, tipo: str, actor, momento) -> None:
    anterior = estado.estado
    estado.estado = nuevo
    estado.actualizado_en = momento
    estado.save(update_fields=["estado", "actualizado_en"])
    EventoEstadoPedido.objects.create(
        pedido_id=estado.pedido_id,
        estado_anterior=anterior,
        estado_nuevo=nuevo,
        tipo=tipo,
        actor=actor,
        creado_en=momento,
    )


def _finalizar_inventario(
    pedido: Pedido, *, actor, motivo: str, momento, cancelacion=None, cierre=None
) -> list[ObligacionClasificacionInventario]:
    """Libera remanentes no manipulados y crea las obligaciones de clasificación.

    ``cantidad_consumida - entregada`` de cada reserva es la evidencia V1 de unidades
    estándar manipuladas y no entregadas (D-AUD13-15). Producción y personalización desde
    cero no tienen reserva, así que nunca generan obligación (D-AUD13-18).
    """
    entregadas = cumplimiento.cantidades_entregadas(pedido)
    try:
        reservas = inventario.liberar_remanentes_por_finalizacion(
            pedido=pedido, motivo=motivo, actor=actor
        )
    except inventario.ReservaInconsistente as exc:
        logger.critical(
            "Finalización abortada: reserva inconsistente pedido_id=%s reserva_id=%s estado=%s",
            pedido.pk,
            exc.reserva_id,
            exc.estado,
        )
        raise ResolucionInconsistente(str(exc)) from exc
    obligaciones = []
    for reserva in reservas:
        manipulada = reserva.cantidad_consumida - entregadas[reserva.linea_pedido_id]
        if manipulada > 0:
            obligaciones.append(
                ObligacionClasificacionInventario(
                    pedido=pedido,
                    linea_pedido_id=reserva.linea_pedido_id,
                    reserva=reserva,
                    cantidad=manipulada,
                    cancelacion=cancelacion,
                    cierre_parcial=cierre,
                    creado_en=momento,
                )
            )
    return ObligacionClasificacionInventario.objects.bulk_create(obligaciones)


def _bloquear(pedido_id: int, **ownership):
    pedido = cumplimiento._bloquear_pedido(pedido_id, **ownership)
    pago, estado = cumplimiento._bloquear_pago_y_estado(pedido)
    return pedido, pago, estado


# --- Cancelación del artesano ---


@transaction.atomic
def cancelar_pedido(*, artesano, pedido_id: int, motivo: str) -> CancelacionPedido:
    """Cancela por imposibilidad justificada antes de cualquier entrega (RN-017).

    Una transacción: cancelación, liberación de remanentes, obligaciones de clasificación,
    reembolso total si el pago está confirmado, estado ``cancelado_artesano`` y su evento.
    """
    verificar_artesano_habilitado(artesano)
    motivo = normalizar_motivo_cancelacion(motivo)
    pedido, pago, estado = _bloquear(pedido_id, taller__propietario=artesano)
    hay_entregas = EntregaPedido.objects.filter(pedido=pedido).exists()
    if codigo := conflicto_cancelacion(estado.estado, pago, hay_entregas):
        raise ConflictoResolucion(codigo)
    momento = pagos.ahora()
    cancelacion = CancelacionPedido.objects.create(
        pedido=pedido, motivo=motivo, registrado_por=artesano, registrado_en=momento
    )
    obligaciones = _finalizar_inventario(
        pedido,
        actor=artesano,
        motivo=inventario.motivo_liberacion_cancelacion(pedido.pk),
        momento=momento,
        cancelacion=cancelacion,
    )
    if pago is not None and pago.estado == EstadoPago.CONFIRMADO:
        reembolsos.crear_reembolso_total(pedido=pedido, cancelacion=cancelacion, momento=momento)
    _transicion(
        estado,
        EstadoPedido.CANCELADO_ARTESANO,
        tipo=TipoEventoPedido.ARTESANO,
        actor=artesano,
        momento=momento,
    )
    transaction.on_commit(
        lambda: _notificar(EVENTO_CANCELADO, pedido_id=pedido.pk, por_clasificar=len(obligaciones))
    )
    return cancelacion


# --- Cierre parcial ---


@transaction.atomic
def proponer_cierre_parcial(*, artesano, pedido_id: int, motivo: str) -> CierreParcialPedido:
    """Congela cantidades del ledger e importes a reembolsar; no toca inventario (D-AUD13-07).

    El cliente solo aporta el motivo: cantidades e importes los deriva el servidor.
    """
    verificar_artesano_habilitado(artesano)
    motivo = normalizar_motivo_cierre(motivo)
    pedido, _pago, estado = _bloquear(pedido_id, taller__propietario=artesano)
    lineas = list(pedido.lineas.select_related("distribucion").order_by("posicion", "id"))
    entregadas = cumplimiento.cantidades_entregadas(pedido)
    pendiente = cumplimiento.cierre_pendiente(pedido.pk) is not None
    acordadas = {linea.pk: linea.cantidad for linea in lineas}
    if codigo := conflicto_cierre(estado.estado, pendiente, acordadas, entregadas):
        raise ConflictoResolucion(codigo)
    calculadas = reembolsos.calcular_cierre(pedido, lineas, entregadas)
    monto = reembolsos.monto_total(calculadas)
    if not 0 < monto < pedido.total:
        logger.critical(
            "Cierre abortado: reembolso fuera de rango pedido_id=%s monto=%s", pedido.pk, monto
        )
        raise ResolucionInconsistente(f"Reembolso parcial fuera de rango: {monto}.")
    momento = pagos.ahora()
    # El lock del pedido serializa la numeración; el UNIQUE (pedido, numero) la respalda.
    numero = (pedido.cierres_parciales.aggregate(maximo=Max("numero"))["maximo"] or 0) + 1
    cierre = CierreParcialPedido.objects.create(
        pedido=pedido, numero=numero, motivo=motivo, propuesto_por=artesano, propuesto_en=momento
    )
    LineaCierreParcial.objects.bulk_create(
        LineaCierreParcial(
            cierre=cierre,
            linea_pedido_id=c.linea_pedido_id,
            cantidad_acordada=c.cantidad_acordada,
            cantidad_entregada=c.cantidad_entregada,
            cantidad_no_entregada=c.cantidad_no_entregada,
            importe_reembolso=c.importe_reembolso,
        )
        for c in calculadas
    )
    transaction.on_commit(
        lambda: _notificar(EVENTO_CIERRE_PROPUESTO, pedido_id=pedido.pk, cierre=numero, monto=monto)
    )
    return cierre


@transaction.atomic
def responder_cierre_parcial(
    *, comprador, pedido_id: int, cierre_id: int, decision: str, motivo: str = ""
) -> DecisionCierreParcial:
    """Respuesta única del comprador (RN-019).

    Objetar solo deja la decisión: el pedido sigue ``en_cumplimiento`` con sus reservas,
    inventario y sin reembolso (D-AUD13-06). Aceptar finaliza en la misma transacción:
    liberaciones, obligaciones, reembolso parcial congelado y ``cerrado_parcial`` con un
    evento ``tipo="comprador"`` (D-AUD13-07).
    """
    verificar_comprador_activo(comprador)
    decision, motivo = normalizar_respuesta(decision, motivo)
    pedido, pago, estado = _bloquear(pedido_id, comprador=comprador)
    cierre = (
        CierreParcialPedido.objects.select_for_update(of=("self",))
        .filter(pk=cierre_id, pedido=pedido)
        .first()
    )
    if cierre is None:
        raise CierreNoEncontrado
    if DecisionCierreParcial.objects.filter(cierre=cierre).exists():
        raise ConflictoResolucion(C.CIERRE_YA_RESUELTO)
    # Defensa: un cierre sin decisión solo existe en un pedido en cumplimiento.
    if codigo := _conflicto_estado(estado.estado):
        raise ConflictoResolucion(codigo)
    momento = pagos.ahora()
    registro = DecisionCierreParcial.objects.create(
        cierre=cierre,
        decision=decision,
        motivo=motivo,
        registrado_por=comprador,
        registrado_en=momento,
    )
    if decision == ResultadoCierreParcial.OBJETADO:
        transaction.on_commit(
            lambda: _notificar(EVENTO_CIERRE_OBJETADO, pedido_id=pedido.pk, cierre=cierre.numero)
        )
        return registro

    lineas_cierre = list(cierre.lineas.all())
    entregadas = cumplimiento.cantidades_entregadas(pedido)
    desactualizadas = [
        lc.linea_pedido_id
        for lc in lineas_cierre
        if lc.cantidad_entregada != entregadas[lc.linea_pedido_id]
    ]
    if desactualizadas or pago is None or pago.estado != EstadoPago.CONFIRMADO:
        logger.critical(
            "Cierre abortado: snapshot o pago inconsistentes pedido_id=%s cierre_id=%s",
            pedido.pk,
            cierre.pk,
        )
        raise ResolucionInconsistente(f"El cierre #{cierre.pk} no coincide con el pedido.")
    obligaciones = _finalizar_inventario(
        pedido,
        actor=comprador,
        motivo=inventario.motivo_liberacion_cierre(pedido.pk),
        momento=momento,
        cierre=cierre,
    )
    monto = reembolsos.monto_total(lineas_cierre)
    reembolsos.crear_reembolso_parcial(pedido=pedido, cierre=cierre, monto=monto, momento=momento)
    _transicion(
        estado,
        EstadoPedido.CERRADO_PARCIAL,
        tipo=TipoEventoPedido.COMPRADOR,
        actor=comprador,
        momento=momento,
    )
    transaction.on_commit(
        lambda: _notificar(
            EVENTO_CERRADO,
            pedido_id=pedido.pk,
            cierre=cierre.numero,
            por_clasificar=len(obligaciones),
        )
    )
    return registro


# --- Idempotencia (AUD-08, D-AUD13-20): huellas normalizadas con el recurso destino ---


def cancelar_pedido_idempotente(
    *, artesano, clave: str, pedido_id: int, motivo: str
) -> operaciones.ResultadoIdempotente:
    motivo = normalizar_motivo_cancelacion(motivo)
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.CANCELAR_PEDIDO_ARTESANO,
        clave=clave,
        datos={"pedido_id": pedido_id, "motivo": motivo},
        operacion=lambda: cancelar_pedido(artesano=artesano, pedido_id=pedido_id, motivo=motivo),
        codigo_http=HTTPStatus.CREATED,
    )


def proponer_cierre_parcial_idempotente(
    *, artesano, clave: str, pedido_id: int, motivo: str
) -> operaciones.ResultadoIdempotente:
    # Cantidades e importes no forman parte de la huella: los deriva el servidor.
    motivo = normalizar_motivo_cierre(motivo)
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.PROPONER_CIERRE_PARCIAL,
        clave=clave,
        datos={"pedido_id": pedido_id, "motivo": motivo},
        operacion=lambda: proponer_cierre_parcial(
            artesano=artesano, pedido_id=pedido_id, motivo=motivo
        ),
        codigo_http=HTTPStatus.CREATED,
    )


def responder_cierre_parcial_idempotente(
    *, comprador, clave: str, pedido_id: int, cierre_id: int, decision: str, motivo: str = ""
) -> operaciones.ResultadoIdempotente:
    decision, motivo = normalizar_respuesta(decision, motivo)
    return operaciones.ejecutar_idempotente(
        actor=comprador,
        tipo=TipoOperacion.RESPONDER_CIERRE_PARCIAL,
        clave=clave,
        datos={
            "pedido_id": pedido_id,
            "cierre_id": cierre_id,
            "decision": decision,
            "motivo": motivo,
        },
        operacion=lambda: responder_cierre_parcial(
            comprador=comprador,
            pedido_id=pedido_id,
            cierre_id=cierre_id,
            decision=decision,
            motivo=motivo,
        ),
        codigo_http=HTTPStatus.CREATED,
    )
