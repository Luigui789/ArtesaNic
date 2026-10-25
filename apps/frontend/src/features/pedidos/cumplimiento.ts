/**
 * Cliente real de cumplimiento por renglón, entregas y recepción (AUD-12,
 * docs/api/cumplimiento.md). El servidor decide estados, cantidades, inventario y permisos:
 * este módulo traduce DTO `snake_case` ↔ contratos `camelCase` y nunca calcula saldos.
 */
import type { QueryClient } from "@tanstack/react-query";
import { solicitar } from "@/lib/http";
import { crearIntentoSeguro } from "@/lib/intento-seguro";
import { claves } from "@/lib/query-keys";
import type { RenglonSolicitud } from "@/features/solicitudes/types";
import type { EstadoPedidoOperativo, LineaPedidoConfirmado } from "./confirmados";

const CABECERA_IDEMPOTENCIA = "Idempotency-Key";
const MENSAJES = {
  401: "Inicia sesión para consultar el seguimiento del pedido.",
  404: "No encontramos este pedido, producto o entrega.",
};
/** Límite técnico del motivo de discrepancia (D-AUD12-11), igual que en el backend. */
export const MAX_MOTIVO_DISCREPANCIA = 1000;

export type EstadoLineaCumplimiento = "pendiente" | "en_cumplimiento" | "entregado";
export type ResultadoRecepcion = "confirmada" | "discrepancia";

export const ESTADO_LINEA_LABELS: Record<EstadoLineaCumplimiento, string> = {
  pendiente: "Sin iniciar",
  en_cumplimiento: "En cumplimiento",
  entregado: "Entregado",
};
export const RESULTADO_RECEPCION_LABELS: Record<ResultadoRecepcion, string> = {
  confirmada: "Recepción confirmada",
  discrepancia: "Discrepancia registrada",
};
/** Texto del botón de inicio según la modalidad del renglón (RN-015). */
export const ACCION_INICIO: Record<RenglonSolicitud["modalidad"], string> = {
  stock: "Iniciar preparación",
  produccion: "Iniciar producción",
  personalizacion: "Iniciar personalización",
};

export interface LineaCumplimiento {
  linea: number;
  posicion: number;
  modalidad: RenglonSolicitud["modalidad"];
  cantidad: number;
  estado: EstadoLineaCumplimiento;
  iniciadoEn: string | null;
  cantidadEntregada: number;
  cantidadPendiente: number;
}
export interface Recepcion {
  resultado: ResultadoRecepcion;
  motivo: string;
  registradoEn: string;
}
export interface Entrega {
  id: number;
  numero: number;
  fecha: string;
  registradoEn: string;
  lineas: { linea: number; cantidad: number }[];
  recepcion: Recepcion | null;
}
export interface Cumplimiento {
  pedido: number;
  estado: EstadoPedidoOperativo;
  lineas: LineaCumplimiento[];
  entregas: Entrega[];
}
export interface EntregaEntrada {
  /** `YYYY-MM-DD`. */
  fecha: string;
  lineas: { linea: number; cantidad: number }[];
}
export type RecepcionEntrada =
  { resultado: "confirmada" } | { resultado: "discrepancia"; motivo: string };

export interface CumplimientoDTO {
  pedido: number;
  estado: EstadoPedidoOperativo;
  lineas: {
    linea: number;
    posicion: number;
    modalidad: RenglonSolicitud["modalidad"];
    cantidad: number;
    estado: EstadoLineaCumplimiento;
    iniciado_en: string | null;
    cantidad_entregada: number;
    cantidad_pendiente: number;
  }[];
  entregas: {
    id: number;
    numero: number;
    fecha: string;
    registrado_en: string;
    lineas: { linea: number; cantidad: number }[];
    recepcion: { resultado: ResultadoRecepcion; motivo: string; registrado_en: string } | null;
  }[];
}

export function aCumplimiento(dto: CumplimientoDTO): Cumplimiento {
  return {
    pedido: dto.pedido,
    estado: dto.estado,
    lineas: dto.lineas.map((l) => ({
      linea: l.linea,
      posicion: l.posicion,
      modalidad: l.modalidad,
      cantidad: l.cantidad,
      estado: l.estado,
      iniciadoEn: l.iniciado_en,
      cantidadEntregada: l.cantidad_entregada,
      cantidadPendiente: l.cantidad_pendiente,
    })),
    entregas: dto.entregas.map((e) => ({
      id: e.id,
      numero: e.numero,
      fecha: e.fecha,
      registradoEn: e.registrado_en,
      lineas: e.lineas.map((l) => ({ linea: l.linea, cantidad: l.cantidad })),
      recepcion: e.recepcion
        ? {
            resultado: e.recepcion.resultado,
            motivo: e.recepcion.motivo,
            registradoEn: e.recepcion.registrado_en,
          }
        : null,
    })),
  };
}

const base = (recibido: boolean, pedido: number) =>
  `/pedidos/${recibido ? "recibidos" : "mios"}/${pedido}/`;

export const rutasCumplimiento = {
  lectura: (recibido: boolean, pedido: number) => `${base(recibido, pedido)}cumplimiento/`,
  iniciar: (pedido: number, linea: number) => `${base(true, pedido)}lineas/${linea}/iniciar/`,
  entregas: (pedido: number) => `${base(true, pedido)}entregas/`,
  recepcion: (pedido: number, entrega: number) =>
    `${base(false, pedido)}entregas/${entrega}/recepcion/`,
};

/** Solo líneas con cantidad > 0, ordenadas por línea: el orden no cambia la operación. */
export function cuerpoEntrega(entrada: EntregaEntrada): EntregaEntrada {
  return {
    fecha: entrada.fecha,
    lineas: entrada.lineas
      .filter((l) => Number.isInteger(l.cantidad) && l.cantidad > 0)
      .map((l) => ({ linea: l.linea, cantidad: l.cantidad }))
      .sort((a, b) => a.linea - b.linea),
  };
}

export function cuerpoRecepcion(entrada: RecepcionEntrada) {
  return entrada.resultado === "confirmada"
    ? { resultado: "confirmada" as const }
    : { resultado: "discrepancia" as const, motivo: entrada.motivo.trim() };
}

export async function consultarCumplimiento(
  recibido: boolean,
  pedido: number,
  signal?: AbortSignal,
): Promise<Cumplimiento> {
  return aCumplimiento(
    await solicitar<CumplimientoDTO>(rutasCumplimiento.lectura(recibido, pedido), {
      autenticada: true,
      mensajes: MENSAJES,
      signal,
    }),
  );
}

export async function iniciarLinea(pedido: number, linea: number, clave: string) {
  return aCumplimiento(
    await solicitar<CumplimientoDTO>(rutasCumplimiento.iniciar(pedido, linea), {
      metodo: "POST",
      cuerpo: {},
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

export async function registrarEntrega(pedido: number, entrada: EntregaEntrada, clave: string) {
  return aCumplimiento(
    await solicitar<CumplimientoDTO>(rutasCumplimiento.entregas(pedido), {
      metodo: "POST",
      cuerpo: cuerpoEntrega(entrada),
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

export async function registrarRecepcion(
  pedido: number,
  entrega: number,
  entrada: RecepcionEntrada,
  clave: string,
) {
  return aCumplimiento(
    await solicitar<CumplimientoDTO>(rutasCumplimiento.recepcion(pedido, entrega), {
      metodo: "POST",
      cuerpo: cuerpoRecepcion(entrada),
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

/**
 * Un intento por acción (AUD-08): misma clave mientras la huella no cambie —un reintento
 * tras timeout, red caída o 5xx no duplica la operación— y clave nueva para la siguiente.
 */
export function crearIntentoDeCumplimiento() {
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
    /** Un resultado incierto solo admite reintentar con los mismos datos. */
    get incierto() {
      return intento.incierto;
    },
  };
}

/** Fecha actual en America/Managua (`YYYY-MM-DD`): valor por defecto y máximo del formulario.
 * Es solo comodidad de la interfaz; el servidor valida la fecha con su propio reloj. */
export function hoyEnManagua(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Managua",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Productos cuyo inventario estándar cambia con la acción (RN-022, RN-023). */
export function productosConsumidos(
  accion: "iniciar" | "entregar",
  lineas: (LineaPedidoConfirmado | undefined)[],
): number[] {
  return lineas
    .filter((s): s is LineaPedidoConfirmado => !!s)
    .filter((s) =>
      accion === "iniciar"
        ? s.modalidad === "personalizacion" && s.origenPersonalizacion === "unidad_estandar"
        : s.modalidad === "stock",
    )
    .map((s) => s.producto.id);
}

/** Tras una respuesta: la verdad del servidor reemplaza la caché y refresca lo derivado. */
export function refrescarTrasCumplimiento(
  client: QueryClient,
  usuario: number | undefined,
  recibido: boolean,
  pedido: number,
  datos: Cumplimiento | null,
  productosConsumidos: number[] = [],
) {
  const clave = claves.cumplimiento(usuario, recibido, pedido);
  if (datos) client.setQueryData(clave, datos);
  else void client.invalidateQueries({ queryKey: clave });
  void client.invalidateQueries({ queryKey: claves.pedido(usuario, recibido, pedido) });
  void client.invalidateQueries({ queryKey: claves.pedidos(usuario) });
  if (productosConsumidos.length) {
    void client.invalidateQueries({ queryKey: claves.inventario(usuario) });
    for (const producto of new Set(productosConsumidos))
      void client.invalidateQueries({ queryKey: claves.movimientos(usuario, producto) });
  }
}
