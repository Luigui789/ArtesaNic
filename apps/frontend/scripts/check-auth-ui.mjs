// AUD-18: formularios de acceso y cabecera renderizados (react-dom/server, sin navegador).
// Comprueba lo que la persona ve: el login no pregunta el rol, el registro sí pide la
// intención y los datos del taller, y la «Vista de demostración» solo existe en la demo.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

// Sin gcTime finito, QueryClient no deja temporizadores que mantengan vivo el proceso.
const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity } } };

globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const MODULOS = {
  React: "react",
  servidor: "react-dom/server",
  router: "react-router",
  rq: "@tanstack/react-query",
  sesionReact: "@/features/auth/use-session",
  sesion: "@/features/auth/sesion",
  ingreso: "@/features/auth/components/formulario-ingreso",
  registro: "@/features/auth/components/formulario-registro",
  guard: "@/features/auth/components/requiere-sesion",
  acceso: "@/features/auth/pages/acceso",
  layout: "@/components/layout/site-layout",
  moneda: "@/hooks/use-currency",
  notificaciones: "@/features/notificaciones/use-notifications",
};

const real = await cargarModulos(MODULOS, { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" });
const demo = await cargarModulos(MODULOS, { VITE_AUTH_API: "mock", VITE_CATALOGO_API: "mock" });

const CARLA = { id: 41, nombre: "Carla Compradora", telefono: "85551234", rol: "comprador" };
const ARTURO = { id: 42, nombre: "Arturo Artesano", telefono: "87779090", rol: "artesano" };

/** Adaptador mínimo: la identidad la decide quien llama, como haría el servidor. */
const adaptador = (usuario) => ({
  restaurar: async () => usuario,
  iniciarSesion: async () => usuario,
  registrarComprador: async () => usuario,
  registrarArtesano: async () => usuario,
  cerrarSesion: async () => undefined,
  alExpirar: () => () => undefined,
});

async function renderizar(m, nodo, { usuario = null, ruta = "/auth", controlador } = {}) {
  const h = m.React.createElement;
  const queryClient = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  const ctrl = controlador ?? m.sesion.crearControladorSesion(adaptador(usuario), queryClient);
  if (usuario && !controlador) await ctrl.iniciarSesion({ telefono: "", password: "" });
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

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
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
const noop = () => undefined;

await verificar("12. login: solo teléfono y contraseña, sin selector de rol", async () => {
  const html = await renderizar(real, (h) => h(real.ingreso.FormularioIngreso, { onExito: noop }));
  assert.match(html, /id="ingreso-telefono"/);
  assert.match(
    html,
    /id="ingreso-password"[^>]*type="password"|type="password"[^>]*id="ingreso-password"/,
  );
  assert.doesNotMatch(html, /role="radio"|radiogroup/);
  assert.doesNotMatch(texto(html), /comprador|artesano|Quiero entrar como/i);
  // La página completa tampoco pregunta el rol en el login (pestaña activa).
  const pagina = await renderizar(real, (h) => h(real.acceso.default));
  assert.doesNotMatch(texto(pagina), /Quiero entrar como/);
  assert.match(texto(pagina), /Ingresar/);
});

await verificar("13. registro: intención comprador/artesano y datos del taller", async () => {
  const comprador = await renderizar(real, (h) =>
    h(real.registro.FormularioRegistro, { onExito: noop }),
  );
  assert.match(texto(comprador), /Quiero comprar/);
  assert.match(texto(comprador), /Quiero vender mis artesanías/);
  assert.match(comprador, /role="radiogroup"/);
  assert.doesNotMatch(texto(comprador), /Nombre del taller/);
  assert.doesNotMatch(texto(comprador), /Administrador/i);
  const artesano = await renderizar(real, (h) =>
    h(real.registro.FormularioRegistro, { onExito: noop, intencionInicial: "artesano" }),
  );
  for (const etiqueta of ["Nombre del taller *", "Rubro *", "Dirección completa *"])
    assert.ok(texto(artesano).includes(etiqueta), etiqueta);
  for (const opcional of ["Historia del taller", "Horario de atención", "WhatsApp público"])
    assert.ok(texto(artesano).includes(opcional), opcional);
  assert.match(texto(artesano), /tu teléfono de acceso no se muestra/);
  // El registro de la página completa se abre con ?modo=registro.
  const pagina = await renderizar(real, (h) => h(real.acceso.default), {
    ruta: "/auth?modo=registro",
  });
  assert.match(texto(pagina), /Quiero vender mis artesanías/);
});

await verificar("33. modo real: sin «Vista de demostración» ni cambio de rol", async () => {
  for (const usuario of [null, CARLA, ARTURO]) {
    const html = await renderizar(real, (h) => h(real.layout.SiteLayout, null, "contenido"), {
      usuario,
      ruta: "/",
    });
    assert.doesNotMatch(html, /Vista de demostración/);
    assert.doesNotMatch(texto(html), /Restablecer datos de demostración/);
    assert.doesNotMatch(texto(html), /Pedidos \(demo\)/);
    if (usuario) {
      assert.match(texto(html), /Cerrar sesión/);
      assert.ok(texto(html).includes(usuario.nombre));
    } else assert.match(texto(html), /Acceso/);
  }
  // Navegación por el rol del servidor.
  const artesano = await renderizar(real, (h) => h(real.layout.SiteLayout, null, ""), {
    usuario: ARTURO,
    ruta: "/panel",
  });
  const navegacion = texto(artesano.match(/<nav aria-label="Principal".*?<\/nav>/s)[0]);
  assert.equal(navegacion.trim(), "Panel Solicitudes Mis productos");
});

await verificar("modo demo: el selector existe solo con VITE_AUTH_API=mock", async () => {
  const queryClient = new demo.rq.QueryClient(SIN_TEMPORIZADORES);
  const ctrl = demo.sesion.crearControladorSesion(
    { ...adaptador(CARLA), cambiarVista: (rol) => (rol === "artesano" ? ARTURO : CARLA) },
    queryClient,
  );
  await ctrl.iniciarSesion({ telefono: "", password: "" });
  const html = await renderizar(demo, (h) => h(demo.layout.SiteLayout, null, ""), {
    controlador: ctrl,
    ruta: "/",
  });
  assert.match(html, /aria-label="Vista de demostración"/);
  assert.match(texto(html), /Restablecer datos de demostración/);
});

await verificar("guards: cargando, anónimo, rol distinto y pantallas solo demo", async () => {
  const privado = (h) => h(real.guard.RequiereSesion, { rol: "artesano" }, "PANEL-PRIVADO");
  // Cargando: no muestra el contenido ni decide todavía.
  const cargando = await renderizar(real, privado, {
    ruta: "/panel",
    controlador: real.sesion.crearControladorSesion(
      adaptador(null),
      new real.rq.QueryClient(SIN_TEMPORIZADORES),
    ),
  });
  assert.match(texto(cargando), /Comprobando tu sesión/);
  assert.doesNotMatch(cargando, /PANEL-PRIVADO/);
  // Comprador en ruta de artesano: mensaje de rol, no el contenido.
  const comprador = await renderizar(real, privado, { usuario: CARLA, ruta: "/panel" });
  assert.match(texto(comprador), /Esta sección es para cuentas de artesano/);
  assert.doesNotMatch(comprador, /PANEL-PRIVADO/);
  const artesano = await renderizar(real, privado, { usuario: ARTURO, ruta: "/panel" });
  assert.match(artesano, /PANEL-PRIVADO/);
  // Pantallas simuladas con la identidad demo no se muestran a una cuenta real.
  const legacy = await renderizar(real, (h) => h(real.guard.SoloDemo, null, "PEDIDOS-DEMO"), {
    usuario: CARLA,
    ruta: "/pedidos",
  });
  assert.doesNotMatch(legacy, /PEDIDOS-DEMO/);
  assert.match(texto(legacy), /todavía no disponible/);
  const enDemo = await renderizar(demo, (h) => h(demo.guard.SoloDemo, null, "PEDIDOS-DEMO"), {
    usuario: CARLA,
    ruta: "/pedidos",
  });
  assert.match(enDemo, /PEDIDOS-DEMO/);
});

console.log(`OK (${grupos.length} grupos): ${grupos.join(" · ")}`);
// El runtime de react-dom/server (build de navegador) deja canales abiertos que
// mantienen vivo a Node aunque no quede trabajo: se termina explícitamente.
process.exit(0);
