from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .health import SaludView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/salud/", SaludView.as_view(), name="salud"),
    path("api/v1/auth/", include("apps.accounts.api.urls")),
    path("api/v1/talleres/", include("apps.talleres.api.urls")),
    path("api/v1/categorias/", include("apps.catalogo.api.urls_categorias")),
    path("api/v1/productos/", include("apps.catalogo.api.urls")),
    path("api/v1/solicitudes/", include("apps.solicitudes.api.urls")),
    path("api/v1/solicitudes/", include("apps.propuestas.api.urls")),
    path("api/v1/pedidos/", include("apps.pedidos.api.urls")),
    path("api/v1/pedidos/", include("apps.pagos.api.urls")),
    path("api/v1/inventario/", include("apps.inventario.api.urls")),
    path("api/v1/operaciones/", include("apps.operaciones.api.urls")),
]

# Django sirve archivos únicamente en desarrollo con DEBUG.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
