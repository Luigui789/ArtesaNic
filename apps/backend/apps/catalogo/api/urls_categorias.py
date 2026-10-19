from django.urls import path

from . import views

app_name = "categorias"

urlpatterns = [
    path("", views.CategoriasView.as_view(), name="lista"),
]
