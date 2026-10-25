import type { EstadoPago, MetodoPago, OrigenIntento } from "./types";

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
