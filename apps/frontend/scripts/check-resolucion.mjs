// AUD-13: cliente HTTP de resolución (cancelación, cierre parcial, reembolso, clasificación),
// su interfaz y la línea de tiempo terminal.
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
    resolucion: "@/features/pedidos/resolucion",
    vista: "@/features/pedidos/components/resolucion-pedido",
    cumplimiento: "@/features/pedidos/cumplimiento",
    vistaCumplimiento: "@/features/pedidos/components/cumplimiento-pedido",
    progreso: "@/features/pedidos/progreso",
    progresoVista: "@/features/pedidos/components/progreso-pedido",
    pago: "@/features/pagos/components/pago-pedido",
    pedidos: "@/features/pedidos/confirmados",
    pagina: "@/features/pedidos/pages/confirmados",
    errores: "@/lib/errores-dominio",
    importes: "@/lib/importes",
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
globalThis.fetch = async (url, init) => {
  peticiones.push({ url: String(url), ...init });
  return new Response(JSON.stringify(respuesta), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
};
m.http.establecerTokenDeAcceso("access-en-memoria");
const ultima = () => peticiones.at(-1);
const cabecera = (p, nombre) => new Headers(p.headers).get(nombre);
const importe = (x) => m.importes.mostrarImporte(x);

// --- Datos de contrato ---
const lineaPedido = (id, posicion, modalidad, nombre, cambios = {}) => ({
  id,
  posicion,
  renglon: id + 100,
  linea_propuesta: id + 200,
  producto: { id: id + 300, nombre, categoria: { id: 1, nombre: "Cerámica" } },
  modalidad,
  cantidad: 5,
  precio_unitario: "100.00",
  subtotal: "500.00",
  cargo_personalizacion: "0.00",
  fecha_solicitada: null,
  fecha_comprometida: null,
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
  modalidad_entrega: "entrega_artesano",
  descripcion_entrega: "",
  lineas: [
    lineaPedido(14, 1, "stock", "Jarrón base"),
    lineaPedido(15, 2, "personalizacion", "Plato grabado", { cantidad: 2 }),
  ],
  otros_cargos: [],
  costo_entrega: "50.00",
  subtotal_productos: "700.00",
  total_personalizacion: "0.00",
  total_otros_cargos: "0.00",
  total: "750.00",
  ...cambios,
});
const lineaCierre = (linea, posicion, acordada, entregada, imp) => ({
  linea,
  posicion,
  cantidad_acordada: acordada,
  cantidad_entregada: entregada,
  cantidad_no_entregada: acordada - entregada,
  importe_reembolso: imp,
});
const motivoLargo = "No será posible completar las cantidades restantes del pedido. ".repeat(14);
const cierre = (cambios = {}) => ({
  id: 3,
  numero: 1,
  estado: "pendiente",
  motivo: motivoLargo,
  propuesto_en: "2026-10-24T12:00:00-06:00",
  lineas: [lineaCierre(14, 1, 5, 2, "321.43"), lineaCierre(15, 2, 2, 2, "0.00")],
  monto_reembolso: "321.43",
  decision: null,
  ...cambios,
});
const accion = (disponible, codigo = null) => ({ disponible, codigo });
const resolucionDTO = (cambios = {}) => ({
  pedido: 9,
  estado: "en_cumplimiento",
  cancelacion: null,
  cierres_parciales: [],
  reembolso: null,
  acciones: {
    cancelar: accion(true),
    proponer_cierre: accion(false, "cierre_requiere_entrega_parcial"),
  },
  estimacion_cierre: null,
  ...cambios,
});
const reembolsoDTO = (cambios = {}) => ({
  id: 4,
  tipo: "parcial",
  monto: "321.43",
  moneda: "NIO",
  estado: "pendiente",
  origen: "cierre_parcial",
  cierre: 3,
  creado_en: "2026-10-24T13:00:00-06:00",
  devolucion: null,
  ...cambios,
});
const clasificacionesDTO = (cambios = {}) => ({
  pedido: 9,
  obligaciones: [
    {
      id: 8,
      linea: 15,
      posicion: 2,
      producto: { id: 315, nombre: "Jarrón base" },
      origen: "cierre_parcial",
      cantidad: 3,
      cantidad_clasificada: 1,
      cantidad_pendiente: 2,
      creado_en: "2026-10-24T13:00:00-06:00",
      clasificaciones: [
        {
          id: 1,
          cantidad: 1,
          resultado: "baja",
          motivo: "La transformación impide revenderla.",
          registrado_en: "2026-10-24T14:00:00-06:00",
        },
      ],
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
const vista = (dto, { recibido = true, pedido = pedidoDTO() } = {}) =>
  render(
    h(m.vista.VistaResolucion, {
      pedido: m.pedidos.aPedido(pedido),
      resolucion: m.resolucion.aResolucion(dto),
      recibido,
    }),
  );

await verificar("DTO snake_case → camelCase sin campos crudos", () => {
  const r = m.resolucion.aResolucion(
    resolucionDTO({
      cancelacion: { motivo: "x", registrado_en: "2026-10-24T10:00:00-06:00" },
      cierres_parciales: [cierre()],
      reembolso: reembolsoDTO({
        estado: "realizado",
        devolucion: {
          fecha: "2026-10-24",
          monto: "321.43",
          referencia: "TRX",
          registrado_en: "2026-10-24T15:00:00-06:00",
        },
      }),
      estimacion_cierre: { lineas: [lineaCierre(14, 1, 5, 2, "1.00")], monto_reembolso: "1.00" },
    }),
  );
  assert.equal(r.cierresParciales[0].lineas[0].cantidadNoEntregada, 3);
  assert.equal(r.cierresParciales[0].montoReembolso, "321.43");
  assert.equal(r.reembolso.devolucion.registradoEn, "2026-10-24T15:00:00-06:00");
  assert.deepEqual(r.acciones.proponerCierre, {
    disponible: false,
    codigo: "cierre_requiere_entrega_parcial",
  });
  assert.equal(r.estimacionCierre.montoReembolso, "1.00");
  const c = m.resolucion.aClasificaciones(clasificacionesDTO());
  assert.equal(c.obligaciones[0].cantidadPendiente, 2);
  const texto = JSON.stringify([r, c]);
  for (const crudo of [
    "cantidad_no_entregada",
    "monto_reembolso",
    "registrado_en",
    "proponer_cierre",
    "cantidad_pendiente",
  ])
    assert.ok(!texto.includes(crudo), crudo);
});

await verificar("rutas exactas y cuerpos sin montos del cliente", async () => {
  const r = m.resolucion.rutasResolucion;
  assert.equal(r.lectura(false, 9), "/pedidos/mios/9/resolucion/");
  assert.equal(r.lectura(true, 9), "/pedidos/recibidos/9/resolucion/");
  assert.equal(r.cancelacion(9), "/pedidos/recibidos/9/cancelacion/");
  assert.equal(r.cierres(9), "/pedidos/recibidos/9/cierres-parciales/");
  assert.equal(r.respuesta(9, 3), "/pedidos/mios/9/cierres-parciales/3/respuesta/");
  assert.equal(r.devolucion(9), "/pedidos/recibidos/9/reembolso/realizacion/");
  assert.equal(r.clasificaciones(9), "/pedidos/recibidos/9/clasificaciones/");
  respuesta = resolucionDTO();
  await m.resolucion.consultarResolucion(false, 9);
  assert.match(ultima().url, /\/pedidos\/mios\/9\/resolucion\/$/);
  assert.equal(ultima().url.match(/\/api\/v1/g)?.length, 1);
  await m.resolucion.cancelarPedido(9, "  Sin horno.  ", "clave-cancelar-000001");
  assert.equal(ultima().method, "POST");
  assert.equal(cabecera(ultima(), "Idempotency-Key"), "clave-cancelar-000001");
  assert.deepEqual(JSON.parse(ultima().body), { motivo: "Sin horno." });
  await m.resolucion.proponerCierre(9, " No podré. ", "clave-cierre-00000001");
  assert.deepEqual(JSON.parse(ultima().body), { motivo: "No podré." });
  await m.resolucion.responderCierre(9, 3, { decision: "aceptado" }, "clave-respuesta-00001");
  assert.match(ultima().url, /\/pedidos\/mios\/9\/cierres-parciales\/3\/respuesta\/$/);
  assert.deepEqual(JSON.parse(ultima().body), { decision: "aceptado" });
  await m.resolucion.responderCierre(
    9,
    3,
    { decision: "objetado", motivo: "  Prefiero esperar.  " },
    "clave-respuesta-00002",
  );
  assert.deepEqual(JSON.parse(ultima().body), {
    decision: "objetado",
    motivo: "Prefiero esperar.",
  });
  await m.resolucion.registrarDevolucion(
    9,
    { fecha: "2026-10-24", referencia: "  Transferencia BAC 12345 " },
    "clave-devolucion-0001",
  );
  assert.deepEqual(JSON.parse(ultima().body), {
    fecha: "2026-10-24",
    referencia: "Transferencia BAC 12345",
  });
  assert.doesNotMatch(ultima().body, /monto|moneda|estado/, "nunca monto, moneda ni estado");
  respuesta = clasificacionesDTO();
  await m.resolucion.clasificarInventario(
    9,
    [
      { obligacion: 9, cantidad: 1, resultado: "baja", motivo: " Rota " },
      { obligacion: 8, cantidad: 2, resultado: "reutilizable", motivo: "Intacta" },
    ],
    "clave-clasificar-0001",
  );
  assert.deepEqual(JSON.parse(ultima().body), {
    clasificaciones: [
      { obligacion: 8, cantidad: 2, resultado: "reutilizable", motivo: "Intacta" },
      { obligacion: 9, cantidad: 1, resultado: "baja", motivo: "Rota" },
    ],
  });
});

await verificar("códigos 409 de AUD-13 con mensajes de dominio", () => {
  for (const codigo of [
    "pedido_finalizado",
    "cancelacion_requiere_sin_entregas",
    "pago_pendiente_de_resolucion",
    "cierre_requiere_entrega_parcial",
    "cierre_parcial_pendiente",
    "cierre_ya_resuelto",
    "reembolso_ya_realizado",
    "clasificacion_excede_pendiente",
  ]) {
    const texto = m.errores.mensajeDominio(new m.http.ApiError(409, "detalle crudo", {}, codigo));
    assert.notEqual(texto, "detalle crudo", codigo);
    assert.ok(texto.length > 10, codigo);
  }
});

await verificar("query keys con identidad e invalidación sin optimismo", () => {
  const k = m.keys.claves;
  assert.deepEqual(k.resolucion(7, true, 9), ["resolucion-real", 7, true, 9]);
  assert.deepEqual(k.clasificacionesPedido(7, true, 9), [
    "clasificaciones-pedido-real",
    7,
    true,
    9,
  ]);
  assert.notDeepEqual(k.resolucion(7, true, 9), k.resolucion(8, true, 9));
  assert.notDeepEqual(k.resolucion(7, true, 9), k.resolucion(7, false, 9));
  const qc = new m.rq.QueryClient();
  const claves = [
    k.resolucion(7, true, 9),
    k.pedido(7, true, 9),
    k.pedidos(7),
    k.cumplimiento(7, true, 9),
    k.pago(7, true, 9),
    k.inventario(7),
    k.movimientos(7, 314),
    k.movimientos(7, 999),
    k.clasificacionesPedido(7, true, 9),
  ];
  for (const key of claves) qc.setQueryData(key, { previo: true });
  const datos = m.resolucion.aResolucion(resolucionDTO());
  m.resolucion.refrescarTrasResolucion(qc, 7, true, 9, datos, [314]);
  const invalida = (key) => qc.getQueryState(key)?.isInvalidated;
  assert.deepEqual(qc.getQueryData(k.resolucion(7, true, 9)), datos, "verdad del servidor");
  for (const key of claves.slice(1, 7)) assert.ok(invalida(key), JSON.stringify(key));
  assert.ok(invalida(k.clasificacionesPedido(7, true, 9)));
  assert.ok(!invalida(k.movimientos(7, 999)), "solo productos afectados");
  const qc2 = new m.rq.QueryClient();
  qc2.setQueryData(k.inventario(7), {});
  qc2.setQueryData(k.resolucion(7, false, 9), {});
  m.resolucion.refrescarTrasResolucion(qc2, 7, false, 9, null);
  assert.ok(qc2.getQueryState(k.resolucion(7, false, 9)).isInvalidated, "409: relee");
  assert.ok(!qc2.getQueryState(k.inventario(7)).isInvalidated, "sin cambio de inventario");
  const pedido = m.pedidos.aPedido(pedidoDTO());
  assert.deepEqual(m.resolucion.productosConReserva(pedido.lineas), [314, 315]);
});

await verificar("cancelación disponible antes de entrega", () => {
  const html = vista(resolucionDTO());
  assert.match(html, /Cancelar pedido/);
  assert.match(html, /antes de cualquier entrega/);
  assert.doesNotMatch(html, /Proponer cierre parcial/);
});

await verificar("cancelación oculta después de entrega", () => {
  const html = vista(
    resolucionDTO({
      acciones: {
        cancelar: accion(false, "cancelacion_requiere_sin_entregas"),
        proponer_cierre: accion(false, "cierre_parcial_pendiente"),
      },
    }),
  );
  assert.doesNotMatch(html, /Cancelar pedido/);
  assert.equal(html, "", "sin bloques no se muestra la sección");
});

await verificar("pago en revisión bloquea cancelación", () => {
  const html = vista(
    resolucionDTO({
      acciones: {
        cancelar: accion(false, "pago_pendiente_de_resolucion"),
        proponer_cierre: accion(false, "cierre_requiere_entrega_parcial"),
      },
    }),
  );
  assert.doesNotMatch(html, /Confirmar cancelación|>Cancelar pedido<\/button>/);
  assert.match(html, /pago registrado u observado sin resolver/);
});

await verificar("cierre parcial disponible solo con entrega parcial y monto del servidor", () => {
  const estimacion = { lineas: cierre().lineas, monto_reembolso: "321.43" };
  const html = vista(
    resolucionDTO({
      acciones: {
        cancelar: accion(false, "cancelacion_requiere_sin_entregas"),
        proponer_cierre: accion(true),
      },
      estimacion_cierre: estimacion,
    }),
  );
  assert.match(html, /Proponer cierre parcial/);
  assert.match(html, /Reembolso estimado/);
  assert.ok(html.includes(importe("321.43")), "monto exacto del servidor");
  assert.match(html, /Entregado/);
  assert.match(html, /No entregado/);
  assert.match(html, /Jarrón base/);
  // Sin estimación (no procede) no se ofrece aunque la acción dijera disponible.
  const sin = vista(
    resolucionDTO({ acciones: { cancelar: accion(false, "x"), proponer_cierre: accion(true) } }),
  );
  assert.doesNotMatch(sin, /Proponer cierre parcial/);
  const fuente = readFileSync(
    new URL("../src/features/pedidos/components/resolucion-pedido.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(fuente, /parseFloat|Number\([^)]*importe|toFixed/, "sin cálculo de montos");
});

await verificar("cierre pendiente: artesano espera; comprador acepta u objeta", () => {
  const dto = resolucionDTO({
    cierres_parciales: [cierre()],
    acciones: {
      cancelar: accion(false, "x"),
      proponer_cierre: accion(false, "cierre_parcial_pendiente"),
    },
  });
  const artesano = vista(dto);
  assert.match(artesano, /Esperando respuesta del comprador/);
  assert.doesNotMatch(artesano, /Aceptar cierre|Objetar/);
  const comprador = vista(dto, { recibido: false });
  for (const texto of [
    /Propuesta de cierre parcial/,
    /Motivo del taller/,
    /Reembolso resultante/,
    /Aceptar cierre/,
    />Objetar</,
    /No entregado/,
  ])
    assert.match(comprador, texto);
  assert.ok(comprador.includes(importe("321.43")));
  assert.ok(comprador.includes(motivoLargo.slice(0, 50)));
  assert.doesNotMatch(comprador, /Cancelar pedido|Proponer cierre parcial/);
});

await verificar("aceptación: historial y reembolso parcial pendiente", () => {
  const dto = resolucionDTO({
    estado: "cerrado_parcial",
    cierres_parciales: [
      cierre({
        estado: "aceptado",
        decision: { decision: "aceptado", motivo: "", registrado_en: "2026-10-24T13:00:00-06:00" },
      }),
    ],
    reembolso: reembolsoDTO(),
    acciones: {
      cancelar: accion(false, "pedido_finalizado"),
      proponer_cierre: accion(false, "pedido_finalizado"),
    },
  });
  const html = vista(dto, { recibido: false });
  assert.match(html, /Cierre aceptado/);
  assert.match(html, /Reembolso parcial/);
  assert.match(html, />Pendiente</);
  assert.match(html, /Cierre parcial #1/);
  assert.doesNotMatch(html, /Aceptar cierre|Cancelar pedido|Proponer cierre parcial/);
});

await verificar("objeción y nuevo cierre tras objeción", () => {
  const objetado = cierre({
    estado: "objetado",
    decision: {
      decision: "objetado",
      motivo: "Prefiero esperar el resto.",
      registrado_en: "2026-10-24T13:00:00-06:00",
    },
  });
  const nuevo = cierre({ id: 5, numero: 2, motivo: "Segundo intento" });
  const html = vista(
    resolucionDTO({
      cierres_parciales: [objetado, nuevo],
      acciones: {
        cancelar: accion(false, "x"),
        proponer_cierre: accion(false, "cierre_parcial_pendiente"),
      },
    }),
    { recibido: false },
  );
  assert.match(html, /Cierre objetado/);
  assert.match(html, /Prefiero esperar el resto/);
  assert.match(html, /Propuestas de cierre anteriores/);
  assert.match(html, /Segundo intento/);
  assert.equal(html.match(/Aceptar cierre/g).length, 1, "solo el cierre pendiente");
});

await verificar(
  "reembolso pendiente: el artesano registra la devolución sin campo de monto",
  () => {
    const dto = resolucionDTO({
      estado: "cancelado_artesano",
      cancelacion: { motivo: "El horno se dañó.", registrado_en: "2026-10-24T10:00:00-06:00" },
      reembolso: reembolsoDTO({
        tipo: "total",
        origen: "cancelacion",
        cierre: null,
        monto: "750.00",
      }),
      acciones: {
        cancelar: accion(false, "pedido_finalizado"),
        proponer_cierre: accion(false, "pedido_finalizado"),
      },
    });
    const artesano = vista(dto);
    assert.match(artesano, /Reembolso total/);
    assert.match(artesano, /Cancelación del taller/);
    assert.match(artesano, /Registrar devolución realizada/);
    assert.match(artesano, /Cancelado por el taller/);
    assert.match(artesano, /El horno se dañó/);
    assert.ok(artesano.includes(importe("750.00")));
    assert.doesNotMatch(artesano, /name="monto"|id="[^"]*monto/);
    const comprador = vista(dto, { recibido: false });
    assert.doesNotMatch(comprador, /Registrar devolución realizada/);
    assert.match(comprador, /debe devolverte este importe/);
  },
);

await verificar("reembolso realizado: fecha y referencia, sin acciones", () => {
  const html = vista(
    resolucionDTO({
      estado: "cerrado_parcial",
      reembolso: reembolsoDTO({
        estado: "realizado",
        devolucion: {
          fecha: "2026-10-25",
          monto: "321.43",
          referencia: "Transferencia BAC 12345",
          registrado_en: "2026-10-25T09:00:00-06:00",
        },
      }),
      acciones: {
        cancelar: accion(false, "pedido_finalizado"),
        proponer_cierre: accion(false, "pedido_finalizado"),
      },
    }),
  );
  assert.match(html, />Realizado</);
  assert.match(html, /Transferencia BAC 12345/);
  assert.match(html, /Fecha de la devolución/);
  assert.doesNotMatch(html, /Registrar devolución/);
});

await verificar("clasificación reutilizable y baja, solo para el artesano", () => {
  const html = render(
    h(m.vista.VistaClasificaciones, {
      pedido: 9,
      obligaciones: m.resolucion.aClasificaciones(clasificacionesDTO()).obligaciones,
    }),
  );
  assert.match(html, /Unidades por clasificar/);
  assert.match(html, /Producto: Jarrón base/);
  assert.match(html, /Pendientes: 2/);
  assert.match(html, />Reutilizable<\/button>/);
  assert.match(html, />Baja<\/button>/);
  assert.match(html, /Obligatorio en ambos casos/);
  assert.match(html, /max="2"/);
  assert.match(html, /Historial de clasificación/);
  assert.match(html, /La transformación impide revenderla/);
  const completa = clasificacionesDTO();
  completa.obligaciones[0] = {
    ...completa.obligaciones[0],
    cantidad_clasificada: 3,
    cantidad_pendiente: 0,
  };
  const html2 = render(
    h(m.vista.VistaClasificaciones, {
      pedido: 9,
      obligaciones: m.resolucion.aClasificaciones(completa).obligaciones,
    }),
  );
  assert.match(html2, /Clasificación completa/);
  assert.doesNotMatch(html2, />Reutilizable<\/button>|>Baja<\/button>/);
  assert.equal(
    render(h(m.vista.VistaClasificaciones, { pedido: 9, obligaciones: [] })),
    "",
    "sin obligaciones no hay tarjeta",
  );
  const fuente = readFileSync(
    new URL("../src/features/pedidos/components/resolucion-pedido.tsx", import.meta.url),
    "utf8",
  );
  assert.match(fuente, /recibido && finalizado \? <ClasificacionInventarioPedido/);
});

// --- Línea de tiempo terminal ---
const pasos = (estadoPedido, estadoPago, lineasIniciadas = 0, entregas = 0) =>
  m.progreso.pasosProgreso({
    estadoPedido,
    estadoPago,
    cumplimiento: {
      pedido: 9,
      estado: estadoPedido,
      lineas: Array.from({ length: 2 }, (_, i) => ({
        linea: 14 + i,
        posicion: i + 1,
        modalidad: "stock",
        cantidad: 5,
        estado: "pendiente",
        iniciadoEn: i < lineasIniciadas ? "2026-10-24T10:00:00-06:00" : null,
        cantidadEntregada: 0,
        cantidadPendiente: 5,
      })),
      entregas: Array.from({ length: entregas }, (_, i) => ({
        id: i + 1,
        numero: i + 1,
        fecha: "2026-10-24",
        registradoEn: "2026-10-24T11:00:00-06:00",
        lineas: [],
        recepcion: null,
      })),
    },
  });
const timeline = (lista) => render(h(m.progresoVista.LineaTiempoPedido, { pasos: lista }));

await verificar("timeline cancelado: terminal sin «Pedido entregado» futuro", () => {
  const sinPago = pasos("cancelado_artesano", "pendiente");
  assert.deepEqual(
    sinPago.map((p) => p.clave),
    ["confirmado", "cancelado"],
  );
  const pagado = pasos("cancelado_artesano", "confirmado", 1);
  assert.deepEqual(
    pagado.map((p) => `${p.clave}:${p.estado}`),
    [
      "confirmado:completado",
      "pago:completado",
      "cumplimiento:completado",
      "cancelado:final_negativo",
    ],
  );
  const html = timeline(pagado);
  assert.match(html, /Cancelado por el taller/);
  assert.match(html, /Estado final/);
  assert.match(html, /lucide-x/);
  assert.match(html, /text-destructive/);
  assert.doesNotMatch(html, /Pedido entregado/);
});

await verificar("timeline cerrado parcial: comunicado con texto, no como entregado", () => {
  const lista = pasos("cerrado_parcial", "confirmado", 2, 1);
  assert.deepEqual(
    lista.map((p) => `${p.clave}:${p.estado}`),
    [
      "confirmado:completado",
      "pago:completado",
      "cumplimiento:completado",
      "entregas:completado",
      "cerrado_parcial:final_parcial",
    ],
  );
  assert.equal(lista[3].label, "Entrega parcial");
  assert.equal(lista[4].label, "Cerrado parcialmente");
  const html = timeline(lista);
  assert.match(html, /Cerrado parcialmente/);
  assert.match(html, />Estado final</);
  assert.doesNotMatch(html, /Pedido entregado|Paso actual/);
});

await verificar("sin acciones después de estado terminal o con cierre pendiente", () => {
  const pedido = m.pedidos.aPedido(pedidoDTO());
  const cumplimiento = (estadoPedido) =>
    m.cumplimiento.aCumplimiento({
      pedido: 9,
      estado: estadoPedido,
      lineas: [
        {
          linea: 14,
          posicion: 1,
          modalidad: "stock",
          cantidad: 5,
          estado: "en_cumplimiento",
          iniciado_en: "2026-10-24T10:00:00-06:00",
          cantidad_entregada: 2,
          cantidad_pendiente: 3,
        },
        {
          linea: 15,
          posicion: 2,
          modalidad: "personalizacion",
          cantidad: 2,
          estado: "pendiente",
          iniciado_en: null,
          cantidad_entregada: 0,
          cantidad_pendiente: 2,
        },
      ],
      entregas: [],
    });
  const acciones = /Registrar una entrega|Iniciar (preparación|producción|personalización)/;
  const verVista = (estadoPedido, extra = {}) =>
    render(
      h(m.vistaCumplimiento.VistaCumplimiento, {
        pedido,
        cumplimiento: cumplimiento(estadoPedido),
        recibido: true,
        pagoConfirmado: true,
        ...extra,
      }),
    );
  assert.match(verVista("en_cumplimiento"), acciones, "control: con acciones");
  const cancelado = verVista("cancelado_artesano");
  assert.doesNotMatch(cancelado, acciones);
  assert.match(cancelado, /canceló el pedido/);
  assert.match(cancelado, /Historial de entregas/);
  const cerrado = verVista("cerrado_parcial");
  assert.doesNotMatch(cerrado, acciones);
  assert.match(cerrado, /se cerró parcialmente/);
  const pendiente = verVista("en_cumplimiento", { cierrePendiente: true });
  assert.doesNotMatch(pendiente, acciones);
  assert.match(pendiente, /esperando la respuesta del comprador/);
  const fuente = readFileSync(
    new URL("../src/features/pedidos/components/cumplimiento-pedido.tsx", import.meta.url),
    "utf8",
  );
  assert.match(fuente, /: recibido\s*\}/, "sin resolución cargada, el artesano no ve acciones");
  assert.match(fuente, /queryKey: claves\.resolucion\(usuario\?\.id, recibido, pedido\.id\)/);
  const pago = render(
    h(m.pago.VistaPago, {
      pago: {
        estado: "pendiente",
        total: "750.00",
        moneda: "NIO",
        registrableHasta: null,
        plazoVencido: false,
        intentos: [],
      },
      recibido: false,
      pedidoFinalizado: true,
    }),
  );
  assert.match(pago, /El pedido finalizó/);
  assert.doesNotMatch(pago, /Registrar (el )?pago/);
});

await verificar("estados nuevos con texto e icono propios", () => {
  const a = render(h(m.pagina.EstadoPedidoBadge, { estado: "cancelado_artesano" }));
  const b = render(h(m.pagina.EstadoPedidoBadge, { estado: "cerrado_parcial" }));
  assert.match(a, /Cancelado por el taller/);
  assert.match(b, /Cerrado parcialmente/);
  assert.match(a, /Estado del pedido/);
  assert.notEqual(a.match(/<svg[^>]*class="([^"]*)"/)[1], b.match(/<svg[^>]*class="([^"]*)"/)[1]);
  assert.deepEqual([...m.pedidos.ESTADOS_TERMINALES].sort(), [
    "cancelado_artesano",
    "cerrado_parcial",
    "entregado",
    "vencido_falta_pago",
  ]);
});

await verificar("integración en el detalle existente, sin páginas nuevas", () => {
  const html = render(
    h(m.pagina.ContenidoPedidoConfirmado, {
      pedido: m.pedidos.aPedido(pedidoDTO()),
      pago: h("p", null, "SECCION-PAGO"),
      resolucion: h("p", null, "SECCION-RESOLUCION"),
      cumplimiento: h("p", null, "SECCION-CUMPLIMIENTO"),
    }),
  );
  const orden = ["SECCION-PAGO", "SECCION-RESOLUCION", "SECCION-CUMPLIMIENTO"].map((t) =>
    html.indexOf(t),
  );
  assert.ok(orden.every((p) => p >= 0));
  assert.deepEqual(
    [...orden].sort((x, y) => x - y),
    orden,
  );
  const fuente = readFileSync(
    new URL("../src/features/pedidos/pages/confirmados.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    fuente,
    /resolucion=\{<ResolucionPedido pedido=\{query\.data\} recibido=\{recibido\} \/>\}/,
  );
  const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /resolucion|reembolso|clasificaci/i, "sin rutas nuevas");
});

await verificar("responsive: sin anchos fijos, texto largo y objetivos táctiles", () => {
  const html = vista(
    resolucionDTO({
      cierres_parciales: [cierre()],
      reembolso: reembolsoDTO(),
      acciones: { cancelar: accion(false, "x"), proponer_cierre: accion(false, "x") },
    }),
    { recibido: false },
  );
  const clasif = render(
    h(m.vista.VistaClasificaciones, {
      pedido: 9,
      obligaciones: m.resolucion.aClasificaciones(clasificacionesDTO()).obligaciones,
    }),
  );
  for (const fragmento of [html, clasif]) {
    assert.match(fragmento, /min-w-0/);
    assert.match(fragmento, /flex-wrap/);
    assert.match(fragmento, /break-words/);
    assert.doesNotMatch(fragmento, /\bw-\[\d+px\]|min-w-\[\d+px\]/, "sin anchos fijos en píxeles");
    const botones = [...fragmento.matchAll(/<button[^>]*class="([^"]*)"/g)].map((x) => x[1]);
    assert.ok(botones.length > 0);
    for (const clase of botones)
      assert.match(clase, /min-h-11|size-11/, "objetivo táctil de 44 px");
  }
  assert.match(html, /grid-cols-2 gap-2 text-sm sm:grid-cols-4/, "desglose en 2 columnas en móvil");
});

console.log(`OK: ${grupos} grupos de resolución AUD-13.`);
process.exit(0);
