/**
 * Contrato real de la conversación del pedido (AUD-16, docs/api/mensajes.md). No reutiliza el
 * `Message` legacy de la demo: el autor es una cuenta (id estable + nombre vigente), no un rol.
 */
export interface AutorMensaje {
  id: number;
  nombre: string;
}

export interface MensajePedido {
  /** Orden contractual de la conversación y cursor del polling. */
  id: number;
  autor: AutorMensaje;
  texto: string;
  creadoEn: string;
}

export interface ConversacionPedido {
  /** Ordenados por `id` ascendente, sin duplicados. */
  mensajes: MensajePedido[];
  /** Mayor id ya recibido por el polling; nunca retrocede. */
  cursor: number;
  /** Pedido terminal: el historial se conserva y no admite mensajes nuevos. */
  soloLectura: boolean;
}
