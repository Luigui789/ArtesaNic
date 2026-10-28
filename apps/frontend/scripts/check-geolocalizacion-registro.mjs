// FEAT-GEO-03: ubicación del taller durante el registro del artesano. Contrato de
// POST /api/v1/auth/registro/artesano/ (GEO-01: `taller` admite latitud, longitud y
// ubicacion_publica): cuerpo, redondeo, privacidad defensiva, compatibilidad sin
// ubicación y errores 400 en la sección «Ubicación del taller».
import assert from "node:assert/strict";
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

await verificar("8. errores de latitud, longitud y publicación → taller.ubicacion", async () => {
  assert.equal(m.validacion.CAMPO_UBICACION_TALLER, "taller.ubicacion");
  for (const campo of ["latitud", "longitud", "ubicacion_publica"]) {
    const fallo = await falloDe({ taller: { [campo]: [`Error en ${campo}.`] } });
    assert.deepEqual(fallo.campos, { "taller.ubicacion": `Error en ${campo}.` });
    // Con campo conocido, el mensaje general es el genérico, no el detalle técnico.
    assert.equal(fallo.general, "Revisa los datos marcados.");
  }
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

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
process.exit(0);
