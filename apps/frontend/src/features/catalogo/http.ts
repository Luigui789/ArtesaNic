/**
 * Cliente HTTP del catálogo contra Django (AUD-04). Contrato: docs/api/catalogo.md.
 *
 * Única capa que conoce los nombres de la API: traduce `snake_case` ↔ `camelCase`,
 * reconstruye la paginación de DRF y convierte los errores HTTP en `ApiError`.
 * No contiene reglas de negocio: permisos, modalidades y publicación los decide el servidor.
 */
import type { Category, Modalidad } from "@/types";
import type {
  CatalogFilters,
  CatalogProduct,
  OwnProduct,
  Paginated,
  ProductInput,
  TallerResumen,
} from "./types";
import { solicitar as solicitarComun, type Opciones as OpcionesComunes } from "@/lib/http";

/** Contrato §1.8: el cliente envía siempre `page_size` para reconstruir `totalPages`. */
export const PAGE_SIZE = 12;

// ---------- Transporte (cliente común de AUD-18) ----------

export { ApiError, reintentarSalvoErrorDelCliente } from "@/lib/http";

/** Mensajes del catálogo por código; los demás dominios pasan los suyos. */
const MENSAJES: Record<number, string> = {
  401: "Inicia sesión con tu cuenta de artesano para gestionar tus productos.",
  403: "Tu cuenta no puede realizar esta operación.",
  404: "No encontramos este producto.",
};

export type Opciones = Omit<OpcionesComunes, "esquema" | "csrf">;

/**
 * Petición JSON a la API con los mensajes del catálogo por defecto. Delega en el
 * cliente común (`@/lib/http`): Bearer, renovación, `credentials` y errores son los
 * mismos para todos los dominios. La usan también talleres y solicitudes.
 */
export function solicitar<T>(ruta: string, { mensajes, ...opciones }: Opciones = {}) {
  return solicitarComun<T>(ruta, { ...opciones, mensajes: { ...MENSAJES, ...mensajes } });
}

// ---------- Forma de la API ----------

interface CategoriaDTO {
  id: number;
  codigo: string;
  nombre: string;
}

interface ProductoDTO {
  id: number;
  nombre: string;
  descripcion: string;
  precio: string;
  categoria: CategoriaDTO;
  modalidades: Modalidad[];
  taller: TallerResumen;
  creado_en: string;
}

interface ProductoPropioDTO extends ProductoDTO {
  publicado: boolean;
  actualizado_en: string;
}

interface PaginaDTO<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------- Mapeo ----------

const aCategoria = (c: CategoriaDTO): Category => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
});

export function aProductoCatalogo(p: ProductoDTO): CatalogProduct {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    // El importe autoritativo es el decimal del servidor; el número es para mostrarlo.
    precio: Number(p.precio),
    categoria: aCategoria(p.categoria),
    modalidades: [...p.modalidades],
    taller: { id: p.taller.id, nombre: p.taller.nombre },
    creadoEn: p.creado_en,
  };
}

export function aProductoPropio(p: ProductoPropioDTO): OwnProduct {
  return { ...aProductoCatalogo(p), publicado: p.publicado, actualizadoEn: p.actualizado_en };
}

function aPaginado<D, T>(
  pagina: PaginaDTO<D>,
  page: number,
  pageSize: number,
  mapear: (d: D) => T,
): Paginated<T> {
  return {
    items: pagina.results.map(mapear),
    total: pagina.count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(pagina.count / pageSize)),
  };
}

const ORDEN_API = {
  recientes: "recientes",
  "precio-asc": "precio_asc",
  "precio-desc": "precio_desc",
  nombre: "nombre",
} as const;

/** Parámetros de `GET /productos/` a partir de los filtros de la interfaz. */
export function parametrosCatalogo(filtros: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  const q = filtros.q?.trim();
  if (q) params.set("q", q);
  if (filtros.categoria) params.set("categoria", filtros.categoria);
  if (filtros.precioMin != null) params.set("precio_min", String(filtros.precioMin));
  if (filtros.precioMax != null) params.set("precio_max", String(filtros.precioMax));
  if (filtros.artesanoId != null) params.set("taller", String(filtros.artesanoId));
  params.set("orden", ORDEN_API[filtros.orden ?? "recientes"]);
  params.set("page", String(filtros.page ?? 1));
  params.set("page_size", String(filtros.pageSize ?? PAGE_SIZE));
  return params;
}

/**
 * Cuerpo de alta o edición. Solo los campos del contrato: la imagen y el inventario de
 * la demo no viajan (la API los rechazaría con 400).
 */
export function cuerpoProducto(input: ProductInput) {
  return {
    nombre: input.nombre,
    descripcion: input.descripcion,
    precio: input.precio.toFixed(2),
    categoria: input.categoria,
    modalidades: [...input.modalidades],
  };
}

// ---------- Endpoints ----------

export async function listCategories(): Promise<Category[]> {
  return (await solicitar<CategoriaDTO[]>("/categorias/")).map(aCategoria);
}

/** Talleres aprobados, para el filtro por taller del catálogo. */
export async function listTalleres(): Promise<TallerResumen[]> {
  const talleres = await solicitar<TallerResumen[]>("/talleres/");
  return talleres.map((t) => ({ id: t.id, nombre: t.nombre }));
}

export async function listCatalog(
  filtros: CatalogFilters = {},
): Promise<Paginated<CatalogProduct>> {
  const params = parametrosCatalogo(filtros);
  const pagina = await solicitar<PaginaDTO<ProductoDTO>>(`/productos/?${params}`);
  return aPaginado(
    pagina,
    Number(params.get("page")),
    Number(params.get("page_size")),
    aProductoCatalogo,
  );
}

export async function getCatalogProduct(id: number): Promise<CatalogProduct> {
  return aProductoCatalogo(await solicitar<ProductoDTO>(`/productos/${id}/`));
}

export async function listOwnProducts(page = 1, pageSize = PAGE_SIZE) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  const pagina = await solicitar<PaginaDTO<ProductoPropioDTO>>(`/productos/mios/?${params}`, {
    autenticada: true,
  });
  return aPaginado(pagina, page, pageSize, aProductoPropio);
}

export async function createOwnProduct(input: ProductInput): Promise<OwnProduct> {
  return aProductoPropio(
    await solicitar<ProductoPropioDTO>("/productos/mios/", {
      metodo: "POST",
      cuerpo: cuerpoProducto(input),
      autenticada: true,
    }),
  );
}

export async function updateOwnProduct(id: number, input: ProductInput): Promise<OwnProduct> {
  return aProductoPropio(
    await solicitar<ProductoPropioDTO>(`/productos/mios/${id}/`, {
      metodo: "PATCH",
      cuerpo: cuerpoProducto(input),
      autenticada: true,
    }),
  );
}

export async function publishOwnProduct(id: number): Promise<OwnProduct> {
  return aProductoPropio(
    await solicitar<ProductoPropioDTO>(`/productos/mios/${id}/publicar/`, {
      metodo: "POST",
      autenticada: true,
    }),
  );
}

export async function unpublishOwnProduct(id: number): Promise<OwnProduct> {
  return aProductoPropio(
    await solicitar<ProductoPropioDTO>(`/productos/mios/${id}/despublicar/`, {
      metodo: "POST",
      autenticada: true,
    }),
  );
}
