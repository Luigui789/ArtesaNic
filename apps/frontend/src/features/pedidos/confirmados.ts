/** Lectura AUD-07: solo snapshot del servidor; nunca reconstruye desde catálogo. */
import { solicitar } from "@/lib/http";
import { paginaDe, type PaginaDTO } from "@/lib/paginacion";
import type { Propuesta, RenglonSolicitud } from "@/features/solicitudes/types";
/** Estado operativo global del pedido (AUD-11/12/13); independiente del estado del pago. El
 * avance y la modalidad se conservan por renglón (ver `cumplimiento.ts`). */
export type EstadoPedidoOperativo =
  | "confirmado"
  | "en_cumplimiento"
  | "entregado"
  | "vencido_falta_pago"
  | "cancelado_artesano"
  | "cerrado_parcial";
export const ESTADO_PEDIDO_LABELS: Record<EstadoPedidoOperativo, string> = {
  confirmado: "Pedido confirmado",
  en_cumplimiento: "En cumplimiento",
  entregado: "Entregado",
  vencido_falta_pago: "Vencido por falta de pago",
  cancelado_artesano: "Cancelado por el taller",
  cerrado_parcial: "Cerrado parcialmente",
};
/** Sin nuevas acciones de cumplimiento ni de pago; el historial sigue visible (D-AUD13-01). */
export const ESTADOS_TERMINALES: ReadonlySet<EstadoPedidoOperativo> = new Set([
  "entregado",
  "vencido_falta_pago",
  "cancelado_artesano",
  "cerrado_parcial",
]);
export interface LineaPedidoConfirmado {
  id: number;
  posicion: number;
  renglon: number;
  lineaPropuesta: number;
  producto: RenglonSolicitud["producto"];
  modalidad: RenglonSolicitud["modalidad"];
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  cargoPersonalizacion: string;
  fechaSolicitada: string | null;
  fechaComprometida: string | null;
  caracteristicas: string;
  origenPersonalizacion: string;
}
export interface PedidoConfirmado {
  id: number;
  solicitud: number;
  propuesta: number;
  taller: { id: number; nombre: string };
  comprador?: { id: number; nombre: string };
  estado: EstadoPedidoOperativo;
  vencidoEn: string | null;
  confirmadoEn: string;
  moneda: "NIO";
  modalidadEntrega: Propuesta["modalidadEntrega"];
  descripcionEntrega: string;
  lineas: LineaPedidoConfirmado[];
  otrosCargos: { posicion: number; descripcion: string; monto: string; renglon: number | null }[];
  costoEntrega: string;
  subtotalProductos: string;
  totalPersonalizacion: string;
  totalOtrosCargos: string;
  total: string;
}
export interface PedidoDTO {
  id: number;
  solicitud: number;
  propuesta: number;
  taller: PedidoConfirmado["taller"];
  comprador?: { id: number; nombre: string };
  estado: EstadoPedidoOperativo;
  vencido_en: string | null;
  confirmado_en: string;
  moneda: "NIO";
  modalidad_entrega: PedidoConfirmado["modalidadEntrega"];
  descripcion_entrega: string;
  lineas: {
    id: number;
    posicion: number;
    renglon: number;
    linea_propuesta: number;
    producto: RenglonSolicitud["producto"];
    modalidad: RenglonSolicitud["modalidad"];
    cantidad: number;
    precio_unitario: string;
    subtotal: string;
    cargo_personalizacion: string;
    fecha_solicitada: string | null;
    fecha_comprometida: string | null;
    caracteristicas: string;
    origen_personalizacion: string;
  }[];
  otros_cargos: PedidoConfirmado["otrosCargos"];
  costo_entrega: string;
  subtotal_productos: string;
  total_personalizacion: string;
  total_otros_cargos: string;
  total: string;
}
export function aPedido(dto: PedidoDTO): PedidoConfirmado {
  return {
    id: dto.id,
    solicitud: dto.solicitud,
    propuesta: dto.propuesta,
    taller: dto.taller,
    ...(dto.comprador ? { comprador: dto.comprador } : {}),
    estado: dto.estado,
    vencidoEn: dto.vencido_en,
    confirmadoEn: dto.confirmado_en,
    moneda: dto.moneda,
    modalidadEntrega: dto.modalidad_entrega,
    descripcionEntrega: dto.descripcion_entrega,
    lineas: dto.lineas.map((l) => ({
      id: l.id,
      posicion: l.posicion,
      renglon: l.renglon,
      lineaPropuesta: l.linea_propuesta,
      producto: l.producto,
      modalidad: l.modalidad,
      cantidad: l.cantidad,
      precioUnitario: l.precio_unitario,
      subtotal: l.subtotal,
      cargoPersonalizacion: l.cargo_personalizacion,
      fechaSolicitada: l.fecha_solicitada,
      fechaComprometida: l.fecha_comprometida,
      caracteristicas: l.caracteristicas,
      origenPersonalizacion: l.origen_personalizacion,
    })),
    otrosCargos: dto.otros_cargos,
    costoEntrega: dto.costo_entrega,
    subtotalProductos: dto.subtotal_productos,
    totalPersonalizacion: dto.total_personalizacion,
    totalOtrosCargos: dto.total_otros_cargos,
    total: dto.total,
  };
}
const base = (recibidos: boolean) => `/pedidos/${recibidos ? "recibidos" : "mios"}/`;
export async function listarPedidosConfirmados(recibidos: boolean, page = 1, signal?: AbortSignal) {
  const dto = await solicitar<PaginaDTO<PedidoDTO>>(
    `${base(recibidos)}?page=${page}&page_size=12`,
    { autenticada: true, signal },
  );
  return paginaDe(dto, page, aPedido);
}
export async function consultarPedidoConfirmado(
  recibido: boolean,
  id: number,
  signal?: AbortSignal,
) {
  return aPedido(
    await solicitar<PedidoDTO>(`${base(recibido)}${id}/`, {
      autenticada: true,
      signal,
      mensajes: { 404: "No encontramos este pedido." },
    }),
  );
}
