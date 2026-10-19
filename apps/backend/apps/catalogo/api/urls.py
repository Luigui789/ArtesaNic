from django.urls import path

from . import views

app_name = "catalogo"

urlpatterns = [
    path("", views.CatalogoView.as_view(), name="catalogo"),
    path("<int:producto_id>/", views.ProductoPublicoView.as_view(), name="detalle"),
    path("mios/", views.MisProductosView.as_view(), name="mios"),
    path("mios/<int:producto_id>/", views.MiProductoView.as_view(), name="mio"),
    path("mios/<int:producto_id>/publicar/", views.PublicarView.as_view(), name="publicar"),
    path(
        "mios/<int:producto_id>/despublicar/", views.DespublicarView.as_view(), name="despublicar"
    ),
]
