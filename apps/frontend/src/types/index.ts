/**
 * Recurso propio del backend (`GET /categorias/`), no una lista fija del
 * frontend: un administrador puede añadir rubros sin desplegar la interfaz.
 *
 * Se anida completo en lectura y viaja solo por `codigo` en escritura, en los
 * filtros y en la URL. `nombre` es la etiqueta presentable; `codigo` es el
 * valor estable del dominio.
 */
export interface Category {
  id: number;
  codigo: string;
  nombre: string;
}

export type Role = "comprador" | "artesano";

export interface User {
  id: number;
  nombre: string;
  telefono: string;
  rol: Role;
  artesanoId?: number;
}

export interface Artisan {
  id: number;
  nombreTaller: string;
  responsable: string;
  historia: string;
  descripcion: string;
  rubro: Category;
  ubicacion: string;
  horario: string;
  telefono: string;
  whatsapp: string;
  redes: { facebook?: string; instagram?: string };
  fotoUrl: string;
  portadaUrl: string;
}

/**
 * Clasificación de las unidades de una publicación (definición de Luis del
 * 30-sep-2026, pendiente de homologación). Es independiente de la
 * personalización: una pieza única no es un producto bajo demanda.
 */
export const UNIT_TYPES = ["pieza_unica", "existencias"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * Modalidades de venta que admite un producto, solas o combinadas (RF-017, RN-004).
 * Códigos del contrato `GET /api/v1/productos/` (docs/api/catalogo.md).
 */
export const MODALIDADES = ["stock", "produccion", "personalizacion"] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export interface Product {
  id: number;
  nombre: string;
  precio: number; // en córdobas
  categoria: Category;
  descripcion: string;
  imagenes: string[];
  artesanoId: number;
  disponible: boolean;
  creadoEn: string;
  /** RF-017: modalidades de venta que admite; al menos una. */
  modalidades: Modalidad[];
  /** RF-019: solo los publicados aparecen en el catálogo. Despublicar no borra. */
  publicado: boolean;
  tipoUnidades: UnitType;
  /** RF-017: el comprador puede pedir que se personalice una unidad existente. */
  admitePersonalizacion: boolean;
  /** RF-022: unidades que existen en el taller. */
  existenciasFisicas: number;
  /** RF-022: comprometidas con pedidos aceptados que aún no se entregan. */
  unidadesReservadas: number;
  /** RF-022 (D22): reservas de pedidos cancelados por el comprador que el artesano aún no clasifica. */
  unidadesPorClasificar: number;
  /** Dato derivado que calcula el servicio: físicas − reservadas − por clasificar. */
  unidadesDisponibles: number;
}

export const UNIT_MOVEMENT_TYPES = [
  "alta",
  "ajuste",
  "reserva",
  "consumo",
  "pendiente_clasificacion",
  "liberacion",
  "baja",
] as const;
export type UnitMovementType = (typeof UNIT_MOVEMENT_TYPES)[number];

/** RNF-008: cada movimiento de unidades estándar, con actor, fecha y motivo. */
export interface UnitMovement {
  id: number;
  productoId: number;
  tipo: UnitMovementType;
  cantidad: number;
  existenciasAntes: number;
  existenciasDespues: number;
  motivo?: string | undefined;
  pedidoCodigo?: string | undefined;
  usuario: string;
  fecha: string;
}

/**
 * Códigos de dominio. Son estables y viajan por la API; el texto que ve la
 * persona usuaria vive en `src/lib/labels.ts`. No usar estos valores como
 * etiqueta visible ni redactar UI a partir de ellos.
 */
export const ORDER_STATES = [
  "pendiente",
  "aceptado",
  "en_produccion",
  "listo_para_entrega",
  "entregado",
  "rechazado",
  "cancelado",
] as const;
export type OrderStatus = (typeof ORDER_STATES)[number];

/**
 * RF-011 (especificación v2.1): `pendiente` significa que no hay intentos; los
 * demás valores son el estado del último intento de pago.
 */
export const PAYMENT_STATES = [
  "pendiente",
  "registrado",
  "observado",
  "confirmado",
  "no_recibido",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATES)[number];
export type PaymentAttemptStatus = Exclude<PaymentStatus, "pendiente">;

/**
 * Opción elegida en la solicitud. En esta fase las dos consumen unidades
 * existentes: la personalización modifica una unidad disponible. La fabricación
 * bajo demanda de RF-017 es una modalidad distinta, todavía no implementada.
 */
export const ORDER_OPTIONS = ["estandar", "personalizada"] as const;
export type OrderOption = (typeof ORDER_OPTIONS)[number];

export const DELIVERY_MODES = [
  "retiro_en_taller",
  "punto_de_encuentro",
  "entrega_directa",
  "otra",
] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** RF-011 v3.0: no existe el pago contra entrega. */
export const PAYMENT_METHODS = ["transferencia", "otro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * RNF-008. Los eventos de `pedido` y `pago` registran un cambio de estado; los
 * de `entrega` y `unidades` no cambian estado y se describen en `detalle`.
 */
export interface AuditEvent {
  id: number;
  tipo: "pedido" | "pago" | "entrega" | "unidades";
  estadoAnterior: string;
  estadoNuevo: string;
  detalle?: string | undefined;
  usuario: string;
  fecha: string; // ISO
}

/** Metadatos del comprobante. La imagen se pide aparte y solo la reciben las partes (RNF-004). */
export interface PaymentReceipt {
  id: number;
  nombreArchivo: string;
  tipo: string;
  tamano: number;
  subidoEn: string;
  subidoPor: string;
}

/** Historial de un intento: solo se añaden entradas, nunca se reescriben. */
export interface PaymentAttemptEvent {
  estadoAnterior: PaymentAttemptStatus | null;
  estadoNuevo: PaymentAttemptStatus;
  motivo?: string | undefined;
  comprobanteId?: number | undefined;
  /** Solo en una observación: vencimiento del plazo de 48 horas para corregir. */
  plazoHasta?: string | undefined;
  usuario: string;
  fecha: string;
}

export interface PaymentAttempt {
  id: number;
  numero: number;
  metodo: PaymentMethod;
  referencia?: string | undefined;
  nota?: string | undefined;
  estado: PaymentAttemptStatus;
  registradoEn: string;
  /** El último es el vigente; los anteriores se conservan como historial. */
  comprobantes: PaymentReceipt[];
  eventos: PaymentAttemptEvent[];
}

/** RF-022: reserva de las unidades del pedido. */
export interface UnitReservation {
  cantidad: number;
  estado: "activa" | "pendiente_clasificacion" | "consumida" | "clasificada";
  disponiblesDevueltas?: number | undefined;
  bajas?: number | undefined;
  motivoClasificacion?: string | undefined;
}

/** RF-006: desglose y total congelados al aceptar. */
export interface FrozenQuote {
  precioUnitario: number;
  cantidad: number;
  costosAdicionales: number;
  costoEntrega: number;
  modalidad: DeliveryMode;
  total: number;
  congeladaEn: string;
}

export interface Message {
  id: number;
  pedidoId: number;
  autor: Role;
  autorNombre: string;
  texto: string;
  fecha: string;
}

/** LEGACY/DEMO: no representa Solicitud V1, Propuesta ni Pedido confirmado del backend. */
export interface Order {
  id: number;
  /** Código de negocio visible ("PM-1009"), no un identificador. */
  codigo: string;
  productoId: number;
  artesanoId: number;
  compradorId: number;
  compradorNombre: string;
  cantidad: number;
  opcion: OrderOption;
  /** Vacío cuando la opción es estándar. */
  personalizacion: string;
  observaciones: string;
  estado: OrderStatus;
  estadoPago: PaymentStatus;
  precioUnitario: number;
  costosAdicionales: number;
  costoEntrega: number;
  /** RF-016: modalidad que propone el comprador al preparar la solicitud. */
  entregaPreferida: {
    modalidad: DeliveryMode;
    /** Ubicación indicada por el comprador para encuentro o entrega directa. */
    ubicacion?: string | undefined;
    detalle?: string | undefined;
  };
  /**
   * Modalidad elegida por el comprador; el artesano solo cotiza costo y notas.
   * Al aceptar se congela. La fecha de recogida se guarda como YYYY-MM-DD.
   */
  entrega?:
    | {
        modalidad: DeliveryMode;
        notasCotizacion?: string | undefined;
        fechaRecogida?: string | undefined;
        detalle?: string | undefined;
      }
    | undefined;
  cotizacionCongelada?: FrozenQuote | undefined;
  reserva?: UnitReservation | undefined;
  pagos: PaymentAttempt[];
  motivoCancelacion?: string | undefined;
  motivoRechazo?: string | undefined;
  creadoEn: string;
  historial: AuditEvent[];
}
