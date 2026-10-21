/** Contratos legacy/demo; Solicitud V1 vive en features/solicitudes. */
import type { Order, OrderOption } from "@/types";

export interface OrderRequestInput {
  productoId: number;
  cantidad: number;
  personalizacion: string;
  observaciones: string;
  opcion: OrderOption;
  entregaPreferida: Order["entregaPreferida"];
}

export interface DeliveryCoordinationInput {
  fechaRecogida?: string | undefined;
  detalle?: string | undefined;
}
