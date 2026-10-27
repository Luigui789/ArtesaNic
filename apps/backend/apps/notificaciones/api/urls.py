from django.urls import path

from .views import Leer, LeerTodas, Lista, Resumen

urlpatterns = [
    path("", Lista.as_view()),
    path("resumen/", Resumen.as_view()),
    path("leer-todas/", LeerTodas.as_view()),
    path("<int:notificacion_id>/leer/", Leer.as_view()),
]
