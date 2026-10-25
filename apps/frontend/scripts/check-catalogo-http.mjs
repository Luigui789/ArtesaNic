// Verifica el cliente HTTP del catálogo (src/features/catalogo/http.ts) contra el contrato
// de docs/api/catalogo.md, con un fetch simulado y sin añadir un framework de pruebas.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

// El token de acceso vive en el cliente común (@/lib/http, AUD-18): mismo bundle.
const { http, sesion } = await cargarModulos({
  http: "@/features/catalogo/http",
  sesion: "@/lib/http",
});

// ---------- fetch simulado ----------

let peticiones = [];
let respuestas = [];
globalThis.fetch = async (url, init = {}) => {
  peticiones.push({
    url: String(url),
    metodo: init.method ?? "GET",
    cabeceras: init.headers ?? {},
    cuerpo: init.body ? JSON.parse(init.body) : undefined,
  });
  const siguiente = respuestas.shift();
  if (siguiente instanceof Error) throw siguiente;
  const { status = 200, cuerpo } = siguiente ?? {};
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
const responder = (...lista) => {
  peticiones = [];
  respuestas = lista;
};
const ultima = () => peticiones.at(-1);
const parametros = (url) => Object.fromEntries(new URL(url, "http://x").searchParams);

const categoria = { id: 1, codigo: "cuero_y_calzado", nombre: "Cuero y calzado" };
const productoDTO = {
  id: 15,
  nombre: "Sandalias",
  descripcion: "Cuero natural.",
  precio: "4890.50",
  categoria,
  modalidades: ["produccion", "personalizacion"],
  taller: { id: 3, nombre: "Barro y Sombra" },
  creado_en: "2026-10-14T10:30:00-06:00",
};
const propioDTO = { ...productoDTO, publicado: false, actualizado_en: "2026-10-15T09:00:00-06:00" };
const pagina = (results, count = results.length) => ({
  count,
  next: null,
  previous: null,
  results,
});

// ---------- Catálogo público (RF-003) ----------

responder({ cuerpo: pagina([productoDTO], 30) });
let catalogo = await http.listCatalog({
  q: "  sandalias ",
  categoria: "cuero_y_calzado",
  precioMin: 100,
  precioMax: 5000.5,
  artesanoId: 3,
  orden: "precio-desc",
  page: 2,
  pageSize: 12,
});
assert.equal(new URL(ultima().url, "http://x").pathname, "/api/v1/productos/");
assert.deepEqual(parametros(ultima().url), {
  q: "sandalias",
  categoria: "cuero_y_calzado",
  precio_min: "100",
  precio_max: "5000.5",
  taller: "3",
  orden: "precio_desc",
  page: "2",
  page_size: "12",
});
assert.equal(ultima().cabeceras.Authorization, undefined, "El catálogo público no envía token.");
assert.deepEqual(
  {
    total: catalogo.total,
    page: catalogo.page,
    pageSize: catalogo.pageSize,
    totalPages: catalogo.totalPages,
  },
  { total: 30, page: 2, pageSize: 12, totalPages: 3 },
);
assert.deepEqual(catalogo.items[0], {
  id: 15,
  nombre: "Sandalias",
  descripcion: "Cuero natural.",
  precio: 4890.5,
  categoria,
  modalidades: ["produccion", "personalizacion"],
  taller: { id: 3, nombre: "Barro y Sombra" },
  creadoEn: "2026-10-14T10:30:00-06:00",
});

// Sin filtros: orden por defecto y page_size explícito (contrato §1.8).
responder({ cuerpo: pagina([]) });
catalogo = await http.listCatalog();
assert.deepEqual(parametros(ultima().url), { orden: "recientes", page: "1", page_size: "12" });
assert.deepEqual(catalogo, { items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 });

for (const [orden, esperado] of [
  ["recientes", "recientes"],
  ["precio-asc", "precio_asc"],
  ["precio-desc", "precio_desc"],
  ["nombre", "nombre"],
]) {
  responder({ cuerpo: pagina([]) });
  await http.listCatalog({ orden });
  assert.equal(parametros(ultima().url).orden, esperado);
}

responder({ cuerpo: [categoria] });
assert.deepEqual(await http.listCategories(), [categoria]);
assert.equal(ultima().url, "/api/v1/categorias/");

responder({ cuerpo: [{ id: 3, nombre: "Barro y Sombra", historia: "…", rubro: "Cerámica" }] });
assert.deepEqual(await http.listTalleres(), [{ id: 3, nombre: "Barro y Sombra" }]);

responder({ cuerpo: productoDTO });
assert.equal((await http.getCatalogProduct(15)).taller.id, 3);
assert.equal(ultima().url, "/api/v1/productos/15/");

responder({ cuerpo: { ...productoDTO, modalidades: ["stock"], disponible_stock: 6 } });
assert.equal((await http.getCatalogProduct(15)).disponibleStock, 6);

// Despublicado o de un taller no aprobado: 404.
responder({ status: 404, cuerpo: { detail: "No encontrado." } });
await assert.rejects(http.getCatalogProduct(99), (e) => {
  assert.equal(e.name, "ApiError");
  assert.equal(e.status, 404);
  assert.equal(e.message, "No encontramos este producto.");
  return true;
});

// Parámetros inválidos: 400 por campo.
responder({ status: 400, cuerpo: { orden: ['"x" no es una elección válida.'] } });
await assert.rejects(http.listCatalog(), (e) => e.status === 400 && e.campos.orden.length === 1);

// Sin conexión.
responder(new TypeError("fetch failed"));
await assert.rejects(http.listCatalog(), (e) => e.status === 0 && /conectar/.test(e.message));

// ---------- Gestión del artesano (RF-001, RF-017, RF-019) ----------

// Sin sesión: no se envía token, el servidor responde 401 y no se intenta renovar.
responder({ status: 401, cuerpo: { detail: "No se proporcionaron las credenciales." } });
await assert.rejects(http.listOwnProducts(), (e) => {
  assert.equal(e.status, 401);
  assert.match(e.message, /Inicia sesión/);
  return true;
});
assert.equal(ultima().cabeceras.Authorization, undefined);

sesion.establecerTokenDeAcceso("token-de-prueba");

responder({ cuerpo: pagina([propioDTO], 13) });
const propios = await http.listOwnProducts(2);
assert.equal(ultima().cabeceras.Authorization, "Bearer token-de-prueba");
assert.deepEqual(parametros(ultima().url), { page: "2", page_size: "12" });
assert.equal(propios.totalPages, 2);
assert.equal(propios.items[0].publicado, false);
assert.equal(propios.items[0].actualizadoEn, "2026-10-15T09:00:00-06:00");

// Taller pendiente o rechazado: el 403 conserva el motivo del servidor.
const motivo =
  "Tu taller todavía no está aprobado: esta operación requiere la aprobación de la administración.";
responder({ status: 403, cuerpo: { detail: motivo } });
await assert.rejects(http.listOwnProducts(), (e) => e.status === 403 && e.message === motivo);

// El cuerpo solo lleva campos del contrato: sin taller, imagen ni inventario de la demo,
// y una modalidad sin stock no pide existencias.
responder({ status: 201, cuerpo: propioDTO });
const creado = await http.createOwnProduct({
  nombre: "Sandalias",
  descripcion: "Cuero natural.",
  precio: 4890.5,
  categoria: "cuero_y_calzado",
  modalidades: ["produccion", "personalizacion"],
  imagen: "data:image/png;base64,AAAA",
  inventarioDemo: { tipoUnidades: "existencias", existenciasFisicas: 3 },
});
assert.equal(ultima().metodo, "POST");
assert.equal(ultima().url, "/api/v1/productos/mios/");
assert.equal(ultima().cabeceras["Content-Type"], "application/json");
assert.deepEqual(ultima().cuerpo, {
  nombre: "Sandalias",
  descripcion: "Cuero natural.",
  precio: "4890.50",
  categoria: "cuero_y_calzado",
  modalidades: ["produccion", "personalizacion"],
});
assert.equal(creado.publicado, false);

responder({
  status: 400,
  cuerpo: { modalidades: ["Selecciona al menos una modalidad de venta."] },
});
await assert.rejects(
  http.createOwnProduct({
    nombre: "x",
    descripcion: "y",
    precio: 1,
    categoria: "c",
    modalidades: [],
  }),
  (e) =>
    e.status === 400 &&
    e.message === "Selecciona al menos una modalidad de venta." &&
    e.campos.modalidades[0] === e.message,
);

responder({ cuerpo: { ...propioDTO, nombre: "Otro" } });
await http.updateOwnProduct(15, {
  nombre: "Otro",
  descripcion: "Cuero natural.",
  precio: 10,
  categoria: "cuero_y_calzado",
  modalidades: ["stock"],
});
assert.equal(ultima().metodo, "PATCH");
assert.equal(ultima().url, "/api/v1/productos/mios/15/");

// Producto ajeno o inexistente: 404, sin distinguirlos.
responder({ status: 404, cuerpo: { detail: "No encontrado." } });
await assert.rejects(http.publishOwnProduct(77), (e) => e.status === 404);

responder({ cuerpo: { ...propioDTO, publicado: true } });
assert.equal((await http.publishOwnProduct(15)).publicado, true);
assert.equal(ultima().metodo, "POST");
assert.equal(ultima().url, "/api/v1/productos/mios/15/publicar/");
assert.equal(ultima().cuerpo, undefined);

responder({ cuerpo: { ...propioDTO, publicado: false } });
assert.equal((await http.unpublishOwnProduct(15)).publicado, false);
assert.equal(ultima().url, "/api/v1/productos/mios/15/despublicar/");

// Reintentos: un 4xx no se repite; un fallo de red o del servidor sí, hasta tres veces.
const { ApiError, reintentarSalvoErrorDelCliente: reintentar } = http;
for (const status of [400, 401, 403, 404])
  assert.equal(reintentar(0, new ApiError(status, "x")), false);
assert.equal(reintentar(0, new ApiError(0, "sin conexión")), true);
assert.equal(reintentar(0, new ApiError(500, "error")), true);
assert.equal(reintentar(3, new ApiError(500, "error")), false);

console.log(
  "OK: cliente HTTP del catálogo (parámetros, mapeo, paginación, errores 400/401/403/404, token y cuerpo del contrato).",
);
