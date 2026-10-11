/**
 * API de catálogo, categorías y productos que consume la interfaz.
 * Hoy delega en el servidor simulado; al integrar Django se reemplaza cada
 * función por su llamada HTTP con la misma firma (ver `src/features/README.md`).
 */
export {
  countByCategory,
  createProduct,
  featuredProducts,
  getProduct,
  listCategories,
  listMyProducts,
  listProducts,
  processImage,
  updateProduct,
} from "@/mocks/catalogo";
export { listUnitMovements } from "@/mocks/inventario";
export type { CatalogFilters, Paginated, ProductInput } from "./types";
