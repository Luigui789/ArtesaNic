/** Servidor simulado: categorías, catálogo y productos del artesano (RF-001, RF-002, RF-003). */
import type { CatalogFilters, Paginated, ProductInput } from "@/features/catalogo/types";
import { CATEGORY_IMAGE } from "@/lib/category-images";
import { availableUnits } from "@/lib/units";
import { imageFileError, readAsDataUrl } from "@/lib/image-files";
import { UNIT_TYPES } from "@/types";
import type { Category, Product } from "@/types";
import { api, DEMO_ARTISAN_RESPONSABLE, nextId, nowIso, store } from "./core";
import { movement } from "./inventario";

const nuevoProductoId = () => nextId(store.products);

// ---------- Categorías (RF-003) ----------

/** Equivale a `GET /categorias/`: colección completa, sin paginar. */
export function listCategories(): Promise<Category[]> {
  return api(() => store.categories, 200);
}

// ---------- Catálogo ----------

export function listProducts(filters: CatalogFilters = {}): Promise<Paginated<Product>> {
  return api(() => {
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

    let items = store.products.filter((p) => {
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
  });
}

export function getProduct(id: number): Promise<Product> {
  return api(() => {
    const p = store.products.find((x) => x.id === id);
    if (!p) throw new Error("No encontramos este producto.");
    return p;
  });
}

export function featuredProducts(): Promise<Product[]> {
  return api(() => store.products.slice(0, 8));
}

export function countByCategory(): Promise<Record<string, number>> {
  return api(() => {
    const out: Record<string, number> = {};
    for (const p of store.products) {
      out[p.categoria.codigo] = (out[p.categoria.codigo] ?? 0) + 1;
    }
    return out;
  }, 200);
}

// ---------- Productos del artesano (RF-001 / RF-002) ----------

function validateProduct(input: ProductInput, previous?: Product) {
  if (!UNIT_TYPES.includes(input.tipoUnidades)) throw new Error("Selecciona el tipo de unidades.");
  if (
    !input.nombre.trim() ||
    !input.descripcion.trim() ||
    !Number.isFinite(input.precio) ||
    input.precio <= 0
  )
    throw new Error("Revisa el nombre, descripción y precio del producto.");
  const n = input.existenciasFisicas;
  if (!Number.isSafeInteger(n) || n < (previous ? 0 : 1))
    throw new Error("Las existencias deben ser un entero válido.");
  if (input.tipoUnidades === "pieza_unica" && n > 1)
    throw new Error("Una pieza única admite una sola unidad.");
  if (previous && n < previous.unidadesReservadas + previous.unidadesPorClasificar)
    throw new Error("No puedes reducir las existencias por debajo de las unidades comprometidas.");
  if (
    previous &&
    (n !== previous.existenciasFisicas || input.tipoUnidades !== previous.tipoUnidades) &&
    !input.motivoAjuste?.trim()
  )
    throw new Error("Indica el motivo del ajuste de unidades.");
}

/** El servidor resuelve el código recibido contra su catálogo de categorías. */
function resolverCategoria(codigo: string): Category {
  const categoria = store.categories.find((c) => c.codigo === codigo);
  if (!categoria) throw new Error("La categoría indicada no existe.");
  return categoria;
}

export function listMyProducts(artesanoId: number): Promise<Product[]> {
  return api(() => store.products.filter((p) => p.artesanoId === artesanoId));
}

export function createProduct(
  artesanoId: number,
  input: ProductInput,
  usuario = DEMO_ARTISAN_RESPONSABLE,
): Promise<Product> {
  return api(
    () => {
      validateProduct(input);
      const categoria = resolverCategoria(input.categoria);
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
        tipoUnidades: input.tipoUnidades,
        admitePersonalizacion: input.admitePersonalizacion,
        existenciasFisicas: input.existenciasFisicas,
        unidadesReservadas: 0,
        unidadesPorClasificar: 0,
        unidadesDisponibles: input.existenciasFisicas,
      };
      store.products.unshift(nuevo);
      movement(nuevo, "alta", nuevo.existenciasFisicas, 0, usuario, "Publicación del producto");
      return nuevo;
    },
    700,
    true,
  );
}

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
      const antes = p.existenciasFisicas;
      const changed = antes !== input.existenciasFisicas || p.tipoUnidades !== input.tipoUnidades;
      p.nombre = input.nombre;
      p.precio = input.precio;
      p.categoria = resolverCategoria(input.categoria);
      p.descripcion = input.descripcion;
      p.tipoUnidades = input.tipoUnidades;
      p.admitePersonalizacion = input.admitePersonalizacion;
      p.existenciasFisicas = input.existenciasFisicas;
      p.unidadesDisponibles = availableUnits(p);
      if (changed)
        movement(p, "ajuste", input.existenciasFisicas - antes, antes, usuario, input.motivoAjuste);
      if (input.imagen) p.imagenes = [input.imagen, ...p.imagenes.slice(1)];
      return p;
    },
    700,
    true,
  );
}

/** RF-002: simulación del procesamiento/optimización de la imagen. */
export function processImage(file: File): Promise<string> {
  const error = imageFileError(file);
  return error ? Promise.reject(new Error(error)) : readAsDataUrl(file);
}
