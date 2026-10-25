from django.apps import AppConfig


class PagosConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.pagos"
    verbose_name = "Pagos"

    def ready(self):
        from . import checks  # noqa: F401 - registra la comprobación del storage privado
