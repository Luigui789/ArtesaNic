"""Política D-DR01-01: validar bytes antes de persistir, sin transformar la imagen."""

import warnings
from uuid import uuid4

from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELES = 25_000_000
EXTENSIONES = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def validar_fotografia(archivo):
    # Una referencia ya persistida fue validada al ingresar; editar otros campos no la abre.
    if getattr(archivo, "_committed", False):
        return
    if archivo.size > MAX_BYTES:
        raise ValidationError("El archivo no puede superar 5 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            archivo.seek(0)
            with Image.open(archivo) as imagen:
                formato = imagen.format
                if formato not in EXTENSIONES:
                    raise ValidationError("Usa una imagen JPEG, PNG o WebP.")
                if imagen.width * imagen.height > MAX_PIXELES:
                    raise ValidationError("La imagen no puede superar 25 millones de píxeles.")
                if getattr(imagen, "n_frames", 1) != 1:
                    raise ValidationError("Usa una imagen estática, sin animación.")
                imagen.verify()
            archivo.seek(0)
            with Image.open(archivo) as imagen:
                imagen.load()
        archivo.formato_validado = formato
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise ValidationError("La imagen excede el límite técnico de píxeles.") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise ValidationError("El archivo no es una imagen válida.") from exc
    finally:
        archivo.seek(0)


def ruta_fotografia(instance, filename):
    # No usa PK ni filename del cliente. Solo un archivo validado puede obtener ruta.
    archivo = instance.fotografia_principal
    formato = getattr(archivo, "formato_validado", None)
    if formato is None:
        validar_fotografia(archivo)
        formato = archivo.formato_validado
    return f"productos/{uuid4().hex}/principal/{uuid4().hex}.{EXTENSIONES[formato]}"
