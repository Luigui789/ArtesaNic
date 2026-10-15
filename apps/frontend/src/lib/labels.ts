/**
 * Capa de presentación de los códigos de dominio.
 *
 * Los códigos (`en_produccion`) son estables y viajan por la API; las etiquetas
 * ("En producción") son texto de interfaz y pueden reescribirse sin migrar datos
 * ni romper el contrato. Ningún componente debe mostrar un código directamente.
 */
import type {
  AuditEvent,
  Category,
  DeliveryMode,
  Modalidad,
  OrderOption,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  UnitMovementType,
  UnitType,
} from "@/types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  en_produccion: "En producción",
  listo_para_entrega: "Listo para entrega",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pendiente: "Pendiente de pago",
  registrado: "Pago registrado",
  observado: "Pago observado",
  confirmado: "Pago confirmado",
  no_recibido: "Pago no recibido",
};

/**
 * El código `retiro_en_taller` pertenece al contrato y no cambia aquí; la
 * etiqueta usa «recoger el pedido en el taller» (D27).
 */
export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  retiro_en_taller: "Recoger en el taller",
  punto_de_encuentro: "Punto de encuentro",
  entrega_directa: "Entrega por el artesano",
  otra: "Otra modalidad",
};

export const MODALIDAD_LABELS: Record<Modalidad, string> = {
  stock: "Venta desde stock",
  produccion: "Producción por cantidad",
  personalizacion: "Personalización",
};

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  pieza_unica: "Pieza única",
  existencias: "Con existencias",
};

export const ORDER_OPTION_LABELS: Record<OrderOption, string> = {
  estandar: "Sin modificaciones",
  personalizada: "Con personalización",
};

export const UNIT_MOVEMENT_LABELS: Record<UnitMovementType, string> = {
  alta: "Alta",
  ajuste: "Ajuste",
  reserva: "Reserva",
  consumo: "Entrega",
  pendiente_clasificacion: "Pendiente de clasificación",
  liberacion: "Vuelve a estar disponible",
  baja: "Baja",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: "Transferencia",
  otro: "Otro método",
};

export const ROLE_LABELS: Record<Role, string> = {
  comprador: "Comprador",
  artesano: "Artesano",
};

/**
 * RNF-008: los eventos de auditoría guardan el código del estado en un campo de
 * texto libre, y el diccionario aplicable depende de si el evento es de pedido o
 * de pago. Un valor sin traducción conocida (como el "—" del evento inicial) se
 * devuelve tal cual.
 */
export function auditStateLabel(tipo: AuditEvent["tipo"], codigo: string): string {
  const dict: Record<string, string> =
    tipo === "pedido" ? ORDER_STATUS_LABELS : tipo === "pago" ? PAYMENT_STATUS_LABELS : {};
  return dict[codigo] ?? codigo;
}

export const AUDIT_TYPE_LABELS: Record<AuditEvent["tipo"], string> = {
  pedido: "Pedido",
  pago: "Pago",
  entrega: "Entrega",
  unidades: "Unidades",
};

/**
 * Traduce un código de categoría a su etiqueta.
 *
 * Solo para consumidores que tienen el **código aislado** —el valor de la URL o
 * el de un control de formulario—. Donde ya se dispone de un `Category`
 * completo se usa `categoria.nombre` directamente: esta función no existe para
 * ocultar que el objeto ya trae su etiqueta.
 *
 * Devuelve el propio código cuando no se encuentra, porque el catálogo acepta
 * códigos desconocidos en la URL sin validarlos contra la lista.
 */
export function categoryLabel(codigo: string, categorias: Category[]): string {
  return categorias.find((c) => c.codigo === codigo)?.nombre ?? codigo;
}
