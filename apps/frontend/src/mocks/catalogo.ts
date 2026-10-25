/** Servidor simulado: categorías, catálogo y productos del artesano (RF-001, RF-003, RF-017, RF-019). */
import type {
  CatalogFilters,
  CatalogProduct,
  OwnProduct,
  Paginated,
  ProductInput,
} from "@/features/catalogo/types";
import { CATEGORY_IMAGE } from "@/lib/category-images";
import { availableUnits } from "@/lib/units";
import { imageFileError, readAsDataUrl } from "@/lib/image-files";
import { MODALIDADES, UNIT_TYPES } from "@/types";
import type { Category, Product } from "@/types";
import { api, DEMO_ARTISAN_ID, DEMO_ARTISAN_RESPONSABLE, nextId, nowIso, store } from "./core";
import { movement } from "./inventario";

const nuevoProductoId = () => nextId(store.products);

// ---------- Categorías (RF-003) ----------

/** Equivale a `GET /categorias/`: colección completa, sin paginar. */
export function listCategories(): Promise<Category[]> {
  return api(() => store.categories, 200);
}

// ---------- Lecturas internas de la demo ----------

function filtrar(products: Product[], filters: CatalogFilters): Paginated<Product> {
  const {
    q = "",
    categoria,
    precioMin,
    precioMax,
    artesanoId,
    orden = "recientes",
    page = 1,
    pageSize = 12,
  } = filters;

  let items = products.filter((p) => {
    if (q && !p.nombre.toLowerCase().includes(q.toLowerCase())) return false;
    if (categoria && p.categoria.codigo !== categoria) return false;
    if (precioMin != null && p.precio < precioMin) return false;
    if (precioMax != null && p.precio > precioMax) return false;
    if (artesanoId && p.artesanoId !== artesanoId) return false;
    return true;
  });

  items = [...items].sort((a, b) => {
    switch (orden) {
      case "precio-asc":
        return a.precio - b.precio;
      case "precio-desc":
        return b.precio - a.precio;
      case "nombre":
        return a.nombre.localeCompare(b.nombre);
      default:
        return b.creadoEn.localeCompare(a.creadoEn);
    }
  });

  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Todos los productos, publicados o no. La usan los dominios que todavía son
 * simulados (pedidos, mensajes, panel) para resolver productos de pedidos
 * existentes: un producto despublicado sigue siendo referencia histórica (RN-003).
 * El catálogo público usa `listCatalog`.
 */
export function listProducts(filters: CatalogFilters = {}): Promise<Paginated<Product>> {
  return api(() => filtrar(store.products, filters));
}

/** Lectura interna de la demo, con inventario. El catálogo público usa `getCatalogProduct`. */
export function getProduct(id: number): Promise<Product> {
  return api(() => {
    const p = store.products.find((x) => x.id === id);
    if (!p) throw new Error("No encontramos este producto.");
    return p;
  });
}

export function featuredProducts(): Promise<Product[]> {
  return api(() => store.products.filter((p) => p.publicado).slice(0, 8));
}

export function countByCategory(): Promise<Record<string, number>> {
  return api(() => {
    const out: Record<string, number> = {};
    for (const p of store.products) {
      if (!p.publicado) continue;
      out[p.categoria.codigo] = (out[p.categoria.codigo] ?? 0) + 1;
    }
    return out;
  }, 200);
}

// ---------- Catálogo público con la forma del contrato (RF-003) ----------

function aCatalogo(p: Product): CatalogProduct {
  const taller = store.artisans.find((a) => a.id === p.artesanoId);
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    categoria: p.categoria,
    modalidades: p.modalidades,
    taller: { id: p.artesanoId, nombre: taller?.nombreTaller ?? "" },
    creadoEn: p.creadoEn,
    imagen: p.imagenes[0],
  };
}

function aPropio(p: Product): OwnProduct {
  // La demo no registra la hora de edición; se informa la de alta.
  // La demo no modera productos: la moderación es exclusiva de Django Admin (AUD-14).
  return { ...aCatalogo(p), publicado: p.publicado, moderacion: null, actualizadoEn: p.creadoEn };
}

/** Equivale a `GET /productos/`: solo publicados. En la demo todos los talleres están aprobados. */
export function listCatalog(filters: CatalogFilters = {}): Promise<Paginated<CatalogProduct>> {
  return api(() => {
    const pagina = filtrar(
      store.products.filter((p) => p.publicado),
      filters,
    );
    return { ...pagina, items: pagina.items.map(aCatalogo) };
  });
}

/** Equivale a `GET /productos/{id}/`: un producto no publicado no se encuentra. */
export function getCatalogProduct(id: number): Promise<CatalogProduct> {
  return api(() => {
    const p = store.products.find((x) => x.id === id && x.publicado);
    if (!p) throw new Error("No encontramos este producto.");
    return aCatalogo(p);
  });
}

// ---------- Productos del artesano (RF-001, RF-017, RF-019) ----------

function validateProduct(input: ProductInput, previous?: Product) {
  if (
    !input.nombre.trim() ||
    !input.descripcion.trim() ||
    !Number.isFinite(input.precio) ||
    input.precio <= 0
  )
    throw new Error("Revisa el nombre, descripción y precio del producto.");
  const modalidades = input.modalidades;
  if (
    !Array.isArray(modalidades) ||
    modalidades.length === 0 ||
    new Set(modalidades).size !== modalidades.length ||
    modalidades.some((m) => !MODALIDADES.includes(m))
  )
    throw new Error("Selecciona al menos una modalidad de venta.");
  // Las existencias solo se piden si el producto se vende desde stock.
  if (!modalidades.includes("stock")) return;
  const inventario = input.inventarioDemo;
  if (!inventario || !UNIT_TYPES.includes(inventario.tipoUnidades))
    throw new Error("Selecciona el tipo de unidades.");
  const n = inventario.existenciasFisicas;
  if (!Number.isSafeInteger(n) || n < (previous ? 0 : 1))
    throw new Error("Las existencias deben ser un entero válido.");
  if (inventario.tipoUnidades === "pieza_unica" && n > 1)
    throw new Error("Una pieza única admite una sola unidad.");
  if (previous && n < previous.unidadesReservadas + previous.unidadesPorClasificar)
    throw new Error("No puedes reducir las existencias por debajo de las unidades comprometidas.");
  if (
    previous &&
    (n !== previous.existenciasFisicas || inventario.tipoUnidades !== previous.tipoUnidades) &&
    !inventario.motivoAjuste?.trim()
  )
    throw new Error("Indica el motivo del ajuste de unidades.");
}

/** El servidor resuelve el código recibido contra su catálogo de categorías. */
function resolverCategoria(codigo: string): Category {
  const categoria = store.categories.find((c) => c.codigo === codigo);
  if (!categoria) throw new Error("La categoría indicada no existe.");
  return categoria;
}

/** Productos de un taller con inventario; la usan la verificación de la demo y el panel. */
export function listMyProducts(artesanoId: number): Promise<Product[]> {
  return api(() => store.products.filter((p) => p.artesanoId === artesanoId));
}

/** Registra un producto sin publicar, como `POST /productos/mios/`. */
export function createProduct(
  artesanoId: number,
  input: ProductInput,
  usuario = DEMO_ARTISAN_RESPONSABLE,
): Promise<Product> {
  return api(
    () => {
      validateProduct(input);
      const categoria = resolverCategoria(input.categoria);
      const inventario = input.modalidades.includes("stock") ? input.inventarioDemo : undefined;
      const existencias = inventario?.existenciasFisicas ?? 0;
      const nuevo: Product = {
        id: nuevoProductoId(),
        nombre: input.nombre,
        precio: input.precio,
        categoria,
        descripcion: input.descripcion,
        imagenes: [input.imagen || (CATEGORY_IMAGE[categoria.codigo] as string)],
        artesanoId,
        disponible: true,
        creadoEn: nowIso(),
        modalidades: [...input.modalidades],
        publicado: false,
        tipoUnidades: inventario?.tipoUnidades ?? "existencias",
        admitePersonalizacion: input.modalidades.includes("personalizacion"),
        existenciasFisicas: existencias,
        unidadesReservadas: 0,
        unidadesPorClasificar: 0,
        unidadesDisponibles: existencias,
      };
      store.products.unshift(nuevo);
      if (existencias > 0)
        movement(nuevo, "alta", existencias, 0, usuario, "Alta del producto con existencias");
      return nuevo;
    },
    700,
    true,
  );
}

/** Edita un producto. Cambiar las modalidades no borra el inventario ya registrado. */
export function updateProduct(
  id: number,
  input: ProductInput,
  usuario = DEMO_ARTISAN_RESPONSABLE,
): Promise<Product> {
  return api(
    () => {
      const p = store.products.find((x) => x.id === id);
      if (!p) throw new Error("No encontramos este producto.");
      validateProduct(input, p);
      p.nombre = input.nombre;
      p.precio = input.precio;
      p.categoria = resolverCategoria(input.categoria);
      p.descripcion = input.descripcion;
      p.modalidades = [...input.modalidades];
      p.admitePersonalizacion = input.modalidades.includes("personalizacion");
      const inventario = input.modalidades.includes("stock") ? input.inventarioDemo : undefined;
      if (inventario) {
        const antes = p.existenciasFisicas;
        const changed =
          antes !== inventario.existenciasFisicas || p.tipoUnidades !== inventario.tipoUnidades;
        p.tipoUnidades = inventario.tipoUnidades;
        p.existenciasFisicas = inventario.existenciasFisicas;
        p.unidadesDisponibles = availableUnits(p);
        if (changed)
          movement(
            p,
            "ajuste",
            inventario.existenciasFisicas - antes,
            antes,
            usuario,
            inventario.motivoAjuste,
          );
      }
      if (input.imagen) p.imagenes = [input.imagen, ...p.imagenes.slice(1)];
      return p;
    },
    700,
    true,
  );
}

// El taller del servidor simulado es siempre el de la sesión de demostración: igual
// que la API real, que lo deriva del token, estas funciones no reciben un taller.

function productoPropio(id: number): Product {
  const p = store.products.find((x) => x.id === id && x.artesanoId === DEMO_ARTISAN_ID);
  if (!p) throw new Error("No encontramos este producto.");
  return p;
}

/** Equivale a `GET /productos/mios/`: publicados y despublicados, paginados. */
export function listOwnProducts(page = 1, pageSize = 12): Promise<Paginated<OwnProduct>> {
  return api(() => {
    const pagina = filtrar(
      store.products.filter((p) => p.artesanoId === DEMO_ARTISAN_ID),
      { page, pageSize },
    );
    return { ...pagina, items: pagina.items.map(aPropio) };
  });
}

export async function createOwnProduct(input: ProductInput): Promise<OwnProduct> {
  return aPropio(await createProduct(DEMO_ARTISAN_ID, input));
}

export async function updateOwnProduct(id: number, input: ProductInput): Promise<OwnProduct> {
  await api(() => productoPropio(id));
  return aPropio(await updateProduct(id, input));
}

function cambiarPublicacion(id: number, publicado: boolean): Promise<OwnProduct> {
  return api(
    () => {
      const p = productoPropio(id);
      p.publicado = publicado;
      return aPropio(p);
    },
    300,
    true,
  );
}

/** Equivale a `POST /productos/mios/{id}/publicar/`. Idempotente. */
export const publishOwnProduct = (id: number) => cambiarPublicacion(id, true);

/** Equivale a `POST /productos/mios/{id}/despublicar/`: lo retira sin borrarlo. Idempotente. */
export const unpublishOwnProduct = (id: number) => cambiarPublicacion(id, false);

/** RF-002: simulación del procesamiento/optimización de la imagen. */
export function processImage(file: File): Promise<string> {
  const error = imageFileError(file);
  return error ? Promise.reject(new Error(error)) : readAsDataUrl(file);
}
