import assert from "node:assert/strict";
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
    inventario: "@/features/inventario/api",
    pedidos: "@/features/pedidos/confirmados",
    decision: "@/features/solicitudes/decision",
    intento: "@/lib/intento-seguro",
    conflictos: "@/lib/errores-dominio",
    importes: "@/lib/importes",
    formato: "@/lib/format",
    queries: "@/features/solicitudes/queries",
    keys: "@/lib/query-keys",
    nav: "@/components/layout/navigation",
    validacion: "@/features/inventario/validacion",
    React: "react",
    server: "react-dom/server",
    router: "react-router",
    vistaPedido: "@/features/pedidos/pages/confirmados",
    vistaInventario: "@/features/inventario/pages/inventario",
    revision: "@/features/solicitudes/components/revision",
    entrega: "@/features/solicitudes/entrega",
    esquemaPropuesta: "@/features/solicitudes/esquema-propuesta",
    validacionSolicitud: "@/features/solicitudes/validacion",
    rq: "@tanstack/react-query",
    sesion: "@/features/auth/sesion",
    sesionReact: "@/features/auth/use-session",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
let grupos = 0;
function verificar(nombre, fn) {
  fn();
  grupos++;
  console.log("OK", nombre);
}
const peticiones = [];
let respuesta = {};
let estado = 200;
globalThis.fetch = async (url, init) => {
  peticiones.push({ url, ...init });
  return new Response(JSON.stringify(respuesta), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
};
m.http.establecerTokenDeAcceso("access-en-memoria");
const producto = {
  id: 16,
  nombre: "Jarrón histórico",
  categoria: { id: 1, codigo: "barro", nombre: "Barro histórico" },
};
const inv = {
  id: 1,
  producto,
  existencia_fisica: 10,
  reservada: 3,
  disponible: 7,
  inicializado_en: "2026-10-22T10:00:00-06:00",
  actualizado_en: "2026-10-22T10:00:00-06:00",
};
respuesta = inv;
const inicial = await m.inventario.modificarInventario(
  16,
  { accion: "inicial", cantidad: 10 },
  "inicial-clave",
);
verificar("existencia inicial, payload permitido e Idempotency-Key", () => {
  const p = peticiones.at(-1);
  assert.equal(p.url, "/api/v1/inventario/productos/16/inicial/");
  assert.deepEqual(JSON.parse(p.body), { cantidad: 10 });
  assert.equal(p.headers["Idempotency-Key"], "inicial-clave");
  assert.equal(p.headers.Authorization, "Bearer access-en-memoria");
  assert.equal(p.credentials, "include");
  assert.equal(inicial.disponible, 7);
});
await m.inventario.modificarInventario(
  16,
  { accion: "ajustes", delta: -2, motivo: "Piezas quebradas" },
  "ajuste-clave",
);
verificar("ajuste con signo y motivo, sin inventario local", () =>
  assert.deepEqual(JSON.parse(peticiones.at(-1).body), { delta: -2, motivo: "Piezas quebradas" }),
);
await m.inventario.modificarInventario(
  16,
  { accion: "entradas", cantidad: 2, motivo: "Horneada" },
  "entrada-clave",
);
verificar("entrada con contrato vigente", () =>
  assert.deepEqual(JSON.parse(peticiones.at(-1).body), { cantidad: 2, motivo: "Horneada" }),
);
const pedidoDTO = {
  id: 9,
  solicitud: 25,
  propuesta: 4,
  taller: { id: 3, nombre: "Taller histórico" },
  estado: "confirmado",
  vencido_en: null,
  confirmado_en: "2026-10-22T10:00:00-06:00",
  moneda: "NIO",
  modalidad_entrega: "retiro_taller",
  descripcion_entrega: "",
  lineas: [
    {
      id: 14,
      posicion: 1,
      renglon: 70,
      linea_propuesta: 1,
      producto,
      modalidad: "stock",
      cantidad: 2,
      precio_unitario: "100.10",
      subtotal: "200.20",
      cargo_personalizacion: "0.00",
      fecha_solicitada: null,
      fecha_comprometida: null,
      caracteristicas: "",
      origen_personalizacion: "",
    },
  ],
  otros_cargos: [],
  costo_entrega: "0.00",
  subtotal_productos: "200.20",
  total_personalizacion: "0.00",
  total_otros_cargos: "0.00",
  total: "200.20",
};
respuesta = {
  id: 1,
  solicitud: 25,
  propuesta: 4,
  decision: "aceptada",
  decidida_en: "2026-10-22T10:00:00-06:00",
  pedido: pedidoDTO,
};
const decision = await m.decision.decidirPropuesta(25, "aceptar", "decision-clave");
verificar("aceptación real sin inventar pedido ni cambiar importes", () => {
  const p = peticiones.at(-1);
  assert.equal(p.url, "/api/v1/solicitudes/mias/25/propuesta/decision/");
  assert.deepEqual(JSON.parse(p.body), { decision: "aceptar" });
  assert.equal(p.headers["Idempotency-Key"], "decision-clave");
  assert.equal(decision.pedido.lineas[0].precioUnitario, "100.10");
  assert.equal(decision.pedido.total, "200.20");
});
respuesta = { codigo: "stock_insuficiente", detail: "mensaje técnico" };
estado = 409;
await assert.rejects(
  m.decision.decidirPropuesta(25, "aceptar", "misma-clave"),
  (e) =>
    e.codigo === "stock_insuficiente" &&
    m.conflictos.mensajeDominio(e).includes("Ya no hay suficientes unidades"),
);
grupos++;
verificar("todos los conflictos conocidos tienen mensaje comprensible", () => {
  for (const codigo of [
    "inventario_ya_inicializado",
    "inventario_no_inicializado",
    "ajuste_bajo_comprometido",
    "clave_idempotencia_reutilizada",
    "propuesta_ya_decidida",
  ]) {
    assert.notEqual(
      m.conflictos.mensajeDominio(new m.http.ApiError(409, "mensaje técnico", {}, codigo)),
      "mensaje técnico",
    );
  }
});
verificar("reintento incierto conserva clave y bloquea cuerpo distinto", () => {
  const t = m.intento.crearIntentoSeguro();
  const input = { producto: 16, cantidad: 2 };
  const key = t.clave(input);
  t.fallar(new m.http.ApiError(0, "sin red"), input);
  assert.equal(t.clave(input), key);
  assert.throws(
    () => t.clave({ ...input, cantidad: 3 }),
    (e) => e.codigo === "resultado_pendiente",
  );
  t.completar();
  assert.notEqual(t.clave(input), key);
});
estado = 200;
respuesta = { count: 1, next: null, previous: null, results: [pedidoDTO] };
const pedidos = await m.pedidos.listarPedidosConfirmados(false, 1);
verificar("listado paginado y snapshot sin consulta al catálogo", () => {
  assert.equal(peticiones.at(-1).url, "/api/v1/pedidos/mios/?page=1&page_size=12");
  assert.equal(pedidos.items[0].lineas[0].producto.nombre, "Jarrón histórico");
  assert.equal(pedidos.totalPages, 1);
});
verificar("validación UX de inicial, ajuste y motivo", () => {
  const ok = { accion: "inicial", cantidad: 0, direccion: "sumar", motivo: "" };
  assert.equal(m.validacion.esquemaMovimiento.safeParse(ok).success, true);
  assert.equal(
    m.validacion.esquemaMovimiento.safeParse({ ...ok, accion: "entradas" }).success,
    false,
  );
  assert.equal(
    m.validacion.esquemaMovimiento.safeParse({ ...ok, accion: "ajustes", cantidad: 2 }).success,
    false,
  );
  assert.equal(
    m.validacion.esquemaMovimiento.safeParse({
      ...ok,
      accion: "ajustes",
      cantidad: 2,
      motivo: "rotura",
    }).success,
    true,
  );
});
verificar("invalidación dirigida a la solicitud e identidad actuales", () => {
  const keys = [];
  const u = { id: 42, rol: "artesano" };
  m.queries.invalidarSolicitud(
    {
      invalidateQueries: (o) => {
        keys.push(o.queryKey);
        return Promise.resolve();
      },
    },
    u,
    true,
    25,
  );
  assert.equal(keys.length, 3);
  assert.equal(keys[0].at(-1), 25);
  assert.equal(keys[0][2], 42);
  assert.ok(!keys.some((k) => k.length === 0));
});
verificar("navegación real por rol y demo aislada", () => {
  const a = m.nav.navigationFor("artesano", true);
  assert.ok(a.some((n) => n.to === "/panel/inventario"));
  assert.ok(a.some((n) => n.to === "/panel/pedidos"));
  assert.ok(!a.some((n) => n.to === "/mensajes"));
  const b = m.nav.navigationFor("comprador", true);
  assert.ok(b.some((n) => n.to === "/pedidos"));
  assert.ok(!b.some((n) => n.to.startsWith("/panel")));
});
verificar("presentación exacta de decimales", () => {
  assert.equal(m.importes.mostrarImporte("100.10"), "C$ 100.10");
  assert.ok(m.importes.mostrarImporte("99999999999999.99").endsWith(".99"));
});
verificar("fecha de calendario sin desfase por zona horaria", () => {
  const zona = process.env.TZ;
  process.env.TZ = "America/Managua";
  try {
    const texto = m.formato.formatCalendarDate("2026-10-30");
    assert.match(texto, /30/);
    assert.doesNotMatch(texto, /29/);
    assert.equal(m.formato.formatCalendarDate("sin-fecha"), "sin-fecha");
  } finally {
    process.env.TZ = zona;
  }
});
const h = m.React.createElement;
verificar("pedido confirmado muestra snapshot y no controles demo de pago", () => {
  const html = m.server.renderToStaticMarkup(
    h(
      m.router.MemoryRouter,
      null,
      h(m.vistaPedido.ContenidoPedidoConfirmado, { pedido: decision.pedido }),
    ),
  );
  assert.match(html, /Jarrón histórico/);
  assert.match(html, /200.20/);
  assert.doesNotMatch(html, /Subir comprobante|Cambiar estado|Confirmar pago/);
});
verificar("inventario usa cantidades servidor y texto además de color", () => {
  const html = m.server.renderToStaticMarkup(
    h(m.vistaInventario.CantidadesInventario, { inventario: { ...inicial, disponible: 99 } }),
  );
  assert.match(html, /Existencia física/);
  assert.match(html, /Reservadas/);
  assert.match(html, /Disponibles/);
  assert.match(html, />99</);
});
verificar("no se exponen errores técnicos", () => {
  assert.doesNotMatch(
    m.conflictos.mensajeSeguro("Tipo de medio multipart/form-data; boundary=abc incompatible"),
    /boundary|multipart/,
  );
});
verificar(
  "propuesta del artesano: modalidad/descripción de solo lectura, retiro_taller fija C$ 0.00 y fecha con min",
  () => {
    const qc = new m.rq.QueryClient();
    const baseSolicitud = {
      id: 25,
      taller: { id: 3, nombre: "Taller histórico" },
      estado: "lista_propuesta",
      modalidadEntregaPreferida: "retiro_taller",
      descripcionEntregaPreferida: "Pasaré el sábado a las 10am",
      creadaEn: "2026-10-22T10:00:00-06:00",
      renglones: [
        {
          id: 70,
          posicion: 1,
          producto,
          modalidad: "produccion",
          cantidad: 2,
          fechaSolicitada: "2026-11-15",
          caracteristicas: "",
          origenPersonalizacion: "",
          resolucion: "aceptado",
          motivoRechazo: "",
          resueltoEn: "2026-10-22T10:00:00-06:00",
        },
      ],
    };
    const renderPropuesta = (solicitud) =>
      m.server.renderToStaticMarkup(
        h(
          m.rq.QueryClientProvider,
          { client: qc },
          h(m.sesionReact.SessionProvider, null, h(m.revision.FormularioPropuesta, { solicitud })),
        ),
      );
    const htmlRetiro = renderPropuesta(baseSolicitud);
    assert.match(htmlRetiro, /Retiro en taller/);
    assert.match(htmlRetiro, /Pasaré el sábado a las 10am/);
    assert.match(htmlRetiro, /C\$ 0\.00/);
    assert.match(htmlRetiro, /El retiro en el taller no tiene costo de entrega/);
    assert.doesNotMatch(htmlRetiro, /id="propuesta-costo"/);
    assert.doesNotMatch(htmlRetiro, /id="propuesta-modalidad"/);
    assert.doesNotMatch(htmlRetiro, /id="propuesta-entrega"/);
    assert.match(htmlRetiro, /type="date"/);
    assert.match(htmlRetiro, /min="\d{4}-\d{2}-\d{2}"/);

    const htmlDomicilio = renderPropuesta({
      ...baseSolicitud,
      modalidadEntregaPreferida: "entrega_artesano",
      descripcionEntregaPreferida: "Managua, Altamira",
    });
    assert.match(htmlDomicilio, /Entrega por el artesano/);
    assert.match(htmlDomicilio, /Managua, Altamira/);
    assert.match(htmlDomicilio, /id="propuesta-costo"/);
  },
);
const solicitudEntrega = (cambios = {}) => ({
  id: 26,
  taller: { id: 3, nombre: "Taller histórico" },
  estado: "lista_propuesta",
  modalidadEntregaPreferida: "",
  descripcionEntregaPreferida: "",
  creadaEn: "2026-10-22T10:00:00-06:00",
  renglones: [
    {
      id: 71,
      posicion: 1,
      producto,
      modalidad: "stock",
      cantidad: 1,
      fechaSolicitada: null,
      caracteristicas: "",
      origenPersonalizacion: "",
      resolucion: "aceptado",
      motivoRechazo: "",
      resueltoEn: "2026-10-22T10:00:00-06:00",
    },
  ],
  ...cambios,
});
const renderizarPropuesta = (solicitud) =>
  m.server.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: new m.rq.QueryClient() },
      h(m.sesionReact.SessionProvider, null, h(m.revision.FormularioPropuesta, { solicitud })),
    ),
  );
verificar("sin preferencia: el artesano elige la modalidad y no se asume retiro_taller", () => {
  const sin = renderizarPropuesta(solicitudEntrega());
  assert.match(sin, /id="propuesta-modalidad"/);
  assert.match(sin, /id="propuesta-entrega"/);
  assert.match(sin, /El comprador no indicó una preferencia de entrega/);
  for (const etiqueta of [
    "Retiro en taller",
    "Punto de encuentro",
    "Entrega por el artesano",
    "Otra modalidad",
  ])
    assert.ok(sin.includes(etiqueta), etiqueta);
  // Sin modalidad elegida no se muestra el aviso de retiro ni se oculta el costo.
  assert.doesNotMatch(sin, /El retiro en el taller no tiene costo de entrega/);
  assert.doesNotMatch(sin, /Condiciones de entrega elegidas por el comprador/);
  assert.match(sin, /id="propuesta-costo"/);
});
verificar("con preferencia: modalidad y descripción son texto, sin controles", () => {
  for (const modalidad of ["retiro_taller", "punto_encuentro", "entrega_artesano", "otra"]) {
    const html = renderizarPropuesta(
      solicitudEntrega({
        modalidadEntregaPreferida: modalidad,
        descripcionEntregaPreferida: "Detalle del comprador",
      }),
    );
    assert.match(html, /Condiciones de entrega elegidas por el comprador/, modalidad);
    assert.match(html, /Detalle del comprador/, modalidad);
    assert.doesNotMatch(html, /id="propuesta-modalidad"/, modalidad);
    assert.doesNotMatch(html, /id="propuesta-entrega"/, modalidad);
    // Solo el retiro oculta el costo.
    assert.equal(/id="propuesta-costo"/.test(html), modalidad !== "retiro_taller", modalidad);
    assert.equal(
      /El retiro en el taller no tiene costo de entrega/.test(html),
      modalidad === "retiro_taller",
      modalidad,
    );
  }
});
verificar(
  "esquema de propuesta: modalidad obligatoria, otra con descripción, retiro sin costo",
  () => {
    const valido = {
      modalidadEntrega: "entrega_artesano",
      descripcionEntrega: "",
      costoEntrega: "25.00",
      lineas: [],
      otrosCargos: [],
    };
    const errores = (cambios) =>
      m.esquemaPropuesta.esquemaPropuesta
        .safeParse({ ...valido, ...cambios })
        .error?.issues.map((i) => i.path.join(".")) ?? [];
    assert.deepEqual(errores({}), []);
    // Sin preferencia y sin elegir: error en la modalidad, nunca retiro por omisión.
    assert.ok(errores({ modalidadEntrega: "" }).includes("modalidadEntrega"));
    assert.ok(errores({ modalidadEntrega: "otra" }).includes("descripcionEntrega"));
    assert.deepEqual(errores({ modalidadEntrega: "otra", descripcionEntrega: "Encomienda" }), []);
    assert.ok(errores({ costoEntrega: "abc" }).includes("costoEntrega"));
    assert.ok(
      errores({ modalidadEntrega: "punto_encuentro", costoEntrega: "" }).includes("costoEntrega"),
    );
    // Con retiro el costo no es editable: un valor residual inválido no bloquea.
    assert.deepEqual(errores({ modalidadEntrega: "retiro_taller", costoEntrega: "abc" }), []);
  },
);
verificar("entrega: fijada por el comprador o sin preferencia; retiro siempre C$ 0.00", () => {
  assert.equal(
    m.entrega.entregaFijadaPorComprador({
      modalidadEntregaPreferida: "",
      descripcionEntregaPreferida: "",
    }),
    null,
  );
  assert.deepEqual(
    m.entrega.entregaFijadaPorComprador({
      modalidadEntregaPreferida: "otra",
      descripcionEntregaPreferida: "Encomienda",
    }),
    { modalidad: "otra", descripcion: "Encomienda" },
  );
  assert.equal(m.entrega.costoEntregaEnviado("retiro_taller", "100.00"), "0.00");
  assert.equal(m.entrega.costoEntregaEnviado("retiro_taller", ""), "0.00");
  for (const modalidad of ["punto_encuentro", "entrega_artesano", "otra"])
    assert.equal(m.entrega.costoEntregaEnviado(modalidad, "100.00"), "100.00");
});
verificar("motivo de rechazo: límite del frontend alineado con el backend (1000)", () => {
  assert.equal(m.validacionSolicitud.MAX_MOTIVO_RECHAZO, 1000);
  const html = m.server.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: new m.rq.QueryClient() },
      h(
        m.sesionReact.SessionProvider,
        null,
        h(m.revision.RevisionRenglon, { solicitud: 26, renglon: 71 }),
      ),
    ),
  );
  assert.match(html, /maxLength="1000"/);
  assert.doesNotMatch(html, /maxLength="500"/);
});
console.log(`OK: ${grupos} grupos de regresión frontend AUD-07.`);
process.exit(0);
