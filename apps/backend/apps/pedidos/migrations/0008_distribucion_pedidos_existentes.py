"""Distribución económica para las líneas de pedidos confirmados antes de AUD-13.

Copia exactamente la distribución congelada de su propuesta (calculada por
``propuestas.0005`` con el mismo algoritmo). No modifica ``Pedido``, ``LineaPedido``,
``CargoPedido``, pagos, entregas, reservas ni movimientos, y no crea cancelaciones, cierres,
reembolsos ni obligaciones de clasificación. Es idempotente.
"""

from django.db import migrations

from apps.pedidos.services import completar_distribuciones_pedido


def crear_distribuciones(apps, schema_editor):
    completar_distribuciones_pedido(
        LineaPedido=apps.get_model("pedidos", "LineaPedido"),
        DistribucionEconomicaLineaPedido=apps.get_model(
            "pedidos", "DistribucionEconomicaLineaPedido"
        ),
        DistribucionEconomicaLineaPropuesta=apps.get_model(
            "propuestas", "DistribucionEconomicaLineaPropuesta"
        ),
    )


class Migration(migrations.Migration):
    dependencies = [
        ("pedidos", "0007_resolucion_y_reembolsos"),
        ("propuestas", "0005_distribucion_propuestas_existentes"),
    ]

    # Reversión: la 0007 elimina la tabla completa; aquí no hay nada que deshacer.
    operations = [migrations.RunPython(crear_distribuciones, migrations.RunPython.noop)]
