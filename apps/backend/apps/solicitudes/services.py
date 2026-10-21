"""Alta transaccional. AUD-06 resuelve; AUD-07 confirma; AUD-08 protege reintentos."""

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.models import Rol
from apps.catalogo.models import Producto

from .models import RenglonSolicitud, Solicitud

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


@transaction.atomic
def crear_solicitud(*, comprador, renglones: list[dict]) -> Solicitud:
    """Valida todos los renglones antes de persistir el agregado completo.

    No deduplica productos: dos renglones deliberadamente distintos son válidos.
    No toma precios, calcula importes, reserva unidades ni invoca la demo.
    """
    if not comprador.is_active or comprador.rol != Rol.COMPRADOR:
        raise CompradorNoValido
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
    solicitud = Solicitud.objects.create(comprador=comprador, taller_id=taller_id)
    for fila in filas:
        fila.solicitud = solicitud
    RenglonSolicitud.objects.bulk_create(filas)
    return solicitud
