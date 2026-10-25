"""Revisión de talleres en Django Admin (RF-013: aprobar o rechazar talleres).

El administrador no edita el perfil del taller, que pertenece al artesano
(RF-008): todos los campos son de solo lectura y el estado cambia únicamente con
las acciones Aprobar y Rechazar, que invocan los servicios del dominio. Las
acciones exigen el permiso ``talleres.revisar_taller``.
"""

from django import forms
from django.contrib import admin, messages
from django.contrib.admin import helpers
from django.template.response import TemplateResponse

from . import services
from .models import Taller


class MotivoRechazoForm(forms.Form):
    motivo = forms.CharField(
        label="Motivo del rechazo (opcional)",
        required=False,
        max_length=services.MAX_MOTIVO_RECHAZO,
        widget=forms.Textarea(attrs={"rows": 4, "cols": 60}),
    )


@admin.register(Taller)
class TallerAdmin(admin.ModelAdmin):
    list_display = ("nombre", "rubro", "propietario", "estado", "creado_en", "revisado_en")
    list_filter = ("estado",)
    search_fields = ("nombre", "rubro")
    ordering = ("-creado_en",)
    actions = ["aprobar", "rechazar"]
    fieldsets = (
        (
            "Perfil del taller",
            {
                "fields": (
                    "propietario",
                    "nombre",
                    "rubro",
                    "historia",
                    "direccion_completa",
                    "horario",
                )
            },
        ),
        (
            "Contactos públicos",
            {
                "fields": (
                    "telefono_publico",
                    "whatsapp_publico",
                    "facebook_url",
                    "instagram_url",
                    "sitio_web",
                )
            },
        ),
        ("Revisión", {"fields": ("estado", "motivo_rechazo", "revisado_por", "revisado_en")}),
        ("Fechas", {"fields": ("creado_en", "actualizado_en")}),
    )

    def get_readonly_fields(self, request, obj=None):
        return [campo.name for campo in Taller._meta.fields]

    # El taller nace con el registro del artesano; no se crea ni se borra aquí.
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_revisar_permission(self, request):
        return request.user.has_perm("talleres.revisar_taller")

    @admin.action(description="Aprobar los talleres seleccionados", permissions=["revisar"])
    def aprobar(self, request, queryset):
        self._revisar(request, queryset, services.aprobar_taller, "aprobado")

    @admin.action(description="Rechazar los talleres seleccionados", permissions=["revisar"])
    def rechazar(self, request, queryset):
        if "confirmar" in request.POST:
            form = MotivoRechazoForm(request.POST)
            if form.is_valid():
                motivo = form.cleaned_data["motivo"]
                self._revisar(
                    request,
                    queryset,
                    lambda taller, revisor: services.rechazar_taller(
                        taller, revisor=revisor, motivo=motivo
                    ),
                    "rechazado",
                )
                return None
        else:
            form = MotivoRechazoForm()
        contexto = {
            **self.admin_site.each_context(request),
            "title": "Rechazar talleres",
            "opts": self.model._meta,
            "talleres": queryset,
            "form": form,
            "action_checkbox_name": helpers.ACTION_CHECKBOX_NAME,
        }
        return TemplateResponse(request, "admin/talleres/taller/rechazar.html", contexto)

    def _revisar(self, request, queryset, decision, resultado: str):
        resueltos, sin_cambios = 0, 0
        for taller in queryset:
            try:
                if decision(taller, revisor=request.user):
                    resueltos += 1
                else:
                    sin_cambios += 1
            except services.TransicionNoPermitida as exc:
                self.message_user(request, f"«{taller}»: {exc}", messages.ERROR)
            except services.RevisorNoValido:
                self.message_user(
                    request,
                    "Solo una cuenta de administración activa puede revisar talleres.",
                    messages.ERROR,
                )
                return
        if resueltos:
            self.message_user(request, f"Talleres {resultado}s: {resueltos}.", messages.SUCCESS)
        if sin_cambios:
            self.message_user(
                request, f"Ya estaban {resultado}s, sin cambios: {sin_cambios}.", messages.INFO
            )
