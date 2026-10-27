// AUD-15: «Mi cuenta» (/cuenta) y PATCH /auth/perfil/ contra un backend simulado con el
// contrato de docs/api/autenticacion.md. Reglas puras, cliente HTTP, controlador de sesión
// y páginas renderizadas con react-dom/server (sin navegador).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    http: "@/features/auth/http",
    sesion: "@/features/auth/sesion",
    sesionReact: "@/features/auth/use-session",
    cuenta: "@/features/auth/cuenta",
    errores: "@/features/auth/errores",
    pagina: "@/features/auth/pages/cuenta",
    guard: "@/features/auth/components/requiere-sesion",
    layout: "@/components/layout/site-layout",
    moneda: "@/hooks/use-currency",
    notificaciones: "@/features/notificaciones/use-notifications-demo",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

const ANA = { id: 41, nombre: "Ana Delgado", telefono: "85551234", rol: "comprador" };
const ARTURO = { id: 42, nombre: "Arturo Artesano", telefono: "87779090", rol: "artesano" };

const grupos = [];
async function verificar(nombre, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos.push(nombre);
}
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ---------- Backend simulado de PATCH /auth/perfil/ ----------

const PERMITIDOS = ["nombre", "telefono", "password_actual"];
let peticiones = [];
let cuentas;
const reiniciar = () => {
  peticiones = [];
  cuentas = [
    { ...ANA, password: "Clave-segura-1" },
    { id: 50, nombre: "Otra", telefono: "87771234", rol: "comprador", password: "x" },
  ];
};
const json = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const canonico = (t) => String(t).replace(/\D/g, "").slice(-8);

globalThis.fetch = async (url, init = {}) => {
  const ruta = String(url);
  const cabeceras = init.headers ?? {};
  const cuerpo = init.body ? JSON.parse(init.body) : undefined;
  peticiones.push({ ruta, metodo: init.method ?? "GET", cabeceras, cuerpo });
  assert.equal(ruta, "/api/v1/auth/perfil/");
  if (cabeceras.Authorization !== "Bearer acc-ana") return json(401, { detail: "Sesión" });
  const yo = cuentas[0];
  const extra = Object.keys(cuerpo).filter((k) => !PERMITIDOS.includes(k));
  if (extra.length)
    return json(400, Object.fromEntries(extra.map((k) => [k, ["Campo no permitido."]])));
  if (cuerpo.telefono !== undefined && canonico(cuerpo.telefono) !== yo.telefono) {
    if (!cuerpo.password_actual)
      return json(400, {
        password_actual: ["Confirma tu contraseña actual para cambiar el teléfono."],
      });
    if (cuerpo.password_actual !== yo.password)
      return json(400, { password_actual: ["La contraseña actual no es correcta."] });
    if (cuentas.some((c) => c !== yo && c.telefono === canonico(cuerpo.telefono)))
      return json(400, { telefono: ["Ya existe una cuenta con este teléfono."] });
    yo.telefono = canonico(cuerpo.telefono);
  }
  if (cuerpo.nombre !== undefined) yo.nombre = cuerpo.nombre;
  const { id, nombre, telefono, rol } = yo;
  return json(200, { id, nombre, telefono, rol });
};

// ---------- Render ----------

const adaptador = (usuario, actualizarPerfil = async () => usuario) => ({
  restaurar: async () => usuario,
  iniciarSesion: async () => usuario,
  registrarComprador: async () => usuario,
  registrarArtesano: async () => usuario,
  cerrarSesion: async () => undefined,
  actualizarPerfil,
  alExpirar: () => () => undefined,
});

async function controladorCon(usuario, actualizarPerfil) {
  const cache = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  const ctrl = m.sesion.crearControladorSesion(adaptador(usuario, actualizarPerfil), cache);
  await ctrl.reintentar();
  return { ctrl, cache };
}

async function renderizar(nodo, { usuario = ANA, ruta = "/cuenta", controlador } = {}) {
  const h = m.React.createElement;
  const queryClient = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  const ctrl = controlador ?? (await controladorCon(usuario)).ctrl;
  return m.servidor.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: queryClient },
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
const paginaCuenta = (h) => h(m.guard.RequiereSesion, null, h(m.pagina.default));
const formulario = (usuario, inicial) => (h) => h(m.pagina.FormularioCuenta, { usuario, inicial });

// ---------- Verificaciones ----------

await verificar(
  "1. ruta /cuenta protegida por sesión, sin rol y distinta de /panel/perfil",
  async () => {
    const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
    assert.match(
      app,
      /path="\/cuenta"\s+element=\{\s*<RequiereSesion>\s*<Cuenta \/>\s*<\/RequiereSesion>/,
    );
    assert.match(app, /path="\/panel\/perfil"/);
    // Anónimo: el guard redirige y la página no se pinta.
    const anonimo = await renderizar(paginaCuenta, { usuario: null });
    assert.doesNotMatch(anonimo, /cuenta-nombre/);
    assert.doesNotMatch(texto(anonimo), /Mi cuenta/);
  },
);

await verificar("2. carga la identidad actual; rol solo lectura", async () => {
  for (const usuario of [ANA, ARTURO]) {
    const html = await renderizar(paginaCuenta, { usuario });
    assert.match(texto(html), /Mi cuenta/);
    assert.match(html, new RegExp(`id="cuenta-nombre"[^>]*value="${usuario.nombre}"`));
    assert.match(html, new RegExp(`id="cuenta-telefono"[^>]*value="${usuario.telefono}"`));
    assert.match(texto(html), /Teléfono de acceso/);
    const rol = usuario.rol === "artesano" ? "Artesano" : "Comprador";
    assert.match(html, new RegExp(`data-campo="rol"[^>]*>${rol}<`));
    // El rol no es un control editable ni hay formulario de contraseña nueva.
    assert.doesNotMatch(html, /<(input|select)[^>]*(name|id)="[^"]*rol/);
    assert.doesNotMatch(texto(html), /Nueva contraseña|Cambiar contraseña/);
  }
});

await verificar("3. edición de nombre y de teléfono: solo lo que cambió", async () => {
  const { entradaDeCambios, valoresDeCuenta } = m.cuenta;
  const base = valoresDeCuenta(ANA);
  assert.deepEqual(entradaDeCambios(ANA, base), {});
  assert.deepEqual(entradaDeCambios(ANA, { ...base, nombre: "  Ana López " }), {
    nombre: "Ana López",
  });
  assert.deepEqual(
    entradaDeCambios(ANA, { ...base, telefono: "8777 1234", passwordActual: "Clave-segura-1" }),
    { telefono: "8777 1234", passwordActual: "Clave-segura-1" },
  );
  // Mismo teléfono en otro formato: no es un cambio y la contraseña no viaja.
  assert.deepEqual(
    entradaDeCambios(ANA, { ...base, telefono: "+505 8555-1234", passwordActual: "x" }),
    {},
  );
});

await verificar("4. contraseña actual solo si el teléfono cambia de verdad", async () => {
  const { cambiaTelefono, esquemaCuenta } = m.cuenta;
  for (const igual of ["85551234", "8555-1234", "+505 8555 1234", "50585551234"])
    assert.equal(cambiaTelefono(ANA, igual), false, igual);
  assert.equal(cambiaTelefono(ANA, "87771234"), true);
  const sinPassword = esquemaCuenta(ANA).safeParse({
    nombre: "Ana",
    telefono: "87771234",
    passwordActual: "",
  });
  assert.equal(sinPassword.success, false);
  assert.deepEqual(sinPassword.error.issues[0].path, ["passwordActual"]);
  assert.equal(
    esquemaCuenta(ANA).safeParse({ nombre: "Ana López", telefono: "8555-1234", passwordActual: "" })
      .success,
    true,
  );
  const inicial = await renderizar(formulario(ANA));
  assert.doesNotMatch(inicial, /cuenta-password-actual/);
  const soloNombre = await renderizar(formulario(ANA, { nombre: "Ana López" }));
  assert.doesNotMatch(soloNombre, /cuenta-password-actual/);
  const mismo = await renderizar(formulario(ANA, { telefono: "8555-1234" }));
  assert.doesNotMatch(mismo, /cuenta-password-actual/);
  const nuevo = await renderizar(formulario(ANA, { telefono: "8777 1234" }));
  assert.match(
    nuevo,
    /id="cuenta-password-actual"[^>]*type="password"|type="password"[^>]*id="cuenta-password-actual"/,
  );
  assert.match(nuevo, /autoComplete="current-password"|autocomplete="current-password"/);
  assert.match(texto(nuevo), /el teléfono es tu identificador para iniciar sesión/);
  assert.match(nuevo, /aria-pressed="false"[^>]*>Mostrar contraseña|Mostrar contraseña/);
});

await verificar(
  "5. PATCH: Bearer, sin CSRF, cuerpo de lista cerrada y respuesta validada",
  async () => {
    reiniciar();
    m.lib.establecerTokenDeAcceso("acc-ana");
    const usuario = await m.http.actualizarPerfil({ nombre: "Ana López" });
    assert.deepEqual(usuario, { ...ANA, nombre: "Ana López" });
    const [p] = peticiones;
    assert.equal(p.metodo, "PATCH");
    assert.equal(p.cabeceras.Authorization, "Bearer acc-ana");
    assert.equal(p.cabeceras["X-CSRFToken"], undefined);
    assert.deepEqual(p.cuerpo, { nombre: "Ana López" });

    peticiones = [];
    await m.http.actualizarPerfil({ telefono: "8666 1234", passwordActual: "Clave-segura-1" });
    assert.deepEqual(peticiones[0].cuerpo, {
      telefono: "8666 1234",
      password_actual: "Clave-segura-1",
    });
  },
);

await verificar("6. campos internos nunca enviados", async () => {
  const sesionCompleta = {
    ...ANA,
    artesanoId: 9,
    rol: "administrador",
    is_staff: true,
    access: "acc-ana",
    password: "nueva",
  };
  assert.deepEqual(m.http.cuerpoActualizarPerfil(sesionCompleta), {
    nombre: "Ana Delgado",
    telefono: "85551234",
  });
  // Sin teléfono, la contraseña actual tampoco viaja.
  assert.deepEqual(m.http.cuerpoActualizarPerfil({ nombre: "A", passwordActual: "x" }), {
    nombre: "A",
  });
  const entrada = m.cuenta.entradaDeCambios(ANA, {
    ...m.cuenta.valoresDeCuenta(ANA),
    nombre: "Otra",
    rol: "artesano",
    id: 99,
  });
  assert.deepEqual(Object.keys(entrada), ["nombre"]);
});

await verificar("7. errores del servidor: teléfono duplicado y contraseña actual", async () => {
  const campos = Object.keys(m.cuenta.CAMPOS_SERVIDOR_CUENTA);
  reiniciar();
  const fallo = async (entrada) => {
    try {
      await m.http.actualizarPerfil(entrada);
    } catch (error) {
      return m.errores.interpretarFallo(error, campos);
    }
    assert.fail("debía fallar");
  };
  const duplicado = await fallo({ telefono: "87771234", passwordActual: "Clave-segura-1" });
  assert.deepEqual(duplicado.campos, { telefono: "Ya existe una cuenta con este teléfono." });
  const incorrecta = await fallo({ telefono: "86661234", passwordActual: "mal" });
  assert.deepEqual(incorrecta.campos, {
    password_actual: "La contraseña actual no es correcta.",
  });
  const requerida = await fallo({ telefono: "86661234" });
  assert.deepEqual(requerida.campos, {
    password_actual: "Confirma tu contraseña actual para cambiar el teléfono.",
  });
  assert.equal(m.cuenta.CAMPOS_SERVIDOR_CUENTA.password_actual, "passwordActual");
  // La cuenta original queda intacta.
  assert.equal(cuentas[0].telefono, "85551234");
});

await verificar(
  "8. la respuesta reemplaza la identidad del SessionProvider al instante",
  async () => {
    const actualizado = { ...ANA, nombre: "Ana López", telefono: "87771234" };
    const { ctrl, cache } = await controladorCon(ANA, async () => actualizado);
    let avisos = 0;
    ctrl.suscribir(() => avisos++);
    const datoPrivado = ["mis-solicitudes"];
    cache.setQueryData(datoPrivado, ["s1"]);
    const devuelto = await ctrl.actualizarPerfil({ nombre: "Ana López" });
    assert.deepEqual(devuelto, actualizado);
    assert.deepEqual(ctrl.obtener(), { estado: "autenticada", usuario: actualizado, error: null });
    assert.equal(avisos, 1);
    // Misma cuenta: no se vacía la caché como en un cambio de identidad.
    assert.deepEqual(cache.getQueryData(datoPrivado), ["s1"]);

    // Si la sesión se cerró mientras tanto, la respuesta no resucita la identidad.
    let liberar;
    const { ctrl: otro } = await controladorCon(
      ANA,
      () => new Promise((r) => (liberar = () => r(actualizado))),
    );
    const pendiente = otro.actualizarPerfil({ nombre: "Ana López" });
    await otro.cerrarSesion();
    liberar();
    await pendiente;
    assert.equal(otro.obtener().estado, "anonima");
  },
);

await verificar("9. la cabecera refleja el nombre nuevo sin recargar", async () => {
  const { ctrl } = await controladorCon(ANA, async () => ({ ...ANA, nombre: "Ana López" }));
  const conCabecera = (h) => h(m.layout.SiteLayout, null, "contenido");
  const antes = await renderizar(conCabecera, { controlador: ctrl, ruta: "/" });
  assert.match(antes, /aria-label="Mi cuenta: Ana Delgado"/);
  await ctrl.actualizarPerfil({ nombre: "Ana López" });
  const despues = await renderizar(conCabecera, { controlador: ctrl, ruta: "/" });
  assert.match(
    despues,
    /href="\/cuenta"[^>]*aria-label="Mi cuenta: Ana López"|aria-label="Mi cuenta: Ana López"[^>]*href="\/cuenta"/,
  );
  assert.doesNotMatch(despues, /Ana Delgado/);
});

await verificar("10. doble envío protegido", async () => {
  let llamadas = 0;
  let liberar;
  const enviar = m.cuenta.crearEnvioUnico(
    () =>
      new Promise((r) => {
        llamadas++;
        liberar = () => r("ok");
      }),
  );
  const primero = enviar();
  const segundo = await enviar();
  assert.equal(segundo, null);
  liberar();
  assert.equal(await primero, "ok");
  assert.equal(llamadas, 1);
  // Terminada la primera, se puede volver a enviar (por ejemplo, tras un error).
  const tercero = enviar();
  liberar();
  assert.equal(await tercero, "ok");
  assert.equal(llamadas, 2);
  // El botón se deshabilita mientras se envía y la página usa el envío único.
  const fuente = readFileSync(
    new URL("../src/features/auth/pages/cuenta.tsx", import.meta.url),
    "utf8",
  );
  assert.match(fuente, /crearEnvioUnico\(actualizarPerfil\)/);
  assert.match(fuente, /disabled=\{form\.formState\.isSubmitting\}/);
});

await verificar("11. Mi cuenta y Mi taller diferenciados; acceso en desktop y móvil", async () => {
  const artesano = await renderizar((h) => h(m.layout.SiteLayout, null, ""), {
    usuario: ARTURO,
    ruta: "/",
  });
  assert.match(artesano, /href="\/panel"[^>]*>.*?Mi taller/s);
  assert.match(artesano, /aria-label="Mi cuenta: Arturo Artesano"/);
  const pagina = await renderizar(paginaCuenta, { usuario: ARTURO });
  assert.match(pagina, /href="\/panel\/perfil"/);
  assert.match(texto(pagina), /contactos públicos de tu taller/);
  const comprador = await renderizar(paginaCuenta, { usuario: ANA });
  assert.doesNotMatch(comprador, /href="\/panel\/perfil"/);
  // El menú móvil (Sheet, cerrado en el render) también enlaza /cuenta, en su propia sección.
  const cabecera = readFileSync(
    new URL("../src/components/layout/app-header.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cabecera, /Mi cuenta\s*<\/p>\s*<NavLink\s+to="\/cuenta"/);
});

await verificar("12. responsive estructural", async () => {
  const html = await renderizar(paginaCuenta, { usuario: ARTURO });
  assert.match(html, /max-w-3xl/); // contenedor estrecho
  assert.match(html, /w-full sm:w-auto/); // botón a todo el ancho en móvil
  assert.match(html, /flex-wrap/); // la tarjeta de rol se reacomoda
  assert.match(html, /sm:flex-row/); // aviso del taller apilado en móvil
  assert.match(html, /touch-target/);
  assert.match(html, /min-h-11/); // campos con altura táctil
  const cabecera = await renderizar((h) => h(m.layout.SiteLayout, null, ""), { ruta: "/" });
  assert.match(cabecera, /<a[^>]*class="[^"]*min-h-11 min-w-11[^"]*"[^>]*href="\/cuenta"/);
});

console.log(`check-cuenta: ${grupos.length} grupos OK`);
for (const g of grupos) console.log(`  ✓ ${g}`);
// react-dom/server deja un MessagePort abierto: salir de forma explícita, como check-auth-ui.
process.exit(0);
