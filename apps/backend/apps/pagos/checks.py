"""El storage privado de comprobantes nunca puede quedar dentro de una carpeta servida."""

from pathlib import Path

from django.conf import settings
from django.core.checks import Error, register


def _dentro(ruta: Path, base) -> bool:
    if not base:
        return False
    base = Path(base).resolve()
    return ruta == base or base in ruta.parents or ruta in base.parents


@register()
def storage_privado_separado(app_configs, **kwargs):
    raiz = getattr(settings, "PRIVATE_MEDIA_ROOT", None)
    if not raiz:
        return [Error("PRIVATE_MEDIA_ROOT no está configurado.", id="pagos.E001")]
    ruta = Path(raiz).resolve()
    publicas = [settings.MEDIA_ROOT, getattr(settings, "STATIC_ROOT", None)]
    if any(_dentro(ruta, base) for base in publicas):
        return [
            Error(
                "PRIVATE_MEDIA_ROOT no puede coincidir con MEDIA_ROOT/STATIC_ROOT ni "
                "contenerlos o estar dentro de ellos: los comprobantes son privados.",
                id="pagos.E002",
            )
        ]
    return []
