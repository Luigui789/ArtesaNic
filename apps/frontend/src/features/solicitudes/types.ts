/**
 * Solicitudes V1 (AUD-05/06): lo que pide el comprador, la revisión individual del
 * artesano y su propuesta final. Ninguna es un pedido confirmado: la aceptación del
 * comprador, el snapshot contractual y las reservas pertenecen a AUD-07.
 */
import type { Category, Modalidad } from "@/types";
import type { CatalogProduct, TallerResumen } from "@/features/catalogo/types";

export const ESTADOS_SOLICITUD = [
  "pendiente_revision",
  "lista_propuesta",
  "propuesta_emitida",
  "rechazada",
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const RESOLUCIONES_RENGLON = ["pendiente", "aceptado", "rechazado"] as const;
export type ResolucionRenglon = (typeof RESOLUCIONES_RENGLON)[number];

export const ORIGENES_PERSONALIZACION = ["desde_cero", "unidad_estandar"] as const;
export type OrigenPersonalizacion = (typeof ORIGENES_PERSONALIZACION)[number];

/** RF-016: modalidades mínimas de entrega; «otra» exige descripción. */
export const MODALIDADES_ENTREGA = [
  "retiro_taller",
  "punto_encuentro",
  "entrega_artesano",
  "otra",
] as const;
export type ModalidadEntrega = (typeof MODALIDADES_ENTREGA)[number];

/** Códigos estables de los `409` de revisión y propuesta (más el de AUD-08). */
export type CodigoConflictoSolicitud =
  | "renglon_ya_resuelto"
  | "solicitud_con_renglones_pendientes"
  | "solicitud_rechazada"
  | "solicitud_sin_renglones_aceptados"
  | "propuesta_ya_emitida"
  | "clave_idempotencia_reutilizada";

export interface RenglonSolicitud {
  id: number;
  posicion: number;
  producto: { id: number; nombre: string; categoria: Category };
  modalidad: Modalidad;
  cantidad: number;
  fechaSolicitada: string | null;
  caracteristicas: string;
  origenPersonalizacion: OrigenPersonalizacion | "";
  resolucion: ResolucionRenglon;
  motivoRechazo: string;
  /** Momento de la resolución final; `null` mientras está pendiente. */
  resueltoEn: string | null;
}

/** El taller ve además qué cuenta registró la resolución. */
export interface RenglonSolicitudArtesano extends RenglonSolicitud {
  resueltoPor: { id: number; nombre: string } | null;
}

export interface Solicitud {
  id: number;
  taller: TallerResumen;
  estado: EstadoSolicitud;
  /** Vacía si el comprador no indicó preferencia. */
  modalidadEntregaPreferida: ModalidadEntrega | "";
  descripcionEntregaPreferida: string;
  creadoEn: string;
  actualizadoEn: string;
  renglones: RenglonSolicitud[];
}

/** Lectura privada del taller destinatario: no publica el teléfono del comprador. */
export interface SolicitudArtesano extends Solicitud {
  comprador: { id: number; nombre: string };
  renglones: RenglonSolicitudArtesano[];
}

interface RenglonEntradaBase {
  producto: number;
  cantidad: number;
}

/** Cada modalidad admite únicamente sus datos de solicitud, sin efectos de inventario. */
export type RenglonSolicitudEntrada =
  | (RenglonEntradaBase & { modalidad: "stock" })
  | (RenglonEntradaBase & { modalidad: "produccion"; fechaSolicitada: string })
  | (RenglonEntradaBase & {
      modalidad: "personalizacion";
      caracteristicas: string;
      origenPersonalizacion: OrigenPersonalizacion;
    });

/** El comprador y el taller los determina el servidor; no forman parte de la entrada. */
export interface SolicitudEntrada {
  renglones: RenglonSolicitudEntrada[];
  /** Opcional (RF-016); omitida si el comprador no indica preferencia. */
  modalidadEntregaPreferida?: ModalidadEntrega | undefined;
  descripcionEntregaPreferida?: string | undefined;
}

/** Estado editable del formulario. El producto completo no se envía en el payload. */
export interface RenglonBorrador {
  producto: CatalogProduct;
  modalidad: Modalidad;
  cantidad: number;
  fechaSolicitada: string;
  caracteristicas: string;
  origenPersonalizacion: OrigenPersonalizacion | "";
}

export interface EntregaPreferidaBorrador {
  modalidad: ModalidadEntrega | "";
  descripcion: string;
}

/** Resolución final de un renglón; sin cantidad ni producto: no hay contraofertas. */
export type ResolucionEntrada =
  { resolucion: "aceptado" } | { resolucion: "rechazado"; motivoRechazo: string };

/** Importes en C$ como cadenas decimales exactas, tal como los devuelve la API. */
export type Importe = string;

export interface LineaPropuesta {
  id: number;
  renglon: number;
  posicion: number;
  producto: RenglonSolicitud["producto"];
  modalidad: Modalidad;
  cantidad: number;
  /** Precio vigente del producto al emitir, tomado por el servidor. */
  precioUnitario: Importe;
  subtotal: Importe;
  cargoPersonalizacion: Importe;
  fechaSolicitada: string | null;
  fechaComprometida: string | null;
}

export interface CargoPropuesta {
  posicion: number;
  descripcion: string;
  monto: Importe;
  /** Renglón al que se atribuye; `null` si es un cargo global. */
  renglon: number | null;
}

/** Oferta del artesano antes de la decisión del comprador. No es pedido confirmado. */
export interface Propuesta {
  id: number;
  solicitud: number;
  emitidaEn: string;
  decision?: "pendiente" | "aceptada" | "rechazada";
  decididaEn?: string | null;
  pedidoId?: number | null;
  moneda: "NIO";
  modalidadEntrega: ModalidadEntrega;
  descripcionEntrega: string;
  lineas: LineaPropuesta[];
  otrosCargos: CargoPropuesta[];
  costoEntrega: Importe;
  subtotalProductos: Importe;
  totalPersonalizacion: Importe;
  totalOtrosCargos: Importe;
  total: Importe;
}

/** Condiciones del artesano. Precios, subtotales y total los calcula el servidor. */
export interface PropuestaEntrada {
  modalidadEntrega: ModalidadEntrega;
  descripcionEntrega?: string;
  costoEntrega: Importe;
  /** Exactamente los renglones aceptados, una vez cada uno. */
  lineas: { renglon: number; fechaComprometida?: string; cargoPersonalizacion?: Importe }[];
  otrosCargos?: { descripcion: string; monto: Importe; renglon?: number }[];
}
