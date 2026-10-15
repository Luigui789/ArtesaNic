"""Categorías en Django Admin (RF-013). Los productos no se registran aquí.

La administración crea y renombra categorías; el código no cambia una vez creado
porque la API y los filtros del catálogo lo usan como identificador estable. Una
categoría con productos no se puede borrar (``on_delete=PROTECT``).
La moderación de productos con actor y motivo (RF-019.4) corresponde a AUD-14.
"""

from django.contrib import admin

from .models import Categoria


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "codigo")
    search_fields = ("nombre", "codigo")
    ordering = ("nombre",)

    def get_readonly_fields(self, request, obj=None):
        return ("codigo",) if obj is not None else ()
