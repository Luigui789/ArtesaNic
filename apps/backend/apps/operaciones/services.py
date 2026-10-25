"""Ejecución idempotente de mutaciones comerciales (AUD-08).

Contrato: misma clave y misma huella repiten el resultado ya confirmado; misma clave y
otra huella es un conflicto; claves distintas son operaciones distintas aunque el
contenido coincida. No se deduplica por contenido.

Concurrencia: el registro y la mutación comparten una transacción. El INSERT del
registro es el árbitro: PostgreSQL hace esperar a un segundo INSERT con la misma
``(actor, tipo, clave)`` hasta que la primera transacción confirme (entonces falla por
la restricción única y se lee el resultado) o se revierta (entonces procede). Un fallo
revierte también el registro, de modo que nunca queda «en progreso» ni un éxito falso.
"""

import hashlib
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from http import HTTPStatus

from django.db import IntegrityError, models, transaction
from django.utils import timezone

from .models import PATRON_CLAVE, EstadoOperacion, OperacionIdempotente, TipoOperacion

RESTRICCION_UNICA = "operacion_clave_unica_por_actor"
CODIGO_CLAVE_REUTILIZADA = "clave_idempotencia_reutilizada"
_FORMATO_CLAVE = re.compile(PATRON_CLAVE)


class ClaveIdempotenciaInvalida(Exception):
    """La clave falta o no cumple el formato técnico."""


class ClaveIdempotenciaReutilizada(Exception):
    """La clave ya identifica otra petición de este actor y tipo."""


@dataclass(frozen=True)
class ResultadoIdempotente:
    operacion: OperacionIdempotente
    # True si se devolvió el resultado de una ejecución anterior sin repetir la mutación.
    repetida: bool


def validar_clave(clave: object) -> str:
    """Formato técnico, no comercial: 16–128 caracteres no reservados de URL."""
    if not isinstance(clave, str) or not _FORMATO_CLAVE.fullmatch(clave):
        raise ClaveIdempotenciaInvalida
    return clave


def _canonico(valor):
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return str(valor)
    raise TypeError(f"Valor no serializable en la huella: {type(valor).__name__}")


def calcular_huella(datos: Mapping) -> str:
    """SHA-256 del JSON canónico: claves ordenadas, sin espacios, listas en su orden.

    El llamador entrega solo el contrato de entrada ya normalizado (sin identidad,
    cabeceras ni tokens); el orden de las listas sí es significativo.
    """
    canonico = json.dumps(
        datos, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_canonico
    )
    return hashlib.sha256(canonico.encode()).hexdigest()


def _es_restriccion_unica(exc: IntegrityError) -> bool:
    diag = getattr(exc.__cause__, "diag", None)
    return getattr(diag, "constraint_name", None) == RESTRICCION_UNICA


def _resultado_previo(actor, tipo, clave, huella) -> ResultadoIdempotente | None:
    previa = OperacionIdempotente.objects.del_actor(actor).filter(tipo=tipo, clave=clave).first()
    if previa is None:
        return None
    if previa.estado != EstadoOperacion.COMPLETADA:  # pragma: no cover - invariante
        raise RuntimeError("Operación idempotente visible sin completar.")
    if previa.huella != huella:
        raise ClaveIdempotenciaReutilizada
    return ResultadoIdempotente(previa, repetida=True)


def ejecutar_idempotente(
    *,
    actor,
    tipo: TipoOperacion,
    clave: str,
    datos: Mapping,
    operacion: Callable[[], models.Model],
    codigo_http: int = HTTPStatus.CREATED,
) -> ResultadoIdempotente:
    """Ejecuta ``operacion`` una sola vez por ``(actor, tipo, clave)``.

    ``operacion`` es la mutación del servicio de dominio, que conserva todas sus
    validaciones y devuelve el recurso resultante. Sus excepciones se propagan y no
    dejan registro: la misma clave podrá usarse de nuevo. ``actor`` procede siempre
    de la autenticación del servidor; la clave nunca autentica ni autoriza.
    """
    clave = validar_clave(clave)
    huella = calcular_huella(datos)
    # Camino rápido de una repetición ya confirmada; no sustituye al árbitro único.
    previo = _resultado_previo(actor, tipo, clave, huella)
    if previo is not None:
        return previo
    with transaction.atomic():
        try:
            with transaction.atomic():
                registro = OperacionIdempotente.objects.create(
                    actor=actor, tipo=tipo, clave=clave, huella=huella
                )
        except IntegrityError as exc:
            if not _es_restriccion_unica(exc):
                raise
            # La transacción concurrente ya confirmó: su fila es visible (READ COMMITTED).
            previo = _resultado_previo(actor, tipo, clave, huella)
            if previo is None:  # pragma: no cover - invariante
                raise
            return previo
        recurso = operacion()
        registro.estado = EstadoOperacion.COMPLETADA
        registro.recurso_tipo = recurso._meta.label_lower
        registro.recurso_id = recurso.pk
        registro.codigo_http = int(codigo_http)
        registro.completado_en = timezone.now()
        registro.save(
            update_fields=["estado", "recurso_tipo", "recurso_id", "codigo_http", "completado_en"]
        )
    return ResultadoIdempotente(registro, repetida=False)


def consultar_operacion(actor, tipo: str, clave: str) -> OperacionIdempotente | None:
    """Resultado confirmado de una operación propia; ``None`` si no existe o es ajena."""
    if tipo not in TipoOperacion.values:
        return None
    try:
        clave = validar_clave(clave)
    except ClaveIdempotenciaInvalida:
        return None
    return (
        OperacionIdempotente.objects.del_actor(actor)
        .completadas()
        .filter(tipo=tipo, clave=clave)
        .first()
    )
