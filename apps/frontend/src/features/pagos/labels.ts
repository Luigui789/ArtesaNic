import type { EstadoPago, MetodoPago, OrigenIntento } from "./types";
import type { PagoPedido } from "./types";

/** Orientación visual: no habilita acciones ni calcula plazos. */
export function siguientePasoPago(pago: PagoPedido, recibido: boolean, cerrado: boolean): string {
  if (cerrado) return "Solo consulta: este pedido ya no admite cambios en el pago.";
  if (pago.estado === "confirmado")
    return "Pago resuelto: el taller confirmó que recibió el dinero.";
  if (pago.estado === "registrado")
    return recibido
      ? "Tu turno: revisa el comprobante y verifica el dinero antes de confirmar."
      : "Le toca al taller: revisar tu comprobante y verificar que recibió el dinero.";
  if (pago.plazoVencido) return "El plazo para registrar o corregir el pago ya terminó.";
  if (pago.estado === "observado")
    return recibido
      ? "Le toca al comprador: corregir el comprobante según tu observación."
      : "Tu turno: revisa el motivo y envía la corrección del comprobante.";
  if (pago.estado === "no_recibido")
    return recibido
      ? "Le toca al comprador: revisar el motivo y registrar un nuevo pago."
      : "Tu turno: revisa el motivo antes de registrar un nuevo pago.";
  return recibido
    ? "Le toca al comprador: realizar el pago y registrar su comprobante."
    : "Tu turno: realiza el pago fuera de ArtesaNic y registra el comprobante.";
}

export const ESTADO_PAGO_LABELS: Record<EstadoPago, string> = {
  pendiente: "Pendiente de pago",
  registrado: "Pago registrado",
  observado: "Pago observado",
  confirmado: "Pago confirmado",
  no_recibido: "Pago no recibido",
};

/** El estado también se comunica con texto e icono, nunca solo con color. */
export const TONO_ESTADO_PAGO: Record<EstadoPago, "neutral" | "pending" | "success" | "danger"> = {
  pendiente: "pending",
  registrado: "pending",
  observado: "danger",
  confirmado: "success",
  no_recibido: "danger",
};

export const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  transferencia: "Transferencia",
  otro: "Otro método",
};

export const METODOS_PAGO = Object.keys(METODO_PAGO_LABELS) as MetodoPago[];

export function origenIntento(origen: OrigenIntento, previo: number | null): string {
  if (origen === "correccion") return `Corrección del intento ${previo ?? ""}`.trim();
  if (origen === "nuevo_tras_no_recibido") return "Nuevo intento tras pago no recibido";
  return "Registro inicial";
}
