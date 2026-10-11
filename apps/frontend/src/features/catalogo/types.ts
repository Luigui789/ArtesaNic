import type { UnitType } from "@/types";

export interface CatalogFilters {
  q?: string | undefined;
  /** Código de categoría. `undefined` significa "sin filtro". */
  categoria?: string | undefined;
  precioMin?: number | undefined;
  precioMax?: number | undefined;
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

// ---------- Productos del artesano (RF-001 / RF-002) ----------

export interface ProductInput {
  nombre: string;
  precio: number;
  /** Código de categoría: en escritura el contrato recibe el código, no el objeto. */
  categoria: string;
  descripcion: string;
  imagen?: string | undefined;
  tipoUnidades: UnitType;
  existenciasFisicas: number;
  admitePersonalizacion: boolean;
  motivoAjuste?: string | undefined;
}
