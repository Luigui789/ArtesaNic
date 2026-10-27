/**
 * API de catálogo, categorías y productos que consume la interfaz.
 *
 * Por defecto (`VITE_CATALOGO_API=real`) conecta el catálogo y los productos propios
 * con Django (`http.ts`, AUD-04 y AUD-18). El modo `VITE_CATALOGO_API=mock` queda
 * aislado únicamente para las pruebas de regresión de la demo.
 */
import * as http from "./http";
import { catalogoReal } from "@/features/auth/modo";
import * as mock from "@/mocks/catalogo";
import { listArtisans } from "@/mocks/talleres";
import type { TallerResumen } from "./types";

export { catalogoReal };

// ---------- Catálogo con la forma del contrato V1 ----------

export const listCategories = catalogoReal ? http.listCategories : mock.listCategories;
export const listCatalog = catalogoReal ? http.listCatalog : mock.listCatalog;
export const getCatalogProduct = catalogoReal ? http.getCatalogProduct : mock.getCatalogProduct;

/** Talleres para el filtro del catálogo: los aprobados de la API o los de la demo. */
export const listTalleresCatalogo: () => Promise<TallerResumen[]> = catalogoReal
  ? http.listTalleres
  : async () => (await listArtisans()).map((a) => ({ id: a.id, nombre: a.nombreTaller }));

// ---------- Productos propios del artesano (el taller sale de la sesión) ----------

export const listOwnProducts = catalogoReal ? http.listOwnProducts : mock.listOwnProducts;
export const createOwnProduct = catalogoReal ? http.createOwnProduct : mock.createOwnProduct;
export const updateOwnProduct = catalogoReal ? http.updateOwnProduct : mock.updateOwnProduct;
export const publishOwnProduct = catalogoReal ? http.publishOwnProduct : mock.publishOwnProduct;
export const unpublishOwnProduct = catalogoReal
  ? http.unpublishOwnProduct
  : mock.unpublishOwnProduct;

/** Fotografía de la demo: el modo real envía File mediante el cliente HTTP. */
export const processImage = mock.processImage;

// ---------- Lecturas del servidor simulado aisladas para modo demo ----------

/**
 * Lecturas auxiliares de productos y movimientos que consumen únicamente las
 * vistas de demostración cuando se ejecuta con `VITE_CATALOGO_API=mock`.
 */
export { getProduct, listProducts } from "@/mocks/catalogo";
export { listUnitMovements } from "@/mocks/inventario";
export { ApiError, reintentarSalvoErrorDelCliente } from "./http";
export type {
  CatalogFilters,
  CatalogProduct,
  ModeracionProducto,
  OwnProduct,
  Paginated,
  ProductInput,
  TallerResumen,
} from "./types";
