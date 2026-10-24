/**
 * API de pagos que consume la interfaz.
 *
 * - Pago real (AUD-10): `http.ts` contra Django cuando `VITE_CATALOGO_API=real`. La demo
 *   no simula este contrato (501), igual que la revisión de AUD-06.
 * - Pago simulado de la demo: las funciones del servidor simulado, solo para las pantallas
 *   de demostración (`PaymentPanel`).
 */
import { catalogoReal } from "@/features/catalogo/api";
import { ApiError } from "@/lib/http";
import { crearIntentoSeguro } from "@/lib/intento-seguro";
import * as http from "./http";
import type { IntentoPagoEntrada, PagoPedido, ResolucionPagoEntrada } from "./types";

export {
  confirmPayment,
  correctPayment,
  getPaymentReceipt,
  registerPayment,
  reviewPayment,
} from "@/mocks/pagos";

function noDisponible(): Promise<never> {
  return Promise.reject(
    new ApiError(501, "El registro de pagos solo está disponible con la API real."),
  );
}

export function consultarPago(
  recibido: boolean,
  pedido: number,
  signal?: AbortSignal,
): Promise<PagoPedido> {
  return catalogoReal ? http.consultarPago(recibido, pedido, signal) : noDisponible();
}

export function registrarIntento(
  pedido: number,
  entrada: IntentoPagoEntrada,
  clave: string,
): Promise<PagoPedido> {
  return catalogoReal ? http.registrarIntento(pedido, entrada, clave) : noDisponible();
}

export function corregirIntento(
  pedido: number,
  intento: number,
  entrada: IntentoPagoEntrada,
  clave: string,
): Promise<PagoPedido> {
  return catalogoReal ? http.corregirIntento(pedido, intento, entrada, clave) : noDisponible();
}

export function resolverIntento(
  pedido: number,
  intento: number,
  entrada: ResolucionPagoEntrada,
  clave: string,
): Promise<PagoPedido> {
  return catalogoReal ? http.resolverIntento(pedido, intento, entrada, clave) : noDisponible();
}

export function descargarComprobante(url: string, signal?: AbortSignal): Promise<Blob> {
  return catalogoReal ? http.descargarComprobante(url, signal) : noDisponible();
}

/**
 * Un intento por formulario (AUD-08): misma clave mientras el archivo y los datos no
 * cambien —un reintento tras perder la respuesta no duplica el intento— y clave nueva
 * para la siguiente operación.
 */
export function crearIntentoDePago() {
  const intento = crearIntentoSeguro();
  return {
    async ejecutar<T>(huella: unknown, operacion: (clave: string) => Promise<T>): Promise<T> {
      const clave = intento.clave(huella);
      try {
        const resultado = await operacion(clave);
        intento.completar();
        return resultado;
      } catch (error) {
        intento.fallar(error, huella);
        throw error;
      }
    },
    /** Un resultado incierto (red o 5xx) solo admite reintentar con los mismos datos. */
    get incierto() {
      return intento.incierto;
    },
  };
}

export function huellaIntento(pedido: number, accion: string, entrada: IntentoPagoEntrada) {
  return { pedido, accion, ...http.huellaIntento(entrada) };
}

export function huellaResolucion(pedido: number, intento: number, entrada: ResolucionPagoEntrada) {
  return { pedido, intento, ...http.cuerpoResolucion(entrada) };
}

export type { PaymentInput } from "./types";
export type {
  EstadoPago,
  IntentoPago,
  IntentoPagoEntrada,
  MetodoPago,
  PagoPedido,
  ResolucionPagoEntrada,
} from "./types";
