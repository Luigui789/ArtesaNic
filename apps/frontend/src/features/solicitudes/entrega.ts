/**
 * Plan de entrega de la propuesta (RF-016). Dos casos, ratificados tras AUD-09:
 *
 * - El comprador **eligió** modalidad: el artesano la ve solo como texto y no puede
 *   cambiarla ni su descripción (el servidor lo rechaza con `400`).
 * - El comprador dejó **«Sin preferencia»** (`modalidad_entrega_preferida = ""`): no fijó
 *   nada y el artesano define modalidad y descripción en la propuesta. La ausencia de
 *   preferencia nunca se convierte en `retiro_taller`.
 *
 * `retiro_taller` siempre cuesta C$ 0.00, la elija el comprador o el artesano.
 */
import type { ModalidadEntrega, Solicitud } from "./types";

export const COSTO_RETIRO_TALLER = "0.00";

export interface EntregaFijada {
  modalidad: ModalidadEntrega;
  descripcion: string;
}

/** Lo que fijó el comprador, o `null` si dejó «Sin preferencia». */
export function entregaFijadaPorComprador(
  s: Pick<Solicitud, "modalidadEntregaPreferida" | "descripcionEntregaPreferida">,
): EntregaFijada | null {
  return s.modalidadEntregaPreferida
    ? { modalidad: s.modalidadEntregaPreferida, descripcion: s.descripcionEntregaPreferida }
    : null;
}

export const esRetiroTaller = (modalidad: string): boolean => modalidad === "retiro_taller";

/** Costo que se envía: C$ 0.00 con retiro en taller; con las demás, el que escribió el artesano. */
export function costoEntregaEnviado(modalidad: string, ingresado: string): string {
  return esRetiroTaller(modalidad) ? COSTO_RETIRO_TALLER : ingresado;
}
