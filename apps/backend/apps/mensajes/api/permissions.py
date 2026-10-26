"""Partes del pedido que pueden usar su conversación (AUD-16)."""

from rest_framework.permissions import BasePermission

from apps.accounts.api.permissions import EsComprador
from apps.accounts.models import Rol
from apps.talleres.api.permissions import EsArtesanoAprobado


class EsParteOperativa(BasePermission):
    """Comprador, o artesano con su taller aprobado.

    Anónima: 401. Administración de plataforma u otra cuenta: 403. Que el pedido sea suyo lo
    decide después el filtro SQL del selector y del servicio (ajeno: 404).
    """

    message = "La conversación del pedido es exclusiva de su comprador y de su taller."

    def has_permission(self, request, view):
        if EsComprador().has_permission(request, view):
            return True
        artesano = EsArtesanoAprobado()
        if artesano.has_permission(request, view):
            return True
        if request.user and request.user.is_authenticated and request.user.rol == Rol.ARTESANO:
            self.message = artesano.message
        return False
