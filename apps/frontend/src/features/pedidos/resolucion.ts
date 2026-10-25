/**
 * Cliente real de la resolución del pedido (AUD-13, docs/api/resolucion-pedidos.md y
 * docs/api/reembolsos.md): cancelación del taller, cierre parcial, reembolso y clasificación
 * de unidades manipuladas. El servidor calcula cantidades e importes y decide qué procede:
 * este módulo traduce DTO `snake_case` ↔ contratos `camelCase` y nunca calcula montos.
 */
import type { QueryClient } from "@tanstack/react-query";
import { solicitar } from "@/lib/http";
import { claves } from "@/lib/query-keys";
import type { EstadoPedidoOperativo, LineaPedidoConfirmado } from "./confirmados";

const CABECERA_IDEMPOTENCIA = "Idempotency-Key";
const MENSAJES = {
  401: "Inicia sesión para consultar la resolución del pedido.",
  404: "No encontramos este pedido, cierre o reembolso.",
};
/** Límites técnicos (D-AUD13-21), iguales que en el backend. */
export const MAX_MOTIVO_CANCELACION = 1000;
export const MAX_MOTIVO_CIERRE = 1000;
export const MAX_MOTIVO_OBJECION = 1000;
export const MAX_REFERENCIA_DEVOLUCION = 120;
export const MAX_MOTIVO_CLASIFICACION = 500;

export type EstadoCierre = "pendiente" | "aceptado" | "objetado";
export type DecisionCierre = "aceptado" | "objetado";
export type TipoReembolso = "total" | "parcial";
export type EstadoReembolso = "pendiente" | "realizado";
export type OrigenResolucion = "cancelacion" | "cierre_parcial";
export type ResultadoClasificacion = "reutilizable" | "baja";

export const ESTADO_CIERRE_LABELS: Record<EstadoCierre, string> = {
  pendiente: "Esperando respuesta del comprador",
  aceptado: "Cierre aceptado",
  objetado: "Cierre objetado",
};
export const TIPO_REEMBOLSO_LABELS: Record<TipoReembolso, string> = {
  total: "Reembolso total",
  parcial: "Reembolso parcial",
};
export const ESTADO_REEMBOLSO_LABELS: Record<EstadoReembolso, string> = {
  pendiente: "Pendiente",
  realizado: "Realizado",
};
export const ORIGEN_LABELS: Record<OrigenResolucion, string> = {
  cancelacion: "Cancelación del taller",
  cierre_parcial: "Cierre parcial",
};
export const RESULTADO_CLASIFICACION_LABELS: Record<ResultadoClasificacion, string> = {
  reutilizable: "Reutilizable",
  baja: "Baja",
};

export interface LineaCierre {
  linea: number;
  posicion: number;
  cantidadAcordada: number;
  cantidadEntregada: number;
  cantidadNoEntregada: number;
  importeReembolso: string;
}
export interface CierreParcial {
  id: number;
  numero: number;
  estado: EstadoCierre;
  motivo: string;
  propuestoEn: string;
  lineas: LineaCierre[];
  montoReembolso: string;
  decision: { decision: DecisionCierre; motivo: string; registradoEn: string } | null;
}
export interface Reembolso {
  id: number;
  tipo: TipoReembolso;
  monto: string;
  moneda: string;
  estado: EstadoReembolso;
  origen: OrigenResolucion;
  cierre: number | null;
  creadoEn: string;
  devolucion: { fecha: string; monto: string; referencia: string; registradoEn: string } | null;
}
export interface Accion {
  disponible: boolean;
  codigo: string | null;
}
export interface Resolucion {
  pedido: number;
  estado: EstadoPedidoOperativo;
  cancelacion: { motivo: string; registradoEn: string } | null;
  cierresParciales: CierreParcial[];
  reembolso: Reembolso | null;
  acciones: { cancelar: Accion; proponerCierre: Accion };
  estimacionCierre: { lineas: LineaCierre[]; montoReembolso: string } | null;
}
export interface Clasificacion {
  id: number;
  cantidad: number;
  resultado: ResultadoClasificacion;
  motivo: string;
  registradoEn: string;
}
export interface ObligacionClasificacion {
  id: number;
  linea: number;
  posicion: number;
  producto: { id: number; nombre: string };
  origen: OrigenResolucion;
  cantidad: number;
  cantidadClasificada: number;
  cantidadPendiente: number;
  creadoEn: string;
  clasificaciones: Clasificacion[];
}
export interface ClasificacionesPedido {
  pedido: number;
  obligaciones: ObligacionClasificacion[];
}
export type RespuestaCierreEntrada =
  { decision: "aceptado" } | { decision: "objetado"; motivo: string };
export interface DevolucionEntrada {
  /** `YYYY-MM-DD`. */
  fecha: string;
  referencia: string;
}
export interface ClasificacionEntrada {
  obligacion: number;
  cantidad: number;
  resultado: ResultadoClasificacion;
  motivo: string;
}

interface LineaCierreDTO {
  linea: number;
  posicion: number;
  cantidad_acordada: number;
  cantidad_entregada: number;
  cantidad_no_entregada: number;
  importe_reembolso: string;
}
export interface ResolucionDTO {
  pedido: number;
  estado: EstadoPedidoOperativo;
  cancelacion: { motivo: string; registrado_en: string } | null;
  cierres_parciales: {
    id: number;
    numero: number;
    estado: EstadoCierre;
    motivo: string;
    propuesto_en: string;
    lineas: LineaCierreDTO[];
    monto_reembolso: string;
    decision: { decision: DecisionCierre; motivo: string; registrado_en: string } | null;
  }[];
  reembolso: {
    id: number;
    tipo: TipoReembolso;
    monto: string;
    moneda: string;
    estado: EstadoReembolso;
    origen: OrigenResolucion;
    cierre: number | null;
    creado_en: string;
    devolucion: { fecha: string; monto: string; referencia: string; registrado_en: string } | null;
  } | null;
  acciones: {
    cancelar: { disponible: boolean; codigo: string | null };
    proponer_cierre: { disponible: boolean; codigo: string | null };
  };
  estimacion_cierre: { lineas: LineaCierreDTO[]; monto_reembolso: string } | null;
}
export interface ClasificacionesDTO {
  pedido: number;
  obligaciones: {
    id: number;
    linea: number;
    posicion: number;
    producto: { id: number; nombre: string };
    origen: OrigenResolucion;
    cantidad: number;
    cantidad_clasificada: number;
    cantidad_pendiente: number;
    creado_en: string;
    clasificaciones: {
      id: number;
      cantidad: number;
      resultado: ResultadoClasificacion;
      motivo: string;
      registrado_en: string;
    }[];
  }[];
}

const aLineaCierre = (l: LineaCierreDTO): LineaCierre => ({
  linea: l.linea,
  posicion: l.posicion,
  cantidadAcordada: l.cantidad_acordada,
  cantidadEntregada: l.cantidad_entregada,
  cantidadNoEntregada: l.cantidad_no_entregada,
  importeReembolso: l.importe_reembolso,
});

export function aResolucion(dto: ResolucionDTO): Resolucion {
  const r = dto.reembolso;
  return {
    pedido: dto.pedido,
    estado: dto.estado,
    cancelacion: dto.cancelacion
      ? { motivo: dto.cancelacion.motivo, registradoEn: dto.cancelacion.registrado_en }
      : null,
    cierresParciales: dto.cierres_parciales.map((c) => ({
      id: c.id,
      numero: c.numero,
      estado: c.estado,
      motivo: c.motivo,
      propuestoEn: c.propuesto_en,
      lineas: c.lineas.map(aLineaCierre),
      montoReembolso: c.monto_reembolso,
      decision: c.decision
        ? {
            decision: c.decision.decision,
            motivo: c.decision.motivo,
            registradoEn: c.decision.registrado_en,
          }
        : null,
    })),
    reembolso: r
      ? {
          id: r.id,
          tipo: r.tipo,
          monto: r.monto,
          moneda: r.moneda,
          estado: r.estado,
          origen: r.origen,
          cierre: r.cierre,
          creadoEn: r.creado_en,
          devolucion: r.devolucion
            ? {
                fecha: r.devolucion.fecha,
                monto: r.devolucion.monto,
                referencia: r.devolucion.referencia,
                registradoEn: r.devolucion.registrado_en,
              }
            : null,
        }
      : null,
    acciones: {
      cancelar: { ...dto.acciones.cancelar },
      proponerCierre: { ...dto.acciones.proponer_cierre },
    },
    estimacionCierre: dto.estimacion_cierre
      ? {
          lineas: dto.estimacion_cierre.lineas.map(aLineaCierre),
          montoReembolso: dto.estimacion_cierre.monto_reembolso,
        }
      : null,
  };
}

export function aClasificaciones(dto: ClasificacionesDTO): ClasificacionesPedido {
  return {
    pedido: dto.pedido,
    obligaciones: dto.obligaciones.map((o) => ({
      id: o.id,
      linea: o.linea,
      posicion: o.posicion,
      producto: { id: o.producto.id, nombre: o.producto.nombre },
      origen: o.origen,
      cantidad: o.cantidad,
      cantidadClasificada: o.cantidad_clasificada,
      cantidadPendiente: o.cantidad_pendiente,
      creadoEn: o.creado_en,
      clasificaciones: o.clasificaciones.map((c) => ({
        id: c.id,
        cantidad: c.cantidad,
        resultado: c.resultado,
        motivo: c.motivo,
        registradoEn: c.registrado_en,
      })),
    })),
  };
}

const base = (recibido: boolean, pedido: number) =>
  `/pedidos/${recibido ? "recibidos" : "mios"}/${pedido}/`;

export const rutasResolucion = {
  lectura: (recibido: boolean, pedido: number) => `${base(recibido, pedido)}resolucion/`,
  cancelacion: (pedido: number) => `${base(true, pedido)}cancelacion/`,
  cierres: (pedido: number) => `${base(true, pedido)}cierres-parciales/`,
  respuesta: (pedido: number, cierre: number) =>
    `${base(false, pedido)}cierres-parciales/${cierre}/respuesta/`,
  devolucion: (pedido: number) => `${base(true, pedido)}reembolso/realizacion/`,
  clasificaciones: (pedido: number) => `${base(true, pedido)}clasificaciones/`,
};

/** Solo el motivo: cantidades e importes los deriva el servidor. */
export const cuerpoMotivo = (motivo: string) => ({ motivo: motivo.trim() });

export function cuerpoRespuesta(entrada: RespuestaCierreEntrada) {
  return entrada.decision === "aceptado"
    ? { decision: "aceptado" as const }
    : { decision: "objetado" as const, motivo: entrada.motivo.trim() };
}

/** Fecha y referencia; nunca monto, moneda ni estado (los decide el servidor). */
export const cuerpoDevolucion = (entrada: DevolucionEntrada) => ({
  fecha: entrada.fecha,
  referencia: entrada.referencia.trim(),
});

/** Ordenadas por obligación y resultado: el orden no cambia la operación. */
export function cuerpoClasificaciones(entradas: ClasificacionEntrada[]) {
  return {
    clasificaciones: entradas
      .map((c) => ({
        obligacion: c.obligacion,
        cantidad: c.cantidad,
        resultado: c.resultado,
        motivo: c.motivo.trim(),
      }))
      .sort((a, b) => a.obligacion - b.obligacion || a.resultado.localeCompare(b.resultado)),
  };
}

const mutar = async <T>(ruta: string, cuerpo: unknown, clave: string) =>
  solicitar<T>(ruta, {
    metodo: "POST",
    cuerpo,
    autenticada: true,
    mensajes: MENSAJES,
    cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
  });

export async function consultarResolucion(
  recibido: boolean,
  pedido: number,
  signal?: AbortSignal,
): Promise<Resolucion> {
  return aResolucion(
    await solicitar<ResolucionDTO>(rutasResolucion.lectura(recibido, pedido), {
      autenticada: true,
      mensajes: MENSAJES,
      signal,
    }),
  );
}

export async function cancelarPedido(pedido: number, motivo: string, clave: string) {
  return aResolucion(
    await mutar<ResolucionDTO>(rutasResolucion.cancelacion(pedido), cuerpoMotivo(motivo), clave),
  );
}

export async function proponerCierre(pedido: number, motivo: string, clave: string) {
  return aResolucion(
    await mutar<ResolucionDTO>(rutasResolucion.cierres(pedido), cuerpoMotivo(motivo), clave),
  );
}

export async function responderCierre(
  pedido: number,
  cierre: number,
  entrada: RespuestaCierreEntrada,
  clave: string,
) {
  return aResolucion(
    await mutar<ResolucionDTO>(
      rutasResolucion.respuesta(pedido, cierre),
      cuerpoRespuesta(entrada),
      clave,
    ),
  );
}

export async function registrarDevolucion(
  pedido: number,
  entrada: DevolucionEntrada,
  clave: string,
) {
  return aResolucion(
    await mutar<ResolucionDTO>(
      rutasResolucion.devolucion(pedido),
      cuerpoDevolucion(entrada),
      clave,
    ),
  );
}

export async function consultarClasificaciones(
  pedido: number,
  signal?: AbortSignal,
): Promise<ClasificacionesPedido> {
  return aClasificaciones(
    await solicitar<ClasificacionesDTO>(rutasResolucion.clasificaciones(pedido), {
      autenticada: true,
      mensajes: MENSAJES,
      signal,
    }),
  );
}

export async function clasificarInventario(
  pedido: number,
  entradas: ClasificacionEntrada[],
  clave: string,
) {
  return aClasificaciones(
    await mutar<ClasificacionesDTO>(
      rutasResolucion.clasificaciones(pedido),
      cuerpoClasificaciones(entradas),
      clave,
    ),
  );
}

/** Productos con unidades estándar reservadas: su inventario cambia al finalizar (RN-024). */
export function productosConReserva(lineas: LineaPedidoConfirmado[]): number[] {
  return [
    ...new Set(
      lineas
        .filter(
          (l) =>
            l.modalidad === "stock" ||
            (l.modalidad === "personalizacion" && l.origenPersonalizacion === "unidad_estandar"),
        )
        .map((l) => l.producto.id),
    ),
  ];
}

/**
 * Tras una respuesta: la verdad del servidor reemplaza la caché de la resolución y se
 * releen pedido, listado, cumplimiento y pago. Si el inventario cambió (liberaciones,
 * reincorporaciones o bajas), también inventario, movimientos y clasificaciones. Sin
 * actualizaciones optimistas de saldos ni montos.
 */
export function refrescarTrasResolucion(
  client: QueryClient,
  usuario: number | undefined,
  recibido: boolean,
  pedido: number,
  datos: Resolucion | null,
  productosAfectados: number[] = [],
) {
  const clave = claves.resolucion(usuario, recibido, pedido);
  if (datos) client.setQueryData(clave, datos);
  else void client.invalidateQueries({ queryKey: clave });
  for (const key of [
    claves.pedido(usuario, recibido, pedido),
    claves.pedidos(usuario),
    claves.cumplimiento(usuario, recibido, pedido),
    claves.pago(usuario, recibido, pedido),
  ])
    void client.invalidateQueries({ queryKey: key });
  if (productosAfectados.length) refrescarInventario(client, usuario, pedido, productosAfectados);
}

export function refrescarInventario(
  client: QueryClient,
  usuario: number | undefined,
  pedido: number,
  productos: number[],
) {
  void client.invalidateQueries({ queryKey: claves.inventario(usuario) });
  for (const producto of new Set(productos))
    void client.invalidateQueries({ queryKey: claves.movimientos(usuario, producto) });
  void client.invalidateQueries({ queryKey: claves.clasificacionesPedido(usuario, true, pedido) });
}
