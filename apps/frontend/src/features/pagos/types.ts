import type { PaymentMethod } from "@/types";

export interface PaymentInput {
  metodo: PaymentMethod;
  referencia?: string | undefined;
  nota?: string | undefined;
  comprobante?: { nombreArchivo: string; tipo: string; tamano: number; src: string } | undefined;
}
