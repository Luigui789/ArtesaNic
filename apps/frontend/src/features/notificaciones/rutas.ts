import type { Notificacion } from "./http";

export function rutaNotificacion(n: Notificacion, rol: "comprador" | "artesano") {
  const prefijo = rol === "artesano" ? "/panel" : "";
  return n.pedidoId
    ? `${prefijo}/pedidos/${n.pedidoId}`
    : `${prefijo}/solicitudes/${n.solicitudId}`;
}
