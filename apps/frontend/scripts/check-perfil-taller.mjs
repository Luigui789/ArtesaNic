// Verifica la fuente del perfil público del taller (src/features/talleres/api.ts):
// el modo simulado explícito (VITE_CATALOGO_API=mock) y GET /api/v1/talleres/{id}/ en modo real
// (por defecto tras AUD-18), de modo que el taller.id de un producto real abre su taller real (RF-008).
import assert from "node:assert/strict";
import { cargarModulo } from "./cargar-modulo.mjs";

let peticiones = [];
let respuestas = [];
globalThis.fetch = async (url) => {
  peticiones.push(String(url));
  const { status = 200, cuerpo } = respuestas.shift() ?? {};
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
const responder = (...lista) => {
  peticiones = [];
  respuestas = lista;
};

// ---------- Modo simulado (por defecto) ----------

const mock = await cargarModulo("src/features/talleres/api.ts", { VITE_CATALOGO_API: "mock" });
const catalogoMock = await cargarModulo("src/features/catalogo/api.ts", {
  VITE_CATALOGO_API: "mock",
});
responder();
const [productoDemo] = (await catalogoMock.listCatalog({ pageSize: 1 })).items;
const tallerDemo = await mock.getPerfilTaller(productoDemo.taller.id);
assert.equal(peticiones.length, 0, "El modo simulado no llama a la API.");
assert.equal(tallerDemo.id, productoDemo.taller.id);
assert.equal(tallerDemo.nombre, productoDemo.taller.nombre);
assert.ok(tallerDemo.demo?.portadaUrl, "Conserva los datos que solo tiene la demo.");
await assert.rejects(mock.getPerfilTaller(999_999), /No encontramos/);

// ---------- Modo real ----------

const real = await cargarModulo("src/features/talleres/api.ts", { VITE_CATALOGO_API: "real" });
const catalogoReal = await cargarModulo("src/features/catalogo/api.ts", {
  VITE_CATALOGO_API: "real",
});
assert.equal(catalogoReal.catalogoReal, true);

const tallerDTO = {
  id: 3,
  nombre: "Barro y Sombra",
  historia: "Taller familiar.",
  rubro: "Cerámica artesanal",
  direccion_completa: "Barrio San Juan, Masaya",
  horario: "Lunes a sábado",
  telefono_publico: "",
  whatsapp_publico: "87776655",
  facebook_url: "",
  instagram_url: "https://instagram.com/barroysombra",
  sitio_web: "",
};
const productoDTO = {
  id: 15,
  nombre: "Jarrón",
  descripcion: "Barro.",
  precio: "450.00",
  categoria: { id: 1, codigo: "madera", nombre: "Madera" },
  modalidades: ["produccion"],
  taller: { id: 3, nombre: "Barro y Sombra" },
  creado_en: "2026-10-15T10:30:00-06:00",
};

// El taller.id del producto real abre el taller real correspondiente.
responder({ cuerpo: productoDTO }, { cuerpo: tallerDTO });
const producto = await catalogoReal.getCatalogProduct(15);
const taller = await real.getPerfilTaller(producto.taller.id);
assert.deepEqual(peticiones, ["/api/v1/productos/15/", "/api/v1/talleres/3/"]);
assert.deepEqual(taller, {
  id: 3,
  nombre: "Barro y Sombra",
  historia: "Taller familiar.",
  rubro: "Cerámica artesanal",
  direccion: "Barrio San Juan, Masaya",
  horario: "Lunes a sábado",
  telefono: "",
  whatsapp: "87776655",
  facebook: "",
  instagram: "https://instagram.com/barroysombra",
  sitioWeb: "",
});
assert.equal("demo" in taller, false, "La API pública no trae datos de la demo.");

// Cuando el taller tiene imagen_perfil_url e imagen_portada_url, se mapean a imagenPerfil e imagenPortada.
responder({
  cuerpo: {
    ...tallerDTO,
    imagen_perfil_url: "/media/talleres/abc/perfil/123.png",
    imagen_portada_url: "/media/talleres/abc/portada/456.jpg",
  },
});
const tallerConImagenes = await real.getPerfilTaller(3);
assert.equal(tallerConImagenes.imagenPerfil, "/media/talleres/abc/perfil/123.png");
assert.equal(tallerConImagenes.imagenPortada, "/media/talleres/abc/portada/456.jpg");

// Pendiente, rechazado o inexistente: 404 de la API.
responder({ status: 404, cuerpo: { detail: "No encontrado." } });
await assert.rejects(real.getPerfilTaller(8), (e) => {
  assert.equal(e.status, 404);
  assert.equal(e.message, "No encontramos este taller.");
  return true;
});
assert.deepEqual(peticiones, ["/api/v1/talleres/8/"]);

console.log(
  "OK: perfil público del taller (API real por defecto y modo simulado aislado con VITE_CATALOGO_API=mock).",
);
