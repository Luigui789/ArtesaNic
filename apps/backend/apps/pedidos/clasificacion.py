"""Clasificación de unidades estándar manipuladas y no entregadas (AUD-13; RF-022.14,
RF-023; RN-024; D-AUD13-15..19).

Tras la cancelación o el cierre parcial aceptado, cada ``ObligacionClasificacionInventario``
indica cuántas unidades consumidas del inventario estándar no llegaron al comprador. El
artesano las clasifica, en uno o varios pasos, sin superar lo pendiente:

- ``reutilizable`` → ``reincorporacion``: vuelven a la existencia física y a disponibilidad;
- ``baja`` → ``baja``: disposición final; la existencia no se descuenta otra vez porque ya
  salió al consumirse.

Locks: ``Pedido → ObligacionClasificacionInventario → InventarioProducto`` (por
``producto_id`` ascendente). El lock del ``Pedido`` serializa clasificaciones concurrentes: la
segunda ve lo ya clasificado y nunca supera la obligación ni duplica la reincorporación.
"""

from http import HTTPStatus

from django.db import transaction
from django.db.models import Sum

from apps.inventario import services as inventario
from apps.inventario.models import (
    MAX_CANTIDAD,
    MAX_MOTIVO_MOVIMIENTO,
    ClasificacionInventario,
    ObligacionClasificacionInventario,
    ResultadoClasificacion,
)
from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.pagos import services as pagos
from apps.solicitudes.services import verificar_artesano_habilitado

from . import cumplimiento
from .errores import CodigoConflictoResolucion, ConflictoResolucion, ResolucionInconsistente

MAX_CLASIFICACIONES = 100


def _es_entero(valor: object) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool)


def normalizar_clasificaciones(clasificaciones) -> list[dict]:
    """Forma válida (400) y orden estable por ``obligacion`` y ``resultado`` para la huella."""
    error = None
    if not isinstance(clasificaciones, list) or not clasificaciones:
        error = "Incluye al menos una clasificación."
    elif len(clasificaciones) > MAX_CLASIFICACIONES:
        error = f"Una petición admite hasta {MAX_CLASIFICACIONES} clasificaciones."
    else:
        vistas: set[int] = set()
        for item in clasificaciones:
            datos = item if isinstance(item, dict) else {}
            obligacion, cantidad = datos.get("obligacion"), datos.get("cantidad")
            motivo = datos.get("motivo")
            motivo = motivo.strip() if isinstance(motivo, str) else ""
            if not _es_entero(obligacion) or obligacion < 1:
                error = "Cada clasificación debe indicar su obligación."
            elif not _es_entero(cantidad) or cantidad < 1 or cantidad > MAX_CANTIDAD:
                error = "Cada cantidad debe ser un entero mayor que 0."
            elif datos.get("resultado") not in ResultadoClasificacion.values:
                error = "Elige reutilizable o baja."
            elif not motivo:
                error = "Indica el motivo de cada clasificación."
            elif len(motivo) > MAX_MOTIVO_MOVIMIENTO:
                error = f"El motivo admite hasta {MAX_MOTIVO_MOVIMIENTO} caracteres."
            elif obligacion in vistas:
                error = "Cada obligación puede aparecer una sola vez por petición."
            if error:
                break
            vistas.add(obligacion)
    if error:
        raise cumplimiento.EntradaInvalida({"clasificaciones": [error]})
    return sorted(
        (
            {
                "obligacion": i["obligacion"],
                "cantidad": i["cantidad"],
                "resultado": i["resultado"],
                "motivo": i["motivo"].strip(),
            }
            for i in clasificaciones
        ),
        key=lambda i: (i["obligacion"], i["resultado"]),
    )


@transaction.atomic
def clasificar_inventario(*, artesano, pedido_id: int, clasificaciones) -> ClasificacionInventario:
    """Registra todas las clasificaciones de la petición o ninguna.

    Devuelve la primera clasificación creada (referencia del registro idempotente).
    """
    verificar_artesano_habilitado(artesano)
    clasificaciones = normalizar_clasificaciones(clasificaciones)
    pedido = cumplimiento._bloquear_pedido(pedido_id, taller__propietario=artesano)
    obligaciones = {
        o.pk: o
        for o in ObligacionClasificacionInventario.objects.select_for_update(of=("self",))
        .select_related("reserva")
        .filter(pedido=pedido)
        .order_by("id")
    }
    if any(c["obligacion"] not in obligaciones for c in clasificaciones):
        raise cumplimiento.EntradaInvalida(
            {"clasificaciones": ["Alguna obligación indicada no pertenece a este pedido."]}
        )
    clasificadas = dict(
        ClasificacionInventario.objects.filter(obligacion__pedido=pedido)
        .values("obligacion_id")
        .annotate(total=Sum("cantidad"))
        .values_list("obligacion_id", "total")
    )
    excedidas = [
        c["obligacion"]
        for c in clasificaciones
        if clasificadas.get(c["obligacion"], 0) + c["cantidad"]
        > obligaciones[c["obligacion"]].cantidad
    ]
    if excedidas:
        raise ConflictoResolucion(
            CodigoConflictoResolucion.CLASIFICACION_EXCEDE_PENDIENTE, excedidas
        )
    inventarios = inventario.bloquear_inventarios(
        obligaciones[c["obligacion"]].reserva.producto_id for c in clasificaciones
    )
    momento = pagos.ahora()
    creadas = []
    for c in clasificaciones:
        obligacion = obligaciones[c["obligacion"]]
        reserva = obligacion.reserva
        try:
            movimiento = inventario.registrar_movimiento_clasificacion(
                reserva=reserva,
                inventario=inventarios.get(reserva.producto_id),
                resultado=c["resultado"],
                cantidad=c["cantidad"],
                actor=artesano,
                motivo=c["motivo"],
            )
        except inventario.ConsumoInvalido as exc:
            raise ResolucionInconsistente(str(exc)) from exc
        creadas.append(
            ClasificacionInventario.objects.create(
                obligacion=obligacion,
                cantidad=c["cantidad"],
                resultado=c["resultado"],
                motivo=c["motivo"],
                movimiento=movimiento,
                registrado_por=artesano,
                registrado_en=momento,
            )
        )
    return creadas[0]


def clasificar_inventario_idempotente(
    *, artesano, clave: str, pedido_id: int, clasificaciones
) -> operaciones.ResultadoIdempotente:
    clasificaciones = normalizar_clasificaciones(clasificaciones)
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.CLASIFICAR_INVENTARIO_PEDIDO,
        clave=clave,
        datos={"pedido_id": pedido_id, "clasificaciones": clasificaciones},
        operacion=lambda: clasificar_inventario(
            artesano=artesano, pedido_id=pedido_id, clasificaciones=clasificaciones
        ),
        codigo_http=HTTPStatus.CREATED,
    )
