/**
 * Solicitudes V1 (AUD-05): expresan lo que pide el comprador, sin cotización,
 * propuesta comercial ni pedido confirmado. Esas etapas pertenecen a AUD-06/07.
 */
import type { Category, Modalidad } from "@/types";
import type { CatalogProduct, TallerResumen } from "@/features/catalogo/types";

export const ESTADOS_SOLICITUD = ["pendiente_revision", "rechazada"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const RESOLUCIONES_RENGLON = ["pendiente", "aceptado", "rechazado"] as const;
export type ResolucionRenglon = (typeof RESOLUCIONES_RENGLON)[number];

export const ORIGENES_PERSONALIZACION = ["desde_cero", "unidad_estandar"] as const;
export type OrigenPersonalizacion = (typeof ORIGENES_PERSONALIZACION)[number];

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
}

export interface Solicitud {
  id: number;
  taller: TallerResumen;
  estado: EstadoSolicitud;
  creadoEn: string;
  actualizadoEn: string;
  renglones: RenglonSolicitud[];
}

/** Lectura privada del taller destinatario: no publica el teléfono del comprador. */
export interface SolicitudArtesano extends Solicitud {
  comprador: { id: number; nombre: string };
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
