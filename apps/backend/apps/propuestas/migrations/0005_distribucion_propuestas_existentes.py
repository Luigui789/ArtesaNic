"""Distribución económica para las propuestas emitidas antes de AUD-13 (D-AUD13-08/09).

Usa exactamente el algoritmo determinista de ``apps.propuestas.distribucion`` (mayor residuo
en centavos, empate por menor posición). Solo crea las filas que falten: no modifica
importes, líneas, cargos ni decisiones, y es idempotente.
"""

from django.db import migrations

from apps.propuestas.distribucion import completar_distribuciones


def crear_distribuciones(apps, schema_editor):
    completar_distribuciones(
        Propuesta=apps.get_model("propuestas", "Propuesta"),
        LineaPropuesta=apps.get_model("propuestas", "LineaPropuesta"),
        CargoPropuesta=apps.get_model("propuestas", "CargoPropuesta"),
        DistribucionEconomicaLineaPropuesta=apps.get_model(
            "propuestas", "DistribucionEconomicaLineaPropuesta"
        ),
    )


class Migration(migrations.Migration):
    dependencies = [
        ("propuestas", "0004_distribucion_economica"),
        ("solicitudes", "0003_revision_y_entrega_preferida"),
    ]

    # Reversión: la 0004 elimina la tabla completa; aquí no hay nada que deshacer.
    operations = [migrations.RunPython(crear_distribuciones, migrations.RunPython.noop)]
