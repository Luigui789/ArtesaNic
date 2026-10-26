"""Contrato de la conversación del pedido (AUD-16). Sin teléfono, rol, correo ni privilegios:
el autor solo expone su id de cuenta y su nombre vigente (D-AUD16-09)."""

from rest_framework import serializers

from apps.accounts.api.serializers import SinCamposDesconocidosMixin

from ..models import MAX_TEXTO
from ..services import CODIGO_CONVERSACION_CERRADA, MENSAJE_CONVERSACION_CERRADA

MAX_CURSOR = 2**63 - 1


class AutorMensajeSerializer(serializers.Serializer):
    id = serializers.IntegerField(help_text="Id estable de la cuenta; distingue lo propio.")
    nombre = serializers.CharField(help_text="Nombre vigente de la cuenta (puede cambiar).")


class MensajePedidoSerializer(serializers.Serializer):
    id = serializers.IntegerField(help_text="Orden contractual y cursor de la conversación.")
    autor = AutorMensajeSerializer()
    texto = serializers.CharField(max_length=MAX_TEXTO)
    creado_en = serializers.DateTimeField()


class ConversacionPedidoSerializer(serializers.Serializer):
    mensajes = MensajePedidoSerializer(many=True, help_text="Ordenados por `id` ascendente.")
    cursor = serializers.IntegerField(
        min_value=0,
        help_text="Mayor id entregado o el `despues_de` recibido; nunca retrocede. `0` sin "
        "mensajes ni cursor.",
    )
    solo_lectura = serializers.BooleanField(
        help_text="`true` si el pedido alcanzó un estado terminal: no admite mensajes nuevos.",
    )


class MensajeEntradaSerializer(SinCamposDesconocidosMixin, serializers.Serializer):
    """Lista cerrada: solo ``texto``. El autor sale del token, nunca del cuerpo."""

    texto = serializers.CharField(
        allow_blank=True,
        max_length=MAX_TEXTO,
        help_text=f"Texto plano; 1–{MAX_TEXTO} caracteres tras recortar los extremos.",
    )


class CursorSerializer(serializers.Serializer):
    despues_de = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        max_value=MAX_CURSOR,
        help_text="Devuelve solo mensajes con `id` mayor. Omitido: historial completo.",
    )


class ConflictoConversacionSerializer(serializers.Serializer):
    detail = serializers.CharField(default=MENSAJE_CONVERSACION_CERRADA)
    codigo = serializers.ChoiceField(
        choices=[(CODIGO_CONVERSACION_CERRADA, "Pedido finalizado: conversación de consulta")]
    )
