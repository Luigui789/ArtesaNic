"""Emisión transaccional e idempotente de la propuesta final (AUD-06).

Una sola operación: la solicitud ya revisada más las condiciones comerciales del
artesano producen la propuesta completa, o nada. No hay borradores persistentes,
edición posterior, pedido confirmado ni reservas (AUD-07).
"""

from decimal import Decimal
from http import HTTPStatus

from django.db import transaction
from django.utils import timezone

from apps.catalogo.models import Modalidad
from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import EstadoSolicitud, ResolucionRenglon, errores_entrega
from apps.solicitudes.services import CodigoConflicto, ConflictoSolicitud, EntradaInvalida

from .models import (
    CERO,
    DECIMALES,
    DIGITOS_IMPORTE,
    MAX_OTROS_CARGOS,
    CargoPropuesta,
    LineaPropuesta,
    Propuesta,
)

# Mayor importe representable con DIGITOS_IMPORTE dígitos y dos decimales.
IMPORTE_MAXIMO = Decimal(10 ** (DIGITOS_IMPORTE - DECIMALES)) - Decimal("0.01")
MENSAJE_IMPORTE = "El importe supera el máximo técnico admitido."

_CONFLICTO_POR_ESTADO = {
    EstadoSolicitud.PENDIENTE_REVISION: CodigoConflicto.RENGLONES_PENDIENTES,
    EstadoSolicitud.RECHAZADA: CodigoConflicto.SOLICITUD_RECHAZADA,
    EstadoSolicitud.PROPUESTA_EMITIDA: CodigoConflicto.PROPUESTA_YA_EMITIDA,
}


def _validar_lineas(lineas: list[dict], aceptados: dict, hoy) -> list[dict]:
    """Exactamente los renglones aceptados, una vez cada uno, con los datos de su
    modalidad. Un renglón rechazado, ajeno o repetido es un error de entrada."""
    errores, vistos = [], set()
    for datos in lineas:
        error = {}
        renglon = aceptados.get(datos["renglon"])
        if renglon is None:
            error["renglon"] = ["Solo se cotizan renglones aceptados de esta solicitud."]
        elif datos["renglon"] in vistos:
            error["renglon"] = ["Cada renglón aceptado se cotiza una sola vez."]
        else:
            vistos.add(renglon.pk)
            fecha = datos.get("fecha_comprometida")
            if renglon.modalidad == Modalidad.PRODUCCION:
                if fecha is None:
                    error["fecha_comprometida"] = ["Indica la fecha comprometida de producción."]
                elif fecha < hoy:
                    error["fecha_comprometida"] = [
                        "La fecha comprometida no puede ser anterior a hoy."
                    ]
            elif "fecha_comprometida" in datos:
                error["fecha_comprometida"] = ["Este campo solo corresponde a producción."]
            if "cargo_personalizacion" in datos and renglon.modalidad != Modalidad.PERSONALIZACION:
                error["cargo_personalizacion"] = ["Este cargo solo corresponde a personalización."]
        errores.append(error)
    faltantes = set(aceptados) - vistos
    if any(errores) or faltantes:
        detalle = {"lineas": errores} if any(errores) else {}
        if faltantes:
            detalle.setdefault("non_field_errors", []).append(
                "Incluye en la propuesta todos los renglones aceptados."
            )
        raise EntradaInvalida(detalle)
    return lineas


def _validar_cargos(otros_cargos: list[dict], aceptados: dict) -> None:
    if len(otros_cargos) > MAX_OTROS_CARGOS:
        raise EntradaInvalida(
            {"otros_cargos": [f"Una propuesta admite hasta {MAX_OTROS_CARGOS} cargos."]}
        )
    errores = [
        {"renglon": ["El cargo solo puede atribuirse a un renglón aceptado."]}
        if datos.get("renglon") is not None and datos["renglon"] not in aceptados
        else {}
        for datos in otros_cargos
    ]
    if any(errores):
        raise EntradaInvalida({"otros_cargos": errores})


def _acotar(importe: Decimal) -> Decimal:
    if importe > IMPORTE_MAXIMO:
        raise EntradaInvalida({"non_field_errors": [MENSAJE_IMPORTE]})
    return importe


@transaction.atomic
def finalizar_propuesta(
    *,
    artesano,
    solicitud_id: int,
    modalidad_entrega: str,
    costo_entrega: Decimal,
    lineas: list[dict],
    descripcion_entrega: str = "",
    otros_cargos: list[dict] | None = None,
) -> Propuesta:
    """Emite la propuesta final de una solicitud lista para propuesta.

    Bloquea la solicitud, comprueba ownership y estado dentro del lock, toma el precio
    vigente del producto en el servidor, calcula subtotales y total, crea propuesta,
    líneas y cargos, y pasa la solicitud a ``propuesta_emitida`` en la misma
    transacción. Cualquier fallo revierte todo. El cliente nunca aporta precios,
    subtotales, total, comprador, taller ni estado.
    """
    otros_cargos = otros_cargos or []
    solicitudes.verificar_artesano_habilitado(artesano)
    solicitud = solicitudes.bloquear_solicitud_recibida(artesano, solicitud_id)
    if solicitud.estado in _CONFLICTO_POR_ESTADO:
        raise ConflictoSolicitud(_CONFLICTO_POR_ESTADO[solicitud.estado])

    renglones = list(solicitud.renglones.select_related("producto"))
    # Defensa ante escrituras fuera del servicio: el estado no basta como prueba.
    if any(r.resolucion == ResolucionRenglon.PENDIENTE for r in renglones):
        raise ConflictoSolicitud(CodigoConflicto.RENGLONES_PENDIENTES)
    aceptados = {r.pk: r for r in renglones if r.resolucion == ResolucionRenglon.ACEPTADO}
    if not aceptados:
        raise ConflictoSolicitud(CodigoConflicto.SIN_RENGLONES_ACEPTADOS)

    errores = errores_entrega(modalidad_entrega, descripcion_entrega, opcional=False)
    if errores:
        raise EntradaInvalida({f"{c}_entrega": [m] for c, m in errores.items()})
    _validar_lineas(lineas, aceptados, timezone.localdate())
    _validar_cargos(otros_cargos, aceptados)

    filas = []
    for datos in lineas:
        renglon = aceptados[datos["renglon"]]
        precio = renglon.producto.precio
        filas.append(
            LineaPropuesta(
                renglon=renglon,
                modalidad=renglon.modalidad,
                cantidad=renglon.cantidad,
                precio_unitario=precio,
                subtotal=_acotar(precio * renglon.cantidad),
                cargo_personalizacion=datos.get("cargo_personalizacion", CERO),
                fecha_comprometida=datos.get("fecha_comprometida"),
            )
        )
    subtotal_productos = _acotar(sum((f.subtotal for f in filas), CERO))
    total_personalizacion = _acotar(sum((f.cargo_personalizacion for f in filas), CERO))
    total_otros_cargos = _acotar(sum((c["monto"] for c in otros_cargos), CERO))
    total = _acotar(subtotal_productos + total_personalizacion + total_otros_cargos + costo_entrega)

    propuesta = Propuesta.objects.create(
        solicitud=solicitud,
        emitida_por=artesano,
        modalidad_entrega=modalidad_entrega,
        descripcion_entrega=descripcion_entrega,
        costo_entrega=costo_entrega,
        subtotal_productos=subtotal_productos,
        total_personalizacion=total_personalizacion,
        total_otros_cargos=total_otros_cargos,
        total=total,
    )
    for fila in filas:
        fila.propuesta = propuesta
    # PostgreSQL devuelve las claves: los cargos pueden referenciar sus líneas.
    LineaPropuesta.objects.bulk_create(filas)
    linea_de = {fila.renglon_id: fila for fila in filas}
    CargoPropuesta.objects.bulk_create(
        CargoPropuesta(
            propuesta=propuesta,
            linea=linea_de.get(datos.get("renglon")),
            posicion=posicion,
            descripcion=datos["descripcion"],
            monto=datos["monto"],
        )
        for posicion, datos in enumerate(otros_cargos, start=1)
    )

    solicitud.estado = EstadoSolicitud.PROPUESTA_EMITIDA
    solicitud.save(update_fields=["estado", "actualizado_en"])
    return propuesta


def finalizar_propuesta_idempotente(
    *, artesano, clave: str, solicitud_id: int, **condiciones
) -> operaciones.ResultadoIdempotente:
    """La huella incluye la solicitud y todas las condiciones comerciales enviadas: la
    misma clave en otra solicitud o con otras condiciones responde 409."""
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.FINALIZAR_PROPUESTA,
        clave=clave,
        datos={"solicitud_id": solicitud_id, **condiciones},
        operacion=lambda: finalizar_propuesta(
            artesano=artesano, solicitud_id=solicitud_id, **condiciones
        ),
        codigo_http=HTTPStatus.CREATED,
    )
