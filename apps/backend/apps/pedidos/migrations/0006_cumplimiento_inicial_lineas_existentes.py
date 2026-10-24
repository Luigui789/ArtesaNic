"""Cumplimiento «pendiente» para las líneas de pedidos anteriores a AUD-12.

Solo crea la proyección operativa por renglón (D-AUD12-04): no inicia trabajo, no infiere
entregas históricas, no toca inventario, reservas ni pagos y no reescribe ningún snapshot.
Es idempotente: omite las líneas que ya tienen cumplimiento.
"""

from django.db import migrations


def crear_cumplimientos_pendientes(apps, schema_editor):
    LineaPedido = apps.get_model("pedidos", "LineaPedido")
    CumplimientoLineaPedido = apps.get_model("pedidos", "CumplimientoLineaPedido")
    pendientes = LineaPedido.objects.filter(cumplimiento__isnull=True).values_list(
        "pk", "pedido__confirmado_en"
    )
    CumplimientoLineaPedido.objects.bulk_create(
        (
            CumplimientoLineaPedido(linea_pedido_id=pk, actualizado_en=confirmado_en)
            for pk, confirmado_en in pendientes.iterator()
        ),
        batch_size=500,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("pedidos", "0005_cumplimiento_y_entregas"),
    ]

    # Reversión: la 0005 elimina la tabla completa; aquí no hay nada que deshacer.
    operations = [migrations.RunPython(crear_cumplimientos_pendientes, migrations.RunPython.noop)]
