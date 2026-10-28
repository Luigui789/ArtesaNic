// FEAT-GEO-03: ubicación del taller durante el registro del artesano. Contrato de
// POST /api/v1/auth/registro/artesano/ (GEO-01: `taller` admite latitud, longitud y
// ubicacion_publica): cuerpo, redondeo, privacidad defensiva, compatibilidad sin
// ubicación y errores 400 en la sección «Ubicación del taller». También el formulario:
// el selector de GEO-02 solo aparece al vender, y su estado llega al único POST.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargarModulos } from "./cargar-modulo.mjs";

// P0: todo se compila e importa en Node sin navegador.
assert.equal(typeof globalThis.window, "undefined");
assert.equal(typeof globalThis.document, "undefined");

const m = await cargarModulos(
  {
    lib: "@/lib/http",
    auth: "@/features/auth/http",
    validacion: "@/features/auth/validacion",
    errores: "@/features/auth/errores",
    registro: "@/features/auth/registro",
    React: "react",
    servidor: "react-dom/server",
    rq: "@tanstack/react-query",
    sesion: "@/features/auth/sesion",
    sesionReact: "@/features/auth/use-session",
    formulario: "@/features/auth/components/formulario-registro",
    seccion: "@/features/talleres/components/seccion-ubicacion-taller",
    selector: "@/features/talleres/components/selector-ubicacion-taller",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

// ---------- Backend simulado (contrato GEO-01 del registro) ----------

let peticiones = [];
/** Error `400` forzado para la siguiente petición de registro, con la forma anidada de DRF. */
let errorForzado = null;
const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const decimales = (n) => (String(n).split(".")[1] ?? "").length;

globalThis.fetch = async (url, init = {}) => {
  const ruta = String(url);
  const metodo = init.method ?? "GET";
  const cuerpo = init.body ? JSON.parse(init.body) : undefined;
  peticiones.push({ ruta, metodo, cuerpo });
  if (ruta === "/api/v1/auth/csrf/") return json(200, { csrf_token: "csrf-1" });
  if (metodo !== "POST" || !ruta.startsWith("/api/v1/auth/registro/"))
    return json(404, { detail: "No encontrado." });
  if (errorForzado) {
    const error = errorForzado;
    errorForzado = null;
    return json(400, error);
  }
  const t = cuerpo.taller;
  if (t) {
    // DecimalField(decimal_places=6) y la regla de GEO-01: no se publica sin coordenadas.
    for (const k of ["latitud", "longitud"])
      if (k in t && decimales(t[k]) > 6)
        return json(400, { taller: { [k]: ["Más de 6 decimales."] } });
    if (t.ubicacion_publica === true && (t.latitud == null || t.longitud == null))
      return json(400, {
        taller: { ubicacion_publica: ["No se puede publicar sin coordenadas."] },
      });
  }
  const rol = ruta.endsWith("/artesano/") ? "artesano" : "comprador";
  return json(201, {
    access: `acc-${peticiones.length}`,
    usuario: { id: 9, nombre: cuerpo.nombre, telefono: cuerpo.telefono, rol },
  });
};

// ---------- Utilidades ----------

const grupos = [];
async function verificar(nombre, fn) {
  peticiones = [];
  errorForzado = null;
  m.lib.nuevaEpoca();
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos.push(nombre);
}
const GEO = ["latitud", "longitud", "ubicacion_publica"];
const sinGeo = (taller) => GEO.forEach((k) => assert.ok(!(k in taller), `sobra ${k}`));
const posts = () => peticiones.filter((p) => p.metodo === "POST" && p.ruta.includes("/registro/"));

const CUENTA = { nombre: "Ana López", telefono: "88881234", password: "barro-y-fuego" };
const TALLER = {
  nombre: "Cerámicas Ana",
  rubro: "Cerámica",
  direccionCompleta: "Monimbó, Masaya",
};
const MONIMBO = { latitud: 11.971234, longitud: -86.095678 };

// ---------- Contrato: cuerpoTaller / cuerpoRegistroArtesano ----------

await verificar("1. sin ubicación: cuerpo antiguo, sin campos geográficos", () => {
  for (const extra of [{}, { ubicacion: null }, { ubicacion: undefined }]) {
    const cuerpo = m.auth.cuerpoRegistroArtesano({ ...CUENTA, taller: { ...TALLER, ...extra } });
    assert.deepEqual(cuerpo, {
      ...CUENTA,
      taller: { nombre: "Cerámicas Ana", rubro: "Cerámica", direccion_completa: "Monimbó, Masaya" },
    });
    sinGeo(cuerpo.taller);
  }
});

await verificar("2. ubicación privada", () => {
  const taller = m.auth.cuerpoTaller({ ...TALLER, ubicacion: MONIMBO, ubicacionPublica: false });
  assert.deepEqual(taller, {
    nombre: "Cerámicas Ana",
    rubro: "Cerámica",
    direccion_completa: "Monimbó, Masaya",
    latitud: 11.971234,
    longitud: -86.095678,
    ubicacion_publica: false,
  });
  // Sin decisión explícita también es privada.
  assert.equal(m.auth.cuerpoTaller({ ...TALLER, ubicacion: MONIMBO }).ubicacion_publica, false);
});

await verificar("3. ubicación pública solo con `true` explícito", () => {
  const taller = m.auth.cuerpoTaller({ ...TALLER, ubicacion: MONIMBO, ubicacionPublica: true });
  assert.equal(taller.ubicacion_publica, true);
  assert.equal(taller.latitud, 11.971234);
  assert.equal(taller.longitud, -86.095678);
  for (const raro of ["true", 1, "si"])
    assert.equal(
      m.auth.cuerpoTaller({ ...TALLER, ubicacion: MONIMBO, ubicacionPublica: raro })
        .ubicacion_publica,
      false,
    );
});

await verificar("4. redondeo a 6 decimales en la frontera HTTP", () => {
  const taller = m.auth.cuerpoTaller({
    ...TALLER,
    ubicacion: { latitud: 11.97123449, longitud: -86.09567849 },
    ubicacionPublica: false,
  });
  assert.equal(taller.latitud, 11.971234);
  assert.equal(taller.longitud, -86.095678);
  assert.ok(decimales(taller.latitud) <= 6 && decimales(taller.longitud) <= 6);
});

await verificar("5. privacidad defensiva: sin ubicación nunca viaja `true`", () => {
  for (const ubicacion of [
    null,
    undefined,
    { latitud: Number.NaN, longitud: -86 },
    { latitud: 95, longitud: -86 },
  ]) {
    const taller = m.auth.cuerpoTaller({ ...TALLER, ubicacion, ubicacionPublica: true });
    sinGeo(taller);
  }
});

await verificar("6. una sola petición POST al registro, sin PATCH posterior", async () => {
  const usuario = await m.auth.registrarArtesano({
    ...CUENTA,
    taller: { ...TALLER, ubicacion: MONIMBO, ubicacionPublica: true },
  });
  assert.equal(usuario.rol, "artesano");
  const [post, ...resto] = posts();
  assert.equal(resto.length, 0);
  assert.equal(post.ruta, "/api/v1/auth/registro/artesano/");
  assert.deepEqual(post.cuerpo.taller, {
    nombre: "Cerámicas Ana",
    rubro: "Cerámica",
    direccion_completa: "Monimbó, Masaya",
    latitud: 11.971234,
    longitud: -86.095678,
    ubicacion_publica: true,
  });
  assert.ok(!("rol" in post.cuerpo));
  assert.equal(peticiones.filter((p) => p.metodo === "PATCH").length, 0);
});

await verificar("7. comprador: mismo cuerpo de siempre, sin taller ni geodatos", async () => {
  // Aunque llegaran campos de más, la lista cerrada del comprador los descarta.
  await m.auth.registrarComprador({ ...CUENTA, taller: { ...TALLER, ubicacion: MONIMBO } });
  const [post] = posts();
  assert.equal(post.ruta, "/api/v1/auth/registro/comprador/");
  assert.deepEqual(post.cuerpo, CUENTA);
});

// ---------- Errores 400 → «Ubicación del taller» ----------

const CAMPOS_FORMULARIO = [
  "nombre",
  "telefono",
  "password",
  "confirmacion",
  ...Object.keys(m.validacion.TALLER_VACIO).map((c) => `taller.${c}`),
  m.validacion.CAMPO_UBICACION_TALLER,
];

async function falloDe(error) {
  errorForzado = error;
  try {
    await m.auth.registrarArtesano({ ...CUENTA, taller: { ...TALLER, ubicacion: MONIMBO } });
  } catch (e) {
    return m.errores.interpretarFallo(e, CAMPOS_FORMULARIO);
  }
  assert.fail("el registro debía fallar");
}

/** Un `400` del backend para `campo` termina en «Ubicación del taller». */
async function errorGeografico(campo) {
  const fallo = await falloDe({ taller: { [campo]: [`Error en ${campo}.`] } });
  assert.deepEqual(fallo.campos, { "taller.ubicacion": `Error en ${campo}.` });
  // Con campo conocido, el mensaje general es el genérico, no el detalle técnico.
  assert.equal(fallo.general, "Revisa los datos marcados.");
}

await verificar("8. errores de latitud, longitud y publicación → taller.ubicacion", async () => {
  assert.equal(m.validacion.CAMPO_UBICACION_TALLER, "taller.ubicacion");
  await errorGeografico("latitud");
  await errorGeografico("longitud");
  await errorGeografico("ubicacion_publica");
});

await verificar("9. varios errores geográficos se muestran como un solo mensaje", async () => {
  const fallo = await falloDe({
    taller: { latitud: ["Latitud inválida."], longitud: ["Longitud inválida."] },
  });
  assert.deepEqual(Object.keys(fallo.campos), ["taller.ubicacion"]);
  assert.equal(fallo.campos["taller.ubicacion"], "Latitud inválida.");
  // El backend real responde así si se publica sin coordenadas.
  errorForzado = null;
  assert.deepEqual(
    m.validacion.erroresDelServidor({ "taller.ubicacion_publica": ["Sin coordenadas."] }),
    { "taller.ubicacion": "Sin coordenadas." },
  );
});

await verificar("10. errores de texto del taller siguen en su campo", async () => {
  const fallo = await falloDe({
    taller: { direccion_completa: ["Obligatorio."], latitud: ["Fuera de rango."] },
  });
  assert.deepEqual(fallo.campos, {
    "taller.direccionCompleta": "Obligatorio.",
    "taller.ubicacion": "Fuera de rango.",
  });
});

// ---------- Formulario de registro (FEAT-GEO-03) ----------

globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity } } };
const h = m.React.createElement;
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const noop = () => undefined;

/** Render en Node, sin window/document/navigator, con la sesión real de la app. */
function renderizarRegistro(props = {}) {
  const ctrl = m.sesion.crearControladorSesion(
    {
      restaurar: async () => null,
      iniciarSesion: async () => null,
      registrarComprador: async () => null,
      registrarArtesano: async () => null,
      cerrarSesion: async () => undefined,
      alExpirar: () => () => undefined,
    },
    { cancelQueries: async () => undefined, clear: () => undefined },
  );
  return m.servidor.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: new m.rq.QueryClient(SIN_TEMPORIZADORES) },
      h(
        m.sesionReact.SessionProvider,
        { controlador: ctrl },
        h(m.formulario.FormularioRegistro, { onExito: noop, ...props }),
      ),
    ),
  );
}

await verificar("11. SSR: el registro de artesano con ubicación renderiza sin navegador", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.navigator?.geolocation, "undefined");
  const html = renderizarRegistro({ intencionInicial: "artesano" });
  assert.match(texto(html), /Ubicación del taller \(opcional\)/);
  assert.match(texto(html), /hacerlo después desde tu perfil/);
  // El selector existente de GEO-02 (búsqueda, GPS, mapa diferido) está montado.
  // Build sin VITE_GEOCODING_URL: hereda la decisión de GEO-02 (sin Nominatim público
  // en producción); el mapa y el GPS siguen disponibles.
  assert.match(texto(html), /La búsqueda de lugares no está disponible/);
  assert.match(html, /aria-label="Mapa para seleccionar la ubicación del taller"/);
  assert.match(texto(html), /Usar mi ubicación actual/);
  // Sin `*`: la ubicación es opcional; la dirección sigue obligatoria.
  assert.doesNotMatch(texto(html), /Ubicación del taller \*/);
  assert.match(texto(html), /Dirección completa \*/);
  // Sin inputs de latitud/longitud.
  assert.doesNotMatch(html, /name="(latitud|longitud)"|id="[^"]*(latitud|longitud)[^"]*"/i);
});

await verificar("12. comprador: sin «Ubicación del taller» ni selector", () => {
  const html = renderizarRegistro();
  assert.doesNotMatch(texto(html), /Ubicación del taller/);
  assert.doesNotMatch(html, /ubicacion-busqueda|registro-ubicacion|Mapa para seleccionar/);
  assert.doesNotMatch(texto(html), /Nombre del taller/);
});

await verificar("13. orden: dirección → ubicación → historia y contactos", () => {
  const html = renderizarRegistro({ intencionInicial: "artesano" });
  const pos = (s) => {
    const i = html.indexOf(s);
    assert.ok(i >= 0, s);
    return i;
  };
  assert.ok(pos('id="taller-direccion"') < pos('id="registro-ubicacion-titulo"'));
  assert.ok(pos('id="registro-ubicacion-titulo"') < pos("Historia y contactos públicos"));
});

await verificar("14. switch de publicación: apagado, deshabilitado y con ayuda", () => {
  const html = renderizarRegistro({ intencionInicial: "artesano" });
  const sw = html.match(/<button[^>]*id="registro-ubicacion-publica"[^>]*>/)?.[0];
  assert.ok(sw, "switch");
  assert.match(sw, /aria-checked="false"/);
  assert.match(sw, /disabled=""/);
  assert.match(sw, /aria-describedby="registro-ubicacion-publica-ayuda"/);
  assert.match(html, /<label[^>]*for="registro-ubicacion-publica"/);
  assert.match(texto(html), /Mostrar mi ubicación en el mapa público/);
  // El perfil conserva sus textos e identificadores.
  const perfil = m.servidor.renderToStaticMarkup(
    h(m.seccion.SeccionUbicacionTaller, {
      value: { ubicacion: MONIMBO, publica: false },
      onChange: noop,
      disabled: false,
    }),
  );
  assert.match(perfil, /id="perfil-ubicacion-publica"/);
  assert.match(texto(perfil), /Guardar cambios/);
  assert.doesNotMatch(texto(perfil), /\(opcional\)/);
});

await verificar("15. con ubicación en registro: la ayuda aclara que espera la aprobación", () => {
  const html = m.servidor.renderToStaticMarkup(
    h(m.seccion.SeccionUbicacionTaller, {
      contexto: "registro",
      value: { ubicacion: MONIMBO, publica: false },
      onChange: noop,
      disabled: false,
      error: "La latitud no es válida.",
    }),
  );
  assert.match(texto(html), /una vez que tu taller sea aprobado/);
  const sw = html.match(/<button[^>]*id="registro-ubicacion-publica"[^>]*>/)[0];
  assert.doesNotMatch(sw, /disabled=""/);
  assert.match(html, /<p role="alert"[^>]*>La latitud no es válida\.<\/p>/);
});

// La sección no usa hooks: se evalúa como función y se accionan los callbacks reales
// que reciben el selector de GEO-02 y el switch, igual que al hacer clic.
function hijos(nodo) {
  const c = nodo?.props?.children;
  return (Array.isArray(c) ? c : [c]).flat(Infinity).filter((x) => x && typeof x === "object");
}
function buscar(nodo, pred) {
  if (pred(nodo)) return nodo;
  for (const hijo of hijos(nodo)) {
    const r = buscar(hijo, pred);
    if (r) return r;
  }
  return null;
}
/** Estado del formulario + acciones del usuario sobre la sección real. */
function seccionInteractiva() {
  let estado = m.registro.UBICACION_REGISTRO_INICIAL;
  const arbol = () =>
    m.seccion.SeccionUbicacionTaller({
      contexto: "registro",
      value: estado,
      onChange: (actualizar) => {
        estado = actualizar(estado);
      },
      disabled: false,
    });
  const selector = () => buscar(arbol(), (n) => n.type === m.selector.SelectorUbicacionTaller);
  const sw = () => buscar(arbol(), (n) => n.props?.id === "registro-ubicacion-publica");
  return {
    get estado() {
      return estado;
    },
    elegir: (u) => selector().props.onChange(u),
    quitar: () => selector().props.onChange(null),
    publicar: (v) => sw().props.onCheckedChange(v),
    swDeshabilitado: () => sw().props.disabled,
  };
}

const CUENTA_FORM = { ...CUENTA, confirmacion: CUENTA.password };
const TALLER_FORM = { ...m.validacion.TALLER_VACIO, ...TALLER };
async function enviarRegistro(intencion, ubicacion, taller = TALLER_FORM) {
  const s = m.registro.solicitudDeRegistro(intencion, CUENTA_FORM, taller, ubicacion);
  assert.ok(s.valida, JSON.stringify(s.errores));
  peticiones = [];
  if (s.rol === "artesano") await m.auth.registrarArtesano(s.entrada);
  else await m.auth.registrarComprador(s.entrada);
  const enviados = posts();
  assert.equal(enviados.length, 1);
  assert.equal(peticiones.filter((p) => p.metodo === "PATCH").length, 0);
  return enviados[0];
}

await verificar("16. ubicación opcional: el artesano se registra sin tocar el mapa", async () => {
  assert.deepEqual(m.registro.UBICACION_REGISTRO_INICIAL, { ubicacion: null, publica: false });
  const sec = seccionInteractiva();
  assert.equal(sec.swDeshabilitado(), true);
  const post = await enviarRegistro("artesano", sec.estado);
  assert.equal(post.ruta, "/api/v1/auth/registro/artesano/");
  assert.deepEqual(post.cuerpo.taller, {
    nombre: "Cerámicas Ana",
    rubro: "Cerámica",
    direccion_completa: "Monimbó, Masaya",
  });
});

await verificar("17. ubicación elegida en el selector → mismo POST, privada", async () => {
  const sec = seccionInteractiva();
  sec.elegir(MONIMBO);
  // Elegir (clic, GPS, búsqueda o arrastre) nunca publica.
  assert.deepEqual(sec.estado, { ubicacion: MONIMBO, publica: false });
  sec.elegir({ latitud: 11.972, longitud: -86.096 });
  assert.equal(sec.estado.publica, false);
  const post = await enviarRegistro("artesano", sec.estado);
  assert.deepEqual(post.cuerpo.taller, {
    nombre: "Cerámicas Ana",
    rubro: "Cerámica",
    direccion_completa: "Monimbó, Masaya",
    latitud: 11.972,
    longitud: -86.096,
    ubicacion_publica: false,
  });
});

await verificar("18. publicar solo tras activar el switch", async () => {
  const sec = seccionInteractiva();
  sec.elegir(MONIMBO);
  assert.equal(sec.swDeshabilitado(), false);
  sec.publicar(true);
  sec.elegir({ latitud: 11.97, longitud: -86.09 }); // mover el pin conserva la decisión
  assert.equal(sec.estado.publica, true);
  const post = await enviarRegistro("artesano", sec.estado);
  assert.equal(post.cuerpo.taller.ubicacion_publica, true);
  assert.equal(post.cuerpo.taller.latitud, 11.97);
});

await verificar("19. quitar ubicación tras publicar → sin geodatos ni `true`", async () => {
  const sec = seccionInteractiva();
  sec.elegir(MONIMBO);
  sec.publicar(true);
  sec.quitar();
  assert.deepEqual(sec.estado, { ubicacion: null, publica: false });
  const post = await enviarRegistro("artesano", sec.estado);
  sinGeo(post.cuerpo.taller);
  // Defensa: aunque el estado quedara incoherente, no viaja nada geográfico.
  const incoherente = await enviarRegistro("artesano", { ubicacion: null, publica: true });
  sinGeo(incoherente.cuerpo.taller);
});

await verificar("20. cambiar a comprador: nunca viaja taller ni ubicación", async () => {
  const sec = seccionInteractiva();
  sec.elegir(MONIMBO);
  sec.publicar(true);
  const post = await enviarRegistro("comprador", sec.estado);
  assert.equal(post.ruta, "/api/v1/auth/registro/comprador/");
  assert.deepEqual(post.cuerpo, CUENTA);
  // Volver a «vender» en la misma pantalla recupera la ubicación elegida.
  const vuelta = await enviarRegistro("artesano", sec.estado);
  assert.equal(vuelta.cuerpo.taller.latitud, MONIMBO.latitud);
});

await verificar("21. texto del taller inválido: no se envía nada aunque haya ubicación", () => {
  const s = m.registro.solicitudDeRegistro(
    "artesano",
    CUENTA_FORM,
    { ...TALLER_FORM, direccionCompleta: "  " },
    { ubicacion: MONIMBO, publica: true },
  );
  assert.equal(s.valida, false);
  assert.ok(s.errores["taller.direccionCompleta"]);
  // Los datos de texto que viajan son los validados (recortados).
  const ok = m.registro.solicitudDeRegistro(
    "artesano",
    CUENTA_FORM,
    { ...TALLER_FORM, nombre: "  Cerámicas Ana  " },
    { ubicacion: MONIMBO, publica: false },
  );
  assert.equal(ok.entrada.taller.nombre, "Cerámicas Ana");
  assert.ok(!("confirmacion" in ok.entrada) && !("rol" in ok.entrada));
});

await verificar("22. fuente: sin Leaflet estático y errores GEO en la sección", () => {
  const fuente = readFileSync(
    new URL("../src/features/auth/components/formulario-registro.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(fuente, /from "(leaflet|react-leaflet)"|mapa-ubicacion-leaflet/);
  assert.doesNotMatch(fuente, /selector-ubicacion-registro|geocoding|geolocation/);
  assert.match(fuente, /error=\{errores\[CAMPO_UBICACION_TALLER\]\}/);
  assert.match(fuente, /\.\.\.Object\.keys\(TALLER_VACIO\)[\s\S]*CAMPO_UBICACION_TALLER/);
  assert.doesNotMatch(fuente, /\bPATCH\b|actualizarMiTaller/);
  // El estado del selector es el que llega a la solicitud del único POST.
  assert.match(fuente, /solicitudDeRegistro\(intencion, cuenta, taller, ubicacionTaller\)/);
  assert.match(fuente, /value=\{ubicacionTaller\}\s+onChange=\{setUbicacionTaller\}/);
  // TALLER_VACIO sigue siendo solo texto.
  assert.ok(Object.values(m.validacion.TALLER_VACIO).every((v) => v === ""));
  assert.ok(!("ubicacion" in m.validacion.TALLER_VACIO));
});

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
process.exit(0);
