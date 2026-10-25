/**
 * Cliente real de pagos externos (AUD-10, docs/api/pagos.md). La identidad procede del
 * Bearer del transporte compartido; el total, la moneda y el estado los decide el servidor.
 * Este módulo traduce DTO `snake_case` ↔ contratos `camelCase`; los componentes no ven DTO.
 */
import { solicitar, solicitarBinario } from "@/lib/http";
import type { IntentoPago, IntentoPagoEntrada, PagoPedido, ResolucionPagoEntrada } from "./types";

const CABECERA_IDEMPOTENCIA = "Idempotency-Key";
const MENSAJES = {
  401: "Inicia sesión para consultar o registrar el pago.",
  404: "No encontramos este pedido o el intento de pago indicado.",
};
const MENSAJES_COMPROBANTE = {
  401: "Inicia sesión para ver el comprobante.",
  404: "No encontramos este comprobante.",
};

interface IntentoPagoDTO {
  id: number;
  numero: number;
  origen: IntentoPago["origen"];
  intento_previo: number | null;
  metodo: IntentoPago["metodo"];
  referencia: string;
  registrado_en: string;
  comprobante: { nombre: string; tipo: string; tamano: number; url: string };
  resolucion: {
    estado: NonNullable<IntentoPago["resolucion"]>["estado"];
    motivo: string;
    revisado_en: string;
    plazo_hasta: string | null;
  } | null;
}

export interface PagoDTO {
  pedido: number;
  estado: PagoPedido["estado"];
  moneda: "NIO";
  total: string;
  registrable_hasta: string | null;
  plazo_vencido: boolean;
  revision_pendiente: boolean;
  confirmado_en: string | null;
  intentos: IntentoPagoDTO[];
}

export function aPago(dto: PagoDTO): PagoPedido {
  return {
    pedido: dto.pedido,
    estado: dto.estado,
    moneda: dto.moneda,
    total: dto.total,
    registrableHasta: dto.registrable_hasta,
    plazoVencido: dto.plazo_vencido,
    revisionPendiente: dto.revision_pendiente,
    confirmadoEn: dto.confirmado_en,
    intentos: dto.intentos.map((i) => ({
      id: i.id,
      numero: i.numero,
      origen: i.origen,
      intentoPrevio: i.intento_previo,
      metodo: i.metodo,
      referencia: i.referencia,
      registradoEn: i.registrado_en,
      comprobante: i.comprobante,
      resolucion: i.resolucion
        ? {
            estado: i.resolucion.estado,
            motivo: i.resolucion.motivo,
            revisadoEn: i.resolucion.revisado_en,
            plazoHasta: i.resolucion.plazo_hasta,
          }
        : null,
    })),
  };
}

const base = (recibido: boolean, pedido: number) =>
  `/pedidos/${recibido ? "recibidos" : "mios"}/${pedido}/pago/`;

/** Allowlist multipart: método, referencia recortada y un único archivo. Nunca monto. */
export function cuerpoIntento(entrada: IntentoPagoEntrada): FormData {
  const form = new FormData();
  form.append("metodo", entrada.metodo);
  form.append("referencia", entrada.referencia.trim());
  form.append("comprobante", entrada.comprobante);
  return form;
}

/**
 * Identidad del intento para `Idempotency-Key`: el mismo archivo y los mismos datos
 * conservan la clave en un reintento; otro archivo u otros datos son otra operación.
 */
export function huellaIntento(entrada: IntentoPagoEntrada) {
  const { name, size, type, lastModified } = entrada.comprobante;
  return {
    metodo: entrada.metodo,
    referencia: entrada.referencia.trim(),
    comprobante: { name, size, type, lastModified },
  };
}

export function cuerpoResolucion(entrada: ResolucionPagoEntrada) {
  return entrada.estado === "confirmado"
    ? { estado: "confirmado" }
    : { estado: entrada.estado, motivo: entrada.motivo.trim() };
}

export async function consultarPago(recibido: boolean, pedido: number, signal?: AbortSignal) {
  return aPago(
    await solicitar<PagoDTO>(base(recibido, pedido), {
      autenticada: true,
      mensajes: MENSAJES,
      signal,
    }),
  );
}

/** Registro inicial (pendiente) o nuevo intento tras «no recibido». */
export async function registrarIntento(pedido: number, entrada: IntentoPagoEntrada, clave: string) {
  return aPago(
    await solicitar<PagoDTO>(`${base(false, pedido)}intentos/`, {
      metodo: "POST",
      cuerpo: cuerpoIntento(entrada),
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

/** Corrección del intento observado: el intento previo viaja en la URL, no en el cuerpo. */
export async function corregirIntento(
  pedido: number,
  intento: number,
  entrada: IntentoPagoEntrada,
  clave: string,
) {
  return aPago(
    await solicitar<PagoDTO>(`${base(false, pedido)}intentos/${intento}/corregir/`, {
      metodo: "POST",
      cuerpo: cuerpoIntento(entrada),
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

export async function resolverIntento(
  pedido: number,
  intento: number,
  entrada: ResolucionPagoEntrada,
  clave: string,
) {
  return aPago(
    await solicitar<PagoDTO>(`${base(true, pedido)}intentos/${intento}/resolver/`, {
      metodo: "POST",
      cuerpo: cuerpoResolucion(entrada),
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

/** `url` es la del contrato (endpoint protegido relativo a la API), nunca una ruta pública. */
export function descargarComprobante(url: string, signal?: AbortSignal): Promise<Blob> {
  if (!/^\/pedidos\/(mios|recibidos)\/\d+\/pago\/intentos\/\d+\/comprobante\/$/.test(url))
    return Promise.reject(new Error("Ruta de comprobante inesperada."));
  return solicitarBinario(url, { autenticada: true, mensajes: MENSAJES_COMPROBANTE, signal });
}
