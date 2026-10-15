import type { Category, Modalidad, UnitType } from "@/types";

export interface CatalogFilters {
  q?: string | undefined;
  /** Código de categoría. `undefined` significa "sin filtro". */
  categoria?: string | undefined;
  precioMin?: number | undefined;
  precioMax?: number | undefined;
  /** Identificador del taller (`taller` en la API). */
  artesanoId?: number | undefined;
  orden?: "recientes" | "precio-asc" | "precio-desc" | "nombre" | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Referencia al perfil público del taller que elabora el producto (RF-003.6). */
export interface TallerResumen {
  id: number;
  nombre: string;
}

/**
 * Producto del catálogo público (RF-003): publicado y de un taller aprobado.
 * Sin existencias ni reservas, que pertenecen al inventario (RF-022).
 */
export interface CatalogProduct {
  id: number;
  nombre: string;
  descripcion: string;
  /** Córdobas. La API lo envía como texto decimal; la capa HTTP lo convierte. */
  precio: number;
  categoria: Category;
  modalidades: Modalidad[];
  taller: TallerResumen;
  creadoEn: string;
  /**
   * Fotografía principal. La API real todavía no la ofrece: su política de
   * archivos está pendiente de DR-01. Solo el servidor simulado la rellena.
   */
  imagen?: string | undefined;
}

/** Producto del taller propio: añade su estado de publicación (RF-019). */
export interface OwnProduct extends CatalogProduct {
  publicado: boolean;
  actualizadoEn: string;
}

// ---------- Productos del artesano (RF-001, RF-017) ----------

/**
 * Datos que el artesano escribe. Ninguna modalidad exige existencias: el producto
 * declara qué modalidades admite, y las existencias pertenecen al inventario.
 */
export interface ProductInput {
  nombre: string;
  precio: number;
  /** Código de categoría: en escritura el contrato recibe el código, no el objeto. */
  categoria: string;
  descripcion: string;
  /** Al menos una; se combinan libremente. */
  modalidades: Modalidad[];
  /** Solo servidor simulado (DR-01 abierto): la API real no recibe imágenes todavía. */
  imagen?: string | undefined;
  /** Solo servidor simulado: inventario de la demo, hasta que exista el dominio real. */
  inventarioDemo?: InventarioDemoInput | undefined;
}

/**
 * Unidades del inventario simulado (RF-022, fuera de AUD-04). Solo se piden
 * cuando el producto admite venta desde stock.
 */
export interface InventarioDemoInput {
  tipoUnidades: UnitType;
  existenciasFisicas: number;
  motivoAjuste?: string | undefined;
}
