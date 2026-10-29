"""Envío de mensajes de la conversación del pedido (AUD-16; RF-014, RN-006, RN-020).

Única escritura productiva de ``MensajePedido``. El autor es siempre el actor autenticado.

Cada envío toma primero el ``SELECT … FOR UPDATE`` del ``Pedido`` — el mismo lock con el que
vencimiento, cumplimiento, cancelación y cierre parcial cambian el estado — y revalida el
estado dentro de él (D-AUD16-06):

- dos envíos del mismo pedido se serializan, así que el orden de ``id`` coincide con el orden
  de commit y el cursor ``id > N`` no puede saltarse un mensaje confirmado tarde (D-AUD16-07);
- si la transición terminal gana el lock, el envío ve el estado nuevo y se rechaza; si gana
  el envío, el mensaje queda antes del cierre. Nunca hay un mensaje posterior al cierre.

Los logs solo llevan identificadores: nunca el texto ni datos personales (RNF-013).
"""

import logging

from django.db import transaction

from apps.pedidos.models import ESTADOS_TERMINALES, EstadoOperativoPedido, Pedido

from .models import MAX_TEXTO, MensajePedido
from .selectors import PedidoNoEncontrado, filtro_de_parte

logger = logging.getLogger(__name__)

CODIGO_CONVERSACION_CERRADA = "conversacion_cerrada"
MENSAJE_CONVERSACION_CERRADA = (
    "Este pedido ya finalizó. La conversación está disponible solo para consulta."
)


class TextoInvalido(Exception):
    def __init__(self, mensaje: str):
        self.errores = {"texto": [mensaje]}
        super().__init__(mensaje)


class ConversacionCerrada(Exception):
    """El pedido alcanzó un estado terminal: el historial queda solo para consulta (409)."""

    codigo = CODIGO_CONVERSACION_CERRADA
    mensaje = MENSAJE_CONVERSACION_CERRADA


def validar_texto(texto) -> str:
    if not isinstance(texto, str):
        raise TextoInvalido("El mensaje debe ser texto.")
    texto = texto.strip()
    if not texto:
        raise TextoInvalido("Escribe un mensaje.")
    if len(texto) > MAX_TEXTO:
        raise TextoInvalido(f"El mensaje admite como máximo {MAX_TEXTO} caracteres.")
    return texto


def _crear_mensaje(pedido: Pedido, autor, texto: str) -> MensajePedido:
    return MensajePedido.objects.create(pedido=pedido, autor=autor, texto=texto)


def _registrar(pedido_id: int, mensaje_id: int, actor_id: int) -> None:
    logger.info(
        "mensaje_pedido_creado pedido_id=%s mensaje_id=%s actor_id=%s",
        pedido_id,
        mensaje_id,
        actor_id,
    )


@transaction.atomic
def enviar_mensaje(*, actor, pedido_id: int, texto: str) -> MensajePedido:
    filtro = filtro_de_parte(actor)
    texto = validar_texto(texto)
    pedido = Pedido.objects.select_for_update(of=("self",)).filter(pk=pedido_id, **filtro).first()
    if pedido is None:
        raise PedidoNoEncontrado
    # Leído después del lock: READ COMMITTED ve la transición que confirmó quien lo tenía.
    estado = EstadoOperativoPedido.objects.values_list("estado", flat=True).get(pedido=pedido)
    if estado in ESTADOS_TERMINALES:
        raise ConversacionCerrada
    mensaje = _crear_mensaje(pedido, actor, texto)
    transaction.on_commit(lambda: _registrar(pedido.pk, mensaje.pk, actor.pk))
    return mensaje
