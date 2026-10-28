// FEAT-GEO-02: selector visual de la ubicación del taller en el panel del artesano.
// Contrato GEO-01 (GET/PATCH /api/v1/talleres/mi-taller/): mapeo DTO, cuerpo del PATCH
// (JSON y multipart), utilidades puras y render en Node sin `window` (Leaflet es
// solo del navegador).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    geocoding: "@/features/talleres/geocoding",
    geolocation: "@/features/talleres/geolocation",
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

// ---------- Geocodificación (Nominatim mockeado: nunca se llama al servicio real) ----------

const NOMINATIM = [
  {
    place_id: 101,
    lat: "11.9741537",
    lon: "-86.0950123",
    display_name: "Mercado de Artesanías, Masaya, Nicaragua",
  },
  { place_id: 102, lat: "11.9611", lon: "-86.0989", display_name: "Monimbó, Masaya, Nicaragua" },
];
/** Geocodificador con reloj y espera simulados; registra las llamadas a fetch. */
function geocodificador(respuesta = () => json(200, NOMINATIM)) {
  const llamadas = [];
  const esperas = [];
  const reloj = { t: 10_000 };
  const { buscar } = m.geocoding.crearGeocodificador({
    url: "https://geo.test/search",
    ahora: () => reloj.t,
    // Temporizador virtual: cada espera termina en un instante absoluto, como setTimeout.
    esperar: async (ms) => {
      esperas.push(ms);
      const objetivo = reloj.t + ms;
      await Promise.resolve();
      reloj.t = Math.max(reloj.t, objetivo);
    },
    fetch: async (url, init) => {
      llamadas.push({ url: new URL(url), init });
      return respuesta();
    },
  });
  return { buscar, llamadas, esperas, reloj };
}

await verificar("geocodificación: URL, parámetros y normalización", async () => {
  const g = geocodificador();
  assert.equal(g.llamadas.length, 0, "crear el geocodificador no hace peticiones");
  const r = await g.buscar("  Mercado de Artesanías ");
  const [{ url, init }] = g.llamadas;
  assert.equal(`${url.origin}${url.pathname}`, "https://geo.test/search");
  assert.equal(url.searchParams.get("q"), "Mercado de Artesanías");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("countrycodes"), "ni");
  assert.ok(Number(url.searchParams.get("limit")) <= 5);
  assert.equal(url.searchParams.has("addressdetails"), false);
  assert.equal(init.credentials, "omit");
  assert.deepEqual(r[0], {
    id: "101",
    nombre: "Mercado de Artesanías, Masaya, Nicaragua",
    ubicacion: { latitud: 11.974154, longitud: -86.095012 }, // redondeado a 6 decimales
  });
  assert.equal(r.length, 2);
  assert.deepEqual(await g.buscar("   "), []);
  assert.equal(g.llamadas.length, 1, "una consulta vacía no llama al servicio");
});

await verificar(
  "geocodificación: vacía, error HTTP, JSON inválido, coordenadas inválidas",
  async () => {
    assert.deepEqual(await geocodificador(() => json(200, [])).buscar("Nada"), []);
    const fallidas = [
      () => json(503, { error: "ocupado" }),
      () => json(429, {}),
      () => new Response("<html>", { status: 200 }),
      () => json(200, { error: "Unable to geocode" }),
    ].map((respuesta) =>
      assert.rejects(geocodificador(respuesta).buscar("Masaya"), (e) => {
        assert.equal(e.name, "ErrorGeocodificacion");
        assert.match(e.message, /No pudimos buscar ese lugar/);
        return true;
      }),
    );
    await Promise.all(fallidas);
    const red = geocodificador(() => {
      throw new TypeError("Failed to fetch");
    });
    await assert.rejects(red.buscar("Masaya"), (e) => e.name === "ErrorGeocodificacion");
    const raros = await geocodificador(() =>
      json(200, [
        { place_id: 1, lat: "abc", lon: "-86.1", display_name: "Texto" },
        { place_id: 2, lat: "95", lon: "-86.1", display_name: "Fuera de rango" },
        { place_id: 3, lat: 11.9, lon: -86.1, display_name: "Números, no texto" },
        { place_id: 4, lat: "11.97", lon: "-86.09" }, // sin nombre
        null,
        ...NOMINATIM,
        ...NOMINATIM.map((r, i) => ({ ...r, place_id: 200 + i })),
        ...NOMINATIM.map((r, i) => ({ ...r, place_id: 300 + i })),
      ]),
    ).buscar("Masaya");
    assert.deepEqual(
      raros.map((r) => r.id),
      ["101", "102", "200", "201", "300"],
      "descarta inválidos y no pasa de 5",
    );
  },
);

await verificar("geocodificación: caché por consulta normalizada", async () => {
  const g = geocodificador();
  // Secuencial a propósito: la segunda búsqueda debe encontrar la primera en caché.
  const a = await g.buscar("Mercado de Artesanías");
  assert.equal(await g.buscar("  mercado   de ARTESANIAS "), a);
  assert.equal(g.llamadas.length, 1, "la búsqueda repetida no vuelve a llamar");
  assert.equal(m.geocoding.normalizarConsulta(" Monimbó  "), "monimbo");
  // Los errores no se guardan: reintentar vuelve a consultar.
  let fallar = true;
  const h = geocodificador(() => (fallar ? json(500, {}) : json(200, NOMINATIM)));
  await assert.rejects(h.buscar("Masaya"));
  fallar = false;
  assert.equal((await h.buscar("Masaya")).length, 2);
  assert.equal(h.llamadas.length, 2);
});

await verificar("geocodificación: como máximo 1 petición por segundo", async () => {
  const g = geocodificador();
  await g.buscar("Masaya");
  g.reloj.t += 300; // segunda búsqueda a los 300 ms
  await g.buscar("Monimbó");
  assert.deepEqual(g.esperas, [700], "espera hasta completar 1 s");
  g.reloj.t += 5_000;
  await g.buscar("Parque San Jerónimo");
  assert.deepEqual(g.esperas, [700], "pasado 1 s no espera");
  // Dos búsquedas simultáneas quedan espaciadas (el turno se reserva antes de esperar).
  const c = geocodificador();
  await Promise.all([c.buscar("uno"), c.buscar("dos"), c.buscar("tres")]);
  // Las tres empiezan en t=10 000: salen a 10 000, 11 000 y 12 000 ms.
  assert.deepEqual(c.esperas, [1000, 2000]);
  assert.equal(c.llamadas.length, 3);
  // Una caché no consume turno.
  const d = geocodificador();
  await d.buscar("Masaya");
  await d.buscar("masaya");
  await d.buscar("Catarina");
  assert.deepEqual(d.esperas, [1000]);
});

await verificar("geocodificación: sin autocompletado", async () => {
  // La API del módulo solo expone `buscar` (acción explícita): no hay debounce ni
  // suscripción a lo que se escribe.
  assert.deepEqual(Object.keys(m.geocoding.crearGeocodificador()), ["buscar"]);
  // Renderizar el selector con texto escrito no dispara búsquedas.
  const antes = peticiones.length;
  await renderizar((h) =>
    h(m.selector.SelectorUbicacionTaller, { value: null, onChange: () => undefined }),
  );
  assert.equal(peticiones.length, antes);
  // Comprobación complementaria de la fuente: el selector no hace fetch directo y
  // solo llama a la búsqueda desde `buscar()` (botón Buscar o Enter).
  const fuente = readFileSync(
    new URL("../src/features/talleres/components/selector-ubicacion-taller.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(fuente, /\bfetch\(/);
  assert.equal(fuente.match(/buscarLugar\(/g)?.length, 1);
  assert.match(fuente, /onChange=\{\(e\) => setConsulta\(e\.target\.value\)\}/);
});

// ---------- Geolocalización (navigator.geolocation mockeado) ----------

const geo = (fn) => ({
  getCurrentPosition: (ok, error, opciones) => {
    geo.opciones = opciones;
    fn(ok, error);
  },
});

await verificar(
  "geolocalización: éxito, denegado, no disponible, tiempo, no soportada",
  async () => {
    const { obtenerUbicacionActual, MENSAJES_GEOLOCALIZACION } = m.geolocation;
    const exito = await obtenerUbicacionActual({
      geolocalizacion: geo((ok) =>
        ok({ coords: { latitude: 11.97123449, longitude: -86.0956784 } }),
      ),
      contextoSeguro: true,
    });
    assert.deepEqual(exito, { ok: true, ubicacion: { latitud: 11.971234, longitud: -86.095678 } });
    assert.equal(geo.opciones.timeout > 0, true);
    const fallos = await Promise.all(
      [1, 2, 3].map((code) =>
        obtenerUbicacionActual({
          geolocalizacion: geo((_, error) => error({ code })),
          contextoSeguro: true,
        }),
      ),
    );
    assert.deepEqual(
      fallos.map((r) => r.fallo),
      ["denegado", "no-disponible", "tiempo"],
    );
    assert.deepEqual(await obtenerUbicacionActual({ contextoSeguro: true }), {
      ok: false,
      fallo: "no-soportado",
    });
    // Node no tiene navigator.geolocation: el entorno por defecto es «no soportado».
    assert.deepEqual(await obtenerUbicacionActual(), { ok: false, fallo: "no-soportado" });
    // HTTP no seguro: ni siquiera se pide.
    let pedida = false;
    const inseguro = await obtenerUbicacionActual({
      geolocalizacion: geo(() => (pedida = true)),
      contextoSeguro: false,
    });
    assert.deepEqual(inseguro, { ok: false, fallo: "inseguro" });
    assert.equal(pedida, false);
    // Coordenadas absurdas del dispositivo no se emiten.
    const absurda = await obtenerUbicacionActual({
      geolocalizacion: geo((ok) => ok({ coords: { latitude: Number.NaN, longitude: 0 } })),
    });
    assert.deepEqual(absurda, { ok: false, fallo: "no-disponible" });
    for (const mensaje of Object.values(MENSAJES_GEOLOCALIZACION))
      assert.match(mensaje, /buscar un lugar o mover el marcador manualmente/);
    // Solo lectura puntual: el módulo no usa seguimiento continuo.
    const fuente = readFileSync(
      new URL("../src/features/talleres/geolocation.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(fuente, /watchPosition\(/);
  },
);

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
    assert.match(vacio, /id="ubicacion-busqueda"/);
    assert.match(texto(vacio), /Buscar/);
    assert.match(texto(vacio), /Usar mi ubicación actual/);
    assert.match(texto(vacio), /OpenStreetMap/);

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

// ---------- Integración en el perfil del artesano ----------

const PUBLICA = { latitud: "11.971234", longitud: "-86.095678", ubicacion_publica: true };
const editar = async () =>
  renderizar((h) => h(m.panel.default, { editarAlAbrir: true }), await conTaller());
/** Atributos del switch de publicación en el HTML renderizado. */
const switchPublico = (html) => {
  const etiqueta = html.match(/<button[^>]*id="perfil-ubicacion-publica"[^>]*>/)?.[0];
  assert.ok(etiqueta, "existe el switch de publicación");
  return {
    activo: /aria-checked="true"/.test(etiqueta),
    deshabilitado: /\sdisabled=""/.test(etiqueta),
  };
};

await verificar("perfil sin ubicación: switch apagado y deshabilitado", async () => {
  const html = await editar();
  const t = texto(html);
  assert.match(t, /Ubicación del taller/);
  assert.match(t, /Busca un lugar o selecciona tu taller en el mapa/);
  assert.match(t, /Mostrar mi ubicación en el mapa público/);
  assert.match(t, /Primero selecciona la ubicación de tu taller\./);
  assert.deepEqual(switchPublico(html), { activo: false, deshabilitado: true });
  assert.doesNotMatch(t, /Quitar ubicación/);
  // La sección va después de «Dirección completa» y no pide números.
  assert.ok(html.indexOf("perfil-direccion") < html.indexOf("perfil-ubicacion-titulo"));
  assert.doesNotMatch(html, /name="(latitud|longitud)"|>Latitud|>Longitud/);
});

await verificar("perfil con ubicación pública: switch según el servidor y aviso", async () => {
  reiniciar(PUBLICA);
  const html = await editar();
  const t = texto(html);
  assert.deepEqual(switchPublico(html), { activo: true, deshabilitado: false });
  assert.match(t, /los compradores podrán ver la posición exacta que selecciones/);
  assert.match(t, /Quitar ubicación/);
  assert.match(t, /Ubicación seleccionada/);
  reiniciar({ ...PUBLICA, ubicacion_publica: false });
  assert.deepEqual(switchPublico(await editar()), { activo: false, deshabilitado: false });
});

await verificar("datos inválidos del servidor: aviso sin romper el formulario", async () => {
  reiniciar({ latitud: "11.97", longitud: null, ubicacion_publica: true });
  const html = await editar();
  assert.match(texto(html), /No pudimos leer la ubicación guardada/);
  assert.deepEqual(switchPublico(html), { activo: false, deshabilitado: true });
  assert.match(html, /aria-label="Editar perfil del taller"/);
});

await verificar("vista «Mi taller»: resumen de texto, sin mapa", async () => {
  const resumen = async () => texto(await renderizar((h) => h(m.panel.default), await conTaller()));
  assert.match(await resumen(), /Ubicación del taller Sin ubicación en el mapa/);
  reiniciar(PUBLICA);
  assert.match(await resumen(), /Registrada, visible en el mapa público/);
  reiniciar({ ...PUBLICA, ubicacion_publica: false });
  const privada = await resumen();
  assert.match(privada, /Registrada, privada/);
  assert.doesNotMatch(privada, /11\.971234/, "las coordenadas no se muestran");
});

await verificar("guardar actualiza la caché de mi-taller e invalida lo público", async () => {
  const qc = await conTaller();
  qc.setQueryData(["perfil-taller", 7], { id: 7 });
  const original = m.ubicacion.estadoUbicacionDe(qc.getQueryData(m.propio.claveMiTaller(42)));
  const editado = m.ubicacion.conUbicacion(original, { latitud: 11.971234, longitud: -86.095678 });
  const cambios = m.ubicacion.cambiosDeUbicacion(original, { ...editado, publica: true });
  const actualizado = await m.api.actualizarMiTaller(cambios);
  m.propio.aplicarTallerActualizado(qc, 42, actualizado);
  const enCache = qc.getQueryData(m.propio.claveMiTaller(42));
  assert.equal(enCache.latitud, "11.971234");
  assert.equal(enCache.ubicacionPublica, true);
  assert.equal(qc.getQueryState(["perfil-taller", 7]).isInvalidated, true);
  // El render tras guardar parte de la ubicación nueva.
  assert.deepEqual(
    switchPublico(await renderizar((h) => h(m.panel.default, { editarAlAbrir: true }), qc)),
    {
      activo: true,
      deshabilitado: false,
    },
  );
});

await verificar("cancelar o mover sin guardar no genera PATCH", async () => {
  // El estado de la sección es local: sin cambios respecto a lo guardado no hay campos
  // de ubicación en el payload; cancelar desmonta el formulario sin enviar nada.
  reiniciar(PUBLICA);
  const guardado = m.ubicacion.estadoUbicacionDe(await m.api.getMiTaller());
  assert.deepEqual(m.ubicacion.cambiosDeUbicacion(guardado, { ...guardado }), {});
  await editar();
  assert.equal(patches().length, 0, "abrir el formulario y el mapa no hace PATCH");
});

await verificar("payload del formulario: perfil + ubicación + imagen juntos", async () => {
  const t = await m.api.getMiTaller();
  const original = m.propio.perfilEditableDe(t);
  const ubicacionGuardada = m.ubicacion.estadoUbicacionDe(t);
  const imagenPerfil = new File([new Uint8Array([1])], "logo.png", { type: "image/png" });
  assert.deepEqual(
    m.propio.cambiosDelFormulario({
      original,
      editado: original,
      ubicacionGuardada,
      ubicacion: ubicacionGuardada,
    }),
    {},
    "sin cambios no hay PATCH (Cancelar o pin sin mover)",
  );
  const payload = m.propio.cambiosDelFormulario({
    original,
    editado: { ...original, historia: "Nueva" },
    ubicacionGuardada,
    ubicacion: { ubicacion: { latitud: 11.97, longitud: -86.09 }, publica: false },
    imagenPerfil,
  });
  assert.deepEqual(payload, {
    historia: "Nueva",
    ubicacion: { latitud: 11.97, longitud: -86.09 },
    ubicacionPublica: false,
    imagenPerfil,
  });
  const form = m.http.cuerpoPerfilTaller(payload);
  assert.deepEqual([...form.keys()].sort(), [
    "historia",
    "imagen_perfil",
    "latitud",
    "longitud",
    "ubicacion_publica",
  ]);
});

await verificar("errores 400 de ubicación se muestran en su sección", async () => {
  await assert.rejects(m.api.actualizarMiTaller({ ubicacionPublica: true }), (error) => {
    assert.equal(error.status, 400);
    const fallo = m.propio.erroresDelPerfil(error.campos);
    assert.equal(fallo.campos.ubicacion, "No se puede publicar sin coordenadas.");
    return true;
  });
});

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
// El runtime de react-dom/server (build de navegador) deja canales abiertos.
process.exit(0);
