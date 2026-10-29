"""Categorías y moderación de productos en Django Admin (RF-013.3, RF-019.5).

La administración crea y renombra categorías; el código no cambia una vez creado
porque la API y los filtros del catálogo lo usan como identificador estable. Una
categoría con productos no se puede borrar (``on_delete=PROTECT``).

Los productos pertenecen al artesano: aquí solo se consultan y se retiran por
moderación. Todos sus campos son de solo lectura, no se agregan ni se borran, y la
acción «Retirar productos por moderación» pide un motivo e invoca
``services.moderar_producto`` por cada producto, con ``request.user`` como actor.
Exige el permiso ``catalogo.moderar_producto`` (no ``change_producto``).
"""

from django import forms
from django.contrib import admin, messages
from django.contrib.admin import helpers
from django.core.exceptions import ValidationError
from django.template.response import TemplateResponse

from . import services
from .models import MAX_MOTIVO_MODERACION, Categoria, Producto


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "codigo")
    search_fields = ("nombre", "codigo")
    ordering = ("nombre",)

    def get_readonly_fields(self, request, obj=None):
        return ("codigo",) if obj is not None else ()


class MotivoModeracionForm(forms.Form):
    motivo = forms.CharField(
        label="Motivo de la moderación",
        max_length=MAX_MOTIVO_MODERACION,
        widget=forms.Textarea(attrs={"rows": 4, "cols": 60}),
        help_text="Obligatorio. El artesano verá este motivo y la fecha, no tu identidad.",
    )


class ModeracionFilter(admin.SimpleListFilter):
    title = "moderación"
    parameter_name = "moderado"

    def lookups(self, request, model_admin):
        return (("si", "Retirado por moderación"), ("no", "Sin moderación"))

    def queryset(self, request, queryset):
        if self.value() == "si":
            return queryset.filter(moderacion__isnull=False)
        if self.value() == "no":
            return queryset.filter(moderacion__isnull=True)
        return queryset


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "nombre",
        "taller",
        "categoria",
        "publicado",
        "estado_moderacion",
        "creado_en",
        "actualizado_en",
    )
    list_filter = ("publicado", "categoria", ModeracionFilter, "taller__estado")
    search_fields = ("nombre", "taller__nombre")
    ordering = ("-creado_en", "-id")
    list_select_related = ("taller", "categoria", "moderacion")
    actions = ["moderar"]
    fieldsets = (
        (
            "Producto (pertenece al artesano)",
            {
                "fields": (
                    "taller",
                    "nombre",
                    "descripcion",
                    "precio",
                    "categoria",
                    "modalidades_admitidas",
                    "fotografia_principal",
                )
            },
        ),
        ("Publicación del artesano", {"fields": ("publicado",)}),
        (
            "Moderación administrativa",
            {"fields": ("estado_moderacion", "motivo_moderacion", "moderado_por", "moderado_en")},
        ),
        ("Fechas", {"fields": ("creado_en", "actualizado_en")}),
    )
    readonly_fields = (
        "taller",
        "nombre",
        "descripcion",
        "precio",
        "categoria",
        "modalidades_admitidas",
        "fotografia_principal",
        "publicado",
        "estado_moderacion",
        "motivo_moderacion",
        "moderado_por",
        "moderado_en",
        "creado_en",
        "actualizado_en",
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("taller", "categoria", "moderacion")

    # El producto nace y se edita desde el panel del artesano; aquí no se crea, edita ni borra.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_moderar_permission(self, request):
        return request.user.has_perm(services.PERMISO_MODERAR)

    @admin.display(description="modalidades")
    def modalidades_admitidas(self, obj):
        return ", ".join(obj.modalidades)

    @admin.display(description="estado de moderación")
    def estado_moderacion(self, obj):
        return "Retirado por moderación" if obj.moderacion_vigente else "Sin moderación"

    @admin.display(description="motivo")
    def motivo_moderacion(self, obj):
        moderacion = obj.moderacion_vigente
        return moderacion.motivo if moderacion else "—"

    @admin.display(description="moderado por")
    def moderado_por(self, obj):
        moderacion = obj.moderacion_vigente
        return moderacion.moderado_por.nombre if moderacion else "—"

    @admin.display(description="moderado en")
    def moderado_en(self, obj):
        moderacion = obj.moderacion_vigente
        return moderacion.moderado_en if moderacion else "—"

    @admin.action(description="Retirar productos por moderación", permissions=["moderar"])
    def moderar(self, request, queryset):
        if "confirmar" in request.POST:
            form = MotivoModeracionForm(request.POST)
            if form.is_valid():
                self._moderar(request, queryset, form.cleaned_data["motivo"])
                return None
        else:
            form = MotivoModeracionForm()
        contexto = {
            **self.admin_site.each_context(request),
            "title": "Retirar productos por moderación",
            "opts": self.model._meta,
            "productos": queryset,
            "form": form,
            "action_checkbox_name": helpers.ACTION_CHECKBOX_NAME,
        }
        return TemplateResponse(request, "admin/catalogo/producto/moderar.html", contexto)

    def _moderar(self, request, queryset, motivo: str):
        moderados, ya_moderados = 0, 0
        # Cada producto pasa por el servicio, con su lock y su transacción; nunca update().
        for producto in queryset:
            try:
                if services.moderar_producto(producto, actor=request.user, motivo=motivo):
                    moderados += 1
                else:
                    ya_moderados += 1
            except services.ModeradorNoValido:
                self.message_user(
                    request,
                    "Solo una cuenta de administración activa con el permiso de moderación "
                    "puede retirar productos.",
                    messages.ERROR,
                )
                return
            except ValidationError as exc:
                self.message_user(request, " ".join(exc.messages), messages.ERROR)
                return
        if moderados:
            self.message_user(
                request, f"Productos retirados por moderación: {moderados}.", messages.SUCCESS
            )
        if ya_moderados:
            self.message_user(
                request, f"Ya estaban moderados, sin cambios: {ya_moderados}.", messages.INFO
            )
