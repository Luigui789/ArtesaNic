"""Reglas del producto: alta, edición y publicación (RF-001, RF-017, RF-019; RN-002 a RN-004).

El taller dueño llega siempre de la identidad autenticada, nunca de los datos
recibidos. Solo un taller aprobado opera su catálogo; la vista lo exige con
``EsArtesanoAprobado`` y estos servicios lo vuelven a comprobar.
Despublicar es un cambio de estado, no un borrado.
"""

from django.db import transaction

from apps.talleres.models import Taller

from .models import CAMPOS_EDITABLES, Producto


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
        producto.save()
    return producto


def actualizar_producto(producto: Producto, **datos) -> Producto:
    """Modifica solo los campos recibidos. No cambia taller, publicación ni fecha de alta."""
    _exigir_habilitado(producto.taller)
    _validar_campos(datos)
    with transaction.atomic():
        actual = Producto.objects.select_for_update().select_related("taller").get(pk=producto.pk)
        for campo, valor in datos.items():
            setattr(actual, campo, valor)
        # Valida el producto completo: por ejemplo, que no quede sin modalidades.
        actual.full_clean()
        actual.save(update_fields=[*datos, "actualizado_en"])
    return actual


def publicar_producto(producto: Producto) -> bool:
    """Lo muestra en el catálogo público. Devuelve ``False`` si ya estaba publicado."""
    return _cambiar_publicacion(producto, publicado=True)


def despublicar_producto(producto: Producto) -> bool:
    """Lo retira del catálogo sin borrarlo (RF-019). ``False`` si ya estaba despublicado."""
    return _cambiar_publicacion(producto, publicado=False)


def _cambiar_publicacion(producto: Producto, *, publicado: bool) -> bool:
    _exigir_habilitado(producto.taller)
    with transaction.atomic():
        actual = Producto.objects.select_for_update().get(pk=producto.pk)
        if actual.publicado == publicado:
            cambio = False
        else:
            actual.publicado = publicado
            actual.save(update_fields=["publicado", "actualizado_en"])
            cambio = True
    producto.publicado = actual.publicado
    producto.actualizado_en = actual.actualizado_en
    return cambio
