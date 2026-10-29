import { z } from "zod";
import { solicitar } from "@/lib/http";

const tipo = z.enum([
  "solicitud_recibida",
  "solicitud_rechazada",
  "propuesta_lista",
  "propuesta_aceptada",
  "propuesta_rechazada",
  "pago_registrado",
  "pago_corregido",
  "pago_confirmado",
  "pago_observado",
  "pago_no_recibido",
  "pedido_en_cumplimiento",
  "entrega_registrada",
  "pedido_entregado",
  "recepcion_confirmada",
  "discrepancia_entrega",
  "pedido_vencido_falta_pago",
  "pedido_cancelado_artesano",
  "cierre_parcial_propuesto",
  "cierre_parcial_objetado",
  "pedido_cerrado_parcial",
  "reembolso_creado",
  "reembolso_realizado",
]);
const aviso = z.object({
  id: z.number().int().positive(),
  tipo,
  titulo: z.string(),
  detalle: z.string(),
  solicitud_id: z.number().int().nullable(),
  pedido_id: z.number().int().nullable(),
  creada_en: z.string(),
  leida: z.boolean(),
  leida_en: z.string().nullable(),
});
const pagina = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(aviso),
});
const resumen = z.object({ no_leidas: z.number().int().nonnegative() });
const resultado = z.object({
  actualizadas: z.number().int().nonnegative(),
  no_leidas: z.number().int().nonnegative(),
});
function convertir(n: z.infer<typeof aviso>) {
  return {
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    detalle: n.detalle,
    solicitudId: n.solicitud_id,
    pedidoId: n.pedido_id,
    creadaEn: n.creada_en,
    leida: n.leida,
    leidaEn: n.leida_en,
  };
}
export type Notificacion = ReturnType<typeof convertir>;
export async function listarNotificaciones(page: number, signal?: AbortSignal) {
  const data = await solicitar(`/notificaciones/?page=${page}`, {
    autenticada: true,
    esquema: pagina,
    signal,
  });
  return { ...data, results: data.results.map(convertir) };
}
export async function consultarResumen(signal?: AbortSignal) {
  const data = await solicitar("/notificaciones/resumen/", {
    autenticada: true,
    esquema: resumen,
    signal,
  });
  return data.no_leidas;
}
export async function marcarLeida(id: number) {
  return convertir(
    await solicitar(`/notificaciones/${id}/leer/`, {
      metodo: "POST",
      autenticada: true,
      esquema: aviso,
    }),
  );
}
export async function marcarTodasLeidas() {
  return solicitar("/notificaciones/leer-todas/", {
    metodo: "POST",
    autenticada: true,
    esquema: resultado,
  });
}
