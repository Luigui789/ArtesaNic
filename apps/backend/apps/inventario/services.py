"""Operaciones transaccionales e idempotentes de inventario (AUD-07; RF-022/023, RN-011/021).

Garantías:
- Los bloqueos de filas de inventario se adquieren siempre con ``SELECT … FOR UPDATE``
  y en orden ascendente de ``producto_id`` cuando intervienen varios productos.
- Las mutaciones del artesano (existencia inicial, entradas y ajustes) exigen cuenta
  activa de artesano con taller aprobado y propietario del producto.
- Un ajuste negativo nunca deja ``existencia_fisica < reservada`` ni ``< 0``.
"""

from http import HTTPStatus

from django.db import transaction

from apps.catalogo.models import Modalidad, Producto
from apps.operaciones import services as operaciones
from apps.operaciones.models import TipoOperacion
from apps.solicitudes import services as solicitudes
from apps.solicitudes.models import OrigenPersonalizacion

from .models import (
    MAX_CANTIDAD,
    MAX_MOTIVO_MOVIMIENTO,
    EstadoReserva,
    InventarioProducto,
    MovimientoInventario,
    ReservaInventario,
    TipoMovimientoInventario,
)


class ProductoInventarioNoEncontrado(Exception):
    """El producto no existe o no pertenece al taller del artesano (404)."""


class EntradaInventarioInvalida(Exception):
    """Errores de validación de entrada que la API responde con 400."""

    def __init__(self, errores: dict):
        self.errores = errores
        super().__init__("Revisa los datos de inventario enviados.")


class CodigoConflictoInventario:
    """Códigos estables para los conflictos 409 de operaciones de inventario."""

    INVENTARIO_YA_INICIALIZADO = "inventario_ya_inicializado"
    INVENTARIO_NO_INICIALIZADO = "inventario_no_inicializado"
    AJUSTE_BAJO_COMPROMETIDO = "ajuste_bajo_comprometido"

    MENSAJES = {
        INVENTARIO_YA_INICIALIZADO: ("La existencia inicial de este producto ya fue registrada."),
        INVENTARIO_NO_INICIALIZADO: (
            "Registra primero la existencia inicial del producto antes de operar."
        ),
        AJUSTE_BAJO_COMPROMETIDO: (
            "El ajuste negativo no puede reducir la existencia física por debajo de las "
            "unidades reservadas ni de cero."
        ),
    }


class ConflictoInventario(Exception):
    """Conflicto con el estado actual del inventario (409)."""

    def __init__(self, codigo: str):
        self.codigo = codigo
        self.mensaje = CodigoConflictoInventario.MENSAJES[codigo]
        super().__init__(self.mensaje)


class StockInsuficienteError(Exception):
    """Al menos un producto requerido carece de disponibilidad suficiente para confirmar."""

    def __init__(self, productos_ids: list[int]):
        self.productos_ids = productos_ids
        super().__init__("No hay disponibilidad suficiente para confirmar la propuesta.")


def requiere_reserva_estandar(modalidad: str, origen_personalizacion: str = "") -> bool:
    """Regla V1 (RF-017, RF-022, RN-011, RN-023): solo ``stock`` y ``personalizacion`` con
    ``unidad_estandar`` reservan unidades estándar al confirmar el pedido."""
    return modalidad == Modalidad.STOCK or (
        modalidad == Modalidad.PERSONALIZACION
        and origen_personalizacion == OrigenPersonalizacion.UNIDAD_ESTANDAR
    )


def calcular_requerimientos_stock(lineas) -> dict[int, int]:
    """Suma las unidades estándar requeridas por ``producto_id`` en todas las líneas."""
    requerimientos: dict[int, int] = {}
    for linea in lineas:
        renglon = linea.renglon
        if requiere_reserva_estandar(linea.modalidad, renglon.origen_personalizacion):
            producto_id = renglon.producto_id
            requerimientos[producto_id] = requerimientos.get(producto_id, 0) + linea.cantidad
    return requerimientos


def bloquear_y_validar_disponibilidad(
    requerimientos: dict[int, int],
) -> dict[int, InventarioProducto]:
    """Bloquea ``InventarioProducto`` en orden determinista por ``producto_id`` y valida
    ``disponible >= requerido`` para todos los productos antes de crear pedido o reservas."""
    if not requerimientos:
        return {}
    ids_ordenados = sorted(requerimientos)
    inventarios = {
        inv.producto_id: inv
        for inv in InventarioProducto.objects.select_for_update(of=("self",))
        .filter(producto_id__in=ids_ordenados)
        .order_by("producto_id")
    }
    faltantes = [
        pid
        for pid in ids_ordenados
        if pid not in inventarios or inventarios[pid].disponible < requerimientos[pid]
    ]
    if faltantes:
        raise StockInsuficienteError(faltantes)
    return inventarios


def reservar_para_pedido(
    *,
    pedido,
    lineas_pedido: list,
    inventarios: dict[int, InventarioProducto],
    actor,
) -> list[ReservaInventario]:
    """Crea las reservas activas y los movimientos de reserva incrementando ``reservada``
    sin descontar ``existencia_fisica`` (RN-011, RN-021)."""
    reservas: list[ReservaInventario] = []
    for linea in lineas_pedido:
        if not requiere_reserva_estandar(linea.modalidad, linea.origen_personalizacion):
            continue
        inv = inventarios[linea.producto_id]
        reservada_antes = inv.reservada
        reservada_despues = reservada_antes + linea.cantidad
        if reservada_despues > inv.existencia_fisica:
            raise StockInsuficienteError([linea.producto_id])
        inv.reservada = reservada_despues
        inv.save(update_fields=["reservada", "actualizado_en"])
        reserva = ReservaInventario.objects.create(
            pedido=pedido,
            linea_pedido=linea,
            producto_id=linea.producto_id,
            cantidad=linea.cantidad,
            estado=EstadoReserva.ACTIVA,
        )
        MovimientoInventario.objects.create(
            producto_id=linea.producto_id,
            tipo=TipoMovimientoInventario.RESERVA,
            cantidad=linea.cantidad,
            existencia_antes=inv.existencia_fisica,
            existencia_despues=inv.existencia_fisica,
            reservada_antes=reservada_antes,
            reservada_despues=reservada_despues,
            actor=actor,
            pedido=pedido,
            linea_pedido=linea,
            reserva=reserva,
        )
        reservas.append(reserva)
    return reservas


class ReservaInconsistente(Exception):
    """Reserva no activa en un pedido que todavía no tiene Pago confirmado (D-AUD11-11).

    Indica una violación previa de RN-015; el vencimiento aborta sin reparar datos.
    """

    def __init__(self, reserva: ReservaInventario):
        self.reserva_id = reserva.pk
        self.estado = reserva.estado
        super().__init__(f"Reserva #{reserva.pk} en estado inesperado «{reserva.estado}».")


MOTIVO_LIBERACION_VENCIMIENTO = "Vencimiento automático por falta de pago."


def liberar_reservas_de_pedido(*, pedido, motivo: str, actor=None) -> list[ReservaInventario]:
    """Libera todas las reservas activas del pedido (``activa → liberada``).

    Debe ejecutarse dentro de la transacción del llamador con el ``Pedido`` ya bloqueado.
    Bloquea las reservas y después los inventarios en orden ascendente de ``producto_id``
    (el mismo orden que AUD-07), valida todas antes de escribir y, si alguna no está activa,
    lanza ``ReservaInconsistente`` sin modificar nada. La existencia física no cambia.
    """
    reservas = list(
        ReservaInventario.objects.select_for_update(of=("self",))
        .filter(pedido=pedido)
        .order_by("id")
    )
    for reserva in reservas:
        if reserva.estado != EstadoReserva.ACTIVA:
            raise ReservaInconsistente(reserva)
    if not reservas:
        return []
    inventarios = {
        inv.producto_id: inv
        for inv in InventarioProducto.objects.select_for_update(of=("self",))
        .filter(producto_id__in={r.producto_id for r in reservas})
        .order_by("producto_id")
    }
    for reserva in reservas:
        inv = inventarios[reserva.producto_id]
        reservada_antes = inv.reservada
        inv.reservada = reservada_antes - reserva.cantidad
        inv.save(update_fields=["reservada", "actualizado_en"])
        reserva.estado = EstadoReserva.LIBERADA
        reserva.save(update_fields=["estado", "actualizada_en"])
        MovimientoInventario.objects.create(
            producto_id=reserva.producto_id,
            tipo=TipoMovimientoInventario.LIBERACION,
            cantidad=reserva.cantidad,
            existencia_antes=inv.existencia_fisica,
            existencia_despues=inv.existencia_fisica,
            reservada_antes=reservada_antes,
            reservada_despues=inv.reservada,
            actor=actor,
            pedido=pedido,
            linea_pedido_id=reserva.linea_pedido_id,
            reserva=reserva,
            motivo=motivo,
        )
    return reservas


def _es_entero(valor: object) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool)


def _bloquear_producto_propio(artesano, producto_id: int) -> Producto:
    producto = (
        Producto.objects.select_for_update(of=("self",))
        .filter(pk=producto_id, taller__propietario=artesano)
        .first()
    )
    if producto is None:
        raise ProductoInventarioNoEncontrado
    return producto


def _bloquear_inventario_propio(artesano, producto_id: int) -> InventarioProducto:
    inventario = (
        InventarioProducto.objects.select_for_update(of=("self",))
        .filter(producto_id=producto_id, producto__taller__propietario=artesano)
        .first()
    )
    if inventario is not None:
        return inventario
    if not Producto.objects.filter(pk=producto_id, taller__propietario=artesano).exists():
        raise ProductoInventarioNoEncontrado
    raise ConflictoInventario(CodigoConflictoInventario.INVENTARIO_NO_INICIALIZADO)


@transaction.atomic
def establecer_inventario_inicial(
    *, artesano, producto_id: int, cantidad: int
) -> InventarioProducto:
    """Registra la única existencia inicial de un producto del taller propio (puede ser 0)."""
    solicitudes.verificar_artesano_habilitado(artesano)
    if not _es_entero(cantidad) or cantidad < 0 or cantidad > MAX_CANTIDAD:
        raise EntradaInventarioInvalida(
            {"cantidad": [f"Indica un entero entre 0 y {MAX_CANTIDAD}."]}
        )
    producto = _bloquear_producto_propio(artesano, producto_id)
    if InventarioProducto.objects.filter(producto=producto).exists():
        raise ConflictoInventario(CodigoConflictoInventario.INVENTARIO_YA_INICIALIZADO)
    inventario = InventarioProducto.objects.create(
        producto=producto,
        existencia_fisica=cantidad,
        reservada=0,
    )
    MovimientoInventario.objects.create(
        producto=producto,
        tipo=TipoMovimientoInventario.EXISTENCIA_INICIAL,
        cantidad=cantidad,
        existencia_antes=0,
        existencia_despues=cantidad,
        reservada_antes=0,
        reservada_despues=0,
        actor=artesano,
    )
    return inventario


def establecer_inventario_inicial_idempotente(
    *, artesano, clave: str, producto_id: int, cantidad: int
) -> operaciones.ResultadoIdempotente:
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.ESTABLECER_INVENTARIO_INICIAL,
        clave=clave,
        datos={"producto_id": producto_id, "cantidad": cantidad},
        operacion=lambda: establecer_inventario_inicial(
            artesano=artesano, producto_id=producto_id, cantidad=cantidad
        ),
        codigo_http=HTTPStatus.CREATED,
    )


@transaction.atomic
def registrar_entrada(
    *, artesano, producto_id: int, cantidad: int, motivo: str = ""
) -> MovimientoInventario:
    """Aumenta la existencia física de un producto ya inicializado."""
    solicitudes.verificar_artesano_habilitado(artesano)
    motivo = motivo.strip()
    if len(motivo) > MAX_MOTIVO_MOVIMIENTO:
        raise EntradaInventarioInvalida(
            {"motivo": [f"Usa como máximo {MAX_MOTIVO_MOVIMIENTO} caracteres."]}
        )
    if not _es_entero(cantidad) or cantidad < 1 or cantidad > MAX_CANTIDAD:
        raise EntradaInventarioInvalida(
            {"cantidad": [f"Indica una cantidad entera positiva (1 a {MAX_CANTIDAD})."]}
        )
    inventario = _bloquear_inventario_propio(artesano, producto_id)
    nueva_existencia = inventario.existencia_fisica + cantidad
    if nueva_existencia > MAX_CANTIDAD:
        raise EntradaInventarioInvalida(
            {"cantidad": ["La existencia resultante supera el máximo técnico admitido."]}
        )
    existencia_antes = inventario.existencia_fisica
    inventario.existencia_fisica = nueva_existencia
    inventario.save(update_fields=["existencia_fisica", "actualizado_en"])
    return MovimientoInventario.objects.create(
        producto_id=inventario.producto_id,
        tipo=TipoMovimientoInventario.ENTRADA,
        cantidad=cantidad,
        existencia_antes=existencia_antes,
        existencia_despues=nueva_existencia,
        reservada_antes=inventario.reservada,
        reservada_despues=inventario.reservada,
        actor=artesano,
        motivo=motivo,
    )


def registrar_entrada_idempotente(
    *, artesano, clave: str, producto_id: int, cantidad: int, motivo: str = ""
) -> operaciones.ResultadoIdempotente:
    datos = {"producto_id": producto_id, "cantidad": cantidad}
    motivo_limpio = motivo.strip()
    if motivo_limpio:
        datos["motivo"] = motivo_limpio
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.REGISTRAR_ENTRADA_INVENTARIO,
        clave=clave,
        datos=datos,
        operacion=lambda: registrar_entrada(
            artesano=artesano, producto_id=producto_id, cantidad=cantidad, motivo=motivo_limpio
        ),
        codigo_http=HTTPStatus.OK,
    )


@transaction.atomic
def ajustar_inventario(
    *, artesano, producto_id: int, delta: int, motivo: str
) -> MovimientoInventario:
    """Aplica un ajuste positivo o negativo con motivo obligatorio, sin bajar de ``reservada``."""
    solicitudes.verificar_artesano_habilitado(artesano)
    motivo = (motivo or "").strip()
    errores: dict[str, list[str]] = {}
    if not motivo:
        errores["motivo"] = ["Indica el motivo del ajuste."]
    elif len(motivo) > MAX_MOTIVO_MOVIMIENTO:
        errores["motivo"] = [f"Usa como máximo {MAX_MOTIVO_MOVIMIENTO} caracteres."]
    if not _es_entero(delta) or delta == 0 or abs(delta) > MAX_CANTIDAD:
        errores["delta"] = ["Indica un ajuste entero distinto de cero."]
    if errores:
        raise EntradaInventarioInvalida(errores)

    inventario = _bloquear_inventario_propio(artesano, producto_id)
    nueva_existencia = inventario.existencia_fisica + delta
    if nueva_existencia < 0 or nueva_existencia < inventario.reservada:
        raise ConflictoInventario(CodigoConflictoInventario.AJUSTE_BAJO_COMPROMETIDO)
    if nueva_existencia > MAX_CANTIDAD:
        raise EntradaInventarioInvalida(
            {"delta": ["La existencia resultante supera el máximo técnico admitido."]}
        )

    existencia_antes = inventario.existencia_fisica
    inventario.existencia_fisica = nueva_existencia
    inventario.save(update_fields=["existencia_fisica", "actualizado_en"])
    tipo = (
        TipoMovimientoInventario.AJUSTE_POSITIVO
        if delta > 0
        else TipoMovimientoInventario.AJUSTE_NEGATIVO
    )
    return MovimientoInventario.objects.create(
        producto_id=inventario.producto_id,
        tipo=tipo,
        cantidad=abs(delta),
        existencia_antes=existencia_antes,
        existencia_despues=nueva_existencia,
        reservada_antes=inventario.reservada,
        reservada_despues=inventario.reservada,
        actor=artesano,
        motivo=motivo,
    )


def ajustar_inventario_idempotente(
    *, artesano, clave: str, producto_id: int, delta: int, motivo: str
) -> operaciones.ResultadoIdempotente:
    motivo_limpio = (motivo or "").strip()
    return operaciones.ejecutar_idempotente(
        actor=artesano,
        tipo=TipoOperacion.AJUSTAR_INVENTARIO,
        clave=clave,
        datos={"producto_id": producto_id, "delta": delta, "motivo": motivo_limpio},
        operacion=lambda: ajustar_inventario(
            artesano=artesano, producto_id=producto_id, delta=delta, motivo=motivo_limpio
        ),
        codigo_http=HTTPStatus.OK,
    )
