from django.urls import path

from . import views

app_name = "talleres"

urlpatterns = [
    path("", views.TalleresView.as_view(), name="lista"),
    path("<int:taller_id>/", views.TallerView.as_view(), name="detalle"),
    path("mi-taller/", views.MiTallerView.as_view(), name="mi-taller"),
]
