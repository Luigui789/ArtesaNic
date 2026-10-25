"""Singleton inicial de la configuración, sin tasa (D-AUD14-05).

La cifra 36.8 del antiguo mock del frontend era una simulación, no una decisión
administrativa: no se promueve. Nace ``id = 1`` con tasa, actor y fecha en NULL; la
administración fija la tasa en Django Admin. Idempotente: no toca una fila existente.
"""

from django.db import migrations


def crear_configuracion(apps, schema_editor):
    ConfiguracionPlataforma = apps.get_model("configuracion", "ConfiguracionPlataforma")
    ConfiguracionPlataforma.objects.get_or_create(pk=1)


class Migration(migrations.Migration):
    dependencies = [
        ("configuracion", "0001_initial"),
    ]

    # Reversión: la 0001 elimina la tabla completa; aquí no hay nada que deshacer.
    operations = [migrations.RunPython(crear_configuracion, migrations.RunPython.noop)]
