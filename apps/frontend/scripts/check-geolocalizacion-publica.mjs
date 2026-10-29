// FEAT-GEO-04: mapas públicos de talleres. Contrato `ubicacion_mapa` de
// GET /api/v1/talleres/ y /talleres/{id}/ (única autoridad de la posición pública),
// privacidad, marcadores, encuadre, popup y render en Node sin `window` (Leaflet es solo
// del navegador).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargarModulos } from "./cargar-modulo.mjs";

globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

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
  rq: "@tanstack/react-query",
  sesion: "@/features/auth/sesion",
  sesionReact: "@/features/auth/use-session",
  moneda: "@/hooks/use-currency",
  notificaciones: "@/features/notificaciones/use-notifications-demo",
  descubrir: "@/features/catalogo/pages/inicio",
  seccion: "@/features/talleres/components/talleres-descubrir",
  artesano: "@/features/talleres/pages/artesano",
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

// ---------- /descubrir: lista y mapa general ----------

const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity } } };

/** Página completa en Node, con la caché de TanStack Query ya poblada (sin red). */
async function renderizarPagina(nodo, { ruta, datos = [] }) {
  const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  for (const [clave, valor] of datos) qc.setQueryData(clave, valor);
  const ctrl = m.sesion.crearControladorSesion(
    {
      restaurar: async () => null,
      iniciarSesion: async () => null,
      registrarComprador: async () => null,
      registrarArtesano: async () => null,
      cerrarSesion: async () => undefined,
      alExpirar: () => () => undefined,
    },
    qc,
  );
  await ctrl.reintentar();
  return m.servidor.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(
        m.sesionReact.SessionProvider,
        { controlador: ctrl },
        h(
          m.moneda.CurrencyProvider,
          null,
          h(
            m.notificaciones.NotificationsProvider,
            null,
            h(m.router.MemoryRouter, { initialEntries: [ruta] }, nodo(h)),
          ),
        ),
      ),
    ),
  );
}

/**
 * Seis talleres aprobados: 1-4 son las tarjetas destacadas (solo el 2 publica su
 * ubicación), el 5 publica la suya y el 6 la tiene privada.
 */
const SEIS = perfiles([
  [1, null],
  [2, { latitud: "11.975", longitud: "-86.09" }],
  [3, null],
  [4, null],
  [5, MONIMBO],
  [6, null],
]);
const seccion = (talleres, vistaInicial) =>
  m.servidor.renderToStaticMarkup(
    h(m.router.MemoryRouter, null, h(m.seccion.TalleresDescubrir, { talleres, vistaInicial })),
  );
const enlacesTaller = (html) => [...html.matchAll(/href="\/artesano\/(\d+)"/g)].map((x) => +x[1]);
const pulsado = (html, etiqueta) =>
  html.match(
    new RegExp(`<button[^>]*aria-pressed="(true|false)"[^>]*>(?:(?!</button>).)*${etiqueta}`),
  )?.[1];

await verificar("11. /descubrir en Node: vista lista inicial, sin mapa ni red", async () => {
  const html = await renderizarPagina((hh) => hh(m.descubrir.default), {
    ruta: "/descubrir",
    datos: [[["talleres-publicos"], SEIS]],
  });
  assert.match(texto(html), /Talleres para descubrir/);
  assert.match(html, /role="group" aria-label="Cómo ver los talleres"/);
  assert.equal(pulsado(html, "Ver talleres"), "true");
  assert.equal(pulsado(html, "Ver mapa"), "false");
  // Las tarjetas siguen siendo las 4 destacadas, como antes.
  assert.deepEqual(enlacesTaller(html), [1, 2, 3, 4]);
  // Lista inicial: el mapa no se monta (no se descarga Leaflet).
  assert.doesNotMatch(html, /Mapa de los talleres artesanales/);
  sinCoordenadas(html, "11.971234", "-86.095678", "11.975");
  // Ni geocodificación ni otra petición para el mapa.
  assert.deepEqual(peticiones, []);
  // Complemento de la fuente: la página entrega la respuesta completa, sin recortar.
  const fuente = readFileSync(
    new URL("../src/features/catalogo/pages/inicio.tsx", import.meta.url),
    "utf8",
  );
  assert.match(fuente, /<TalleresDescubrir talleres=\{artesanos\.data\} \/>/);
  assert.doesNotMatch(fuente, /artesanos\.data\.slice|queryKey: \["mapa/);
});

await verificar("12. regresión slice(0,4): el mapa usa todos los talleres ubicados", () => {
  assert.deepEqual(
    m.ubicacion.marcadoresDeTalleres(SEIS).map((x) => x.id),
    [2, 5],
  );
  const html = seccion(SEIS, "mapa");
  assert.equal(pulsado(html, "Ver mapa"), "true");
  // 2 marcadores (talleres 2 y 5): con slice(0,4) serían 1. El 6 (privado) no cuenta.
  assert.match(texto(html), /2 talleres han publicado su ubicación en el mapa/);
  assert.match(html, /role="region" aria-label="Mapa de los talleres artesanales"/);
  // En vista mapa las tarjetas se ocultan; vuelven con «Ver talleres».
  assert.deepEqual(enlacesTaller(html), []);
  sinCoordenadas(html, "11.971234", "-86.095678", "11.975");
});

await verificar("13. mapa general: 1 ubicación y 0 ubicaciones", () => {
  const uno = seccion(
    SEIS.filter((t) => t.id !== 2),
    "mapa",
  );
  assert.match(texto(uno), /1 taller ha publicado su ubicación en el mapa/);
  const ninguno = seccion(
    SEIS.filter((t) => t.ubicacionMapa === null),
    "mapa",
  );
  // Sin ubicaciones: aviso y tarjetas, nunca un mapa vacío sin explicación.
  assert.match(
    ninguno,
    /role="status"[^>]*>.*Estos talleres todavía no han publicado su ubicación en el mapa\./,
  );
  assert.doesNotMatch(ninguno, /role="region"/);
  assert.deepEqual(enlacesTaller(ninguno), [1, 3, 4, 6]);
});

await verificar("14. la lista conserva los talleres sin ubicación pública", () => {
  // Los talleres sin ubicación pública no desaparecen de la lista.
  const html = seccion(SEIS, "lista");
  assert.deepEqual(enlacesTaller(html), [1, 2, 3, 4]);
  assert.match(texto(html), /Ver mapa/);
});

// ---------- /artesano/:id: mapa individual y «Cómo llegar» ----------

await verificar("15. urlComoLlegar: solo coordenadas públicas, URL válida", () => {
  const url = m.mapa.urlComoLlegar({ latitud: 11.971234, longitud: -86.095678 });
  assert.equal(url, "https://www.google.com/maps/search/?api=1&query=11.971234%2C-86.095678");
  const u = new URL(url);
  assert.equal(u.protocol, "https:");
  assert.equal(u.searchParams.get("query"), "11.971234,-86.095678");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["api", "query"]);
  assert.doesNotMatch(url, /\s|Masaya|Taller|key=/i);
  // Formato estable aunque el número tenga menos decimales o sea negativo/cero.
  assert.match(
    m.mapa.urlComoLlegar({ latitud: 12, longitud: -0 }),
    /query=12\.000000%2C-?0\.000000$/,
  );
});

const SIN_PRODUCTOS = { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 };
async function perfil(taller) {
  return renderizarPagina(
    (hh) =>
      hh(
        m.router.Routes,
        null,
        hh(m.router.Route, { path: "/artesano/:id", element: hh(m.artesano.default) }),
      ),
    {
      ruta: `/artesano/${taller.id}`,
      datos: [
        [["perfil-taller", taller.id], taller],
        [["productos-artesano", taller.id], SIN_PRODUCTOS],
      ],
    },
  );
}

await verificar(
  "16. perfil con ubicación pública: «Dónde encontrarnos», mapa y «Cómo llegar»",
  async () => {
    const html = await perfil(m.http.aPerfilTaller(dto(5, MONIMBO)));
    assert.match(texto(html), /Dónde encontrarnos/);
    assert.match(html, /role="region" aria-label="Mapa con la ubicación del taller Taller 5"/);
    const enlace = html.match(/<a [^>]*href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*>/)?.[0];
    assert.ok(enlace, "Cómo llegar");
    assert.match(enlace, /target="_blank"/);
    assert.match(enlace, /rel="noreferrer"/);
    assert.match(texto(html), /Cómo llegar \(se abre en otra pestaña\)/);
    // Jerarquía pública: productos primero, ubicación y contacto después.
    const i = (s) => html.indexOf(s);
    assert.ok(i('id="productos-taller"') < i('id="ubicacion-taller"'));
    assert.ok(i('id="ubicacion-taller"') < i('id="contacto"'));
    // La dirección textual sigue en el perfil y las coordenadas no se muestran como texto.
    assert.match(texto(html), /Dirección 5, Masaya/);
    assert.doesNotMatch(texto(html), /11\.971234|-86\.095678|Lat|Lng/);
    // Sin red para el mapa: los datos vienen de ["perfil-taller", id].
    assert.deepEqual(peticiones, []);
  },
);

await verificar("17. perfil privado: sin mapa, sin «Cómo llegar» y con dirección", async () => {
  const html = await perfil(m.http.aPerfilTaller(dto(6, null)));
  assert.doesNotMatch(texto(html), /Dónde encontrarnos|Cómo llegar/);
  assert.doesNotMatch(html, /role="region"|google\.com\/maps|data-(lat|lng)/i);
  assert.match(texto(html), /Información del taller Dirección 6, Masaya/);
  assert.match(texto(html), /Productos publicados/);
});

await verificar(
  "18. privacidad: ubicación inválida o privada no deja coordenadas en el HTML",
  async () => {
    // Aunque el DTO trajera coordenadas fuera de ubicacion_mapa, no salen al HTML.
    const html = await perfil(
      m.http.aPerfilTaller(dto(8, null, { latitud: "11.961111", longitud: "-86.081111" })),
    );
    sinCoordenadas(html, "11.961111", "-86.081111");
    const invalido = await perfil(
      m.http.aPerfilTaller(dto(9, { latitud: "abc", longitud: "-86.081111" })),
    );
    sinCoordenadas(invalido, "-86.081111");
    assert.doesNotMatch(invalido, /Cómo llegar|role="region"/);
  },
);

await verificar("19. modo demo: el perfil renderiza normalmente sin mapa", async () => {
  const [primero] = await demo.api.listPerfilesTalleres();
  const html = await perfil(primero);
  assert.match(texto(html), /Información del taller/);
  assert.doesNotMatch(texto(html), /Dónde encontrarnos|Cómo llegar/);
});

await verificar("20. fuente: mapa público de solo lectura, sin GPS, geocodificación ni SDK", () => {
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), "utf8");
  const publicos = [
    "features/talleres/components/mapa-talleres-publico.tsx",
    "features/talleres/components/mapa-talleres-publico-leaflet.tsx",
    "features/talleres/components/talleres-descubrir.tsx",
    "features/talleres/components/ubicacion-publica-taller.tsx",
    "features/talleres/components/popup-taller.tsx",
    "features/catalogo/pages/inicio.tsx",
    "features/talleres/pages/artesano.tsx",
  ];
  for (const ruta of publicos) {
    const fuente = leer(ruta);
    assert.doesNotMatch(fuente, /geolocation|geocoding|buscarLugar|obtenerUbicacionActual/, ruta);
    assert.doesNotMatch(fuente, /maps\.googleapis|google\.maps|apiKey/i, ruta);
    assert.doesNotMatch(fuente, /tile\.openstreetmap\.org/, ruta);
    assert.doesNotMatch(fuente, /window\.location|localStorage/, ruta);
    // Solo el módulo diferido importa Leaflet.
    if (!ruta.endsWith("-leaflet.tsx"))
      assert.doesNotMatch(fuente, /from "(leaflet|react-leaflet)"/, ruta);
  }
  const leaflet = leer("features/talleres/components/mapa-talleres-publico-leaflet.tsx");
  assert.doesNotMatch(leaflet, /draggable|dragend|useMapEvents|onSeleccionar/);
  assert.match(leaflet, /CAPA_MAPA\.url/);
});

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
// El runtime de react-dom/server (build de navegador) deja canales abiertos.
process.exit(0);
