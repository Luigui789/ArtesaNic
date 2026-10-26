/**
 * Cliente real de la conversación del pedido (AUD-16, docs/api/mensajes.md). La identidad sale
 * del Bearer del transporte compartido: el cuerpo del envío lleva solo `texto`. Sin CSRF: la
 * operación no se autentica con cookies. Las respuestas se validan con Zod y se traducen de
 * `snake_case` a los contratos `camelCase`; los componentes no ven DTO.
 */
import { z } from "zod";
import { solicitar } from "@/lib/http";
import type { ConversacionPedido, MensajePedido } from "./types";

export const MAX_TEXTO = 500;
const MENSAJES = {
  401: "Inicia sesión para ver los mensajes del pedido.",
  404: "No encontramos este pedido.",
};

const esquemaMensaje = z.object({
  id: z.number().int().positive(),
  autor: z.object({ id: z.number().int().positive(), nombre: z.string() }),
  texto: z.string().min(1).max(MAX_TEXTO),
  creado_en: z.string().min(1),
});
const esquemaConversacion = z.object({
  mensajes: z.array(esquemaMensaje),
  cursor: z.number().int().nonnegative(),
  solo_lectura: z.boolean(),
});

export type MensajeDTO = z.infer<typeof esquemaMensaje>;
export type ConversacionDTO = z.infer<typeof esquemaConversacion>;

export function aMensaje(dto: MensajeDTO): MensajePedido {
  return {
    id: dto.id,
    autor: { id: dto.autor.id, nombre: dto.autor.nombre },
    texto: dto.texto,
    creadoEn: dto.creado_en,
  };
}

export function aConversacion(dto: ConversacionDTO): ConversacionPedido {
  return {
    mensajes: dto.mensajes.map(aMensaje),
    cursor: dto.cursor,
    soloLectura: dto.solo_lectura,
  };
}

const ruta = (pedido: number) => `/pedidos/${pedido}/mensajes/`;

/** Sin cursor: historial completo. Con `despuesDe`: solo los mensajes con `id` mayor. */
export async function listarMensajes(
  pedido: number,
  despuesDe?: number,
  signal?: AbortSignal,
): Promise<ConversacionPedido> {
  const consulta = despuesDe === undefined ? "" : `?despues_de=${despuesDe}`;
  return aConversacion(
    await solicitar(`${ruta(pedido)}${consulta}`, {
      autenticada: true,
      mensajes: MENSAJES,
      esquema: esquemaConversacion,
      signal,
    }),
  );
}

/** Lista cerrada: solo `texto`. El autor, el rol y la fecha los decide el servidor. */
export async function enviarMensaje(pedido: number, texto: string): Promise<MensajePedido> {
  return aMensaje(
    await solicitar(ruta(pedido), {
      metodo: "POST",
      cuerpo: { texto },
      autenticada: true,
      mensajes: MENSAJES,
      esquema: esquemaMensaje,
    }),
  );
}
