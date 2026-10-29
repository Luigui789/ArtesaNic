"""Tasa de cambio en Django Admin (RF-007.3, RF-013.4).

El singleton nace por migración: no se agrega ni se borra aquí. El formulario solo edita
``tasa_cambio_usd_nio`` y ``save_model`` delega en ``services.actualizar_tasa_cambio``,
que escribe la proyección y su historial en una transacción; el actor es siempre
``request.user`` (nunca un dato del formulario). Permiso: ``change_configuracionplataforma``.
"""

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from . import services
from .models import (
    DECIMALES_TASA,
    DIGITOS_TASA,
    ID_CONFIGURACION,
    TASA_MINIMA,
    ConfiguracionPlataforma,
)

HISTORIAL_VISIBLE = 20


class ConfiguracionPlataformaForm(forms.ModelForm):
    tasa_cambio_usd_nio = forms.DecimalField(
        label="Tasa de cambio (C$ por US$)",
        max_digits=DIGITOS_TASA,
        decimal_places=DECIMALES_TASA,
        min_value=TASA_MINIMA,
        help_text="Córdobas por un dólar, hasta cuatro decimales. Solo informativa: no "
        "modifica precios ni importes de pedidos, que se conservan en córdobas.",
    )

    class Meta:
        model = ConfiguracionPlataforma
        fields = ("tasa_cambio_usd_nio",)


@admin.register(ConfiguracionPlataforma)
class ConfiguracionPlataformaAdmin(admin.ModelAdmin):
    form = ConfiguracionPlataformaForm
    fields = ("tasa_cambio_usd_nio", "actualizada_por", "actualizada_en", "historial")
    readonly_fields = ("actualizada_por", "actualizada_en", "historial")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Una sola fila: el listado lleva directamente a ella.
        if not self.has_view_or_change_permission(request):
            raise PermissionDenied
        return redirect(
            reverse("admin:configuracion_configuracionplataforma_change", args=[ID_CONFIGURACION])
        )

    @admin.display(description="Historial de cambios")
    def historial(self, obj):
        cambios = obj.cambios_tasa.select_related("actor")[:HISTORIAL_VISIBLE]
        if not cambios:
            return "Sin cambios registrados."
        filas = format_html_join(
            "",
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            (
                (
                    c.creado_en.strftime("%Y-%m-%d %H:%M"),
                    c.tasa_anterior if c.tasa_anterior is not None else "—",
                    c.tasa_nueva,
                    c.actor.nombre,
                )
                for c in cambios
            ),
        )
        return format_html(
            "<table><thead><tr><th>Fecha</th><th>Anterior</th><th>Nueva</th><th>Actor</th>"
            "</tr></thead><tbody>{}</tbody></table>",
            filas,
        )

    def save_model(self, request, obj, form, change):
        try:
            cambio = services.actualizar_tasa_cambio(
                actor=request.user, nueva_tasa=form.cleaned_data["tasa_cambio_usd_nio"]
            )
        except services.ActorNoAutorizado:
            raise PermissionDenied from None
        obj.refresh_from_db()
        if not cambio:
            self.message_user(request, "La tasa ya tenía ese valor: sin cambios.", messages.INFO)
