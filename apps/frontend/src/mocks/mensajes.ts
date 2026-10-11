/** Servidor simulado: mensajería asociada al pedido (RF-014). */
import type { Message, Role } from "@/types";
import { api, nextId, nowIso, store } from "./core";

const nuevoMensajeId = () => nextId(store.messages);

export function listMessages(pedidoId: number): Promise<Message[]> {
  return api(
    () =>
      store.messages
        .filter((m) => m.pedidoId === pedidoId)
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    250,
  );
}

export function sendMessage(
  pedidoId: number,
  autor: Role,
  autorNombre: string,
  texto: string,
): Promise<Message> {
  return api(
    () => {
      const msg: Message = {
        id: nuevoMensajeId(),
        pedidoId,
        autor,
        autorNombre,
        texto,
        fecha: nowIso(),
      };
      store.messages.push(msg);
      return msg;
    },
    400,
    true,
  );
}

/**
 * RNF-010: cada consulta del polling trae únicamente los mensajes posteriores al
 * último recibido. Solo devuelve mensajes reales de las partes: el mock no los
 * inventa, para que la demostración sea reproducible.
 */
export function pollNewMessages(pedidoId: number, desde: string): Promise<Message[]> {
  return api(() => store.messages.filter((m) => m.pedidoId === pedidoId && m.fecha > desde), 200);
}
