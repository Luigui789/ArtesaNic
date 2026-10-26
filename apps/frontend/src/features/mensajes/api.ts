/**
 * API real de la mensajería del pedido (AUD-16; RF-014, RNF-010). Solo Django: sin fallback
 * al servidor simulado. La demo (`OrderChatDemo`, `NotificationsProvider` simulado) importa
 * `@/mocks/mensajes` directamente.
 *
 * El polling pide solo los ids posteriores al cursor y mezcla el delta en la caché; nunca
 * vuelve a descargar el historial completo (D-AUD16-08).
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { listarMensajes } from "./http";
import type { ConversacionPedido, MensajePedido } from "./types";

export { enviarMensaje, listarMensajes, MAX_TEXTO } from "./http";
export type { AutorMensaje, ConversacionPedido, MensajePedido } from "./types";

/** RNF-010: intervalo de sondeo de la conversación activa. */
export const INTERVALO_SONDEO_MS = 15_000;

function ordenados(mensajes: Iterable<MensajePedido>): MensajePedido[] {
  const porId = new Map<number, MensajePedido>();
  for (const m of mensajes) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.id - b.id);
}

/**
 * Mezcla un delta: deduplica por id, ordena por id ascendente y solo avanza el cursor. Un
 * pedido terminal no vuelve a admitir mensajes, así que `soloLectura` tampoco retrocede.
 */
export function fusionar(
  actual: ConversacionPedido,
  delta: ConversacionPedido,
): ConversacionPedido {
  return {
    mensajes: ordenados([...actual.mensajes, ...delta.mensajes]),
    cursor: Math.max(actual.cursor, delta.cursor),
    soloLectura: actual.soloLectura || delta.soloLectura,
  };
}

/**
 * Agrega el mensaje propio devuelto por el `201` sin mover el cursor: entre el último sondeo y
 * este envío pudo confirmarse un mensaje de la otra parte con un id menor. El siguiente delta
 * (`despues_de=<cursor>`) lo trae, devuelve también el propio (se deduplica) y avanza el cursor.
 */
export function agregarPropio(
  actual: ConversacionPedido,
  mensaje: MensajePedido,
): ConversacionPedido {
  return { ...actual, mensajes: ordenados([...actual.mensajes, mensaje]) };
}

/** Un ciclo del polling: pide `despues_de=<cursor>` y mezcla el delta en la caché. */
export async function sondearNovedades(
  queryClient: QueryClient,
  clave: QueryKey,
  pedido: number,
): Promise<void> {
  const actual = queryClient.getQueryData<ConversacionPedido>(clave);
  if (!actual) return;
  const delta = await listarMensajes(pedido, actual.cursor);
  queryClient.setQueryData<ConversacionPedido>(clave, (previa) =>
    previa ? fusionar(previa, delta) : previa,
  );
}
