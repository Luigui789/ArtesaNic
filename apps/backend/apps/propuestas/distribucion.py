"""Distribución económica determinista por línea (AUD-13; RF-006.4, RF-021.3; D-AUD13-08/09).

Los cargos globales (``CargoPropuesta.linea IS NULL``) y el costo de entrega no pertenecen a
ningún renglón. Para que el desglose congelado permita calcular reembolsos parciales, al
emitir la propuesta se reparten entre sus líneas y el reparto se congela antes de que el
comprador decida; el ``Pedido`` lo copia sin recalcular.

Algoritmo (centavos enteros, nunca floats):

1. ``base_linea = subtotal + cargo_personalizacion + Σ cargos atribuidos a la línea``.
2. Cada pool (``otros`` y ``entrega``, de forma independiente) se reparte en proporción a
   ``base_linea / Σ base_linea`` con el método de mayor residuo: parte entera de la cuota
   exacta y los centavos restantes, uno por línea, a los mayores residuos; empate → menor
   ``posicion``.

Garantía: la suma asignada de cada pool es exactamente el pool, al centavo.

Este módulo no depende de modelos: lo reutilizan el servicio de emisión, la migración de
datos de las propuestas existentes y el cálculo de reembolsos.
"""

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from operator import attrgetter

CENTAVO = Decimal("0.01")


def a_centavos(importe: Decimal) -> int:
    """Importe NIO con dos decimales → centavos enteros (exacto)."""
    centavos = Decimal(importe) * 100
    if centavos != centavos.to_integral_value():
        raise ValueError(f"Importe con más de dos decimales: {importe}")
    return int(centavos)


def de_centavos(centavos: int) -> Decimal:
    return (Decimal(centavos) / 100).quantize(CENTAVO)


@dataclass(frozen=True)
class BaseLinea:
    """Peso económico de una línea: ``clave`` la identifica; ``posicion`` desempata."""

    clave: int
    posicion: int
    base: Decimal


@dataclass(frozen=True)
class Asignacion:
    otros_compartidos_asignados: Decimal
    entrega_asignada: Decimal


def repartir(pool: Decimal, bases: Sequence[BaseLinea]) -> list[Decimal]:
    """Reparte ``pool`` por mayor residuo; devuelve un importe por base, en el mismo orden."""
    total = a_centavos(pool)
    if total < 0:
        raise ValueError("El pool a repartir no puede ser negativo.")
    pesos = [a_centavos(b.base) for b in bases]
    if total == 0:
        return [de_centavos(0) for _ in bases]
    suma = sum(pesos)
    if not bases or suma <= 0 or any(p < 0 for p in pesos):
        raise ValueError("Se requiere al menos una línea con base económica positiva.")
    cuotas, residuos = [], []
    for peso in pesos:
        # Cuota exacta = total * peso / suma; los residuos comparten denominador.
        entero, residuo = divmod(total * peso, suma)
        cuotas.append(entero)
        residuos.append(residuo)
    restantes = total - sum(cuotas)
    orden = sorted(range(len(bases)), key=lambda i: (-residuos[i], bases[i].posicion))
    for i in orden[:restantes]:
        cuotas[i] += 1
    return [de_centavos(c) for c in cuotas]


def distribuir(
    bases: Sequence[BaseLinea], *, pool_otros: Decimal, pool_entrega: Decimal
) -> dict[int, Asignacion]:
    """Asignación de ambos pools por ``clave`` de línea."""
    otros = repartir(pool_otros, bases)
    entrega = repartir(pool_entrega, bases)
    return {b.clave: Asignacion(o, e) for b, o, e in zip(bases, otros, entrega, strict=True)}


def bases_de_lineas(
    lineas: Iterable, cargos: Iterable, *, posicion: Callable = attrgetter("posicion")
) -> list[BaseLinea]:
    """Bases desde líneas con ``pk``, ``subtotal`` y ``cargo_personalizacion`` y cargos con
    ``linea_id`` y ``monto`` (propuesta o snapshot del pedido). ``posicion`` obtiene la
    posición del renglón de cada línea (la propuesta la lee de su ``renglon``)."""
    por_linea: dict[int, Decimal] = {}
    for cargo in cargos:
        if cargo.linea_id is not None:
            por_linea[cargo.linea_id] = por_linea.get(cargo.linea_id, Decimal("0")) + cargo.monto
    return [
        BaseLinea(
            clave=linea.pk,
            posicion=posicion(linea),
            base=linea.subtotal + linea.cargo_personalizacion + por_linea.get(linea.pk, Decimal(0)),
        )
        for linea in lineas
    ]


def pool_otros(cargos: Iterable) -> Decimal:
    return sum((c.monto for c in cargos if c.linea_id is None), Decimal("0.00"))


def completar_distribuciones(
    *, Propuesta, LineaPropuesta, CargoPropuesta, DistribucionEconomicaLineaPropuesta
) -> int:
    """Crea la distribución que falte en las propuestas existentes con este mismo algoritmo.

    Recibe las clases de modelo para servir a la migración de datos (modelos históricos) y a
    las pruebas. Idempotente: omite las propuestas que ya tienen distribución y no modifica
    ningún importe. Devuelve el número de distribuciones creadas.
    """
    creadas = 0
    pendientes = (
        Propuesta.objects.filter(lineas__distribucion__isnull=True)
        .distinct()
        .order_by("pk")
        .values_list("pk", "costo_entrega")
    )
    for propuesta_id, costo_entrega in pendientes.iterator():
        lineas = list(
            LineaPropuesta.objects.filter(propuesta_id=propuesta_id)
            .select_related("renglon")
            .order_by("renglon__posicion", "pk")
        )
        cargos = list(CargoPropuesta.objects.filter(propuesta_id=propuesta_id).order_by("pk"))
        asignaciones = distribuir(
            bases_de_lineas(lineas, cargos, posicion=lambda linea: linea.renglon.posicion),
            pool_otros=pool_otros(cargos),
            pool_entrega=costo_entrega,
        )
        existentes = set(
            DistribucionEconomicaLineaPropuesta.objects.filter(
                linea_propuesta__propuesta_id=propuesta_id
            ).values_list("linea_propuesta_id", flat=True)
        )
        nuevas = [
            DistribucionEconomicaLineaPropuesta(
                linea_propuesta_id=linea.pk,
                otros_compartidos_asignados=asignaciones[linea.pk].otros_compartidos_asignados,
                entrega_asignada=asignaciones[linea.pk].entrega_asignada,
            )
            for linea in lineas
            if linea.pk not in existentes
        ]
        DistribucionEconomicaLineaPropuesta.objects.bulk_create(nuevas)
        creadas += len(nuevas)
    return creadas
