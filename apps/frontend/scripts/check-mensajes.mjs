// AUD-16: conversación privada real del pedido confirmado. Cliente HTTP (Bearer, solo texto,
// sin CSRF), DTO validado, cursor por id, polling incremental de 15 s, fusión sin duplicados,
// solo lectura terminal e integración en el detalle real; la demo sigue en el servidor simulado.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargarModulos } from "./cargar-modulo.mjs";

process.on("unhandledRejection", (e) => {
  console.error(e?.name, e?.message);
  process.exit(1);
});

const m = await cargarModulos(
  {
    http: "@/lib/http",
    api: "@/features/mensajes/api",
    chat: "@/features/mensajes/components/order-chat",
    pedidos: "@/features/pedidos/confirmados",
    pagina: "@/features/pedidos/pages/confirmados",
    errores: "@/lib/errores-dominio",
    keys: "@/lib/query-keys",
    React: "react",
    server: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    sesionReact: "@/features/auth/use-session",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

// Sin gcTime finito, QueryClient no deja temporizadores que mantengan vivo el proceso.
const nuevoQC = () =>
  new m.rq.QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

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
const fuente = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), "utf8");

// ---------- Backend simulado con el contrato de docs/api/mensajes.md ----------

let peticiones = [];
let respuestas = [];
const responder = (status, cuerpo) => respuestas.push({ status, cuerpo });
globalThis.fetch = async (url, init = {}) => {
  peticiones.push({
    url: String(url),
    metodo: init.method ?? "GET",
    cabeceras: new Headers(init.headers),
    cuerpo: init.body ? JSON.parse(init.body) : undefined,
  });
  const r = respuestas.shift() ?? { status: 500, cuerpo: { detail: "sin respuesta" } };
  return new Response(JSON.stringify(r.cuerpo), {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
};
const reiniciar = () => {
  peticiones = [];
  respuestas = [];
};
m.http.establecerTokenDeAcceso("acc-ana");

const ANA = { id: 41, nombre: "Ana Delgado" };
const ARTURO = { id: 42, nombre: "Arturo Artesano" };
const dto = (id, autor = ANA, texto = `m${id}`) => ({
  id,
  autor,
  texto,
  creado_en: "2026-10-26T15:30:00-06:00",
});
const conversacion = (mensajes, cursor, solo_lectura = false) => ({
  mensajes,
  cursor,
  solo_lectura,
});

await verificar("GET historial con Bearer, sin CSRF ni cursor", async () => {
  reiniciar();
  responder(200, conversacion([dto(126), dto(127, ARTURO)], 127));
  const c = await m.api.listarMensajes(81);
  const p = peticiones[0];
  assert.equal(p.url, "/api/v1/pedidos/81/mensajes/");
  assert.equal(p.metodo, "GET");
  assert.equal(p.cabeceras.get("Authorization"), "Bearer acc-ana");
  assert.equal(p.cabeceras.get("X-CSRFToken"), null);
  assert.equal(peticiones.length, 1, "sin pedir token CSRF");
  assert.deepEqual(c, {
    mensajes: [
      { id: 126, autor: ANA, texto: "m126", creadoEn: "2026-10-26T15:30:00-06:00" },
      { id: 127, autor: ARTURO, texto: "m127", creadoEn: "2026-10-26T15:30:00-06:00" },
    ],
    cursor: 127,
    soloLectura: false,
  });
});

await verificar("delta usa despues_de con cursor numérico", async () => {
  reiniciar();
  responder(200, conversacion([], 127));
  const c = await m.api.listarMensajes(81, 127);
  assert.equal(peticiones[0].url, "/api/v1/pedidos/81/mensajes/?despues_de=127");
  assert.equal(c.cursor, 127);
});

await verificar("DTO validado con Zod: una forma distinta se rechaza", async () => {
  for (const malo of [
    { mensajes: [], solo_lectura: false },
    conversacion([{ ...dto(1), autor: { nombre: "Sin id" } }], 1),
    conversacion([dto(1)], "1"),
    conversacion([{ ...dto(1), texto: "" }], 1),
  ]) {
    reiniciar();
    responder(200, malo);
    await assert.rejects(m.api.listarMensajes(81), (e) => e.name === "RespuestaInvalidaError");
  }
  // Campos no contractuales (p. ej. teléfono) no llegan al modelo de la interfaz.
  reiniciar();
  responder(200, conversacion([{ ...dto(5), autor: { ...ANA, telefono: "85551234" } }], 5));
  const c = await m.api.listarMensajes(81);
  assert.deepEqual(Object.keys(c.mensajes[0].autor).sort(), ["id", "nombre"]);
});

await verificar("POST con Bearer envía solo texto y sin CSRF", async () => {
  reiniciar();
  responder(201, dto(130, ANA, "Hola"));
  const mensaje = await m.api.enviarMensaje(81, "Hola");
  const p = peticiones[0];
  assert.equal(p.url, "/api/v1/pedidos/81/mensajes/");
  assert.equal(p.metodo, "POST");
  assert.equal(p.cabeceras.get("Authorization"), "Bearer acc-ana");
  assert.equal(p.cabeceras.get("X-CSRFToken"), null);
  assert.deepEqual(p.cuerpo, { texto: "Hola" });
  assert.equal(peticiones.length, 1);
  assert.equal(mensaje.id, 130);
  assert.equal(mensaje.autor.id, ANA.id);
  // El componente no añade identidad al cuerpo.
  const chat = fuente("features/mensajes/components/order-chat.tsx");
  assert.match(chat, /enviarMensaje\(pedido, contenido\)/);
  assert.doesNotMatch(chat, /usuario\??\.(rol|nombre)/);
});

await verificar("409 conversacion_cerrada y errores de envío comprensibles", async () => {
  reiniciar();
  responder(409, {
    detail: "Este pedido ya finalizó. La conversación está disponible solo para consulta.",
    codigo: "conversacion_cerrada",
  });
  const error = await m.api.enviarMensaje(81, "Tarde").catch((e) => e);
  assert.equal(error.status, 409);
  assert.equal(error.codigo, "conversacion_cerrada");
  assert.match(m.errores.mensajeDominio(error), /solo para consulta/);
  reiniciar();
  responder(400, { texto: ["El mensaje admite como máximo 500 caracteres."] });
  const largo = await m.api.enviarMensaje(81, "x").catch((e) => e);
  assert.equal(m.errores.mensajeDominio(largo), "El mensaje admite como máximo 500 caracteres.");
  reiniciar();
  responder(404, { detail: "No encontrado." });
  const ajeno = await m.api.listarMensajes(99).catch((e) => e);
  assert.equal(ajeno.status, 404);
  assert.equal(ajeno.message, "No encontramos este pedido.");
});

// ---------- Fusión incremental ----------

const msg = (id, autor = ANA) => ({ id, autor, texto: `m${id}`, creadoEn: "2026-10-26T00:00Z" });

await verificar("merge incremental: deduplica por id, ordena y el cursor no retrocede", () => {
  const actual = { mensajes: [msg(1), msg(3)], cursor: 3, soloLectura: false };
  const r = m.api.fusionar(actual, {
    mensajes: [msg(5), msg(3), msg(4)],
    cursor: 5,
    soloLectura: false,
  });
  assert.deepEqual(
    r.mensajes.map((x) => x.id),
    [1, 3, 4, 5],
  );
  assert.equal(r.cursor, 5);
  assert.equal(m.api.fusionar(r, { mensajes: [], cursor: 2, soloLectura: false }).cursor, 5);
  // Solo lectura es irreversible: un delta no lo reabre.
  const cerrada = m.api.fusionar(r, { mensajes: [], cursor: 5, soloLectura: true });
  assert.equal(cerrada.soloLectura, true);
  assert.equal(
    m.api.fusionar(cerrada, { mensajes: [], cursor: 5, soloLectura: false }).soloLectura,
    true,
  );
  assert.equal(actual.mensajes.length, 2, "no muta la caché previa");
});

await verificar("201 agrega el mensaje sin mover el cursor (no salta mensajes ajenos)", () => {
  const actual = { mensajes: [msg(10)], cursor: 10, soloLectura: false };
  const r = m.api.agregarPropio(actual, msg(14));
  assert.deepEqual(
    r.mensajes.map((x) => x.id),
    [10, 14],
  );
  assert.equal(r.cursor, 10);
  // El siguiente delta trae el 12 de la otra parte y el propio deduplicado.
  const d = m.api.fusionar(r, {
    mensajes: [msg(12, ARTURO), msg(14)],
    cursor: 14,
    soloLectura: false,
  });
  assert.deepEqual(
    d.mensajes.map((x) => x.id),
    [10, 12, 14],
  );
  assert.equal(d.cursor, 14);
});

await verificar("sondeo: pide solo novedades y las mezcla en QueryClient", async () => {
  const qc = nuevoQC();
  const clave = m.keys.claves.mensajes(41, 81);
  qc.setQueryData(clave, { mensajes: [msg(126), msg(127)], cursor: 127, soloLectura: false });
  reiniciar();
  responder(200, conversacion([dto(127), dto(128, ARTURO)], 128));
  await m.api.sondearNovedades(qc, clave, 81);
  assert.equal(peticiones.length, 1);
  assert.equal(peticiones[0].url, "/api/v1/pedidos/81/mensajes/?despues_de=127");
  const c = qc.getQueryData(clave);
  assert.deepEqual(
    c.mensajes.map((x) => x.id),
    [126, 127, 128],
  );
  assert.equal(c.cursor, 128);
  // Sin novedades: el cursor se conserva y nunca se pide el historial completo.
  reiniciar();
  responder(200, conversacion([], 128));
  await m.api.sondearNovedades(qc, clave, 81);
  assert.equal(peticiones[0].url, "/api/v1/pedidos/81/mensajes/?despues_de=128");
  assert.equal(qc.getQueryData(clave).cursor, 128);
  // Sin conversación cargada no hay sondeo.
  reiniciar();
  await m.api.sondearNovedades(qc, m.keys.claves.mensajes(41, 999), 999);
  assert.equal(peticiones.length, 0);
});

await verificar("poll cada 15 s, solo activo y sin releer el historial", () => {
  assert.equal(m.api.INTERVALO_SONDEO_MS, 15000);
  const chat = fuente("features/mensajes/components/order-chat.tsx");
  assert.match(chat, /setInterval\([\s\S]*?sondearConversacion\([\s\S]*?INTERVALO_SONDEO_MS/);
  assert.match(chat, /if \(!cargada \|\| soloLectura\) return;/);
  assert.doesNotMatch(chat, /invalidateQueries|refetchInterval/);
  assert.match(chat, /staleTime: Infinity/);
  assert.match(chat, /refetchOnWindowFocus: false/);
  assert.doesNotMatch(chat, /creadoEn\s*>|\.fecha/, "la fecha no es el cursor");
  // 409 conversacion_cerrada cambia el chat a solo lectura de inmediato.
  assert.match(chat, /error\.codigo === "conversacion_cerrada"[\s\S]{0,200}soloLectura: true/);
});

await verificar("query key privada con identidad", () => {
  assert.deepEqual(m.keys.claves.mensajes(41, 81), ["mensajes-reales", 41, 81]);
  assert.notDeepEqual(m.keys.claves.mensajes(41, 81), m.keys.claves.mensajes(42, 81));
  // El SessionProvider vacía la caché al cambiar de identidad (defensa conservada).
  assert.match(fuente("features/auth/use-session.tsx"), /vacía la caché/);
});

// ---------- Interfaz ----------

const h = m.React.createElement;
const render = (nodo, qc = nuevoQC()) =>
  m.server.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(m.sesionReact.SessionProvider, null, h(m.router.MemoryRouter, null, nodo)),
    ),
  );
const vista = (cambios = {}) =>
  render(
    h(m.chat.VistaConversacion, {
      estado: "lista",
      mensajes: [msg(1, ANA), msg(2, ARTURO), msg(3, { id: 77, nombre: ANA.nombre })],
      usuarioId: ANA.id,
      soloLectura: false,
      errorCarga: null,
      onReintentar: () => {},
      errorSondeo: false,
      texto: "",
      onTexto: () => {},
      enviando: false,
      errorEnvio: null,
      onEnviar: () => {},
      ...cambios,
    }),
  );
const burbujas = (html) =>
  [...html.matchAll(/data-mensaje="(\d+)"[^>]*class="([^"]*)"/g)].map(([, id, clase]) => ({
    id: Number(id),
    propio: clase.includes("justify-end"),
  }));

await verificar("autor propio por id de cuenta, no por nombre ni rol", () => {
  const html = vista();
  assert.deepEqual(burbujas(html), [
    { id: 1, propio: true },
    { id: 2, propio: false },
    { id: 3, propio: false }, // mismo nombre, otra cuenta
  ]);
  assert.match(html, /Arturo Artesano/);
  assert.match(html, /Tú/);
});

await verificar("activo: textarea, botón y límite de 500", () => {
  const html = vista({ texto: "Hola" });
  assert.match(html, /<textarea[^>]*maxLength="500"/);
  assert.match(html, />Enviar</);
  assert.match(html, /role="log"/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /touch-target/);
  assert.match(html, /whitespace-pre-wrap/);
});

await verificar("solo lectura: sin compositor y con historial visible", () => {
  const html = vista({ soloLectura: true });
  assert.doesNotMatch(html, /<textarea/);
  assert.doesNotMatch(html, />Enviar</);
  assert.match(
    html,
    /Este pedido finalizó\. La conversación queda disponible solo para consulta\./,
  );
  assert.equal(burbujas(html).length, 3);
});

await verificar("carga, error inicial con reintento y error de envío", () => {
  assert.match(vista({ estado: "cargando" }), /Cargando mensajes/);
  const error = vista({ estado: "error", errorCarga: "Sin conexión." });
  assert.match(error, /No pudimos cargar los mensajes\. Sin conexión\./);
  assert.match(error, />Reintentar</);
  assert.doesNotMatch(error, /<textarea/);
  const envio = vista({ errorEnvio: "El mensaje admite como máximo 500 caracteres." });
  assert.match(envio, /role="alert"[^>]*>No pudimos enviar el mensaje: El mensaje admite/);
  assert.match(vista({ errorSondeo: true }), /reintentaremos/);
});

await verificar("OrderChat real con caché: activo y terminal", () => {
  const qc = nuevoQC();
  qc.setQueryData(m.keys.claves.mensajes(undefined, 9), {
    mensajes: [msg(1)],
    cursor: 1,
    soloLectura: false,
  });
  const activo = render(h(m.chat.OrderChat, { pedido: 9, estado: "en_cumplimiento" }), qc);
  assert.match(activo, /<textarea/);
  // El backend es la autoridad: solo_lectura cierra aunque el pedido en pantalla siga activo.
  qc.setQueryData(m.keys.claves.mensajes(undefined, 9), {
    mensajes: [msg(1)],
    cursor: 1,
    soloLectura: true,
  });
  const cerrado = render(h(m.chat.OrderChat, { pedido: 9, estado: "confirmado" }), qc);
  assert.doesNotMatch(cerrado, /<textarea/);
  assert.match(cerrado, /m1/);
  // Un estado terminal conocido también oculta el compositor.
  const qc2 = nuevoQC();
  qc2.setQueryData(m.keys.claves.mensajes(undefined, 9), {
    mensajes: [],
    cursor: 0,
    soloLectura: false,
  });
  assert.doesNotMatch(
    render(h(m.chat.OrderChat, { pedido: 9, estado: "entregado" }), qc2),
    /<textarea/,
  );
});

await verificar("chat integrado en el detalle real de comprador y artesano", () => {
  const confirmados = fuente("features/pedidos/pages/confirmados.tsx");
  assert.match(
    confirmados,
    /mensajes=\{<OrderChat pedido=\{query\.data\.id\} estado=\{query\.data\.estado\} \/>\}/,
  );
  assert.equal(confirmados.match(/<OrderChat /g).length, 1, "un único componente real");
  const app = fuente("app/App.tsx");
  assert.match(app, /comprador\(<DetallePedidoConfirmado \/>\)/);
  assert.match(app, /artesano\(<DetallePedidoConfirmado recibido \/>\)/);
  const html = render(
    h(m.pagina.ContenidoPedidoConfirmado, {
      pedido: m.pedidos.aPedido({
        id: 9,
        solicitud: 3,
        propuesta: 4,
        taller: { id: 1, nombre: "Barro" },
        estado: "confirmado",
        vencido_en: null,
        confirmado_en: "2026-10-24T10:00:00-06:00",
        moneda: "NIO",
        modalidad_entrega: "retiro_taller",
        descripcion_entrega: "",
        lineas: [],
        otros_cargos: [],
        costo_entrega: "0.00",
        subtotal_productos: "100.00",
        total_personalizacion: "0.00",
        total_otros_cargos: "0.00",
        total: "100.00",
      }),
      cumplimiento: h("p", null, "SECCION-CUMPLIMIENTO"),
      mensajes: h("p", null, "SECCION-MENSAJES"),
    }),
  );
  assert.ok(html.indexOf("SECCION-CUMPLIMIENTO") < html.indexOf("SECCION-MENSAJES"));
});

await verificar("demo aislada: mocks directos, sin fallback real → mock", () => {
  const api = fuente("features/mensajes/api.ts");
  const http = fuente("features/mensajes/http.ts");
  for (const real of [api, http, fuente("features/mensajes/components/order-chat.tsx")]) {
    assert.doesNotMatch(real, /from "@\/mocks|catalogoReal|authReal/);
  }
  assert.match(
    fuente("features/mensajes/components/order-chat-demo.tsx"),
    /from "@\/mocks\/mensajes"/,
  );
  assert.match(
    fuente("features/mensajes/components/order-chat-demo.tsx"),
    /export function OrderChatDemo/,
  );
  assert.match(
    fuente("features/notificaciones/use-notifications-demo.tsx"),
    /from "@\/mocks\/mensajes"/,
  );
  for (const demo of [
    "features/pedidos/pages/pedido-detalle.tsx",
    "features/pedidos/pages/panel-pedido-detalle.tsx",
  ]) {
    const codigo = fuente(demo);
    assert.match(codigo, /<OrderChatDemo /, demo);
    assert.doesNotMatch(codigo, /components\/order-chat"/, demo);
  }
  const paginaMensajes = fuente("features/mensajes/pages/mensajes.tsx");
  assert.match(
    paginaMensajes,
    /<OrderChat key=\{actual\.id\} pedido=\{actual\.id\} estado=\{actual\.estado\} \/>/,
  );
  assert.doesNotMatch(paginaMensajes, /OrderChatDemo|DEMO_ARTISAN_ID|listOrders|useNotifications/);
  assert.match(
    fuente("app/App.tsx"),
    /path="\/mensajes"[\s\S]*?<RequiereSesion>\s*<Mensajes \/>\s*<\/RequiereSesion>/,
  );
});

console.log(`check-mensajes: ${grupos} grupos OK`);
// Como las demás verificaciones, termina de forma explícita (React Query deja temporizadores).
process.exit(0);
