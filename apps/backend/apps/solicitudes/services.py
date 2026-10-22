"""Alta y revisión transaccionales, protegidas contra reintentos (AUD-05/06/08).

AUD-06 resuelve renglones aquí; la propuesta vive en ``apps.propuestas``; AUD-07 confirma.
"""

from http import HTTPStatus

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction

from apps.accounts.models import Rol
from apps.catalogo.models import Producto
from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion

from .models import (
    MAX_MOTIVO_RECHAZO,
    EstadoSolicitud,
    RenglonSolicitud,
    ResolucionRenglon,
    RevisionRenglonSolicitud,
    Solicitud,
    errores_entrega,
)

CAMPOS_RENGLON = {
    "producto",
    "modalidad",
    "cantidad",
    "fecha_solicitada",
    "caracteristicas",
    "origen_personalizacion",
}
MAX_RENGLONES = 50
MENSAJE_PRODUCTO = "El producto no está disponible para nuevas solicitudes."


class SolicitudInvalida(Exception):
    def __init__(self, errores):
        self.errores = errores
        super().__init__("Revisa los renglones de la solicitud.")


class CompradorNoValido(Exception):
    """El alta requiere una cuenta activa de comprador."""


class ArtesanoNoHabilitado(Exception):
    """La revisión exige una cuenta activa de artesano con su taller aprobado (RN-002)."""


class SolicitudNoEncontrada(Exception):
    """No existe o no pertenece al taller del artesano: se responde igual (404)."""


class EntradaInvalida(Exception):
    """Errores por campo que la API devuelve con 400."""

    def __init__(self, errores):
        self.errores = errores
        super().__init__("Revisa los datos enviados.")


class CodigoConflicto:
    """Códigos estables de los 409 de negocio de revisión y propuesta."""

    RENGLON_YA_RESUELTO = "renglon_ya_resuelto"
    RENGLONES_PENDIENTES = "solicitud_con_renglones_pendientes"
    SOLICITUD_RECHAZADA = "solicitud_rechazada"
    SIN_RENGLONES_ACEPTADOS = "solicitud_sin_renglones_aceptados"
    PROPUESTA_YA_EMITIDA = "propuesta_ya_emitida"

    MENSAJES = {
        RENGLON_YA_RESUELTO: "Este renglón ya tiene una resolución final y no se modifica.",
        RENGLONES_PENDIENTES: "Resuelve todos los renglones antes de emitir la propuesta.",
        SOLICITUD_RECHAZADA: "La solicitud fue rechazada: todos sus renglones se rechazaron.",
        SIN_RENGLONES_ACEPTADOS: "La propuesta requiere al menos un renglón aceptado.",
        PROPUESTA_YA_EMITIDA: "La propuesta final de esta solicitud ya fue emitida.",
    }


class ConflictoSolicitud(Exception):
    """Transición incompatible con el estado actual; nunca sobrescribe lo ya resuelto."""

    def __init__(self, codigo: str):
        self.codigo = codigo
        self.mensaje = CodigoConflicto.MENSAJES[codigo]
        super().__init__(self.mensaje)


def _entrega_preferida(modalidad: str, descripcion: str) -> dict:
    errores = errores_entrega(modalidad, descripcion, opcional=True)
    if errores:
        raise SolicitudInvalida(
            {f"{campo}_entrega_preferida": [mensaje] for campo, mensaje in errores.items()}
        )
    return {"modalidad_entrega_preferida": modalidad, "descripcion_entrega_preferida": descripcion}


@transaction.atomic
def crear_solicitud(
    *,
    comprador,
    renglones: list[dict],
    modalidad_entrega_preferida: str = "",
    descripcion_entrega_preferida: str = "",
) -> Solicitud:
    """Valida todos los renglones antes de persistir el agregado completo.

    No deduplica productos: dos renglones deliberadamente distintos son válidos.
    No toma precios, calcula importes, reserva unidades ni invoca la demo. La
    preferencia de entrega (RF-016) es opcional: no se presupone una por defecto.
    """
    if not comprador.is_active or comprador.rol != Rol.COMPRADOR:
        raise CompradorNoValido
    entrega = _entrega_preferida(modalidad_entrega_preferida, descripcion_entrega_preferida)
    if not renglones:
        raise SolicitudInvalida({"renglones": ["Agrega al menos un renglón."]})
    if len(renglones) > MAX_RENGLONES:
        raise SolicitudInvalida(
            {"renglones": [f"Una solicitud admite hasta {MAX_RENGLONES} renglones."]}
        )
    for datos in renglones:
        if set(datos) - CAMPOS_RENGLON:
            raise SolicitudInvalida({"renglones": ["Hay campos no permitidos."]})
        if any(
            not isinstance(datos.get(campo), int) or isinstance(datos.get(campo), bool)
            for campo in ("producto", "cantidad")
        ):
            raise SolicitudInvalida({"renglones": ["Producto y cantidad deben ser enteros."]})
    productos = {
        p.pk: p
        for p in Producto.objects.catalogo()
        .select_related("taller")
        .filter(pk__in={d["producto"] for d in renglones})
    }
    errores, filas, taller_id = [], [], None
    for posicion, datos in enumerate(renglones, start=1):
        producto = productos.get(datos["producto"])
        error = {}
        if producto is None:
            error["producto"] = [MENSAJE_PRODUCTO]
        else:
            if taller_id is None:
                taller_id = producto.taller_id
            elif producto.taller_id != taller_id:
                error["producto"] = ["Todos los renglones deben pertenecer al mismo taller."]
            fila = RenglonSolicitud(
                producto=producto,
                posicion=posicion,
                **{k: v for k, v in datos.items() if k != "producto"},
            )
            try:
                # Las FK ya se resolvieron en una consulta; los CHECK se aplicarán al insertar.
                fila.full_clean(
                    exclude=["solicitud", "producto"],
                    validate_unique=False,
                    validate_constraints=False,
                )
            except ValidationError as exc:
                error |= exc.message_dict
            filas.append(fila)
        errores.append(error)
    if any(errores):
        raise SolicitudInvalida({"renglones": errores})
    solicitud = Solicitud.objects.create(comprador=comprador, taller_id=taller_id, **entrega)
    for fila in filas:
        fila.solicitud = solicitud
    RenglonSolicitud.objects.bulk_create(filas)
    return solicitud


def crear_solicitud_idempotente(
    *,
    comprador,
    clave: str,
    renglones: list[dict],
    modalidad_entrega_preferida: str = "",
    descripcion_entrega_preferida: str = "",
) -> operaciones.ResultadoIdempotente:
    """Protege ``crear_solicitud`` (RF-009.7) sin duplicar ninguna de sus validaciones.

    La huella cubre solo el contrato de entrada: los renglones normalizados, en orden, y
    la preferencia de entrega cuando se indica. Sin preferencia, la huella coincide con
    la anterior a AUD-06, de modo que las claves ya registradas siguen repitiéndose.
    Comprador y taller no forman parte de ella: proceden del token y de los productos.
    """
    datos = {"renglones": renglones}
    if modalidad_entrega_preferida or descripcion_entrega_preferida:
        datos["modalidad_entrega_preferida"] = modalidad_entrega_preferida
        datos["descripcion_entrega_preferida"] = descripcion_entrega_preferida
    return operaciones.ejecutar_idempotente(
        actor=comprador,
        tipo=TipoOperacion.CREAR_SOLICITUD,
        clave=clave,
        datos=datos,
        operacion=lambda: crear_solicitud(
            comprador=comprador,
            renglones=renglones,
            modalidad_entrega_preferida=modalidad_entrega_preferida,
            descripcion_entrega_preferida=descripcion_entrega_preferida,
        ),
    )


def verificar_artesano_habilitado(artesano) -> None:
    """Defensa en el servicio, además del permiso de la vista (``EsArtesanoAprobado``)."""
    if not artesano.is_active or artesano.rol != Rol.ARTESANO:
        raise ArtesanoNoHabilitado
    try:
        habilitado = artesano.taller.habilita_operacion
    except ObjectDoesNotExist:
        habilitado = False
    if not habilitado:
        raise ArtesanoNoHabilitado


def bloquear_solicitud_recibida(artesano, solicitud_id: int) -> Solicitud:
    """``SELECT … FOR UPDATE`` de una solicitud del taller propio; ownership en SQL.

    Toda mutación de revisión o propuesta toma primero este lock. Así se serializan
    aceptar contra rechazar el mismo renglón, la carrera del último renglón y dos
    emisiones de propuesta, aunque usen claves de idempotencia distintas. Tras la
    espera, las consultas siguientes ven lo que confirmó la transacción anterior
    (READ COMMITTED), de modo que el estado se valida dentro del lock.
    """
    solicitud = (
        Solicitud.objects.select_for_update(of=("self",))
        .filter(pk=solicitud_id, taller__propietario=artesano)
        .first()
    )
    if solicitud is None:
        raise SolicitudNoEncontrada
    return solicitud


def estado_tras_revision(resoluciones: list[str]) -> str:
    """Única derivación del estado tras resolver (DR-03).

    Algún pendiente: sigue en revisión. Todos resueltos y alguno aceptado: lista para
    la propuesta. Todos resueltos y ninguno aceptado: rechazada (terminal).
    """
    if ResolucionRenglon.PENDIENTE in resoluciones:
        return EstadoSolicitud.PENDIENTE_REVISION
    if ResolucionRenglon.ACEPTADO in resoluciones:
        return EstadoSolicitud.LISTA_PROPUESTA
    return EstadoSolicitud.RECHAZADA


def _validar_resolucion(resolucion: str, motivo_rechazo: str) -> None:
    if resolucion == ResolucionRenglon.RECHAZADO:
        if not motivo_rechazo:
            raise EntradaInvalida({"motivo_rechazo": ["Indica el motivo del rechazo."]})
        if len(motivo_rechazo) > MAX_MOTIVO_RECHAZO:
            raise EntradaInvalida(
                {"motivo_rechazo": [f"Usa como máximo {MAX_MOTIVO_RECHAZO} caracteres."]}
            )
    elif resolucion == ResolucionRenglon.ACEPTADO:
        if motivo_rechazo:
            raise EntradaInvalida({"motivo_rechazo": ["Un renglón aceptado no lleva motivo."]})
    else:
        raise EntradaInvalida({"resolucion": ["Elige aceptado o rechazado."]})


@transaction.atomic
def resolver_renglon(
    *, artesano, solicitud_id: int, renglon_id: int, resolucion: str, motivo_rechazo: str = ""
) -> RevisionRenglonSolicitud:
    """Resolución final de un renglón: ``pendiente`` → ``aceptado`` | ``rechazado``.

    Conserva producto, modalidad, cantidad, fecha y características: no existe
    contraoferta de cantidad (RN-008). Historial, proyección del renglón y estado de la
    solicitud se escriben en la misma transacción, con la solicitud bloqueada.
    """
    verificar_artesano_habilitado(artesano)
    motivo_rechazo = motivo_rechazo.strip()
    _validar_resolucion(resolucion, motivo_rechazo)

    solicitud = bloquear_solicitud_recibida(artesano, solicitud_id)
    renglones = list(solicitud.renglones.all())
    renglon = next((r for r in renglones if r.pk == renglon_id), None)
    if renglon is None:
        raise SolicitudNoEncontrada
    if renglon.resolucion != ResolucionRenglon.PENDIENTE:
        raise ConflictoSolicitud(CodigoConflicto.RENGLON_YA_RESUELTO)

    revision = RevisionRenglonSolicitud.objects.create(
        renglon=renglon,
        resolucion=resolucion,
        motivo_rechazo=motivo_rechazo,
        resuelto_por=artesano,
    )
    renglon.resolucion = resolucion
    renglon.motivo_rechazo = motivo_rechazo
    renglon.save(update_fields=["resolucion", "motivo_rechazo"])

    solicitud.estado = estado_tras_revision([r.resolucion for r in renglones])
    solicitud.save(update_fields=["estado", "actualizado_en"])
    return revision


def resolver_renglon_idempotente(
    *,
    artesano,
    clave: str,
    solicitud_id: int,
    renglon_id: int,
    resolucion: str,
    motivo_rechazo: str = "",
) -> operaciones.ResultadoIdempotente:
    """La huella incluye el destino (solicitud y renglón): la misma clave contra otro
    renglón, u otra resolución, es otra petición (409), nunca una repetición."""
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.RESOLVER_RENGLON,
        clave=clave,
        datos={
            "solicitud_id": solicitud_id,
            "renglon_id": renglon_id,
            "resolucion": resolucion,
            "motivo_rechazo": motivo_rechazo.strip(),
        },
        operacion=lambda: resolver_renglon(
            artesano=artesano,
            solicitud_id=solicitud_id,
            renglon_id=renglon_id,
            resolucion=resolucion,
            motivo_rechazo=motivo_rechazo,
        ),
        codigo_http=HTTPStatus.OK,
    )
