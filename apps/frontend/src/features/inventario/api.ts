/** Contratos implementados de AUD-07. El servidor conserva cantidades y bitácora. */
import { solicitar } from "@/lib/http";
import { paginaDe, type PaginaDTO } from "@/lib/paginacion";
import type { RenglonSolicitud } from "@/features/solicitudes/types";
export interface Inventario {
  id: number;
  producto: RenglonSolicitud["producto"];
  existenciaFisica: number;
  reservada: number;
  disponible: number;
  inicializadoEn: string;
  actualizadoEn: string;
}
interface InventarioDTO {
  id: number;
  producto: Inventario["producto"];
  existencia_fisica: number;
  reservada: number;
  disponible: number;
  inicializado_en: string;
  actualizado_en: string;
}
export interface Movimiento {
  id: number;
  tipo: string;
  cantidad: number;
  existenciaAntes: number;
  existenciaDespues: number;
  reservadaAntes: number;
  reservadaDespues: number;
  motivo: string;
  pedido: number | null;
  actor: { id: number; nombre: string } | null;
  creadoEn: string;
}
interface MovimientoDTO {
  id: number;
  tipo: string;
  cantidad: number;
  existencia_antes: number;
  existencia_despues: number;
  reservada_antes: number;
  reservada_despues: number;
  motivo: string;
  pedido: number | null;
  actor: Movimiento["actor"];
  creado_en: string;
}
const map = (d: InventarioDTO): Inventario => ({
  id: d.id,
  producto: d.producto,
  existenciaFisica: d.existencia_fisica,
  reservada: d.reservada,
  disponible: d.disponible,
  inicializadoEn: d.inicializado_en,
  actualizadoEn: d.actualizado_en,
});
const base = (id: number) => `/inventario/productos/${id}/`;
export async function listarInventario(page = 1, signal?: AbortSignal) {
  return paginaDe(
    await solicitar<PaginaDTO<InventarioDTO>>(`/inventario/?page=${page}&page_size=12`, {
      autenticada: true,
      signal,
    }),
    page,
    map,
  );
}
export async function consultarInventario(id: number, signal?: AbortSignal) {
  return map(await solicitar<InventarioDTO>(base(id), { autenticada: true, signal }));
}
export type EntradaInventario =
  | { accion: "inicial"; cantidad: number }
  | { accion: "entradas"; cantidad: number; motivo?: string }
  | { accion: "ajustes"; delta: number; motivo: string };
export function cuerpoInventario(input: EntradaInventario) {
  if (input.accion === "inicial") return { cantidad: input.cantidad };
  if (input.accion === "entradas")
    return { cantidad: input.cantidad, ...(input.motivo ? { motivo: input.motivo } : {}) };
  return { delta: input.delta, motivo: input.motivo };
}
export async function modificarInventario(id: number, input: EntradaInventario, clave: string) {
  return map(
    await solicitar<InventarioDTO>(`${base(id)}${input.accion}/`, {
      metodo: "POST",
      autenticada: true,
      cuerpo: cuerpoInventario(input),
      cabeceras: { "Idempotency-Key": clave },
    }),
  );
}
export async function listarMovimientos(id: number, page = 1, signal?: AbortSignal) {
  return paginaDe(
    await solicitar<PaginaDTO<MovimientoDTO>>(`${base(id)}movimientos/?page=${page}&page_size=12`, {
      autenticada: true,
      signal,
    }),
    page,
    (m): Movimiento => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      existenciaAntes: m.existencia_antes,
      existenciaDespues: m.existencia_despues,
      reservadaAntes: m.reservada_antes,
      reservadaDespues: m.reservada_despues,
      motivo: m.motivo,
      pedido: m.pedido,
      actor: m.actor,
      creadoEn: m.creado_en,
    }),
  );
}
