/**
 * API de pagos y comprobantes que consume la interfaz.
 * Hoy delega en el servidor simulado; al integrar Django se reemplaza cada
 * función por su llamada HTTP con la misma firma (ver `src/features/README.md`).
 */
export {
  confirmPayment,
  correctPayment,
  getPaymentReceipt,
  registerPayment,
  reviewPayment,
} from "@/mocks/pagos";
export type { PaymentInput } from "./types";
