"""Reglas del producto: alta, edición y publicación (RF-001, RF-017, RF-019; RN-002 a RN-004).

El taller dueño llega siempre de la identidad autenticada, nunca de los datos
recibidos. Solo un taller aprobado opera su catálogo; la vista lo exige con
``EsArtesanoAprobado`` y estos servicios lo vuelven a comprobar.
Despublicar es un cambio de estado, no un borrado. La moderación administrativa
(``moderar_producto``) es una autoridad aparte: no cambia ``publicado`` e impide publicar.
"""

import logging

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.accounts.models import Rol
from apps.talleres.models import Taller

from .models import CAMPOS_EDITABLES, MAX_MOTIVO_MODERACION, ModeracionProducto, Producto

logger = logging.getLogger(__name__)


class ProductoSinFotografia(Exception):
    """Publicar exige una fotografía principal persistida."""


class ProductoModerado(Exception):
    """Un producto retirado por moderación no vuelve a publicarse (RF-019, D-AUD14-04)."""


def _eliminar_archivo(storage, nombre):
    try:
        storage.delete(nombre)
    except OSError:
        logger.exception("No se pudo limpiar fotografía obsoleta: %s", nombre)


def _guardar(producto, **kwargs):
    foto = producto.fotografia_principal
    nueva = bool(foto and not foto._committed)
    try:
        producto.save(**kwargs)
    except Exception:
        if nueva and foto._committed:
            _eliminar_archivo(foto.storage, foto.name)
        raise


class TallerNoHabilitado(Exception):
    """El taller no está aprobado: no puede operar su catálogo (RN-002)."""


def _exigir_habilitado(taller: Taller) -> None:
    if not taller.habilita_operacion:
        raise TallerNoHabilitado


def _validar_campos(datos: dict) -> None:
    desconocidos = set(datos) - set(CAMPOS_EDITABLES)
    if desconocidos:
        raise ValueError(f"Campos que no pertenecen al producto: {sorted(desconocidos)}")


def crear_producto(taller: Taller, **datos) -> Producto:
    """Registra un producto del taller, sin publicar. Se publica con ``publicar_producto``."""
    _exigir_habilitado(taller)
    _validar_campos(datos)
    producto = Producto(taller=taller, publicado=False, **datos)
    producto.full_clean()
    with transaction.atomic():
        _guardar(producto)
    return producto


def actualizar_producto(producto: Producto, **datos) -> Producto:
    """Modifica solo los campos recibidos. No cambia taller, publicación ni fecha de alta."""
    _exigir_habilitado(producto.taller)
    _validar_campos(datos)
    with transaction.atomic():
        actual = Producto.objects.select_for_update().select_related("taller").get(pk=producto.pk)
        anterior = actual.fotografia_principal.name
        storage = actual.fotografia_principal.storage
        for campo, valor in datos.items():
            setattr(actual, campo, valor)
        # Valida el producto completo: por ejemplo, que no quede sin modalidades.
        if actual.publicado and "fotografia_principal" in datos and not actual.fotografia_principal:
            raise ValidationError(
                {"fotografia_principal": "Un producto publicado requiere fotografía."}
            )
        actual.full_clean()
        _guardar(actual, update_fields=[*datos, "actualizado_en"])
        if anterior and anterior != actual.fotografia_principal.name:
            transaction.on_commit(lambda: _eliminar_archivo(storage, anterior))
    return actual


def publicar_producto(producto: Producto) -> bool:
    """Lo muestra en el catálogo público. Devuelve ``False`` si ya estaba publicado."""
    return _cambiar_publicacion(producto, publicado=True)


def despublicar_producto(producto: Producto) -> bool:
    """Lo retira del catálogo sin borrarlo (RF-019). ``False`` si ya estaba despublicado."""
    return _cambiar_publicacion(producto, publicado=False)


def _bloquear_producto(producto_id: int) -> Producto:
    """Lock del producto que serializa publicar, moderar y crear solicitudes (D-AUD14-07)."""
    return Producto.objects.select_for_update().get(pk=producto_id)


def _cambiar_publicacion(producto: Producto, *, publicado: bool) -> bool:
    _exigir_habilitado(producto.taller)
    with transaction.atomic():
        # Mismo lock que ``moderar_producto``: publicar revalida la moderación (D-AUD14-04).
        actual = _bloquear_producto(producto.pk)
        if publicado and ModeracionProducto.objects.filter(producto_id=actual.pk).exists():
            raise ProductoModerado
        foto = actual.fotografia_principal
        if publicado and (not foto or not foto.storage.exists(foto.name)):
            raise ProductoSinFotografia
        if actual.publicado == publicado:
            cambio = False
        else:
            actual.publicado = publicado
            actual.save(update_fields=["publicado", "actualizado_en"])
            cambio = True
    producto.publicado = actual.publicado
    producto.actualizado_en = actual.actualizado_en
    return cambio


# ---------- Moderación administrativa (RF-013.3, RF-019.5; AUD-14) ----------

PERMISO_MODERAR = "catalogo.moderar_producto"


class ModeradorNoValido(Exception):
    """Solo un administrador de plataforma activo con ``moderar_producto`` modera."""


def _exigir_moderador(actor) -> None:
    # El permiso no basta: rol de negocio e is_staff son condiciones propias (RNF-004).
    if not (
        actor is not None
        and actor.is_authenticated
        and actor.is_active
        and actor.rol == Rol.ADMINISTRADOR
        and actor.is_staff
        and actor.has_perm(PERMISO_MODERAR)
    ):
        raise ModeradorNoValido


def _validar_motivo(motivo) -> str:
    motivo = (motivo or "").strip()
    if not motivo:
        raise ValidationError({"motivo": "Indica el motivo de la moderación."}, code="required")
    if len(motivo) > MAX_MOTIVO_MODERACION:
        raise ValidationError(
            {"motivo": f"Máximo {MAX_MOTIVO_MODERACION} caracteres."}, code="max_length"
        )
    return motivo


def moderar_producto(producto: Producto, *, actor, motivo: str) -> bool:
    """Retira el producto por moderación. ``False`` si ya estaba moderado (sin efectos).

    No cambia ``publicado`` ni ningún dato del producto, y no toca solicitudes, propuestas,
    pedidos, pagos, reservas ni entregas existentes (D-AUD14-03): solo deja de ser visible
    en el catálogo y para nuevas solicitudes, porque ``catalogo()`` excluye lo moderado.
    Se serializa con publicar y con ``crear_solicitud`` sobre el lock del producto
    (D-AUD14-07); dos moderaciones simultáneas dejan una sola fila, con su actor y motivo.
    """
    _exigir_moderador(actor)
    motivo = _validar_motivo(motivo)
    with transaction.atomic():
        actual = _bloquear_producto(producto.pk)
        if ModeracionProducto.objects.filter(producto_id=actual.pk).exists():
            return False
        try:
            # El lock ya serializa; el savepoint traduce una carrera imposible a «sin cambios».
            with transaction.atomic():
                ModeracionProducto.objects.create(
                    producto=actual, moderado_por=actor, motivo=motivo
                )
        except IntegrityError:
            return False
    return True
