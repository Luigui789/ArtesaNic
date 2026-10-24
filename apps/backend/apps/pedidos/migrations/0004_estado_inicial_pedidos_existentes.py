"""Estado operativo inicial «confirmado» para los pedidos anteriores a AUD-11.

Solo crea la proyección operativa (D-AUD11-02): no evalúa plazos, no vence pedidos, no libera
reservas y no reescribe ningún snapshot. El proceso de vencimientos aplica después las reglas
vigentes. Es idempotente: omite los pedidos que ya tienen estado operativo.
"""

from django.db import migrations


def crear_estados_iniciales(apps, schema_editor):
    Pedido = apps.get_model("pedidos", "Pedido")
    EstadoOperativoPedido = apps.get_model("pedidos", "EstadoOperativoPedido")
    pendientes = Pedido.objects.filter(estado_operativo__isnull=True).values_list(
        "pk", "confirmado_en"
    )
    EstadoOperativoPedido.objects.bulk_create(
        (
            EstadoOperativoPedido(pedido_id=pk, estado="confirmado", actualizado_en=confirmado_en)
            for pk, confirmado_en in pendientes.iterator()
        ),
        batch_size=500,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("pedidos", "0003_estado_operativo_e_historial"),
    ]

    # Reversión: la 0003 elimina la tabla completa; aquí no hay nada que deshacer.
    operations = [migrations.RunPython(crear_estados_iniciales, migrations.RunPython.noop)]
