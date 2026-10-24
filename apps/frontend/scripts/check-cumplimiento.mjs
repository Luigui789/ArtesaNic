// AUD-12: cliente HTTP de cumplimiento por renglón, entregas y recepción, y su interfaz.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargarModulos } from "./cargar-modulo.mjs";
process.on("uncaughtException", (e) => {
  console.error(e.name, e.message);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e?.name, e?.message);
  process.exit(1);
});
const m = await cargarModulos(
  {
    http: "@/lib/http",
    cumplimiento: "@/features/pedidos/cumplimiento",
    vista: "@/features/pedidos/components/cumplimiento-pedido",
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
let grupos = 0;
async function verificar(nombre, fn) {
  await fn();
  grupos++;
  console.log("OK", nombre);
}
const peticiones = [];
let respuesta = {};
let estado = 200;
let fallaRed = false;
globalThis.fetch = async (url, init) => {
  peticiones.push({ url: String(url), ...init });
  if (fallaRed) throw new TypeError("Failed to fetch");
  return new Response(JSON.stringify(respuesta), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
};
m.http.establecerTokenDeAcceso("access-en-memoria");
const ultima = () => peticiones.at(-1);
const cabecera = (p, nombre) => new Headers(p.headers).get(nombre);

// --- Datos de contrato ---
const linea = (id, posicion, modalidad, cambios = {}) => ({
  id,
  posicion,
  renglon: id + 100,
  linea_propuesta: id + 200,
  producto: {
    id: id + 300,
    nombre: `Producto ${posicion}`,
    categoria: { id: 1, nombre: "Cerámica" },
  },
  modalidad,
  cantidad: 5,
  precio_unitario: "100.00",
  subtotal: "500.00",
  cargo_personalizacion: "0.00",
  fecha_solicitada: modalidad === "produccion" ? "2026-11-01" : null,
  fecha_comprometida: modalidad === "produccion" ? "2026-11-10" : null,
  caracteristicas: modalidad === "personalizacion" ? "Nombre grabado" : "",
  origen_personalizacion: modalidad === "personalizacion" ? "unidad_estandar" : "",
  ...cambios,
});
const pedidoDTO = (cambios = {}) => ({
  id: 9,
  solicitud: 1,
  propuesta: 1,
  taller: { id: 1, nombre: "Taller" },
  comprador: { id: 2, nombre: "Comprador" },
  estado: "en_cumplimiento",
  vencido_en: null,
  confirmado_en: "2026-10-24T10:00:00-06:00",
  moneda: "NIO",
  modalidad_entrega: "retiro_taller",
  descripcion_entrega: "",
  lineas: [
    linea(14, 1, "stock"),
    linea(15, 2, "produccion"),
    linea(16, 3, "personalizacion"),
    linea(17, 4, "personalizacion", { origen_personalizacion: "desde_cero" }),
  ],
  otros_cargos: [],
  costo_entrega: "0.00",
  subtotal_productos: "2000.00",
  total_personalizacion: "0.00",
  total_otros_cargos: "0.00",
  total: "2000.00",
  ...cambios,
});
const lineaC = (linea, posicion, modalidad, estadoLinea, entregada, iniciado = true) => ({
  linea,
  posicion,
  modalidad,
  cantidad: 5,
  estado: estadoLinea,
  iniciado_en: iniciado ? "2026-10-24T10:00:00-06:00" : null,
  cantidad_entregada: entregada,
  cantidad_pendiente: 5 - entregada,
});
const motivoLargo = "Falta una unidad y otra llegó rota. ".repeat(25).trim();
const cumplimientoDTO = (cambios = {}) => ({
  pedido: 9,
  estado: "en_cumplimiento",
  lineas: [
    lineaC(14, 1, "stock", "en_cumplimiento", 2),
    lineaC(15, 2, "produccion", "pendiente", 0, false),
    lineaC(16, 3, "personalizacion", "pendiente", 0, false),
    lineaC(17, 4, "personalizacion", "entregado", 5),
  ],
  entregas: [
    {
      id: 3,
      numero: 1,
      fecha: "2026-10-24",
      registrado_en: "2026-10-24T15:30:00-06:00",
      lineas: [{ linea: 14, cantidad: 2 }],
      recepcion: null,
    },
    {
      id: 4,
      numero: 2,
      fecha: "2026-10-24",
      registrado_en: "2026-10-24T16:00:00-06:00",
      lineas: [{ linea: 17, cantidad: 5 }],
      recepcion: {
        resultado: "discrepancia",
        motivo: motivoLargo,
        registrado_en: "2026-10-24T17:00:00-06:00",
      },
    },
  ],
  ...cambios,
});

const h = m.React.createElement;
const render = (nodo, qc = new m.rq.QueryClient()) =>
  m.server.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(m.sesionReact.SessionProvider, null, h(m.router.MemoryRouter, null, nodo)),
    ),
  );
const vista = (props) =>
  render(
    h(m.vista.VistaCumplimiento, {
      pedido: m.pedidos.aPedido(pedidoDTO()),
      cumplimiento: m.cumplimiento.aCumplimiento(cumplimientoDTO()),
      recibido: true,
      pagoConfirmado: true,
      ...props,
    }),
  );

await verificar("DTO snake_case → camelCase sin campos crudos", () => {
  const c = m.cumplimiento.aCumplimiento(cumplimientoDTO());
  assert.equal(c.lineas[0].cantidadEntregada, 2);
  assert.equal(c.lineas[0].cantidadPendiente, 3);
  assert.equal(c.lineas[1].iniciadoEn, null);
  assert.equal(c.entregas[0].registradoEn, "2026-10-24T15:30:00-06:00");
  assert.equal(c.entregas[0].recepcion, null);
  assert.equal(c.entregas[1].recepcion.registradoEn, "2026-10-24T17:00:00-06:00");
  const texto = JSON.stringify(c);
  for (const crudo of ["cantidad_entregada", "iniciado_en", "registrado_en"])
    assert.ok(!texto.includes(crudo), crudo);
});

await verificar("rutas exactas bajo la base común, sin duplicar /api/v1", async () => {
  respuesta = cumplimientoDTO();
  await m.cumplimiento.consultarCumplimiento(false, 9);
  assert.match(ultima().url, /\/pedidos\/mios\/9\/cumplimiento\/$/);
  await m.cumplimiento.consultarCumplimiento(true, 9);
  assert.match(ultima().url, /\/pedidos\/recibidos\/9\/cumplimiento\/$/);
  assert.equal(ultima().url.match(/\/api\/v1/g)?.length, 1, "la base común añade /api/v1 una vez");
  const r = m.cumplimiento.rutasCumplimiento;
  assert.equal(r.lectura(false, 9), "/pedidos/mios/9/cumplimiento/");
  assert.equal(r.lectura(true, 9), "/pedidos/recibidos/9/cumplimiento/");
  assert.equal(r.iniciar(9, 14), "/pedidos/recibidos/9/lineas/14/iniciar/");
  assert.equal(r.entregas(9), "/pedidos/recibidos/9/entregas/");
  assert.equal(r.recepcion(9, 3), "/pedidos/mios/9/entregas/3/recepcion/");
});

await verificar("mutaciones con Idempotency-Key y cuerpos del contrato", async () => {
  respuesta = cumplimientoDTO();
  await m.cumplimiento.iniciarLinea(9, 14, "clave-inicio-0000001");
  assert.equal(ultima().method, "POST");
  assert.match(ultima().url, /\/pedidos\/recibidos\/9\/lineas\/14\/iniciar\/$/);
  assert.equal(cabecera(ultima(), "Idempotency-Key"), "clave-inicio-0000001");
  assert.deepEqual(JSON.parse(ultima().body), {});
  await m.cumplimiento.registrarEntrega(
    9,
    {
      fecha: "2026-10-24",
      lineas: [
        { linea: 15, cantidad: 1 },
        { linea: 14, cantidad: 2 },
        { linea: 16, cantidad: 0 },
      ],
    },
    "clave-entrega-000001",
  );
  assert.match(ultima().url, /\/pedidos\/recibidos\/9\/entregas\/$/);
  assert.equal(cabecera(ultima(), "Idempotency-Key"), "clave-entrega-000001");
  assert.deepEqual(JSON.parse(ultima().body), {
    fecha: "2026-10-24",
    lineas: [
      { linea: 14, cantidad: 2 },
      { linea: 15, cantidad: 1 },
    ],
  });
  await m.cumplimiento.registrarRecepcion(
    9,
    3,
    { resultado: "discrepancia", motivo: "  Falta una unidad.  " },
    "clave-recepcion-00001",
  );
  assert.match(ultima().url, /\/pedidos\/mios\/9\/entregas\/3\/recepcion\/$/);
  assert.deepEqual(JSON.parse(ultima().body), {
    resultado: "discrepancia",
    motivo: "Falta una unidad.",
  });
  await m.cumplimiento.registrarRecepcion(
    9,
    3,
    { resultado: "confirmada" },
    "clave-recepcion-00002",
  );
  assert.deepEqual(JSON.parse(ultima().body), { resultado: "confirmada" });
});

await verificar("errores 409 con mensajes de dominio", async () => {
  respuesta = { detail: "x", codigo: "cantidad_entrega_excede_pendiente", lineas: [14] };
  estado = 409;
  await assert.rejects(
    () =>
      m.cumplimiento.registrarEntrega(
        9,
        { fecha: "2026-10-24", lineas: [{ linea: 14, cantidad: 9 }] },
        "clave-entrega-000002",
      ),
    (e) => e.status === 409 && e.codigo === "cantidad_entrega_excede_pendiente",
  );
  estado = 200;
  for (const codigo of [
    "pedido_vencido",
    "pedido_entregado",
    "pago_no_confirmado",
    "linea_ya_iniciada",
    "linea_no_iniciada",
    "cantidad_entrega_excede_pendiente",
    "recepcion_ya_registrada",
  ]) {
    const texto = m.errores.mensajeDominio(new m.http.ApiError(409, "detalle crudo", {}, codigo));
    assert.notEqual(texto, "detalle crudo", codigo);
    assert.ok(texto.length > 10, codigo);
  }
});

await verificar("intento incierto: misma clave; otra huella exige resolver antes", async () => {
  const intento = m.cumplimiento.crearIntentoDeCumplimiento();
  const claves = [];
  fallaRed = true;
  await assert.rejects(() =>
    intento.ejecutar({ pedido: 9, linea: 14 }, async (k) => {
      claves.push(k);
      return m.cumplimiento.iniciarLinea(9, 14, k);
    }),
  );
  assert.ok(intento.incierto);
  await assert.rejects(
    () => intento.ejecutar({ pedido: 9, linea: 15 }, async (k) => k),
    (e) => e.codigo === "resultado_pendiente",
  );
  fallaRed = false;
  respuesta = cumplimientoDTO();
  await intento.ejecutar({ pedido: 9, linea: 14 }, async (k) => {
    claves.push(k);
    return m.cumplimiento.iniciarLinea(9, 14, k);
  });
  assert.equal(claves[0], claves[1], "el reintento conserva la clave");
  assert.ok(!intento.incierto);
  const nueva = await intento.ejecutar({ pedido: 9, linea: 14 }, async (k) => k);
  assert.notEqual(nueva, claves[0], "tras completar, otra operación usa otra clave");
  // Un 409 es una respuesta conocida: no deja el intento incierto.
  estado = 409;
  respuesta = { detail: "x", codigo: "linea_ya_iniciada" };
  const otro = m.cumplimiento.crearIntentoDeCumplimiento();
  await assert.rejects(() => otro.ejecutar({ a: 1 }, (k) => m.cumplimiento.iniciarLinea(9, 14, k)));
  assert.ok(!otro.incierto);
  estado = 200;
});

await verificar("query key con identidad e invalidación sin optimismo", () => {
  assert.deepEqual(m.keys.claves.cumplimiento(7, true, 9), ["cumplimiento-real", 7, true, 9]);
  assert.notDeepEqual(
    m.keys.claves.cumplimiento(7, true, 9),
    m.keys.claves.cumplimiento(8, true, 9),
  );
  const qc = new m.rq.QueryClient();
  const k = m.keys.claves;
  for (const key of [
    k.cumplimiento(7, true, 9),
    k.pedido(7, true, 9),
    k.pedidos(7),
    k.inventario(7),
    k.movimientos(7, 314),
    k.movimientos(7, 999),
  ])
    qc.setQueryData(key, { previo: true });
  const datos = m.cumplimiento.aCumplimiento(cumplimientoDTO());
  m.cumplimiento.refrescarTrasCumplimiento(qc, 7, true, 9, datos, [314]);
  const invalida = (key) => qc.getQueryState(key)?.isInvalidated;
  assert.deepEqual(qc.getQueryData(k.cumplimiento(7, true, 9)), datos, "verdad del servidor");
  assert.ok(invalida(k.pedido(7, true, 9)));
  assert.ok(invalida(k.pedidos(7)));
  assert.ok(invalida(k.inventario(7)));
  assert.ok(invalida(k.movimientos(7, 314)));
  assert.ok(!invalida(k.movimientos(7, 999)), "solo los productos consumidos");
  const qc2 = new m.rq.QueryClient();
  qc2.setQueryData(k.inventario(7), {});
  qc2.setQueryData(k.cumplimiento(7, false, 9), {});
  m.cumplimiento.refrescarTrasCumplimiento(qc2, 7, false, 9, null);
  assert.ok(
    qc2.getQueryState(k.cumplimiento(7, false, 9)).isInvalidated,
    "409: relee del servidor",
  );
  assert.ok(!qc2.getQueryState(k.inventario(7)).isInvalidated, "sin consumo no toca inventario");
  const pedido = m.pedidos.aPedido(pedidoDTO());
  const [st, pr, ue, dc] = pedido.lineas;
  assert.deepEqual(m.cumplimiento.productosConsumidos("iniciar", [st, pr, ue, dc]), [
    ue.producto.id,
  ]);
  assert.deepEqual(m.cumplimiento.productosConsumidos("entregar", [st, pr, ue, dc]), [
    st.producto.id,
  ]);
});

await verificar("artesano: botón de inicio según modalidad, por renglón", () => {
  const html = vista({});
  assert.match(html, /Iniciar producción/);
  assert.match(html, /Iniciar personalización/);
  assert.doesNotMatch(html, /Iniciar preparación/, "stock ya iniciado");
  assert.doesNotMatch(html, /Iniciar el pedido|Iniciar todo/, "sin acción global");
  const pendientes = cumplimientoDTO({
    estado: "confirmado",
    lineas: [lineaC(14, 1, "stock", "pendiente", 0, false)],
    entregas: [],
  });
  const html2 = vista({ cumplimiento: m.cumplimiento.aCumplimiento(pendientes) });
  assert.match(html2, /Iniciar preparación/);
  assert.deepEqual(m.cumplimiento.ACCION_INICIO, {
    stock: "Iniciar preparación",
    produccion: "Iniciar producción",
    personalizacion: "Iniciar personalización",
  });
});

await verificar("artesano sin pago confirmado: sin acciones", () => {
  const html = vista({ pagoConfirmado: false });
  assert.match(html, /cuando confirmes el pago/);
  assert.doesNotMatch(html, /Iniciar (producción|personalización|preparación)/);
  assert.doesNotMatch(html, /Registrar entrega/);
});

await verificar("entregas parciales: solo renglones iniciados con pendiente y su máximo", () => {
  const html = vista({});
  assert.match(html, /Registrar una entrega/);
  assert.match(html, /type="date"/);
  assert.match(html, /max="\d{4}-\d{2}-\d{2}"/, "fecha máxima: hoy en Managua");
  const numeros = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((x) => x[0]);
  assert.equal(numeros.length, 1, "solo la línea de stock iniciada y con pendiente");
  assert.match(numeros[0], /max="3"/);
  assert.match(numeros[0], /min="0"/);
  assert.match(html, /Pendiente: 3/);
  assert.match(html, /Acordado/);
  assert.match(html, /Fecha comprometida/);
  assert.match(html, /Nombre grabado/);
});

await verificar("comprador: historial y respuesta por entrega, sin mezclar pago", () => {
  const html = vista({ recibido: false, pagoConfirmado: false });
  assert.match(html, /Entrega #1/);
  assert.match(html, /Entrega #2/);
  assert.match(html, /Producto 1/);
  assert.match(html, /2 unidades/);
  assert.match(html, /Confirmar recepción/);
  assert.match(html, /Registrar discrepancia/);
  assert.equal(html.match(/Confirmar recepción/g).length, 1, "solo la entrega sin respuesta");
  assert.match(html, /Discrepancia registrada/);
  assert.ok(html.includes(motivoLargo.slice(0, 40)));
  assert.doesNotMatch(
    html,
    /Iniciar (preparación|producción|personalización)|Registrar una entrega|pago/i,
  );
});

await verificar("artesano ve la respuesta del comprador sin poder responder", () => {
  const html = vista({});
  assert.match(html, /El comprador todavía no respondió/);
  assert.doesNotMatch(html, /Confirmar recepción/);
});

await verificar("pedido entregado y vencido: sin acciones de cumplimiento", () => {
  const entregado = cumplimientoDTO({
    estado: "entregado",
    lineas: [lineaC(14, 1, "stock", "entregado", 5)],
  });
  const html = vista({ cumplimiento: m.cumplimiento.aCumplimiento(entregado) });
  assert.match(html, /Se entregaron todas las cantidades acordadas/);
  assert.doesNotMatch(
    html,
    /Registrar una entrega|Iniciar (preparación|producción|personalización)/,
  );
  assert.match(html, /Historial de entregas/);
  const vencido = cumplimientoDTO({
    estado: "vencido_falta_pago",
    lineas: [lineaC(14, 1, "stock", "pendiente", 0, false)],
    entregas: [],
  });
  const html2 = vista({ cumplimiento: m.cumplimiento.aCumplimiento(vencido) });
  assert.match(html2, /venció por falta de pago/);
  assert.doesNotMatch(
    html2,
    /Iniciar (preparación|producción|personalización)|Registrar una entrega/,
  );
});

await verificar("estados globales nuevos con texto e icono propios", () => {
  const a = render(h(m.pagina.EstadoPedidoBadge, { estado: "en_cumplimiento" }));
  const b = render(h(m.pagina.EstadoPedidoBadge, { estado: "entregado" }));
  assert.match(a, /En cumplimiento/);
  assert.match(b, /Entregado/);
  assert.match(a, /Estado del pedido/);
  assert.notEqual(a.match(/<svg[^>]*class="([^"]*)"/)[1], b.match(/<svg[^>]*class="([^"]*)"/)[1]);
  for (const e of ["aceptado", "en_produccion", "listo_para_entrega"])
    assert.ok(!(e in m.pedidos.ESTADO_PEDIDO_LABELS), `sin estado histórico ${e}`);
});

await verificar("detalle del pedido integra el seguimiento real", () => {
  const html = render(
    h(m.pagina.ContenidoPedidoConfirmado, {
      pedido: m.pedidos.aPedido(pedidoDTO()),
      pago: h("p", null, "SECCION-PAGO"),
      cumplimiento: h("p", null, "SECCION-CUMPLIMIENTO"),
    }),
  );
  assert.match(html, /SECCION-CUMPLIMIENTO/);
  assert.doesNotMatch(html, /próxima etapa/);
  const fuente = readFileSync(
    new URL("../src/features/pedidos/pages/confirmados.tsx", import.meta.url),
    "utf8",
  );
  assert.match(fuente, /<CumplimientoPedido pedido=\{query\.data\} recibido=\{recibido\} \/>/);
});

await verificar("historial de inventario: consumo con texto neutro", () => {
  const fuente = readFileSync(
    new URL("../src/features/inventario/pages/inventario.tsx", import.meta.url),
    "utf8",
  );
  assert.match(fuente, /consumo: "Consumo de unidad reservada"/);
  assert.doesNotMatch(fuente, /consumo: "Entrega"/);
  assert.match(fuente, /m\.motivo/, "el motivo/contexto se muestra");
});

await verificar("fecha local de Managua, no UTC del navegador", () => {
  assert.equal(m.cumplimiento.hoyEnManagua(new Date("2026-10-25T02:00:00Z")), "2026-10-24");
  assert.equal(m.cumplimiento.hoyEnManagua(new Date("2026-10-25T06:00:00Z")), "2026-10-25");
});

await verificar("responsive: sin anchos fijos, ajuste de texto largo y objetivos táctiles", () => {
  const html = vista({ recibido: false });
  assert.match(html, /min-w-0/);
  assert.match(html, /flex-wrap/);
  assert.match(html, /break-words/);
  assert.doesNotMatch(html, /\bw-\[\d+px\]|min-w-\[\d+px\]/, "sin anchos fijos en píxeles");
  const botones = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((x) => x[1]);
  assert.ok(botones.length > 0);
  for (const clase of botones) assert.match(clase, /min-h-11|size-11/, "objetivo táctil de 44 px");
});

console.log(`OK: ${grupos} grupos de cumplimiento AUD-12.`);
process.exit(0);
