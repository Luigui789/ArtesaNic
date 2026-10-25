/**
 * API de pedidos, entrega y panel del artesano que consume la interfaz.
 * Hoy delega en el servidor simulado; al integrar Django se reemplaza cada
 * función por su llamada HTTP con la misma firma (ver `src/features/README.md`).
 */
export {
  artisanSummary,
  changeOrderStatus,
  classifyCancelledUnits,
  createOrderRequest,
  getOrder,
  listOrders,
  setDelivery,
  setDeliveryCoordination,
  setDeliveryQuote,
} from "@/mocks/pedidos";
export type { DeliveryCoordinationInput, OrderRequestInput } from "./types";
