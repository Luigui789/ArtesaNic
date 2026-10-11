/**
 * Servidor simulado: unidades y movimientos de inventario (RF-022, RF-023).
 * Lo comparten productos y pedidos: el alta y el ajuste de un producto, y la
 * reserva, el consumo y la clasificación de un pedido, registran movimientos.
 */
import { availableUnits, maxRequestable } from "@/lib/units";
import type { Product, UnitMovement } from "@/types";
import { api, nextId, nowIso, store } from "./core";

export function movement(
  p: Product,
  tipo: UnitMovement["tipo"],
  cantidad: number,
  antes: number,
  usuario: string,
  motivo?: string,
  pedidoCodigo?: string,
) {
  p.unidadesDisponibles = availableUnits(p);
  store.movements.push({
    id: nextId(store.movements),
    productoId: p.id,
    tipo,
    cantidad,
    existenciasAntes: antes,
    existenciasDespues: p.existenciasFisicas,
    usuario,
    fecha: nowIso(),
    motivo,
    pedidoCodigo,
  });
}

export function listUnitMovements(productoId: number): Promise<UnitMovement[]> {
  return api(() => store.movements.filter((m) => m.productoId === productoId));
}

export function validateQuantity(p: Product, cantidad: number) {
  const max = maxRequestable({ ...p, unidadesDisponibles: availableUnits(p) });
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > max)
    throw new Error(
      `Cantidad no disponible. Puedes solicitar hasta ${max} unidades; las reservas ya están descontadas.`,
    );
}
