/**
 * API de catálogo, categorías y productos que consume la interfaz.
 *
 * `VITE_CATALOGO_API=real` conecta el catálogo con Django (`http.ts`, AUD-04); por
 * defecto sigue el servidor simulado, porque pedidos, solicitudes y mensajes todavía
 * son simulados y resuelven sus productos con `getProduct`/`listProducts` del mock.
 * La gestión real del artesano necesita además la sesión real (AUD-18).
 */
import * as http from "./http";
import * as mock from "@/mocks/catalogo";
import { listArtisans } from "@/mocks/talleres";
import type { TallerResumen } from "./types";

export const catalogoReal = import.meta.env["VITE_CATALOGO_API"] === "real";

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

// ---------- Lecturas del servidor simulado para dominios todavía simulados ----------

/**
 * Pedidos, mensajes y el panel resuelven productos de pedidos de la demo, con su
 * inventario simulado. Se sustituyen cuando esos dominios tengan API (AUD-05 y siguientes).
 */
export { getProduct, listProducts } from "@/mocks/catalogo";
export { listUnitMovements } from "@/mocks/inventario";
export { ApiError, reintentarSalvoErrorDelCliente } from "./http";
export type {
  CatalogFilters,
  CatalogProduct,
  OwnProduct,
  Paginated,
  ProductInput,
  TallerResumen,
} from "./types";
