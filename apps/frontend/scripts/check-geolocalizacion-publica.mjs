// FEAT-GEO-04: mapas públicos de talleres. Contrato `ubicacion_mapa` de
// GET /api/v1/talleres/ y /talleres/{id}/ (única autoridad de la posición pública),
// privacidad, marcadores, encuadre, popup y render en Node sin `window` (Leaflet es solo
// del navegador).
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

// P0: todo se compila e importa en Node sin navegador.
assert.equal(typeof globalThis.window, "undefined");
assert.equal(typeof globalThis.document, "undefined");

const MODULOS = {
  React: "react",
  servidor: "react-dom/server",
  router: "react-router",
  api: "@/features/talleres/api",
  http: "@/features/talleres/http",
  ubicacion: "@/features/talleres/ubicacion",
  mapa: "@/features/talleres/mapa",
  publico: "@/features/talleres/components/mapa-talleres-publico",
  popup: "@/features/talleres/components/popup-taller",
};
const m = await cargarModulos(MODULOS, { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" });
const demo = await cargarModulos(
  { api: "@/features/talleres/api" },
  { VITE_AUTH_API: "mock", VITE_CATALOGO_API: "mock" },
);

// ---------- Backend simulado (contrato GEO-01 del perfil público) ----------

const dto = (id, ubicacion_mapa, extra = {}) => ({
  id,
  nombre: `Taller ${id}`,
  historia: "",
  rubro: "Cerámica",
  direccion_completa: `Dirección ${id}, Masaya`,
  horario: "",
  telefono_publico: "",
  whatsapp_publico: "",
  facebook_url: "",
  instagram_url: "",
  sitio_web: "",
  imagen_perfil_url: null,
  imagen_portada_url: null,
  ubicacion_mapa,
  ...extra,
});
const MONIMBO = { latitud: "11.971234", longitud: "-86.095678" };

let respuestas = {};
let peticiones = [];
const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
globalThis.fetch = async (url) => {
  const ruta = String(url);
  peticiones.push(ruta);
  return ruta in respuestas ? json(200, respuestas[ruta]) : json(404, { detail: "No encontrado." });
};

const grupos = [];
async function verificar(nombre, fn) {
  respuestas = {};
  peticiones = [];
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos.push(nombre);
}
const h = m.React.createElement;
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** Ninguna forma de la coordenada (texto o número) aparece en el HTML. */
function sinCoordenadas(html, ...valores) {
  for (const v of valores) {
    assert.ok(!html.includes(String(v)), `coordenada ${v} expuesta`);
    assert.ok(!html.includes(Number(v).toFixed(6)), `coordenada ${v} expuesta`);
  }
}

// ---------- Contrato DTO → frontend ----------

await verificar("1. público con ubicación: texto decimal → números", async () => {
  respuestas["/api/v1/talleres/7/"] = dto(7, MONIMBO);
  const t = await m.http.getPerfilTaller(7);
  assert.deepEqual(t.ubicacionMapa, { latitud: 11.971234, longitud: -86.095678 });
  assert.equal(typeof t.ubicacionMapa.latitud, "number");
  // Ningún campo crudo ni otra fuente de coordenadas.
  for (const k of ["ubicacion_mapa", "latitud", "longitud", "ubicacionPublica"])
    assert.ok(!(k in t), `sobra ${k}`);
});

await verificar("2. privado o sin ubicación: ubicacionMapa = null", async () => {
  respuestas["/api/v1/talleres/"] = [dto(1, null), dto(2, undefined)];
  const [privado, sinCampo] = await m.http.listPerfilesTalleres();
  assert.equal(privado.ubicacionMapa, null);
  // Un backend anterior a GEO-01 (sin el campo) tampoco publica nada.
  assert.equal(sinCampo.ubicacionMapa, null);
  // Aunque llegaran coordenadas sueltas, no son la autoridad pública.
  assert.equal(
    m.http.aPerfilTaller(dto(3, null, { latitud: "11.9", longitud: "-86.1" })).ubicacionMapa,
    null,
  );
});

await verificar("3. límites ±90/±180 válidos", () => {
  for (const [lat, lng] of [
    ["90", "180"],
    ["-90", "-180"],
    ["0", "0"],
    ["90.000000", "-180.000000"],
  ])
    assert.deepEqual(m.http.aUbicacionMapa({ latitud: lat, longitud: lng }), {
      latitud: Number(lat),
      longitud: Number(lng),
    });
});

await verificar("4. datos inválidos inesperados: sin marcador corrupto ni excepción", () => {
  const invalidos = [
    { latitud: "abc", longitud: "-86.1" },
    { latitud: "11.9", longitud: null },
    { latitud: "11.9" },
    { latitud: "NaN", longitud: "-86.1" },
    { latitud: "Infinity", longitud: "-86.1" },
    { latitud: "90.1", longitud: "-86.1" },
    { latitud: "11.9", longitud: "-180.5" },
    { latitud: 11.9, longitud: -86.1 },
    { latitud: "", longitud: "" },
    "11.9,-86.1",
    [11.9, -86.1],
    42,
  ];
  for (const valor of invalidos) {
    const perfil = m.http.aPerfilTaller(dto(9, valor));
    assert.equal(perfil.ubicacionMapa, null, JSON.stringify(valor));
    assert.deepEqual(m.ubicacion.marcadoresDeTalleres([perfil]), []);
  }
});

await verificar("5. una sola conversión decimal compartida con el panel (GEO-02)", () => {
  const { ubicacionDesdeDecimales, ubicacionDeTaller } = m.ubicacion;
  assert.deepEqual(ubicacionDesdeDecimales("11.971234", "-86.095678"), {
    latitud: 11.971234,
    longitud: -86.095678,
  });
  assert.equal(ubicacionDesdeDecimales(null, "-86.1"), null);
  // El panel conserva su semántica: sin ubicación no es inválida; parcial sí.
  assert.deepEqual(ubicacionDeTaller({ latitud: null, longitud: null }), {
    ubicacion: null,
    invalida: false,
  });
  assert.deepEqual(ubicacionDeTaller({ latitud: "11.9", longitud: null }), {
    ubicacion: null,
    invalida: true,
  });
});

await verificar("6. modo demo: perfiles sin ubicación pública inventada", async () => {
  const talleres = await demo.api.listPerfilesTalleres();
  assert.ok(talleres.length > 0);
  assert.ok(talleres.every((t) => t.ubicacionMapa === null));
  assert.equal((await demo.api.getPerfilTaller(talleres[0].id)).ubicacionMapa, null);
});

// ---------- Marcadores y encuadre ----------

const perfiles = (lista) => lista.map(([id, u]) => m.http.aPerfilTaller(dto(id, u)));

await verificar("7. marcadores: uno por taller con ubicación pública, ninguno por privado", () => {
  const { marcadoresDeTalleres } = m.ubicacion;
  assert.deepEqual(marcadoresDeTalleres([]), []);
  assert.deepEqual(marcadoresDeTalleres(perfiles([[1, null]])), []);
  const uno = marcadoresDeTalleres(perfiles([[1, MONIMBO]]));
  assert.deepEqual(uno, [
    {
      id: 1,
      nombre: "Taller 1",
      rubro: "Cerámica",
      direccion: "Dirección 1, Masaya",
      ubicacion: { latitud: 11.971234, longitud: -86.095678 },
    },
  ]);
  const varios = marcadoresDeTalleres(
    perfiles([
      [1, MONIMBO],
      [2, null],
      [3, { latitud: "11.98", longitud: "-86.09" }],
      [4, { latitud: "abc", longitud: "-86.09" }],
    ]),
  );
  assert.deepEqual(
    varios.map((x) => x.id),
    [1, 3],
  );
  // El marcador lleva solo lo del popup y la posición.
  assert.deepEqual(Object.keys(varios[0]).sort(), [
    "direccion",
    "id",
    "nombre",
    "rubro",
    "ubicacion",
  ]);
});

await verificar("8. encuadre: Masaya sin marcadores, centro con uno, límites con varios", () => {
  const { encuadreDeUbicaciones, CENTRO_INICIAL_MASAYA, ZOOM_INICIAL, ZOOM_TALLER_PUBLICO } =
    m.mapa;
  assert.deepEqual(encuadreDeUbicaciones([]), {
    tipo: "centro",
    centro: CENTRO_INICIAL_MASAYA,
    zoom: ZOOM_INICIAL,
  });
  const a = { latitud: 11.97, longitud: -86.1 };
  assert.deepEqual(encuadreDeUbicaciones([a]), {
    tipo: "centro",
    centro: a,
    zoom: ZOOM_TALLER_PUBLICO,
  });
  assert.deepEqual(
    encuadreDeUbicaciones([
      a,
      { latitud: 11.99, longitud: -86.05 },
      { latitud: 11.95, longitud: -86.08 },
    ]),
    {
      tipo: "limites",
      limites: [
        [11.95, -86.1],
        [11.99, -86.05],
      ],
    },
  );
  // El zoom al encuadrar tiene tope: dos puntos casi iguales no acercan al máximo.
  assert.ok(ZOOM_TALLER_PUBLICO < m.mapa.CAPA_MAPA.zoomMaximo);
});

// ---------- Componentes (render en Node) ----------

await verificar("9. popup: nombre, rubro, dirección y «Ver taller» → /artesano/{id}", () => {
  const [marcador] = m.ubicacion.marcadoresDeTalleres(perfiles([[5, MONIMBO]]));
  const render = (enlace) =>
    m.servidor.renderToStaticMarkup(
      h(m.router.MemoryRouter, null, h(m.popup.PopupTaller, { marcador, enlace })),
    );
  const html = render(true);
  assert.match(texto(html), /Taller 5 Cerámica Dirección 5, Masaya Ver taller/);
  assert.match(html, /<a [^>]*href="\/artesano\/5"[^>]*>Ver taller<\/a>/);
  assert.doesNotMatch(html, /target="_blank"|window\.location/);
  sinCoordenadas(html, "11.971234", "-86.095678");
  // En el perfil individual el popup no repite el enlace a sí mismo.
  assert.doesNotMatch(render(false), /Ver taller|href=/);
});

await verificar(
  "10. SSR: el mapa público renderiza sin navegador, sin coordenadas en el HTML",
  () => {
    const marcadores = m.ubicacion.marcadoresDeTalleres(
      perfiles([
        [1, MONIMBO],
        [2, { latitud: "11.98", longitud: "-86.09" }],
      ]),
    );
    const html = m.servidor.renderToStaticMarkup(
      h(m.publico.MapaTalleresPublico, {
        marcadores,
        etiqueta: "Mapa de talleres",
        enlaces: true,
        mensajeError: "No pudimos cargar el mapa.",
      }),
    );
    assert.match(html, /role="region" aria-label="Mapa de talleres"/);
    assert.match(html, /w-full/);
    // Sin navegador solo existe el contenedor: Leaflet no se evaluó.
    assert.doesNotMatch(html, /leaflet-container|leaflet-marker/);
    sinCoordenadas(html, "11.971234", "-86.095678", "11.98", "-86.09");
    assert.doesNotMatch(html, /data-(lat|lng)/i);
    // Ninguna petición de red (ni geocodificación) para montar el mapa.
    assert.deepEqual(peticiones, []);
  },
);

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
// El runtime de react-dom/server (build de navegador) deja canales abiertos.
process.exit(0);
