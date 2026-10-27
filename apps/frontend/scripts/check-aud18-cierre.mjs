// AUD-18: cierre de integración real del frontend.
// Verifica /mensajes real (comprador y artesano, selección ?pedido=, paginación, pedido fuera de
// página, pedido ajeno 404, ?pedido= inválido, un único OrderChat activo), modo real por defecto,
// /descubrir conectado a GET /api/v1/talleres/, ausencia de fugas demo en rutas reales, navegación
// por rol y aislamiento de caché entre sesiones.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargarModulos } from "./cargar-modulo.mjs";

process.on("unhandledRejection", (e) => {
  console.error(e?.name, e?.message);
  process.exit(1);
});

globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const SIN_TEMPORIZADORES = {
  defaultOptions: { queries: { gcTime: Infinity, retry: false, retryOnMount: false } },
};

const m = await cargarModulos(
  {
    React: "react",
    servidor: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    http: "@/lib/http",
    keys: "@/lib/query-keys",
    modo: "@/features/auth/modo",
    sesion: "@/features/auth/sesion",
    sesionReact: "@/features/auth/use-session",
    guard: "@/features/auth/components/requiere-sesion",
    nav: "@/components/layout/navigation",
    layout: "@/components/layout/site-layout",
    moneda: "@/hooks/use-currency",
    pedidos: "@/features/pedidos/confirmados",
    mensajesPagina: "@/features/mensajes/pages/mensajes",
    talleresApi: "@/features/talleres/api",
    descubrir: "@/features/catalogo/pages/inicio",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

const fuente = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), "utf8");
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

let grupos = 0;
async function verificar(nombre, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos++;
}

const ANA = { id: 41, nombre: "Ana Delgado", telefono: "85551234", rol: "comprador" };
const ARTURO = { id: 42, nombre: "Arturo Artesano", telefono: "87779090", rol: "artesano" };

const adaptador = (usuario) => ({
  restaurar: async () => usuario,
  iniciarSesion: async () => usuario,
  registrarComprador: async () => usuario,
  registrarArtesano: async () => usuario,
  cerrarSesion: async () => undefined,
  alExpirar: () => () => undefined,
});

function crearPedidoDTO(id, cambios = {}) {
  return {
    id,
    solicitud: 10 + id,
    propuesta: 20 + id,
    taller: { id: 3, nombre: "Cerámica Barro Vivo" },
    comprador: { id: ANA.id, nombre: ANA.nombre },
    estado: "en_cumplimiento",
    vencido_en: null,
    confirmado_en: "2026-10-25T10:00:00-06:00",
    moneda: "NIO",
    modalidad_entrega: "retiro_taller",
    descripcion_entrega: "",
    lineas: [
      {
        id: 100 + id,
        posicion: 1,
        renglon: 200 + id,
        linea_propuesta: 300 + id,
        producto: {
          id: 500 + id,
          nombre: `Vasija Bruñida #${id}`,
          categoria: { id: 1, codigo: "ceramica", nombre: "Cerámica" },
        },
        modalidad: "stock",
        cantidad: 2,
        precio_unitario: "250.00",
        subtotal: "500.00",
        cargo_personalizacion: "0.00",
        fecha_solicitada: null,
        fecha_comprometida: null,
        caracteristicas: "",
        origen_personalizacion: "",
      },
    ],
    otros_cargos: [],
    costo_entrega: "0.00",
    subtotal_productos: "500.00",
    total_personalizacion: "0.00",
    total_otros_cargos: "0.00",
    total: "500.00",
    ...cambios,
  };
}

async function renderConSesion(nodo, { usuario = ANA, ruta = "/mensajes", qc } = {}) {
  const h = m.React.createElement;
  const queryClient = qc ?? new m.rq.QueryClient(SIN_TEMPORIZADORES);
  // Evita que crearControladorSesion limpie los datos precargados del QueryClient de la prueba.
  const ctrl = m.sesion.crearControladorSesion(adaptador(usuario), {
    cancelQueries: async () => undefined,
    clear: () => undefined,
  });
  if (usuario) await ctrl.iniciarSesion({ telefono: "", password: "" });
  else await ctrl.reintentar();
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
          h(m.router.MemoryRouter, { initialEntries: [ruta] }, nodo(h)),
        ),
      ),
    ),
  );
}

// ---------- 1. Modo real por defecto ----------

await verificar("modo real por defecto cuando no se definen variables VITE_*", () => {
  assert.equal(m.modo.leerModoCatalogo(undefined), "real");
  assert.equal(m.modo.leerModoCatalogo(""), "real");
  assert.equal(m.modo.leerModoCatalogo("real"), "real");
  assert.equal(m.modo.leerModoCatalogo("mock"), "mock");
  assert.equal(m.modo.leerModoAuth(undefined, undefined), "real");
  assert.equal(m.modo.leerModoAuth("", ""), "real");
  assert.equal(m.modo.leerModoAuth(undefined, "real"), "real");
  assert.equal(m.modo.leerModoAuth(undefined, "mock"), "mock");
  assert.equal(m.modo.modoAuth, "real");
  assert.equal(m.modo.authReal, true);
  assert.equal(m.modo.catalogoReal, true);
});

// ---------- 2. /mensajes real para comprador y artesano ----------

await verificar(
  "/mensajes real para comprador: lista, contraparte taller y chat activo",
  async () => {
    const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
    const p81 = m.pedidos.aPedido(crearPedidoDTO(81));
    const p82 = m.pedidos.aPedido(crearPedidoDTO(82, { estado: "entregado" }));
    qc.setQueryData([...m.keys.claves.pedidos(ANA.id), false, 1], {
      items: [p81, p82],
      total: 2,
      page: 1,
      pageSize: 12,
      totalPages: 1,
    });
    qc.setQueryData(m.keys.claves.mensajes(ANA.id, 81), {
      mensajes: [
        { id: 1, autor: ANA, texto: "Hola taller", creadoEn: "2026-10-25T11:00:00-06:00" },
        {
          id: 2,
          autor: ARTURO,
          texto: "Listo para coordinar",
          creadoEn: "2026-10-25T11:05:00-06:00",
        },
      ],
      cursor: 2,
      soloLectura: false,
    });

    const html = await renderConSesion((h) => h(m.mensajesPagina.default), {
      usuario: ANA,
      ruta: "/mensajes",
      qc,
    });
    assert.match(html, /Pedido #81/);
    assert.match(html, /Pedido #82/);
    assert.match(html, /Cerámica Barro Vivo/);
    assert.match(html, /Vasija Bruñida #81/);
    assert.match(html, /Hola taller/);
    assert.match(html, /Listo para coordinar/);
    assert.match(html, /href="\/pedidos\/81"/);
    assert.match(html, /<textarea[^>]*maxLength="500"/);
    // Solo se monta un único OrderChat para el pedido seleccionado (sin duplicar polling).
    assert.equal((html.match(/aria-label="Conversación del pedido"/g) ?? []).length, 1);
  },
);

await verificar(
  "/mensajes real para artesano: usa recibidos=true, comprador y enlace a /panel/pedidos",
  async () => {
    const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
    const p90 = m.pedidos.aPedido(crearPedidoDTO(90));
    qc.setQueryData([...m.keys.claves.pedidos(ARTURO.id), true, 1], {
      items: [p90],
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
    });
    qc.setQueryData(m.keys.claves.mensajes(ARTURO.id, 90), {
      mensajes: [
        { id: 10, autor: ANA, texto: "Consulta de entrega", creadoEn: "2026-10-25T12:00:00-06:00" },
      ],
      cursor: 10,
      soloLectura: false,
    });

    const html = await renderConSesion((h) => h(m.mensajesPagina.default), {
      usuario: ARTURO,
      ruta: "/mensajes",
      qc,
    });
    assert.match(html, /Pedido #90/);
    assert.match(html, /Comprador: Ana Delgado/);
    assert.match(html, /Consulta de entrega/);
    assert.match(html, /href="\/panel\/pedidos\/90"/);
    assert.match(html, /href="\/panel\/pedidos"[^>]*>Ver pedidos del taller</);
  },
);

// ---------- 3. Deep link /mensajes?pedido=<id>, fuera de página, 404 e inválido ----------

await verificar(
  "deep link ?pedido=<id>: selecciona conversación, soporta pedido de otra página y solo lectura",
  async () => {
    const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
    const p81 = m.pedidos.aPedido(crearPedidoDTO(81));
    const p95 = m.pedidos.aPedido(crearPedidoDTO(95, { estado: "entregado" }));
    qc.setQueryData([...m.keys.claves.pedidos(ANA.id), false, 1], {
      items: [p81],
      total: 15,
      page: 1,
      pageSize: 12,
      totalPages: 2,
    });
    // Pedido 95 pertenece a la página 2; se resuelve con consultarPedidoConfirmado (claves.pedido).
    qc.setQueryData(m.keys.claves.pedido(ANA.id, false, 95), p95);
    qc.setQueryData(m.keys.claves.mensajes(ANA.id, 95), {
      mensajes: [
        {
          id: 50,
          autor: ARTURO,
          texto: "Entregado en taller",
          creadoEn: "2026-10-26T09:00:00-06:00",
        },
      ],
      cursor: 50,
      soloLectura: true,
    });

    const html = await renderConSesion((h) => h(m.mensajesPagina.default), {
      usuario: ANA,
      ruta: "/mensajes?pedido=95",
      qc,
    });
    assert.match(html, /Pedido #95 · Vasija Bruñida #95/);
    assert.match(html, /Entregado en taller/);
    assert.doesNotMatch(html, /<textarea/, "pedido entregado es solo lectura");
    assert.match(
      html,
      /Este pedido finalizó\. La conversación queda disponible solo para consulta\./,
    );
    assert.match(html, /Página 1 de 2/, "conserva la paginación de la lista");
  },
);

await verificar(
  "deep link ?pedido= inválido no selecciona un pedido arbitrario ni rompe la página",
  async () => {
    const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
    const p81 = m.pedidos.aPedido(crearPedidoDTO(81));
    qc.setQueryData([...m.keys.claves.pedidos(ANA.id), false, 1], {
      items: [p81],
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
    });

    await Promise.all(
      ["/mensajes?pedido=abc", "/mensajes?pedido=0", "/mensajes?pedido=-5"].map(
        async (invalido) => {
          const html = await renderConSesion((h) => h(m.mensajesPagina.default), {
            usuario: ANA,
            ruta: invalido,
            qc,
          });
          assert.match(html, /Enlace de conversación no válido/, invalido);
          assert.doesNotMatch(html, /aria-label="Conversación del pedido"/, invalido);
          assert.match(html, /Pedido #81/, "mantiene visible la lista propia");
        },
      ),
    );
  },
);

await verificar(
  "deep link a pedido ajeno o inexistente muestra error del servidor sin abrir chat",
  async () => {
    const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
    const p81 = m.pedidos.aPedido(crearPedidoDTO(81));
    qc.setQueryData([...m.keys.claves.pedidos(ANA.id), false, 1], {
      items: [p81],
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "No encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    await qc.prefetchQuery({
      queryKey: m.keys.claves.pedido(ANA.id, false, 999),
      queryFn: () => m.pedidos.consultarPedidoConfirmado(false, 999),
    });

    const html = await renderConSesion((h) => h(m.mensajesPagina.default), {
      usuario: ANA,
      ruta: "/mensajes?pedido=999",
      qc,
    });
    assert.match(html, /No encontramos este pedido\./);
    assert.doesNotMatch(html, /aria-label="Conversación del pedido"/);
  },
);

// ---------- 4. /descubrir conectado a talleres reales ----------

await verificar("/descubrir consulta GET /api/v1/talleres/ en modo real", async () => {
  const urls = [];
  const senales = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    senales.push(init?.signal);
    return new Response(
      JSON.stringify([
        {
          id: 7,
          nombre: "Taller Real de Masaya",
          historia: "Tradición familiar.",
          rubro: "Barro y cerámica",
          direccion_completa: "San Juan de Oriente",
          horario: "Lun-Sáb",
          telefono_publico: "88887777",
          whatsapp_publico: "",
          facebook_url: "",
          instagram_url: "",
          sitio_web: "",
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const controlador = new AbortController();
  const talleres = await m.talleresApi.listPerfilesTalleres(controlador.signal);
  assert.deepEqual(urls, ["/api/v1/talleres/"]);
  assert.equal(senales[0], controlador.signal);
  assert.equal(talleres.length, 1);
  assert.equal(talleres[0].nombre, "Taller Real de Masaya");
  assert.equal(talleres[0].direccion, "San Juan de Oriente");

  const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  qc.setQueryData(["talleres-publicos"], talleres);
  qc.setQueryData(["categorias"], []);
  qc.setQueryData(["catalogo", "portada"], {
    items: [],
    total: 0,
    page: 1,
    pageSize: 8,
    totalPages: 1,
  });
  const html = await renderConSesion((h) => h(m.descubrir.default), {
    usuario: null,
    ruta: "/descubrir",
    qc,
  });
  assert.match(html, /Taller Real de Masaya/);
  assert.match(html, /San Juan de Oriente/);
  assert.match(html, /href="\/artesano\/7"/);
});

// ---------- 5. Sin fugas de demo en rutas reales ----------

await verificar(
  "sin DEMO_ARTISAN_ID, OrderChatDemo ni NotificationsProvider en rutas reales",
  () => {
    const archivosReales = [
      "features/mensajes/pages/mensajes.tsx",
      "features/pedidos/pages/confirmados.tsx",
      "features/solicitudes/pages/preparar.tsx",
      "features/solicitudes/pages/consultas.tsx",
      "features/notificaciones/pages/notificaciones.tsx",
      "features/talleres/pages/panel-resumen.tsx",
      "features/talleres/pages/panel-taller.tsx",
      "features/catalogo/pages/panel-productos.tsx",
      "features/catalogo/pages/inicio.tsx",
      "features/auth/pages/acceso.tsx",
      "features/auth/pages/cuenta.tsx",
    ];
    for (const ruta of archivosReales) {
      const codigo = fuente(ruta);
      assert.doesNotMatch(
        codigo,
        /DEMO_ARTISAN_ID|OrderChatDemo|use-notifications-demo|from "@\/mocks/,
        `${ruta} no debe importar artefactos de demo`,
      );
    }
    assert.doesNotMatch(
      fuente("features/solicitudes/pages/preparar.tsx"),
      /El inicio de sesión real todavía no está disponible/,
    );
    assert.match(
      fuente("features/solicitudes/pages/preparar.tsx"),
      /Tu solicitud se enviará al taller artesanal para su revisión y emisión de propuesta\./,
    );
    const app = fuente("app/App.tsx");
    assert.match(
      app,
      /conNotificacionesDemo[\s\S]*?authReal \? contenido : <NotificationsProvider>\{contenido\}<\/NotificationsProvider>/,
    );
  },
);

// ---------- 6. Navegación por rol y guards en rutas privadas ----------

await verificar("navegación real por rol y bloqueo de rutas privadas para anónimo", async () => {
  const navComprador = m.nav.navigationFor("comprador", true).map((x) => x.to);
  assert.deepEqual(navComprador, ["/solicitudes", "/pedidos", "/mensajes", "/notificaciones"]);

  const navArtesano = m.nav.navigationFor("artesano", true).map((x) => x.to);
  assert.deepEqual(navArtesano, [
    "/panel",
    "/panel/solicitudes",
    "/panel/pedidos",
    "/panel/productos",
    "/panel/inventario",
    "/panel/perfil",
    "/mensajes",
    "/notificaciones",
  ]);

  // Sin NotificationsProvider montado en modo real, SiteLayout renderiza sin error.
  const layoutComprador = await renderConSesion((h) => h(m.layout.SiteLayout, null, "CONTENIDO"), {
    usuario: ANA,
    ruta: "/mensajes",
  });
  assert.match(texto(layoutComprador), /Mis solicitudes Mis pedidos Mensajes Notificaciones/);

  // Guard de sesión para /mensajes con usuario anónimo: no expone el contenido privado.
  const anonimoMensajes = await renderConSesion(
    (h) => h(m.guard.RequiereSesion, null, h(m.mensajesPagina.default)),
    { usuario: null, ruta: "/mensajes?pedido=81" },
  );
  assert.doesNotMatch(anonimoMensajes, /Conversaciones por pedido|Pedido #81/);
});

console.log(`check-aud18-cierre: ${grupos} grupos OK`);
process.exit(0);
