// AUD-18: cliente HTTP común, CSRF, sesión real, renovación y aislamiento de caché,
// contra un backend simulado con el contrato de docs/api/autenticacion.md (CSRF por
// cabecera + cookie, cookie de renovación rotativa, tokens de acceso revocables).
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

// Sin gcTime finito, QueryClient no deja temporizadores que mantengan vivo el proceso.
const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity } } };

// ---------- Almacenamiento del navegador espiado ----------

const escrituras = [];
const almacen = (nombre) => {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => {
      escrituras.push({ nombre, k, v: String(v) });
      datos.set(k, String(v));
    },
    removeItem: (k) => datos.delete(k),
    clear: () => datos.clear(),
  };
};
globalThis.localStorage = almacen("localStorage");
globalThis.sessionStorage = almacen("sessionStorage");

const ENV = { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" };
const { lib, auth, api, sesion, validacion, destino, errores, modo, rq, talleres } =
  await cargarModulos(
    {
      lib: "@/lib/http",
      auth: "@/features/auth/http",
      api: "@/features/auth/api",
      sesion: "@/features/auth/sesion",
      validacion: "@/features/auth/validacion",
      destino: "@/features/auth/destino",
      errores: "@/features/auth/errores",
      modo: "@/features/auth/modo",
      rq: "@tanstack/react-query",
      talleres: "@/features/talleres/http",
    },
    ENV,
  );

// ---------- Backend simulado ----------

const MENSAJE_CSRF = "Falta el token CSRF o no es válido. Solicita uno en /api/v1/auth/csrf/.";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function crearServidor() {
  return {
    csrf: "csrf-1",
    cookieCsrf: false,
    /** Cookie `refresh` del navegador (el JS de la página nunca la ve). */
    cookieRefresh: null,
    renovacionesValidas: new Map(),
    accesos: new Map(),
    usuarios: [
      {
        id: 41,
        nombre: "Carla Compradora",
        telefono: "85551234",
        password: "Clave-segura-1",
        rol: "comprador",
      },
      {
        id: 42,
        nombre: "Arturo Artesano",
        telefono: "87779090",
        password: "Clave-segura-2",
        rol: "artesano",
      },
    ],
    talleres: new Map(),
    secuencia: 100,
    caido: false,
    retrasoRefrescar: 0,
    /** Respuestas forzadas por ruta (se consumen en orden). */
    forzadas: new Map(),
  };
}

let srv = crearServidor();
let peticiones = [];

const json = (status, cuerpo, cabeceras = {}) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json", ...cabeceras },
  });
const publico = ({ id, nombre, telefono, rol }) => ({ id, nombre, telefono, rol });

function emitirSesion(usuario) {
  const access = `acc-${++srv.secuencia}`;
  const refresh = `ref-${++srv.secuencia}`;
  srv.accesos.set(access, usuario.id);
  srv.renovacionesValidas.set(refresh, usuario.id);
  srv.cookieRefresh = refresh;
  return { access, usuario: publico(usuario) };
}

function csrfValido(cabeceras) {
  return srv.cookieCsrf && cabeceras["X-CSRFToken"] === srv.csrf;
}

function camposExactos(cuerpo, permitidos) {
  const extra = Object.keys(cuerpo ?? {}).filter((k) => !permitidos.includes(k));
  return extra.length ? Object.fromEntries(extra.map((k) => [k, ["Campo no permitido."]])) : null;
}

globalThis.fetch = async (url, init = {}) => {
  const ruta = String(url);
  const cabeceras = init.headers ?? {};
  const cuerpo = init.body ? JSON.parse(init.body) : undefined;
  peticiones.push({
    ruta,
    metodo: init.method ?? "GET",
    cabeceras,
    credentials: init.credentials,
    cuerpo,
  });
  if (srv.caido) throw new TypeError("fetch failed");
  const forzada = srv.forzadas.get(ruta)?.shift();
  if (forzada) return forzada();

  const usuarioDeBearer = () => {
    const token = cabeceras.Authorization?.replace(/^Bearer /, "");
    const id = token ? srv.accesos.get(token) : undefined;
    return srv.usuarios.find((u) => u.id === id);
  };

  switch (ruta) {
    case "/api/v1/auth/csrf/":
      srv.cookieCsrf = true;
      return json(200, { csrf_token: srv.csrf });
    case "/api/v1/auth/login/": {
      if (!csrfValido(cabeceras)) return json(403, { detail: MENSAJE_CSRF });
      const extra = camposExactos(cuerpo, ["telefono", "password"]);
      if (extra) return json(400, extra);
      const tel = cuerpo.telefono.replace(/\D/g, "").slice(-8);
      const u = srv.usuarios.find((x) => x.telefono === tel && x.password === cuerpo.password);
      if (!u) return json(401, { detail: "Teléfono o contraseña incorrectos." });
      return json(200, emitirSesion(u));
    }
    case "/api/v1/auth/registro/comprador/":
    case "/api/v1/auth/registro/artesano/": {
      if (!csrfValido(cabeceras)) return json(403, { detail: MENSAJE_CSRF });
      const esArtesano = ruta.includes("artesano");
      const extra = camposExactos(cuerpo, [
        "nombre",
        "telefono",
        "password",
        ...(esArtesano ? ["taller"] : []),
      ]);
      if (extra) return json(400, extra);
      if (esArtesano) {
        const faltan = ["nombre", "rubro", "direccion_completa"].filter((c) => !cuerpo.taller?.[c]);
        if (faltan.length)
          return json(400, {
            taller: Object.fromEntries(faltan.map((c) => [c, ["Este campo es requerido."]])),
          });
      }
      const tel = cuerpo.telefono.replace(/\D/g, "").slice(-8);
      if (srv.usuarios.some((u) => u.telefono === tel))
        return json(400, { telefono: ["Ya existe una cuenta con este teléfono."] });
      const u = {
        id: ++srv.secuencia,
        nombre: cuerpo.nombre,
        telefono: tel,
        password: cuerpo.password,
        rol: esArtesano ? "artesano" : "comprador",
      };
      srv.usuarios.push(u);
      if (esArtesano) srv.talleres.set(u.id, { ...cuerpo.taller, estado: "pendiente" });
      return json(201, emitirSesion(u));
    }
    case "/api/v1/auth/refrescar/": {
      if (!csrfValido(cabeceras)) return json(403, { detail: MENSAJE_CSRF });
      if (srv.retrasoRefrescar) await esperar(srv.retrasoRefrescar);
      const id = srv.cookieRefresh ? srv.renovacionesValidas.get(srv.cookieRefresh) : undefined;
      if (id === undefined)
        return json(401, { detail: "La sesión no es válida o expiró. Inicia sesión de nuevo." });
      srv.renovacionesValidas.delete(srv.cookieRefresh); // rotación: la anterior queda revocada
      const refresh = `ref-${++srv.secuencia}`;
      const access = `acc-${++srv.secuencia}`;
      srv.renovacionesValidas.set(refresh, id);
      srv.accesos.set(access, id);
      srv.cookieRefresh = refresh;
      return json(200, { access });
    }
    case "/api/v1/auth/logout/":
      if (!csrfValido(cabeceras)) return json(403, { detail: MENSAJE_CSRF });
      if (srv.cookieRefresh) srv.renovacionesValidas.delete(srv.cookieRefresh);
      srv.cookieRefresh = null;
      return new Response(null, { status: 204 });
    case "/api/v1/auth/perfil/": {
      const u = usuarioDeBearer();
      return u ? json(200, publico(u)) : json(401, { detail: "La sesión no es válida o expiró." });
    }
    case "/api/v1/privado/": {
      const u = usuarioDeBearer();
      return u ? json(200, { propietario: u.id }) : json(401, { detail: "Token caducado." });
    }
    case "/api/v1/talleres/mi-taller/": {
      const u = usuarioDeBearer();
      if (!u) return json(401, { detail: "Sin sesión." });
      if (u.rol !== "artesano") return json(403, { detail: "Solo artesanos." });
      const t = srv.talleres.get(u.id);
      if (!t) return json(404, { detail: "No encontrado." });
      return json(200, {
        id: 7,
        nombre: t.nombre,
        historia: t.historia ?? "",
        rubro: t.rubro,
        direccion_completa: t.direccion_completa,
        horario: t.horario ?? "",
        telefono_publico: t.telefono_publico ?? "",
        whatsapp_publico: t.whatsapp_publico ?? "",
        facebook_url: "",
        instagram_url: "",
        sitio_web: "",
        latitud: null,
        longitud: null,
        ubicacion_publica: false,
        estado: t.estado,
        motivo_rechazo: "",
        revisado_en: null,
        creado_en: "2026-10-21T10:00:00-06:00",
        actualizado_en: "2026-10-21T10:00:00-06:00",
      });
    }
    default:
      return json(404, { detail: "No encontrado." });
  }
};

// ---------- Utilidades de prueba ----------

const grupos = [];
async function verificar(nombre, fn) {
  // Cada caso empieza sin sesión en memoria y con un servidor nuevo.
  lib.nuevaEpoca();
  // Mismo navegador: la cookie csrftoken y su token en memoria sobreviven entre casos.
  const { csrf, cookieCsrf } = srv;
  srv = Object.assign(crearServidor(), { csrf, cookieCsrf });
  peticiones = [];
  escrituras.length = 0;
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos.push(nombre);
}

const todas = () => peticiones.map((p) => `${p.metodo} ${p.ruta.replace("/api/v1", "")}`);
/** Rutas sin `GET /auth/csrf/`, que depende de si ya hay un token CSRF en memoria. */
const rutas = () => todas().filter((r) => r !== "GET /auth/csrf/");
const de = (ruta) => peticiones.filter((p) => p.ruta === `/api/v1${ruta}`);
const COMPRADOR = { telefono: "8555 1234", password: "Clave-segura-1" };
const ARTESANO = { telefono: "+505 8777-9090", password: "Clave-segura-2" };
const TALLER = {
  nombre: "Cerámica López",
  rubro: "Cerámica artesanal",
  direccionCompleta: "Barrio San Juan, Masaya",
  historia: "",
  horario: "  ",
  telefonoPublico: "",
  whatsappPublico: "8777 6655",
  facebookUrl: "",
  instagramUrl: "",
  sitioWeb: "",
};

function nuevoControlador() {
  const queryClient = new rq.QueryClient(SIN_TEMPORIZADORES);
  const controlador = sesion.crearControladorSesion(api.adaptadorSesion, queryClient);
  return { queryClient, controlador };
}

async function hastaQueCargue(controlador) {
  controlador.iniciar();
  for (let i = 0; i < 200 && controlador.obtener().estado === "cargando"; i++) await esperar(1);
  return controlador.obtener();
}

const sinEscriturasDeSesion = () => {
  for (const e of escrituras) {
    assert.doesNotMatch(e.v, /acc-|ref-|csrf-/, `${e.nombre} recibió un token`);
    assert.doesNotMatch(e.v, /"rol"/, `${e.nombre} recibió una identidad`);
  }
};

// ---------- Modo explícito ----------

await verificar("modo explícito real/mock sin vuelta silenciosa", () => {
  assert.equal(modo.modoAuth, "real");
  assert.equal(api.modoAuth, "real");
  assert.equal(modo.leerModoAuth(undefined, "mock"), "mock");
  assert.equal(modo.leerModoAuth("mock", "mock"), "mock");
  assert.equal(modo.leerModoAuth("real", "real"), "real");
  assert.throws(() => modo.leerModoAuth("Real", "real"), /VITE_AUTH_API/);
  assert.throws(() => modo.leerModoAuth("real", "mock"), /VITE_CATALOGO_API=real/);
});

// ---------- 1-3, 31: arranque ----------

await verificar("1/3. inicio sin cookie: renovación 401 → anónima, sin perfil", async () => {
  const { controlador } = nuevoControlador();
  const estado = await hastaQueCargue(controlador);
  assert.equal(estado.estado, "anonima");
  assert.equal(estado.usuario, null);
  // Primer uso: sin token CSRF en memoria se pide antes de renovar.
  assert.deepEqual(todas(), ["GET /auth/csrf/", "POST /auth/refrescar/"]);
  assert.equal(lib.tokenDeAcceso(), null);
});

await verificar("2. renovación válida → perfil del servidor restaurado", async () => {
  emitirSesion(srv.usuarios[1]); // cookie de una sesión anterior (recarga)
  peticiones = [];
  const { controlador } = nuevoControlador();
  const estado = await hastaQueCargue(controlador);
  assert.equal(estado.estado, "autenticada");
  assert.deepEqual(estado.usuario, publico(srv.usuarios[1]));
  assert.deepEqual(rutas(), ["POST /auth/refrescar/", "GET /auth/perfil/"]);
  // El perfil se pide con el token recién renovado.
  assert.equal(de("/auth/perfil/")[0].cabeceras.Authorization, `Bearer ${lib.tokenDeAcceso()}`);
});

await verificar("31. red caída: estado de error, sin sesión demo", async () => {
  srv.caido = true;
  const { controlador } = nuevoControlador();
  const estado = await hastaQueCargue(controlador);
  assert.equal(estado.estado, "error");
  assert.equal(estado.usuario, null);
  assert.match(estado.error, /conectar/);
  // Reintentar con el servidor disponible y sin cookie: anónima, nunca demo.
  srv.caido = false;
  await controlador.reintentar();
  assert.equal(controlador.obtener().estado, "anonima");
});

await verificar("StrictMode: iniciar dos veces lanza una sola renovación", async () => {
  emitirSesion(srv.usuarios[0]);
  peticiones = [];
  const { controlador } = nuevoControlador();
  controlador.iniciar();
  await hastaQueCargue(controlador);
  assert.equal(de("/auth/refrescar/").length, 1);
  assert.equal(controlador.obtener().estado, "autenticada");
});

// ---------- 4-6, 14-19, 32, 34: login ----------

await verificar("4/6/19. login comprador: sin rol, con CSRF y credenciales", async () => {
  const { controlador } = nuevoControlador();
  await hastaQueCargue(controlador);
  peticiones = [];
  const usuario = await controlador.iniciarSesion({ ...COMPRADOR, rol: "artesano" });
  assert.deepEqual(usuario, publico(srv.usuarios[0]));
  assert.equal(controlador.obtener().estado, "autenticada");
  const [login] = de("/auth/login/");
  assert.deepEqual(Object.keys(login.cuerpo).sort(), ["password", "telefono"]);
  assert.equal(login.cabeceras["X-CSRFToken"], srv.csrf);
  assert.equal(login.cabeceras.Authorization, undefined);
  assert.deepEqual(auth.cuerpoLogin({ ...COMPRADOR, rol: "artesano", is_staff: true }), COMPRADOR);
});

await verificar("5/34. login artesano: el rol y el destino salen del servidor", async () => {
  const { controlador } = nuevoControlador();
  const usuario = await controlador.iniciarSesion(ARTESANO);
  assert.equal(usuario.rol, "artesano");
  assert.equal(usuario.id, 42);
  assert.equal(destino.destinoTrasAcceso(usuario.rol), "/panel");
  assert.equal(destino.destinoTrasAcceso("comprador"), "/catalogo");
  // Un destino previo del otro rol, externo o de /auth se descarta.
  assert.equal(destino.destinoTrasAcceso("artesano", "/solicitudes/3"), "/panel");
  assert.equal(destino.destinoTrasAcceso("comprador", "/panel/productos"), "/catalogo");
  assert.equal(destino.destinoTrasAcceso("comprador", "//malicioso.example"), "/catalogo");
  assert.equal(destino.destinoTrasAcceso("comprador", "/\\malicioso.example"), "/catalogo");
  assert.equal(destino.destinoTrasAcceso("comprador", "https://x.example"), "/catalogo");
  assert.equal(destino.destinoTrasAcceso("comprador", "/auth"), "/catalogo");
  assert.equal(destino.destinoTrasAcceso("comprador", "/solicitudes/3"), "/solicitudes/3");
  assert.equal(destino.destinoTrasAcceso("artesano", "/panel/productos"), "/panel/productos");
});

await verificar("14-16/17/18. token solo en memoria, Bearer correcto y credentials", async () => {
  const { controlador } = nuevoControlador();
  await hastaQueCargue(controlador);
  await controlador.iniciarSesion(COMPRADOR);
  const token = lib.tokenDeAcceso();
  assert.match(token, /^acc-/);
  const privado = await lib.solicitar("/privado/", { autenticada: true });
  assert.equal(privado.propietario, 41);
  assert.equal(de("/privado/")[0].cabeceras.Authorization, `Bearer ${token}`);
  for (const p of peticiones) assert.equal(p.credentials, "include", p.ruta);
  // Nada de la sesión real toca el almacenamiento del navegador.
  assert.equal(escrituras.length, 0);
  sinEscriturasDeSesion();
  // La cookie de renovación nunca llega al JavaScript de la página.
  for (const p of peticiones) assert.doesNotMatch(JSON.stringify(p.cuerpo ?? {}), /ref-/);
});

await verificar("32. modo real: sin identidad ni vista demo", async () => {
  const { controlador } = nuevoControlador();
  assert.equal(api.adaptadorSesion.cambiarVista, undefined);
  assert.equal(controlador.cambiarVistaDemo, null);
  const u = await controlador.iniciarSesion(ARTESANO);
  assert.notEqual(u.id, api.DEMO_USER_ID);
  assert.equal("artesanoId" in u, false);
  srv.caido = true;
  await assert.rejects(controlador.iniciarSesion(COMPRADOR), (e) => e.status === 0);
  // El fallo no cambia la identidad ni fabrica otra.
  assert.equal(controlador.obtener().usuario.id, 42);
});

// ---------- 7-11, 20: registro ----------

await verificar("7/8/20. registro de comprador: endpoint propio, sin rol, con CSRF", async () => {
  const { controlador } = nuevoControlador();
  const u = await controlador.registrarComprador({
    nombre: "Nueva Compradora",
    telefono: "8222 3344",
    password: "Otra-clave-9",
    rol: "artesano",
    is_staff: true,
  });
  assert.equal(u.rol, "comprador");
  assert.equal(de("/auth/registro/artesano/").length, 0);
  const [registro] = de("/auth/registro/comprador/");
  assert.deepEqual(registro.cuerpo, {
    nombre: "Nueva Compradora",
    telefono: "8222 3344",
    password: "Otra-clave-9",
  });
  assert.equal(registro.cabeceras["X-CSRFToken"], srv.csrf);
  assert.equal(lib.tokenDeAcceso() !== null, true);
});

await verificar("9/10. registro de artesano: endpoint propio y taller pendiente", async () => {
  const { controlador } = nuevoControlador();
  const u = await controlador.registrarArtesano({
    nombre: "Ana Lucía",
    telefono: "8333 4455",
    password: "Tejido-de-Masaya-2026",
    taller: TALLER,
  });
  assert.equal(u.rol, "artesano");
  assert.equal(de("/auth/registro/comprador/").length, 0);
  const [registro] = de("/auth/registro/artesano/");
  assert.equal(registro.cabeceras["X-CSRFToken"], srv.csrf);
  // snake_case del contrato, solo los opcionales escritos: el teléfono de acceso no se publica.
  assert.deepEqual(registro.cuerpo.taller, {
    nombre: "Cerámica López",
    rubro: "Cerámica artesanal",
    direccion_completa: "Barrio San Juan, Masaya",
    whatsapp_publico: "8777 6655",
  });
  assert.equal("rol" in registro.cuerpo, false);
  // El estado del taller lo da el servidor.
  const taller = await talleres.getMiTaller();
  assert.equal(taller.estado, "pendiente");
  assert.equal(taller.direccion, "Barrio San Juan, Masaya");
});

await verificar("11. formulario de artesano exige nombre, rubro y dirección del taller", () => {
  const vacio = validacion.esquemaRegistroArtesano.safeParse({
    nombre: "Ana",
    telefono: "8555 1234",
    password: "Clave-larga-1",
    confirmacion: "Clave-larga-1",
    taller: validacion.TALLER_VACIO,
  });
  assert.equal(vacio.success, false);
  const errs = validacion.erroresDeValidacion(vacio.error);
  assert.ok(errs["taller.nombre"]);
  assert.ok(errs["taller.rubro"]);
  assert.ok(errs["taller.direccionCompleta"]);
  const completo = validacion.esquemaRegistroArtesano.safeParse({
    nombre: "Ana",
    telefono: "+505 8555-1234",
    password: "Clave-larga-1",
    confirmacion: "Clave-larga-1",
    taller: TALLER,
  });
  assert.equal(completo.success, true);
  // Reglas UX alineadas con el backend: 8 caracteres, no solo numérica, Nicaragua.
  const debil = validacion.esquemaRegistroComprador.safeParse({
    nombre: "Ana",
    telefono: "+506 8555 1234",
    password: "1234567",
    confirmacion: "otra",
  });
  const e = validacion.erroresDeValidacion(debil.error);
  assert.ok(e.telefono && e.password && e.confirmacion);
  assert.equal(validacion.esTelefonoNicaragua("(8555) 1234"), true);
  assert.equal(validacion.esTelefonoNicaragua("50585551234"), true);
  assert.equal(validacion.esTelefonoNicaragua("855512345"), false);
});

await verificar("400 del servidor se muestra por campo del formulario", async () => {
  const { controlador } = nuevoControlador();
  await assert.rejects(
    controlador.registrarArtesano({
      nombre: "Ana",
      telefono: "8555 1234",
      password: "Clave-larga-1",
      taller: { ...TALLER, rubro: "" },
    }),
    (error) => {
      const fallo = errores.interpretarFallo(error, ["taller.rubro", "telefono"]);
      assert.deepEqual(fallo.campos, { "taller.rubro": "Este campo es requerido." });
      return true;
    },
  );
  await assert.rejects(
    controlador.registrarComprador({ nombre: "X", telefono: "8555 1234", password: "a-b-c-d-e-f" }),
    (error) => {
      const fallo = errores.interpretarFallo(error, ["telefono"]);
      assert.equal(fallo.campos.telefono, "Ya existe una cuenta con este teléfono.");
      return true;
    },
  );
  assert.equal(controlador.obtener().estado, "cargando"); // nunca se inició: no hay sesión
});

// ---------- 19-22: CSRF ----------

await verificar(
  "21/22. CSRF en refrescar y logout; token CSRF compartido y en memoria",
  async () => {
    const { controlador } = nuevoControlador();
    await controlador.iniciarSesion(COMPRADOR);
    srv.accesos.clear(); // el acceso caducó
    await lib.solicitar("/privado/", { autenticada: true });
    await controlador.cerrarSesion();
    for (const p of [...de("/auth/refrescar/"), ...de("/auth/logout/")]) {
      assert.equal(p.cabeceras["X-CSRFToken"], srv.csrf);
      assert.equal(p.cabeceras.Authorization, undefined);
    }
    // El token CSRF se reutiliza desde memoria: como mucho un GET para todo el flujo.
    assert.ok(de("/auth/csrf/").length <= 1);
  },
);

await verificar("CSRF rotado: 403 de CSRF → token nuevo y un único reintento", async () => {
  const { controlador } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  srv.csrf = "csrf-2"; // la cookie csrftoken cambió
  await controlador.cerrarSesion();
  assert.deepEqual(todas().slice(-3), [
    "POST /auth/logout/",
    "GET /auth/csrf/",
    "POST /auth/logout/",
  ]);
  assert.equal(de("/auth/logout/")[1].cabeceras["X-CSRFToken"], "csrf-2");
});

await verificar("403 de cuenta de administración no se reintenta ni se confunde", async () => {
  const { controlador } = nuevoControlador();
  const detalle =
    "Las cuentas de administración ingresan por Django Admin, no por esta aplicación.";
  srv.forzadas.set("/api/v1/auth/login/", [() => json(403, { detail: detalle })]);
  await assert.rejects(controlador.iniciarSesion(COMPRADOR), (error) => {
    assert.equal(error.status, 403);
    assert.equal(errores.interpretarFallo(error, []).general, detalle);
    return true;
  });
  assert.equal(de("/auth/login/").length, 1);
});

// ---------- 23-25: renovación ----------

await verificar("23. acceso vencido → una renovación → un reintento", async () => {
  const { controlador } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  const viejo = lib.tokenDeAcceso();
  srv.accesos.delete(viejo);
  peticiones = [];
  const r = await lib.solicitar("/privado/", { autenticada: true });
  assert.equal(r.propietario, 41);
  assert.deepEqual(rutas(), ["GET /privado/", "POST /auth/refrescar/", "GET /privado/"]);
  const [primero, reintento] = de("/privado/");
  assert.equal(primero.cabeceras.Authorization, `Bearer ${viejo}`);
  assert.equal(reintento.cabeceras.Authorization, `Bearer ${lib.tokenDeAcceso()}`);
  assert.notEqual(lib.tokenDeAcceso(), viejo);
});

await verificar("24. dos 401 simultáneos → una sola renovación compartida", async () => {
  const { controlador } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  srv.accesos.clear();
  srv.retrasoRefrescar = 20;
  peticiones = [];
  const [a, b, c] = await Promise.all([
    lib.solicitar("/privado/", { autenticada: true }),
    lib.solicitar("/privado/", { autenticada: true }),
    lib.solicitar("/privado/", { autenticada: true }),
  ]);
  assert.deepEqual(
    [a, b, c].map((x) => x.propietario),
    [41, 41, 41],
  );
  assert.equal(de("/auth/refrescar/").length, 1);
  assert.equal(de("/privado/").length, 6); // cada una: original + un reintento
});

await verificar("25. renovación fallida: sin bucle, sesión anónima y caché vacía", async () => {
  const { controlador, queryClient } = nuevoControlador();
  await hastaQueCargue(controlador);
  await controlador.iniciarSesion(COMPRADOR);
  queryClient.setQueryData(["privado", 41], { secreto: "de Carla" });
  srv.accesos.clear();
  srv.renovacionesValidas.clear(); // la sesión fue revocada en el servidor
  peticiones = [];
  await assert.rejects(lib.solicitar("/privado/", { autenticada: true }), (e) => e.status === 401);
  assert.deepEqual(rutas(), ["GET /privado/", "POST /auth/refrescar/"]);
  assert.equal(lib.tokenDeAcceso(), null);
  assert.equal(controlador.obtener().estado, "anonima");
  assert.equal(queryClient.getQueryData(["privado", 41]), undefined);
  // Sin token, una petición autenticada no vuelve a intentar renovar.
  peticiones = [];
  await assert.rejects(lib.solicitar("/privado/", { autenticada: true }), (e) => e.status === 401);
  assert.deepEqual(rutas(), ["GET /privado/"]);
});

await verificar("renovación de la identidad anterior no pisa el login nuevo", async () => {
  const { controlador } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  srv.accesos.clear();
  srv.retrasoRefrescar = 20;
  const pendiente = lib.solicitar("/privado/", { autenticada: true }).catch(() => null);
  await esperar(1);
  srv.retrasoRefrescar = 0;
  // El login espera a que termine la renovación en curso antes de abrir la sesión nueva.
  await controlador.iniciarSesion(ARTESANO);
  await pendiente;
  const r = await lib.solicitar("/privado/", { autenticada: true });
  assert.equal(r.propietario, 42);
});

// ---------- 26-28: logout y aislamiento de caché ----------

await verificar("26/27. logout: revoca en el servidor, borra token y caché", async () => {
  const { controlador, queryClient } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  queryClient.setQueryData(["solicitudes", 41], ["solicitud privada de Carla"]);
  queryClient.setQueryData(["catalogo"], ["público"]);
  const refresh = srv.cookieRefresh;
  await controlador.cerrarSesion();
  assert.equal(controlador.obtener().estado, "anonima");
  assert.equal(controlador.obtener().usuario, null);
  assert.equal(lib.tokenDeAcceso(), null);
  assert.equal(srv.renovacionesValidas.has(refresh), false);
  assert.equal(queryClient.getQueryCache().getAll().length, 0);
  // Tras el logout, recargar no restaura la sesión.
  const otro = nuevoControlador().controlador;
  assert.equal((await hastaQueCargue(otro)).estado, "anonima");
});

await verificar("logout con el acceso caducado sigue funcionando", async () => {
  const { controlador } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  srv.accesos.clear();
  await controlador.cerrarSesion();
  assert.equal(controlador.obtener().estado, "anonima");
  assert.equal(de("/auth/logout/").length, 1);
});

await verificar("logout fallido por red: la sesión sigue abierta y se informa", async () => {
  const { controlador, queryClient } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  queryClient.setQueryData(["privado"], 1);
  srv.caido = true;
  await assert.rejects(controlador.cerrarSesion(), (e) => e.status === 0);
  assert.equal(controlador.obtener().estado, "autenticada");
  assert.notEqual(lib.tokenDeAcceso(), null);
});

await verificar("28. usuario B no ve la caché de A (con y sin logout)", async () => {
  const { controlador, queryClient } = nuevoControlador();
  const pedir = () =>
    queryClient.fetchQuery({
      queryKey: ["mis-datos"],
      queryFn: () => lib.solicitar("/privado/", { autenticada: true }),
      staleTime: Infinity,
    });
  await controlador.iniciarSesion(COMPRADOR);
  assert.equal((await pedir()).propietario, 41);
  await controlador.cerrarSesion();
  await controlador.iniciarSesion(ARTESANO);
  assert.equal(queryClient.getQueryData(["mis-datos"]), undefined);
  assert.equal((await pedir()).propietario, 42);
  // Cambio de cuenta sin logout explícito: también se vacía antes de publicar a A.
  await controlador.iniciarSesion(COMPRADOR);
  assert.equal(queryClient.getQueryData(["mis-datos"]), undefined);
  assert.equal((await pedir()).propietario, 41);
});

await verificar("la identidad nueva se publica con la caché ya vacía", async () => {
  const { controlador, queryClient } = nuevoControlador();
  await controlador.iniciarSesion(COMPRADOR);
  queryClient.setQueryData(["mis-datos"], "de A");
  const vistos = [];
  controlador.suscribir(() =>
    vistos.push([controlador.obtener().usuario?.id, queryClient.getQueryData(["mis-datos"])]),
  );
  await controlador.iniciarSesion(ARTESANO);
  assert.deepEqual(vistos, [[42, undefined]]);
});

// ---------- 29-30: contrato y errores ----------

await verificar("29. DTO de sesión inválido se rechaza sin crear sesión", async () => {
  const { controlador } = nuevoControlador();
  const invalidos = [
    { access: "acc-x", usuario: { id: 9, nombre: "Admin", telefono: "8", rol: "administrador" } },
    { usuario: { id: 9, nombre: "Sin token", telefono: "8", rol: "comprador" } },
    { access: "acc-x", usuario: { id: "9", nombre: "Id texto", telefono: "8", rol: "comprador" } },
  ];
  for (const cuerpo of invalidos) {
    srv.forzadas.set("/api/v1/auth/login/", [() => json(200, cuerpo)]);
    await assert.rejects(controlador.iniciarSesion(COMPRADOR), (e) => {
      assert.equal(e.name, "RespuestaInvalidaError");
      return true;
    });
    assert.equal(controlador.obtener().usuario, null);
    assert.equal(lib.tokenDeAcceso(), null);
  }
  // Renovación sin `access` y perfil con otra forma tampoco crean sesión.
  emitirSesion(srv.usuarios[0]);
  srv.forzadas.set("/api/v1/auth/perfil/", [() => json(200, { id: 41, nombre: "Sin rol" })]);
  const recarga = nuevoControlador().controlador;
  const estado = await hastaQueCargue(recarga);
  assert.equal(estado.estado, "error");
  assert.equal(estado.usuario, null);
  // Mi taller con un estado desconocido también se rechaza.
  lib.nuevaEpoca();
  await controlador.iniciarSesion(ARTESANO);
  srv.talleres.set(42, { ...TALLER, direccion_completa: "x", estado: "aprobado_local" });
  await assert.rejects(talleres.getMiTaller(), (e) => e.name === "RespuestaInvalidaError");
});

await verificar("30. 429 respeta Retry-After y no se presenta como credenciales", async () => {
  const { controlador } = nuevoControlador();
  srv.forzadas.set("/api/v1/auth/login/", [
    () =>
      json(
        429,
        { detail: "Solicitud fue regulada (throttled). Se espera en 30 segundos." },
        { "Retry-After": "30" },
      ),
    () => json(429, { detail: "Solicitud fue regulada." }, { "Retry-After": "3600" }),
    () => json(429, { detail: "Solicitud fue regulada." }),
  ]);
  await assert.rejects(controlador.iniciarSesion(COMPRADOR), (e) => {
    assert.equal(e.status, 429);
    assert.equal(e.reintentarEn, 30);
    const { general, campos } = errores.interpretarFallo(e, ["telefono", "password"]);
    assert.match(general, /30 segundos/);
    assert.doesNotMatch(general, /incorrect/i);
    assert.deepEqual(campos, {});
    return true;
  });
  await assert.rejects(controlador.iniciarSesion(COMPRADOR), (e) => /60 minutos/.test(e.message));
  await assert.rejects(controlador.iniciarSesion(COMPRADOR), (e) => {
    assert.equal(e.reintentarEn, undefined);
    assert.match(e.message, /demasiados intentos/i);
    return true;
  });
  // 401 de credenciales conserva el texto del servidor; 5xx y red son "servicio".
  await assert.rejects(controlador.iniciarSesion({ ...COMPRADOR, password: "mala" }), (e) => {
    assert.equal(errores.interpretarFallo(e, []).general, "Teléfono o contraseña incorrectos.");
    return true;
  });
  srv.forzadas.set("/api/v1/auth/login/", [() => new Response("<html>", { status: 502 })]);
  await assert.rejects(controlador.iniciarSesion(COMPRADOR), (e) => {
    assert.match(errores.interpretarFallo(e, []).general, /servicio no está disponible/);
    return true;
  });
});

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
