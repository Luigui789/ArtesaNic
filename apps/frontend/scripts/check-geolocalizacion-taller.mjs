// FEAT-GEO-02: selector visual de la ubicación del taller en el panel del artesano.
// Contrato GEO-01 (GET/PATCH /api/v1/talleres/mi-taller/): mapeo DTO, cuerpo del PATCH
// (JSON y multipart), utilidades puras y render en Node sin `window` (Leaflet es
// solo del navegador).
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

// P0: el módulo se compila e importa en Node sin navegador. Si Leaflet se evaluara al
// importar, esto fallaría con «window is not defined».
assert.equal(typeof globalThis.window, "undefined");
assert.equal(typeof globalThis.document, "undefined");

const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity } } };
globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const m = await cargarModulos(
  {
    React: "react",
    servidor: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    lib: "@/lib/http",
    sesion: "@/features/auth/sesion",
    sesionReact: "@/features/auth/use-session",
    api: "@/features/talleres/api",
    http: "@/features/talleres/http",
    propio: "@/features/talleres/perfil-propio",
    ubicacion: "@/features/talleres/ubicacion",
    mapa: "@/features/talleres/mapa",
    selector: "@/features/talleres/components/selector-ubicacion-taller",
    panel: "@/features/talleres/pages/panel-taller",
    moneda: "@/hooks/use-currency",
    notificaciones: "@/features/notificaciones/use-notifications-demo",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

// ---------- Backend simulado (contrato GEO-01) ----------

const tallerInicial = (ubicacion = {}) => ({
  id: 7,
  nombre: "Cerámica López",
  historia: "",
  rubro: "Cerámica artesanal",
  direccion_completa: "Barrio San Juan, Masaya",
  horario: "",
  telefono_publico: "",
  whatsapp_publico: "",
  facebook_url: "",
  instagram_url: "",
  sitio_web: "",
  latitud: null,
  longitud: null,
  ubicacion_publica: false,
  imagen_perfil_url: null,
  imagen_portada_url: null,
  estado: "aprobado",
  motivo_rechazo: "",
  revisado_en: "2026-10-21T10:00:00-06:00",
  ...ubicacion,
});

let srv;
let peticiones = [];
const reiniciar = (ubicacion) => {
  srv = { taller: tallerInicial(ubicacion) };
  peticiones = [];
  m.lib.nuevaEpoca();
  m.lib.establecerTokenDeAcceso("acc-1");
};
const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
/** Como DecimalField(decimal_places=6) de DRF: rechaza más de 6 decimales. */
const decimal = (v) => {
  if (v === null || v === "") return null;
  const texto = String(v);
  if ((texto.split(".")[1] ?? "").length > 6) throw new Error("más de 6 decimales");
  return Number(texto).toFixed(6);
};

globalThis.fetch = async (url, init = {}) => {
  const ruta = String(url);
  const metodo = init.method ?? "GET";
  let cuerpo;
  if (init.body instanceof FormData) cuerpo = Object.fromEntries(init.body.entries());
  else if (init.body) cuerpo = JSON.parse(init.body);
  peticiones.push({ ruta, metodo, cuerpo, multipart: init.body instanceof FormData });
  if (ruta === "/api/v1/auth/csrf/") return json(200, { csrf_token: "csrf-1" });
  if (ruta !== "/api/v1/talleres/mi-taller/") return json(404, { detail: "No encontrado." });
  if (metodo === "GET") return json(200, srv.taller);
  const t = srv.taller;
  try {
    if ("latitud" in cuerpo) t.latitud = decimal(cuerpo.latitud);
    if ("longitud" in cuerpo) t.longitud = decimal(cuerpo.longitud);
  } catch (e) {
    return json(400, { latitud: [e.message] });
  }
  if ("ubicacion_publica" in cuerpo)
    t.ubicacion_publica = cuerpo.ubicacion_publica === true || cuerpo.ubicacion_publica === "true";
  if (t.ubicacion_publica && t.latitud === null)
    return json(400, { ubicacion_publica: ["No se puede publicar sin coordenadas."] });
  for (const k of ["nombre", "historia"]) if (k in cuerpo) t[k] = cuerpo[k];
  if (cuerpo.imagen_perfil) t.imagen_perfil_url = "/media/talleres/logo.png";
  return json(200, t);
};

// ---------- Utilidades ----------

const grupos = [];
async function verificar(nombre, fn) {
  reiniciar();
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos.push(nombre);
}
const patches = () => peticiones.filter((p) => p.metodo === "PATCH");
const ARTURO = { id: 42, nombre: "Arturo Artesano", telefono: "87779090", rol: "artesano" };
const adaptador = (usuario) => ({
  restaurar: async () => usuario,
  iniciarSesion: async () => usuario,
  registrarComprador: async () => usuario,
  registrarArtesano: async () => usuario,
  cerrarSesion: async () => undefined,
  alExpirar: () => () => undefined,
});
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const decimales = (n) => (String(n).split(".")[1] ?? "").length;

async function renderizar(nodo, queryClient) {
  const h = m.React.createElement;
  const ctrl = m.sesion.crearControladorSesion(adaptador(ARTURO), {
    cancelQueries: async () => undefined,
    clear: () => undefined,
  });
  await ctrl.iniciarSesion({ telefono: "", password: "" });
  return m.servidor.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: queryClient ?? new m.rq.QueryClient(SIN_TEMPORIZADORES) },
      h(
        m.sesionReact.SessionProvider,
        { controlador: ctrl },
        h(
          m.moneda.CurrencyProvider,
          null,
          h(
            m.notificaciones.NotificationsProvider,
            null,
            h(m.router.MemoryRouter, { initialEntries: ["/panel/perfil"] }, nodo(h)),
          ),
        ),
      ),
    ),
  );
}
async function conTaller() {
  const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  qc.setQueryData(m.propio.claveMiTaller(42), await m.http.getMiTaller());
  return qc;
}

// ---------- Utilidades puras ----------

await verificar("redondeo a 6 decimales", () => {
  const { redondearCoordenada, crearUbicacion } = m.ubicacion;
  assert.equal(redondearCoordenada(11.97123449), 11.971234);
  assert.equal(redondearCoordenada(11.9712345), 11.971235);
  assert.equal(redondearCoordenada(-86.0956784999), -86.095678);
  assert.equal(redondearCoordenada(-0.0000001), 0);
  for (const v of [11.123456789, -86.1 + 1e-9, 0.1 + 0.2, 12.000000449])
    assert.ok(decimales(redondearCoordenada(v)) <= 6, String(v));
  assert.deepEqual(crearUbicacion(11.97123449, -86.09567849), {
    latitud: 11.971234,
    longitud: -86.095678,
  });
  assert.equal(crearUbicacion(91, 0), null);
  assert.equal(crearUbicacion(0, -181), null);
  assert.equal(crearUbicacion(Number.NaN, 0), null);
});

await verificar("ubicación inicial desde el backend (string → número)", () => {
  const { ubicacionDeTaller, estadoUbicacionDe } = m.ubicacion;
  assert.deepEqual(ubicacionDeTaller({ latitud: "11.971234", longitud: "-86.095678" }), {
    ubicacion: { latitud: 11.971234, longitud: -86.095678 },
    invalida: false,
  });
  assert.deepEqual(ubicacionDeTaller({ latitud: null, longitud: null }), {
    ubicacion: null,
    invalida: false,
  });
  // Datos inesperados: no crashea, se tratan como sin ubicación y se señalan.
  for (const raro of [
    { latitud: "11.9", longitud: null },
    { latitud: "abc", longitud: "-86.1" },
    { latitud: "11.9abc", longitud: "-86.1" }, // parseFloat lo aceptaría
    { latitud: "1e2", longitud: "-86.1" },
    { latitud: "95.0", longitud: "-86.1" },
    { latitud: "", longitud: "" },
  ])
    assert.deepEqual(ubicacionDeTaller(raro), { ubicacion: null, invalida: true }, raro.latitud);
  const base = { latitud: null, longitud: null, ubicacionPublica: true };
  assert.equal(estadoUbicacionDe(base).publica, false, "sin coordenadas nunca es pública");
});

await verificar("quitar ubicación y cambios del PATCH", () => {
  const { quitarUbicacion, conUbicacion, cambiosDeUbicacion } = m.ubicacion;
  const guardada = { ubicacion: { latitud: 11.97, longitud: -86.09 }, publica: true };
  assert.deepEqual(quitarUbicacion(), { ubicacion: null, publica: false });
  assert.deepEqual(conUbicacion(guardada, null), { ubicacion: null, publica: false });
  const movida = conUbicacion(guardada, { latitud: 11.98, longitud: -86.1 });
  assert.equal(movida.publica, true, "mover el pin conserva la decisión de publicar");
  assert.deepEqual(cambiosDeUbicacion(guardada, { ...guardada }), {});
  assert.deepEqual(cambiosDeUbicacion(guardada, movida), {
    ubicacion: { latitud: 11.98, longitud: -86.1 },
    ubicacionPublica: true,
  });
  assert.deepEqual(cambiosDeUbicacion(guardada, quitarUbicacion()), {
    ubicacion: null,
    ubicacionPublica: false,
  });
  const privada = { ubicacion: guardada.ubicacion, publica: false };
  assert.deepEqual(cambiosDeUbicacion(privada, quitarUbicacion()), {
    ubicacion: null,
    ubicacionPublica: false,
  });
  assert.deepEqual(cambiosDeUbicacion(guardada, privada), {
    ubicacion: guardada.ubicacion,
    ubicacionPublica: false,
  });
});

await verificar("configuración del mapa centralizada", () => {
  assert.equal(m.mapa.CAPA_MAPA.url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.match(m.mapa.CAPA_MAPA.atribucion, /OpenStreetMap/);
  assert.match(m.mapa.CAPA_MAPA.atribucion, /openstreetmap\.org\/copyright/);
  assert.equal(m.mapa.URL_GEOCODIFICACION, "https://nominatim.openstreetmap.org/search");
  const { latitud, longitud } = m.mapa.CENTRO_INICIAL_MASAYA;
  assert.ok(latitud > 11.9 && latitud < 12.05 && longitud > -86.15 && longitud < -86.05);
});

// ---------- Frontera HTTP ----------

await verificar("GET mi-taller: latitud/longitud string|null y ubicacion_publica", async () => {
  const sin = await m.api.getMiTaller();
  assert.equal(sin.latitud, null);
  assert.equal(sin.longitud, null);
  assert.equal(sin.ubicacionPublica, false);
  reiniciar({ latitud: "11.971234", longitud: "-86.095678", ubicacion_publica: true });
  const con = await m.api.getMiTaller();
  assert.equal(con.latitud, "11.971234");
  assert.equal(con.longitud, "-86.095678");
  assert.equal(con.ubicacionPublica, true);
  assert.equal("ubicacion_publica" in con, false, "la interfaz no ve snake_case");
  // Un contrato roto (coordenada numérica) se rechaza en la frontera.
  reiniciar({ latitud: 11.97, longitud: -86.09 });
  await assert.rejects(m.api.getMiTaller());
});

await verificar("PATCH JSON: guardar, hacer privada y eliminar (snake_case)", async () => {
  const guardada = await m.api.actualizarMiTaller({
    ubicacion: { latitud: 11.97123449, longitud: -86.09567849 },
    ubicacionPublica: true,
  });
  assert.deepEqual(patches()[0].cuerpo, {
    latitud: 11.971234,
    longitud: -86.095678,
    ubicacion_publica: true,
  });
  assert.equal(patches()[0].multipart, false);
  assert.equal(guardada.latitud, "11.971234");
  assert.equal(guardada.ubicacionPublica, true);

  await m.api.actualizarMiTaller({ ubicacionPublica: false });
  assert.deepEqual(patches()[1].cuerpo, { ubicacion_publica: false });

  const quitada = await m.api.actualizarMiTaller({ ubicacion: null, ubicacionPublica: false });
  assert.deepEqual(patches()[2].cuerpo, {
    latitud: null,
    longitud: null,
    ubicacion_publica: false,
  });
  assert.equal(quitada.latitud, null);
  assert.equal(quitada.longitud, null);
  assert.equal(quitada.ubicacionPublica, false);
  // Sin cambios de ubicación no viaja ningún campo de ubicación.
  await m.api.actualizarMiTaller({ historia: "Nueva" });
  assert.deepEqual(patches()[3].cuerpo, { historia: "Nueva" });
});

await verificar("PATCH multipart: imagen + ubicación en una sola petición", async () => {
  const archivo = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
  const form = m.http.cuerpoPerfilTaller({
    nombre: "Cerámica López",
    imagenPerfil: archivo,
    ubicacion: { latitud: 11.971234, longitud: -86.095678 },
    ubicacionPublica: true,
  });
  assert.ok(form instanceof FormData);
  assert.equal(form.get("imagen_perfil"), archivo);
  assert.equal(form.get("nombre"), "Cerámica López");
  assert.equal(form.get("latitud"), "11.971234");
  assert.equal(form.get("longitud"), "-86.095678");
  assert.equal(form.get("ubicacion_publica"), "true");
  const t = await m.api.actualizarMiTaller({
    imagenPerfil: archivo,
    ubicacion: { latitud: 11.971234, longitud: -86.095678 },
    ubicacionPublica: true,
  });
  assert.equal(patches().length, 1, "un solo PATCH: sin estados parcialmente guardados");
  assert.equal(patches()[0].multipart, true);
  assert.equal(t.latitud, "11.971234");
  assert.equal(t.ubicacionPublica, true);
  assert.equal(t.imagenPerfil, "/media/talleres/logo.png");

  // Imagen + eliminar: null viaja como "" (DRF lo convierte en null en multipart).
  const quitar = m.http.cuerpoPerfilTaller({
    imagenPortada: archivo,
    ubicacion: null,
    ubicacionPublica: false,
  });
  assert.equal(quitar.get("latitud"), "");
  assert.equal(quitar.get("longitud"), "");
  assert.equal(quitar.get("ubicacion_publica"), "false");
  assert.equal(quitar.get("imagen_portada"), archivo);
  const sin = await m.api.actualizarMiTaller({
    imagenPerfil: archivo,
    ubicacion: null,
    ubicacionPublica: false,
  });
  assert.equal(sin.latitud, null);
  assert.equal(sin.ubicacionPublica, false);
});

// ---------- Render en Node (P0) ----------

await verificar(
  "SSR: el selector y el panel en edición renderizan sin window/document",
  async () => {
    const vacio = await renderizar((h) =>
      h(m.selector.SelectorUbicacionTaller, { value: null, onChange: () => undefined }),
    );
    assert.match(vacio, /aria-label="Mapa para seleccionar la ubicación del taller"/);
    assert.match(texto(vacio), /Aún no has seleccionado la ubicación/);
    assert.doesNotMatch(texto(vacio), /Quitar ubicación/);
    assert.doesNotMatch(vacio, /leaflet-container/, "el mapa no se monta fuera del navegador");

    const con = await renderizar((h) =>
      h(m.selector.SelectorUbicacionTaller, {
        value: { latitud: 11.97, longitud: -86.09 },
        onChange: () => undefined,
      }),
    );
    assert.match(texto(con), /Ubicación seleccionada/);
    assert.match(texto(con), /Quitar ubicación/);
    // No hay campos numéricos de latitud/longitud para escribir a mano.
    for (const html of [vacio, con]) assert.doesNotMatch(html, /name="(latitud|longitud)"/);

    const panel = await renderizar(
      (h) => h(m.panel.default, { editarAlAbrir: true }),
      await conTaller(),
    );
    assert.match(panel, /aria-label="Editar perfil del taller"/);
    assert.equal(typeof globalThis.window, "undefined");
  },
);

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
// El runtime de react-dom/server (build de navegador) deja canales abiertos.
process.exit(0);
