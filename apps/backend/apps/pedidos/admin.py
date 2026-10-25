"""Supervisión de pedidos en Django Admin, estrictamente de solo lectura (RF-013.5/6; D-AUD14-10).

Solo se registra ``Pedido``: estado operativo, importes y líneas se muestran desde aquí,
sin editores de ``EstadoOperativoPedido``, líneas, cargos, entregas ni reembolsos, cuyas
transiciones pertenecen a los servicios transaccionales de AUD-07 a AUD-13. Nadie agrega,
cambia ni borra pedidos aquí, tampoco el superusuario, y no hay acciones. Permiso:
``pedidos.view_pedido``.

Privacidad (RF-013.7/8, RN-006, D-AUD14-11): no se muestran pagos, referencias,
comprobantes ni rutas de archivos privados, ni el teléfono del comprador; ``apps.pagos``
no se registra en Django Admin y ningún modelo futuro de mensajes debe registrarse aquí.
"""

from django.contrib import admin
from django.core.exceptions import ObjectDoesNotExist
from django.utils.html import format_html, format_html_join

from .models import Pedido


@admin.register(Pedido)
class PedidoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "taller",
        "comprador_nombre",
        "estado",
        "total",
        "moneda",
        "confirmado_en",
    )
    list_filter = ("estado_operativo__estado", "modalidad_entrega", "moneda", "confirmado_en")
    search_fields = ("=id", "taller__nombre", "comprador__nombre")
    list_select_related = ("taller", "comprador", "estado_operativo")
    ordering = ("-confirmado_en", "-id")
    actions = None
    fieldsets = (
        (
            "Pedido",
            {
                "fields": (
                    "id",
                    "solicitud_id",
                    "propuesta_id",
                    "comprador_nombre",
                    "taller",
                    "confirmado_en",
                    "estado",
                )
            },
        ),
        ("Entrega", {"fields": ("modalidad_entrega", "descripcion_entrega", "costo_entrega")}),
        (
            "Importes congelados",
            {
                "fields": (
                    "subtotal_productos",
                    "total_personalizacion",
                    "total_otros_cargos",
                    "total",
                    "moneda",
                )
            },
        ),
        ("Líneas", {"fields": ("resumen_lineas",)}),
    )
    readonly_fields = (
        "id",
        "solicitud_id",
        "propuesta_id",
        "comprador_nombre",
        "taller",
        "confirmado_en",
        "estado",
        "modalidad_entrega",
        "descripcion_entrega",
        "costo_entrega",
        "subtotal_productos",
        "total_personalizacion",
        "total_otros_cargos",
        "total",
        "moneda",
        "resumen_lineas",
    )

    def get_queryset(self, request):
        return (
            super().get_queryset(request).select_related("taller", "comprador", "estado_operativo")
        )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="comprador", ordering="comprador__nombre")
    def comprador_nombre(self, obj):
        return obj.comprador.nombre

    @admin.display(description="estado", ordering="estado_operativo__estado")
    def estado(self, obj):
        try:
            return obj.estado_operativo.get_estado_display()
        except ObjectDoesNotExist:
            return "—"

    @admin.display(description="líneas")
    def resumen_lineas(self, obj):
        lineas = obj.lineas.order_by("posicion", "id")
        if not lineas:
            return "—"
        filas = format_html_join(
            "",
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            (
                (
                    linea.posicion,
                    linea.producto_nombre,
                    linea.get_modalidad_display(),
                    linea.cantidad,
                    linea.precio_unitario,
                    linea.subtotal,
                )
                for linea in lineas
            ),
        )
        return format_html(
            "<table><thead><tr><th>#</th><th>Producto</th><th>Modalidad</th><th>Cantidad</th>"
            "<th>Precio unitario (C$)</th><th>Subtotal (C$)</th></tr></thead>"
            "<tbody>{}</tbody></table>",
            filas,
        )
