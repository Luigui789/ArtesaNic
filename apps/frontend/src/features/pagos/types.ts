import type { PaymentMethod } from "@/types";

/** Entrada del pago simulado de la demo (mock). El contrato real está más abajo. */
export interface PaymentInput {
  metodo: PaymentMethod;
  referencia?: string | undefined;
  nota?: string | undefined;
  comprobante?: { nombreArchivo: string; tipo: string; tamano: number; src: string } | undefined;
}

// --- Contrato real AUD-10 (docs/api/pagos.md) ---

export type EstadoPago = "pendiente" | "registrado" | "observado" | "confirmado" | "no_recibido";
export type MetodoPago = "transferencia" | "otro";
export type OrigenIntento = "inicial" | "correccion" | "nuevo_tras_no_recibido";
export type ResultadoRevisionPago = "confirmado" | "observado" | "no_recibido";

export interface ComprobantePago {
  nombre: string;
  tipo: string;
  tamano: number;
  /** Endpoint autenticado relativo a la raíz de la API; nunca una URL pública. */
  url: string;
}

export interface ResolucionIntentoPago {
  estado: ResultadoRevisionPago;
  motivo: string;
  revisadoEn: string;
  plazoHasta: string | null;
}

export interface IntentoPago {
  id: number;
  numero: number;
  origen: OrigenIntento;
  intentoPrevio: number | null;
  metodo: MetodoPago;
  referencia: string;
  registradoEn: string;
  comprobante: ComprobantePago;
  resolucion: ResolucionIntentoPago | null;
}

export interface PagoPedido {
  pedido: number;
  estado: EstadoPago;
  moneda: "NIO";
  /** 100 % del total congelado del pedido; el cliente nunca lo envía. */
  total: string;
  /** Límite calculado por el servidor; `null` en registrado y confirmado. */
  registrableHasta: string | null;
  plazoVencido: boolean;
  revisionPendiente: boolean;
  confirmadoEn: string | null;
  /** Orden cronológico; el último es el intento vigente. */
  intentos: IntentoPago[];
}

/** Registro inicial, nuevo intento o corrección: sin monto ni datos derivados. */
export interface IntentoPagoEntrada {
  metodo: MetodoPago;
  referencia: string;
  comprobante: File;
}

export type ResolucionPagoEntrada =
  { estado: "confirmado" } | { estado: "observado" | "no_recibido"; motivo: string };
