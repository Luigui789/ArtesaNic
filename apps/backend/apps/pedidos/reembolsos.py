"""Obligaciones de reembolso y devolución externa (AUD-13; RF-006.4, RF-021; RN-017, RN-019).

La plataforma no mueve dinero: registra la obligación con el importe calculado por el
servidor desde el snapshot congelado y, después, la evidencia de la devolución externa.

Cálculos (D-AUD13-10/11, centavos enteros, nunca floats ni importes del cliente):

- **Total** (cancelación con Pago confirmado): exactamente ``Pedido.total``.
- **Parcial** (cierre aceptado), por renglón::

      base_reembolsable = subtotal + cargo_personalizacion + Σ CargoPedido de la línea
                          + otros_compartidos_asignados + entrega_asignada
      importe = ROUND_HALF_UP(base_reembolsable × no_entregada / acordada, 0.01)

  ``Σ base_reembolsable = Pedido.total`` (se comprueba). La proporción por unidad no
  entregada se aplica también a personalización, cargos de la línea, cargos globales y
  entrega asignados.

Estado (D-AUD13-13): «Pendiente» sin ``DevolucionReembolso``; «Realizado» con ella.
"""

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from http import HTTPStatus

from django.db import transaction

from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.pagos import services as pagos
from apps.propuestas.distribucion import a_centavos, de_centavos
from apps.solicitudes.services import verificar_artesano_habilitado

from . import cumplimiento
from .errores import (
    CodigoConflictoResolucion,
    ConflictoResolucion,
    ReembolsoNoEncontrado,
    ResolucionInconsistente,
)
from .models import (
    MAX_REFERENCIA_DEVOLUCION,
    CargoPedido,
    DevolucionReembolso,
    EstadoReembolso,
    LineaPedido,
    Pedido,
    ReembolsoPedido,
    TipoReembolso,
)

logger = logging.getLogger(__name__)

# Nombres estables de los puntos de integración para notificaciones (AUD-20, RN-020).
EVENTO_REEMBOLSO_CREADO = "reembolso_creado"
EVENTO_REEMBOLSO_REALIZADO = "reembolso_realizado"


# --- Cálculo ---


def bases_reembolsables(pedido: Pedido, lineas: list[LineaPedido]) -> dict[int, Decimal]:
    """Base económica de cada línea del snapshot; su suma debe ser ``Pedido.total``.

    ``lineas`` debe venir con ``distribucion`` cargada (``select_related``).
    """
    cargos: dict[int, Decimal] = {}
    for linea_id, monto in CargoPedido.objects.filter(
        pedido=pedido, linea__isnull=False
    ).values_list("linea_id", "monto"):
        cargos[linea_id] = cargos.get(linea_id, Decimal("0.00")) + monto
    bases = {}
    for linea in lineas:
        distribucion = getattr(linea, "distribucion", None)
        if distribucion is None:
            logger.critical(
                "Reembolso abortado: línea sin distribución pedido_id=%s linea_id=%s",
                pedido.pk,
                linea.pk,
            )
            raise ResolucionInconsistente(f"La línea #{linea.pk} no tiene distribución.")
        bases[linea.pk] = (
            linea.subtotal
            + linea.cargo_personalizacion
            + cargos.get(linea.pk, Decimal("0.00"))
            + distribucion.otros_compartidos_asignados
            + distribucion.entrega_asignada
        )
    if sum(bases.values(), Decimal("0.00")) != pedido.total:
        logger.critical("Reembolso abortado: el desglose no suma el total pedido_id=%s", pedido.pk)
        raise ResolucionInconsistente(f"El desglose del pedido #{pedido.pk} no suma su total.")
    return bases


def importe_proporcional(base: Decimal, no_entregada: int, acordada: int) -> Decimal:
    """``base × no_entregada / acordada`` redondeado ``ROUND_HALF_UP`` al centavo, exacto."""
    if acordada < 1 or not 0 <= no_entregada <= acordada:
        raise ValueError("Cantidades fuera de rango.")
    cociente, resto = divmod(a_centavos(base) * no_entregada, acordada)
    if 2 * resto >= acordada:
        cociente += 1
    return de_centavos(cociente)


@dataclass(frozen=True)
class LineaCalculada:
    linea_pedido_id: int
    posicion: int
    cantidad_acordada: int
    cantidad_entregada: int
    cantidad_no_entregada: int
    importe_reembolso: Decimal


def calcular_cierre(pedido: Pedido, lineas: list[LineaPedido], entregadas) -> list[LineaCalculada]:
    """Snapshot por renglón de un cierre parcial desde el ledger de entregas (AUD-12)."""
    bases = bases_reembolsables(pedido, lineas)
    calculadas = []
    for linea in lineas:
        entregada = entregadas[linea.pk]
        no_entregada = linea.cantidad - entregada
        calculadas.append(
            LineaCalculada(
                linea_pedido_id=linea.pk,
                posicion=linea.posicion,
                cantidad_acordada=linea.cantidad,
                cantidad_entregada=entregada,
                cantidad_no_entregada=no_entregada,
                importe_reembolso=importe_proporcional(
                    bases[linea.pk], no_entregada, linea.cantidad
                ),
            )
        )
    return calculadas


def monto_total(calculadas) -> Decimal:
    return sum((c.importe_reembolso for c in calculadas), Decimal("0.00"))


def estado_reembolso(reembolso: ReembolsoPedido) -> str:
    realizado = getattr(reembolso, "devolucion", None) is not None
    return EstadoReembolso.REALIZADO if realizado else EstadoReembolso.PENDIENTE


# --- Obligaciones (dentro de la transacción de cancelación o de aceptación del cierre) ---


def _notificar(evento: str, **datos) -> None:
    """Se ejecuta tras el COMMIT. AUD-20 enganchará aquí la notificación persistente."""
    logger.info(
        "%s %s", evento, " ".join(f"{clave}={valor}" for clave, valor in sorted(datos.items()))
    )


def crear_reembolso_total(*, pedido: Pedido, cancelacion, momento) -> ReembolsoPedido:
    """Cancelación con fondos confirmados: devuelve exactamente ``Pedido.total``."""
    reembolso = ReembolsoPedido.objects.create(
        pedido=pedido,
        tipo=TipoReembolso.TOTAL,
        monto=pedido.total,
        moneda=pedido.moneda,
        cancelacion=cancelacion,
        creado_en=momento,
    )
    transaction.on_commit(
        lambda: _notificar(
            EVENTO_REEMBOLSO_CREADO, pedido_id=pedido.pk, tipo=reembolso.tipo, monto=reembolso.monto
        )
    )
    return reembolso


def crear_reembolso_parcial(*, pedido: Pedido, cierre, monto: Decimal, momento) -> ReembolsoPedido:
    """Cierre aceptado: la suma congelada de ``LineaCierreParcial.importe_reembolso``."""
    reembolso = ReembolsoPedido.objects.create(
        pedido=pedido,
        tipo=TipoReembolso.PARCIAL,
        monto=monto,
        moneda=pedido.moneda,
        cierre_parcial=cierre,
        creado_en=momento,
    )
    transaction.on_commit(
        lambda: _notificar(
            EVENTO_REEMBOLSO_CREADO, pedido_id=pedido.pk, tipo=reembolso.tipo, monto=reembolso.monto
        )
    )
    return reembolso


# --- Devolución externa ---


def normalizar_devolucion(fecha, referencia) -> tuple[date, str]:
    """Fecha no futura en America/Managua y referencia recortada de 1 a 120 caracteres."""
    errores: dict[str, list[str]] = {}
    if not isinstance(fecha, date):
        errores["fecha"] = ["Indica la fecha de la devolución (AAAA-MM-DD)."]
    elif fecha > cumplimiento.hoy_local():
        errores["fecha"] = ["La fecha de la devolución no puede ser posterior a hoy."]
    referencia = referencia.strip() if isinstance(referencia, str) else ""
    if not referencia:
        errores["referencia"] = ["Indica la referencia de la devolución."]
    elif len(referencia) > MAX_REFERENCIA_DEVOLUCION:
        errores["referencia"] = [
            f"La referencia admite hasta {MAX_REFERENCIA_DEVOLUCION} caracteres."
        ]
    if errores:
        raise cumplimiento.EntradaInvalida(errores)
    return fecha, referencia


@transaction.atomic
def registrar_devolucion(*, artesano, pedido_id: int, fecha, referencia) -> DevolucionReembolso:
    """Registra la devolución externa del reembolso del pedido (RF-021.5/6).

    El monto se copia de la obligación; el cliente solo declara fecha y referencia. Una
    devolución por reembolso: no se edita, no se elimina ni se vuelve a registrar.
    Locks: ``Pedido → ReembolsoPedido``.
    """
    verificar_artesano_habilitado(artesano)
    fecha, referencia = normalizar_devolucion(fecha, referencia)
    pedido = cumplimiento._bloquear_pedido(pedido_id, taller__propietario=artesano)
    reembolso = ReembolsoPedido.objects.select_for_update().filter(pedido=pedido).first()
    if reembolso is None:
        raise ReembolsoNoEncontrado
    if DevolucionReembolso.objects.filter(reembolso=reembolso).exists():
        raise ConflictoResolucion(CodigoConflictoResolucion.REEMBOLSO_YA_REALIZADO)
    devolucion = DevolucionReembolso.objects.create(
        reembolso=reembolso,
        fecha=fecha,
        monto=reembolso.monto,
        referencia=referencia,
        registrado_por=artesano,
        registrado_en=pagos.ahora(),
    )
    transaction.on_commit(
        lambda: _notificar(EVENTO_REEMBOLSO_REALIZADO, pedido_id=pedido.pk, monto=devolucion.monto)
    )
    return devolucion


def registrar_devolucion_idempotente(
    *, artesano, clave: str, pedido_id: int, fecha, referencia
) -> operaciones.ResultadoIdempotente:
    """Huella con pedido, reembolso, fecha y referencia recortada; nunca el monto."""
    fecha, referencia = normalizar_devolucion(fecha, referencia)
    reembolso_id = (
        ReembolsoPedido.objects.filter(pedido_id=pedido_id, pedido__taller__propietario=artesano)
        .values_list("pk", flat=True)
        .first()
    )
    if reembolso_id is None:
        if not Pedido.objects.filter(pk=pedido_id, taller__propietario=artesano).exists():
            raise cumplimiento.PedidoNoEncontrado
        raise ReembolsoNoEncontrado
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.REGISTRAR_DEVOLUCION_REEMBOLSO,
        clave=clave,
        datos={
            "pedido_id": pedido_id,
            "reembolso_id": reembolso_id,
            "fecha": fecha,
            "referencia": referencia,
        },
        operacion=lambda: registrar_devolucion(
            artesano=artesano, pedido_id=pedido_id, fecha=fecha, referencia=referencia
        ),
        codigo_http=HTTPStatus.CREATED,
    )
