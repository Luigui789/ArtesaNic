// RF-008 con la sesión real: consulta y edición del perfil propio del taller
// (GET/PATCH /api/v1/talleres/mi-taller/, docs/api/talleres.md §2) contra un backend
// simulado con estado, y el panel «Mi taller» renderizado con react-dom/server.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

// Sin gcTime finito, QueryClient no deja temporizadores que mantengan vivo el proceso.
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
    guard: "@/features/auth/components/requiere-sesion",
    api: "@/features/talleres/api",
    http: "@/features/talleres/http",
    propio: "@/features/talleres/perfil-propio",
    panel: "@/features/talleres/pages/panel-taller",
    moneda: "@/hooks/use-currency",
    notificaciones: "@/features/notificaciones/use-notifications",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

// ---------- Backend simulado ----------

const PERFIL = [
  "nombre",
  "historia",
  "rubro",
  "direccion_completa",
  "horario",
  "telefono_publico",
  "whatsapp_publico",
  "facebook_url",
  "instagram_url",
  "sitio_web",
];
const tallerInicial = (estado = "aprobado") => ({
  id: 7,
  nombre: "Cerámica López",
  historia: "Taller familiar.",
  rubro: "Cerámica artesanal",
  direccion_completa: "Barrio San Juan, Masaya",
  horario: "",
  telefono_publico: "",
  whatsapp_publico: "87776655",
  facebook_url: "",
  instagram_url: "",
  sitio_web: "",
  estado,
  motivo_rechazo: estado === "rechazado" ? "Faltan datos de contacto." : "",
  revisado_en: estado === "pendiente" ? null : "2026-10-21T10:00:00-06:00",
  creado_en: "2026-10-20T10:00:00-06:00",
  actualizado_en: "2026-10-21T10:00:00-06:00",
});

let srv;
let peticiones = [];
const reiniciar = (estado) => {
  srv = { taller: tallerInicial(estado), accesos: new Set(["acc-1"]), refresh: true };
  peticiones = [];
  m.lib.nuevaEpoca();
  m.lib.establecerTokenDeAcceso("acc-1");
};
const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });

globalThis.fetch = async (url, init = {}) => {
  const ruta = String(url);
  const metodo = init.method ?? "GET";
  const cabeceras = init.headers ?? {};
  const cuerpo = init.body ? JSON.parse(init.body) : undefined;
  peticiones.push({ ruta, metodo, cabeceras, cuerpo, credentials: init.credentials });
  const autenticado = srv.accesos.has(cabeceras.Authorization?.replace(/^Bearer /, ""));
  if (ruta === "/api/v1/auth/csrf/") return json(200, { csrf_token: "csrf-1" });
  if (ruta === "/api/v1/auth/refrescar/") {
    if (!srv.refresh) return json(401, { detail: "La sesión no es válida o expiró." });
    srv.accesos.add("acc-2");
    return json(200, { access: "acc-2" });
  }
  if (ruta !== "/api/v1/talleres/mi-taller/") return json(404, { detail: "No encontrado." });
  if (!autenticado) return json(401, { detail: "Token caducado." });
  if (metodo === "GET") return json(200, srv.taller);
  // PATCH: como PerfilTallerEntradaSerializer (campos desconocidos y vacíos obligatorios).
  const extra = Object.keys(cuerpo).filter((k) => !PERFIL.includes(k));
  if (extra.length)
    return json(400, Object.fromEntries(extra.map((k) => [k, ["Campo no permitido."]])));
  const errores = {};
  for (const k of ["nombre", "rubro", "direccion_completa"])
    if (k in cuerpo && !cuerpo[k].trim()) errores[k] = ["Este campo no puede estar en blanco."];
  if (cuerpo.telefono_publico && !/^\d{8}$/.test(cuerpo.telefono_publico.replace(/\D/g, "")))
    errores.telefono_publico = ["Ingresa un teléfono de Nicaragua de 8 dígitos."];
  if (Object.keys(errores).length) return json(400, errores);
  for (const [k, v] of Object.entries(cuerpo))
    srv.taller[k] = k.endsWith("_publico") && v ? v.replace(/\D/g, "").slice(-8) : v;
  return json(200, srv.taller); // editar no cambia el estado
};

// ---------- Utilidades ----------

const grupos = [];
async function verificar(nombre, fn) {
  reiniciar("aprobado");
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
const CARLA = { id: 41, nombre: "Carla Compradora", telefono: "85551234", rol: "comprador" };
const adaptador = (usuario) => ({
  restaurar: async () => usuario,
  iniciarSesion: async () => usuario,
  registrarComprador: async () => usuario,
  registrarArtesano: async () => usuario,
  cerrarSesion: async () => undefined,
  alExpirar: () => () => undefined,
});
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function renderizar(nodo, { usuario = ARTURO, queryClient, ruta = "/panel" } = {}) {
  const h = m.React.createElement;
  const qc = queryClient ?? new m.rq.QueryClient(SIN_TEMPORIZADORES);
  const ctrl = m.sesion.crearControladorSesion(adaptador(usuario), {
    cancelQueries: async () => undefined,
    clear: () => undefined, // no vaciar la caché precargada del render
  });
  await ctrl.iniciarSesion({ telefono: "", password: "" });
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
/** QueryClient con el taller propio ya cargado, como tras el GET del panel. */
async function conTaller(usuarioId = 42) {
  const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  qc.setQueryData(m.propio.claveMiTaller(usuarioId), await m.http.getMiTaller());
  return qc;
}

// ---------- Cliente ----------

await verificar("1. GET de mi taller real con estado y revisión validados", async () => {
  const t = await m.api.getMiTaller();
  assert.equal(t.estado, "aprobado");
  assert.equal(t.direccion, "Barrio San Juan, Masaya");
  assert.equal(t.revisadoEn, "2026-10-21T10:00:00-06:00");
  const [get] = peticiones;
  assert.equal(get.cabeceras.Authorization, "Bearer acc-1");
  assert.equal(get.credentials, "include");
});

await verificar(
  "4-9/11. PATCH parcial: nombre, rubro, dirección, contactos; sigue aprobado",
  async () => {
    const original = m.propio.perfilEditableDe(await m.api.getMiTaller());
    const editado = {
      ...original,
      nombre: " Cerámica López e Hijos ",
      rubro: "Cerámica y barro",
      direccionCompleta: "Barrio San Juan, 2 c. al sur, Masaya",
      horario: "Lunes a sábado",
      telefonoPublico: "8222 3344",
      whatsappPublico: "", // retirar un contacto
      instagramUrl: "https://instagram.com/ceramicalopez",
    };
    const cambios = m.propio.cambiosDelPerfil(original, editado);
    const actualizado = await m.api.actualizarMiTaller({
      ...cambios,
      // Aunque la interfaz recibiera campos privilegiados, la lista cerrada no los envía.
      estado: "pendiente",
      propietario: 1,
      motivo_rechazo: "",
      revisado_en: null,
      id: 99,
    });
    const [patch] = patches();
    assert.deepEqual(patch.cuerpo, {
      nombre: "Cerámica López e Hijos",
      rubro: "Cerámica y barro",
      direccion_completa: "Barrio San Juan, 2 c. al sur, Masaya",
      horario: "Lunes a sábado",
      telefono_publico: "8222 3344",
      whatsapp_publico: "",
      instagram_url: "https://instagram.com/ceramicalopez",
    });
    for (const prohibido of ["estado", "propietario", "motivo_rechazo", "revisado_en", "id"])
      assert.equal(prohibido in patch.cuerpo, false, prohibido);
    assert.equal(patch.cabeceras.Authorization, "Bearer acc-1");
    assert.equal(actualizado.estado, "aprobado");
    assert.equal(actualizado.nombre, "Cerámica López e Hijos");
    assert.equal(actualizado.whatsapp, "");
    // Sin cambios no hay petición; campos sin tocar no viajan.
    assert.deepEqual(m.propio.cambiosDelPerfil(original, { ...original }), {});
    assert.deepEqual(m.propio.cambiosDelPerfil(original, { ...original, historia: "Nueva" }), {
      historia: "Nueva",
    });
  },
);

await verificar("12. pendiente y rechazado también editan, sin cambiar de estado", async () => {
  for (const estado of ["pendiente", "rechazado"]) {
    reiniciar(estado);
    const t = await m.api.actualizarMiTaller({ historia: "Corregida" });
    assert.equal(t.estado, estado);
    assert.equal(t.historia, "Corregida");
  }
});

await verificar("13. errores 400 se muestran por campo del formulario", async () => {
  await assert.rejects(
    m.api.actualizarMiTaller({ direccionCompleta: "  ", telefonoPublico: "123" }),
    (error) => {
      assert.equal(error.status, 400);
      const fallo = m.propio.erroresDelPerfil(error.campos);
      assert.deepEqual(fallo.campos, {
        direccionCompleta: "Este campo no puede estar en blanco.",
        telefonoPublico: "Ingresa un teléfono de Nicaragua de 8 dígitos.",
      });
      return true;
    },
  );
  // Un error sin campo del formulario (p. ej. campo no permitido) es mensaje general.
  assert.equal(
    m.propio.erroresDelPerfil({ estado: ["Campo no permitido."] }).general,
    "Campo no permitido.",
  );
  assert.equal(srv.taller.direccion_completa, "Barrio San Juan, Masaya");
});

await verificar("14. 401 en el PATCH usa la renovación y el reintento comunes", async () => {
  srv.accesos.delete("acc-1"); // el acceso caducó
  const t = await m.api.actualizarMiTaller({ horario: "Todos los días" });
  assert.equal(t.horario, "Todos los días");
  assert.deepEqual(
    peticiones.map((p) => `${p.metodo} ${p.ruta}`).filter((r) => !r.includes("/csrf/")),
    [
      "PATCH /api/v1/talleres/mi-taller/",
      "POST /api/v1/auth/refrescar/",
      "PATCH /api/v1/talleres/mi-taller/",
    ],
  );
  assert.equal(patches()[1].cabeceras.Authorization, "Bearer acc-2");
  // Si la renovación también falla, no hay bucle.
  reiniciar("aprobado");
  srv.accesos.clear();
  srv.refresh = false;
  await assert.rejects(m.api.actualizarMiTaller({ horario: "x" }), (e) => e.status === 401);
  assert.equal(patches().length, 1);
});

await verificar("16. modo real: la edición va por HTTP, no por el mock", async () => {
  assert.equal(m.api.actualizarMiTaller, m.http.actualizarMiTaller);
  assert.notEqual(m.api.actualizarMiTaller, m.api.updateArtisan);
  await m.api.actualizarMiTaller({ nombre: "Otro nombre" });
  assert.equal(patches()[0].ruta, "/api/v1/talleres/mi-taller/");
});

await verificar(
  "17/18. caché: mi-taller se reemplaza y el perfil público se invalida",
  async () => {
    const qc = await conTaller();
    qc.setQueryData(["perfil-taller", 7], { id: 7, nombre: "Cerámica López" });
    qc.setQueryData(["perfil-taller", 8], { id: 8, nombre: "Otro taller" });
    qc.setQueryData(["sesion-ajena"], "intacta");
    const actualizado = await m.api.actualizarMiTaller({ nombre: "Cerámica Nueva" });
    m.propio.aplicarTallerActualizado(qc, 42, actualizado);
    assert.equal(qc.getQueryData(m.propio.claveMiTaller(42)).nombre, "Cerámica Nueva");
    assert.equal(qc.getQueryState(["perfil-taller", 7]).isInvalidated, true);
    assert.equal(qc.getQueryState(["perfil-taller", 8]).isInvalidated, false);
    // Editar el taller no vacía la caché ni toca la sesión.
    assert.equal(qc.getQueryData(["sesion-ajena"]), "intacta");
    assert.equal(m.lib.tokenDeAcceso(), "acc-1");
  },
);

// ---------- Interfaz ----------

await verificar("3. artesano aprobado ve «Mi taller» con datos y «Editar perfil»", async () => {
  const html = await renderizar((h) => h(m.panel.default), { queryClient: await conTaller() });
  const t = texto(html);
  assert.match(t, /Tu taller está aprobado\./);
  assert.match(t, /Mi taller/);
  assert.match(t, /Editar perfil/);
  assert.match(t, /Barrio San Juan, Masaya/);
  assert.match(t, /Revisado el/);
  // Estado y revisión son texto, no controles editables.
  assert.doesNotMatch(html, /name="estado"|id="perfil-estado"/);
});

await verificar("2. el formulario carga los datos actuales y no edita el estado", async () => {
  const html = await renderizar((h) => h(m.panel.default, { editarAlAbrir: true }), {
    queryClient: await conTaller(),
    ruta: "/panel/perfil",
  });
  assert.match(html, /aria-label="Editar perfil del taller"/);
  assert.match(
    html,
    /id="perfil-nombre"[^>]*value="Cerámica López"|value="Cerámica López"[^>]*id="perfil-nombre"/,
  );
  assert.match(html, /value="Barrio San Juan, Masaya"/);
  assert.match(html, /value="87776655"/);
  for (const id of ["estado", "motivo", "revisado", "propietario"])
    assert.doesNotMatch(html, new RegExp(`id="perfil-${id}`));
  assert.match(texto(html), /no cambia el estado de aprobación/);
  assert.match(html, /id="perfil-imagen-perfil"/);
  assert.match(html, /id="perfil-imagen-portada"/);
  assert.match(texto(html), /Cambiar imagen de perfil/);
  assert.match(texto(html), /Cambiar imagen de portada/);
  const archivo = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
  const form = m.http.cuerpoPerfilTaller({ imagenPerfil: archivo });
  assert.ok(form instanceof FormData);
  assert.equal(form.get("imagen_perfil"), archivo);
  assert.equal(form.get("imagen_portada"), null);
});

await verificar(
  "10/11. tras guardar, la UI muestra los datos nuevos y sigue aprobado",
  async () => {
    const qc = await conTaller();
    m.propio.aplicarTallerActualizado(
      qc,
      42,
      await m.api.actualizarMiTaller({ nombre: "Cerámica Renovada", horario: "Lun-Sáb 8-17" }),
    );
    const t = texto(await renderizar((h) => h(m.panel.default), { queryClient: qc }));
    assert.match(t, /Cerámica Renovada/);
    assert.match(t, /Lun-Sáb 8-17/);
    assert.match(t, /Tu taller está aprobado\./);
    assert.doesNotMatch(t, /Cerámica López /);
  },
);

await verificar("pendiente y rechazado: aviso del servidor y edición disponible", async () => {
  reiniciar("pendiente");
  const pendiente = texto(
    await renderizar((h) => h(m.panel.default), { queryClient: await conTaller() }),
  );
  assert.match(pendiente, /Tu taller está pendiente de aprobación\./);
  assert.match(pendiente, /Editar perfil/);
  reiniciar("rechazado");
  const rechazado = texto(
    await renderizar((h) => h(m.panel.default), { queryClient: await conTaller() }),
  );
  assert.match(rechazado, /Motivo: Faltan datos de contacto\./);
  assert.match(rechazado, /Editar perfil/);
});

await verificar("15. un comprador no obtiene controles de edición", async () => {
  const html = await renderizar(
    (h) =>
      h(m.guard.RequiereSesion, { rol: "artesano" }, h(m.panel.default, { editarAlAbrir: true })),
    { usuario: CARLA, queryClient: await conTaller(41), ruta: "/panel/perfil" },
  );
  assert.match(texto(html), /Esta sección es para cuentas de artesano/);
  assert.doesNotMatch(html, /Editar perfil|perfil-nombre/);
});

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
// El runtime de react-dom/server (build de navegador) deja canales abiertos que
// mantienen vivo a Node aunque no quede trabajo: se termina explícitamente.
process.exit(0);
