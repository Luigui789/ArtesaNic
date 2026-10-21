from django.urls import path

from .views import OperacionView

urlpatterns = [
    path("<str:tipo>/<str:clave>/", OperacionView.as_view(), name="operacion"),
]
