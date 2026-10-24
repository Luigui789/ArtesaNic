"""Política de comprobantes de pago (D-AUD10-04/05): whitelist única, validación por
contenido y almacenamiento privado.

La extensión, el nombre y el ``Content-Type`` del navegador no autorizan el archivo: el
servidor identifica el formato por su firma y lo decodifica (imágenes con Pillow, PDF por
estructura mínima de cabecera y cola). Solo un archivo validado obtiene ruta, generada
por el servidor sin nombre original ni PK.
"""

import hashlib
import re
import unicodedata
import warnings
from dataclasses import dataclass
from functools import cache
from pathlib import PurePath
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation, ValidationError
from django.core.files.storage import FileSystemStorage
from PIL import Image, UnidentifiedImageError

# --- Whitelist central (frontend: src/features/pagos/comprobante.ts la refleja) ---

MAX_BYTES = 10 * 1024 * 1024  # 10 MiB
# Protección de recursos al decodificar, no requisito comercial: cubre fotos de 48–50 MP.
MAX_PIXELES = 50_000_000
PDF = "PDF"
# Formato detectado → (MIME canónico, extensión canónica, extensiones del nombre aceptadas).
FORMATOS = {
    "JPEG": ("image/jpeg", "jpg", {"jpg", "jpeg"}),
    "PNG": ("image/png", "png", {"png"}),
    "WEBP": ("image/webp", "webp", {"webp"}),
    PDF: ("application/pdf", "pdf", {"pdf"}),
}
MIME_PERMITIDOS = tuple(mime for mime, _, _ in FORMATOS.values())
EXTENSIONES_PERMITIDAS = tuple(sorted({e for _, _, exts in FORMATOS.values() for e in exts}))
# Tipos que algunos navegadores declaran cuando no reconocen el archivo: no contradicen.
MIME_SIN_INFORMACION = {"", "application/octet-stream"}
MAX_NOMBRE = 120
# Un PDF termina en «%%EOF» (puede seguirle un salto de línea); se tolera relleno breve.
_COLA_PDF = 4096
_CABECERA_PDF = re.compile(rb"^%PDF-[12]\.\d")

MENSAJES = {
    "comprobante_requerido": "Adjunta el comprobante del pago.",
    "comprobante_multiple": "Adjunta un único comprobante por intento.",
    "comprobante_vacio": "El archivo está vacío.",
    "comprobante_demasiado_grande": "El comprobante no puede superar 10 MB.",
    "comprobante_formato_invalido": "Usa un comprobante JPG, JPEG, PNG, WebP o PDF.",
    "comprobante_inconsistente": (
        "La extensión o el tipo del archivo no coinciden con su contenido."
    ),
    "comprobante_corrupto": "No pudimos leer el comprobante: el archivo está dañado.",
    "comprobante_animado": "Usa una imagen estática, sin animación.",
    "comprobante_excede_pixeles": "La imagen excede el límite técnico de píxeles.",
}


def error(codigo: str) -> ValidationError:
    return ValidationError(MENSAJES[codigo], code=codigo)


@dataclass(frozen=True)
class ComprobanteValidado:
    archivo: object
    formato: str
    mime: str
    extension: str
    tamano: int
    sha256: str
    nombre: str


def _extension(nombre: str) -> str:
    sufijo = PurePath(nombre or "").suffix.lower()
    return sufijo[1:] if sufijo.startswith(".") else ""


def nombre_visible(nombre: str, extension: str) -> str:
    """Nombre solo para mostrar: sin rutas, controles ni caracteres invisibles."""
    base = PurePath((nombre or "").replace("\\", "/")).name
    base = "".join(c for c in base if unicodedata.category(c)[0] not in {"C", "Z"} or c == " ")
    base = re.sub(r"\s+", " ", base).strip(" .")
    if not base:
        return f"comprobante.{extension}"
    if len(base) > MAX_NOMBRE:
        raiz, _, ext = base.rpartition(".")
        sufijo = f".{ext}" if raiz and len(ext) <= 5 else ""
        base = base[: MAX_NOMBRE - len(sufijo)].rstrip(" .") + sufijo
    return base


def _leer(archivo) -> tuple[bytes, bytes, str]:
    """Primeros bytes, cola y SHA-256 del contenido completo, leyendo por bloques."""
    sha = hashlib.sha256()
    archivo.seek(0)
    cabecera = archivo.read(16)
    sha.update(cabecera)
    cola = cabecera
    for bloque in iter(lambda: archivo.read(64 * 1024), b""):
        sha.update(bloque)
        cola = (cola + bloque)[-_COLA_PDF:]
    archivo.seek(0)
    return cabecera, cola, sha.hexdigest()


def _validar_imagen(archivo) -> str:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            archivo.seek(0)
            with Image.open(archivo) as imagen:
                formato = imagen.format
                if formato not in FORMATOS or formato == PDF:
                    raise error("comprobante_formato_invalido")
                if imagen.width * imagen.height > MAX_PIXELES:
                    raise error("comprobante_excede_pixeles")
                if getattr(imagen, "n_frames", 1) != 1:
                    raise error("comprobante_animado")
                imagen.verify()
            archivo.seek(0)
            with Image.open(archivo) as imagen:
                imagen.load()
        return formato
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise error("comprobante_excede_pixeles") from exc
    except UnidentifiedImageError as exc:
        raise error("comprobante_formato_invalido") from exc
    except (OSError, ValueError, SyntaxError, EOFError) as exc:
        raise error("comprobante_corrupto") from exc
    finally:
        archivo.seek(0)


def validar_comprobante(archivo) -> ComprobanteValidado:
    """Tamaño, extensión, firma, decodificación y coherencia con el MIME declarado.

    ``archivo`` es un ``UploadedFile``. Lanza ``ValidationError`` con un código estable.
    """
    if archivo is None:
        raise error("comprobante_requerido")
    tamano = archivo.size or 0
    if tamano <= 0:
        raise error("comprobante_vacio")
    if tamano > MAX_BYTES:
        raise error("comprobante_demasiado_grande")
    extension = _extension(archivo.name)
    if extension not in EXTENSIONES_PERMITIDAS:
        raise error("comprobante_formato_invalido")

    cabecera, cola, sha256 = _leer(archivo)
    if cabecera.startswith(b"%PDF-"):
        if not _CABECERA_PDF.match(cabecera) or b"%%EOF" not in cola or b"startxref" not in cola:
            raise error("comprobante_corrupto")
        formato = PDF
    else:
        formato = _validar_imagen(archivo)

    mime, canonica, aceptadas = FORMATOS[formato]
    if extension not in aceptadas:
        raise error("comprobante_inconsistente")
    declarado = (getattr(archivo, "content_type", "") or "").split(";")[0].strip().lower()
    if declarado not in MIME_SIN_INFORMACION and declarado != mime:
        raise error("comprobante_inconsistente")
    return ComprobanteValidado(
        archivo=archivo,
        formato=formato,
        mime=mime,
        extension=canonica,
        tamano=tamano,
        sha256=sha256,
        nombre=nombre_visible(archivo.name, canonica),
    )


# --- Almacenamiento privado (D-AUD10-05) ---


class AlmacenamientoPrivado(FileSystemStorage):
    """Archivos fuera de ``MEDIA_ROOT``: no existe URL pública para ellos.

    Solo se leen a través del endpoint autenticado que repite el control de ownership.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault("location", settings.PRIVATE_MEDIA_ROOT)
        kwargs["base_url"] = None
        super().__init__(**kwargs)

    def url(self, name):
        raise SuspiciousFileOperation("Los comprobantes privados no tienen URL pública.")


@cache
def _almacenamiento(location: str) -> AlmacenamientoPrivado:
    return AlmacenamientoPrivado(location=location)


def almacenamiento_privado() -> AlmacenamientoPrivado:
    """Callable del ``FileField``: respeta ``PRIVATE_MEDIA_ROOT`` vigente (pruebas)."""
    return _almacenamiento(str(settings.PRIVATE_MEDIA_ROOT))


def ruta_comprobante(instance, filename):
    """``pagos/<uuid>/<uuid>.<ext>``: sin nombre original, PK ni datos del pedido."""
    extension = getattr(instance, "extension_validada", None)
    if extension not in {canonica for _, canonica, _ in FORMATOS.values()}:
        raise error("comprobante_formato_invalido")  # el servicio siempre valida antes
    return f"pagos/{uuid4().hex}/{uuid4().hex}.{extension}"
