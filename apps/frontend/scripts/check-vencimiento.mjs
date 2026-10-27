// AUD-11: estado operativo del pedido (confirmado / vencido por falta de pago) en la interfaz.
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
    pedidos: "@/features/pedidos/confirmados",
    pagina: "@/features/pedidos/pages/confirmados",
    vista: "@/features/pagos/components/pago-pedido",
    pagosHttp: "@/features/pagos/http",
    keys: "@/lib/query-keys",
    React: "react",
    server: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    sesionReact: "@/features/auth/use-session",
    moneda: "@/hooks/use-currency",
    notificaciones: "@/features/notificaciones/use-notifications-demo",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
let grupos = 0;
async function verificar(nombre, fn) {
  await fn();
  grupos++;
  console.log("OK", nombre);
}
let respuesta = {};
globalThis.fetch = async () =>
  new Response(JSON.stringify(respuesta), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
m.http.establecerTokenDeAcceso("access-en-memoria");

const pedidoDTO = (cambios = {}) => ({
  id: 42,
  solicitud: 1,
  propuesta: 1,
  taller: { id: 1, nombre: "Taller" },
  estado: "confirmado",
  vencido_en: null,
  confirmado_en: "2026-10-24T10:00:00-06:00",
  moneda: "NIO",
  modalidad_entrega: "retiro_taller",
  descripcion_entrega: "",
  lineas: [],
  otros_cargos: [],
  costo_entrega: "0.00",
  subtotal_productos: "1250.00",
  total_personalizacion: "0.00",
  total_otros_cargos: "0.00",
  total: "1250.00",
  ...cambios,
});
const vencidoDTO = pedidoDTO({
  estado: "vencido_falta_pago",
  vencido_en: "2026-10-26T10:00:00-06:00",
});
const pagoObservadoDTO = {
  pedido: 42,
  estado: "observado",
  moneda: "NIO",
  total: "1250.00",
  registrable_hasta: "2026-10-26T10:00:00-06:00",
  plazo_vencido: true,
  revision_pendiente: false,
  confirmado_en: null,
  intentos: [
    {
      id: 7,
      numero: 1,
      origen: "inicial",
      intento_previo: null,
      metodo: "transferencia",
      referencia: "TRX-123",
      registrado_en: "2026-10-24T08:00:00-06:00",
      comprobante: {
        nombre: "comprobante.pdf",
        tipo: "application/pdf",
        tamano: 2048,
        url: "/pedidos/mios/42/pago/intentos/7/comprobante/",
      },
      resolucion: {
        estado: "observado",
        motivo: "Referencia ilegible.",
        revisado_en: "2026-10-24T10:00:00-06:00",
        plazo_hasta: "2026-10-26T10:00:00-06:00",
      },
    },
  ],
};

const h = m.React.createElement;
const render = (nodo, qc = new m.rq.QueryClient()) =>
  m.server.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(
        m.sesionReact.SessionProvider,
        null,
        h(
          m.moneda.CurrencyProvider,
          null,
          h(m.notificaciones.NotificationsProvider, null, h(m.router.MemoryRouter, null, nodo)),
        ),
      ),
    ),
  );

await verificar("DTO: estado y vencido_en separados del pago", async () => {
  respuesta = vencidoDTO;
  const pedido = await m.pedidos.consultarPedidoConfirmado(false, 42);
  assert.equal(pedido.estado, "vencido_falta_pago");
  assert.equal(pedido.vencidoEn, "2026-10-26T10:00:00-06:00");
  assert.ok(!("vencido_en" in pedido));
  assert.equal(m.pedidos.aPedido(pedidoDTO()).vencidoEn, null);
});

await verificar("badges: texto e icono propios, no solo color", () => {
  const confirmado = render(h(m.pagina.EstadoPedidoBadge, { estado: "confirmado" }));
  assert.match(confirmado, /Pedido confirmado/);
  assert.match(confirmado, /Estado del pedido/);
  assert.match(confirmado, /text-success/);
  const vencido = render(h(m.pagina.EstadoPedidoBadge, { estado: "vencido_falta_pago" }));
  assert.match(vencido, /Vencido por falta de pago/);
  assert.match(vencido, /text-destructive/);
  assert.match(vencido, /<svg/);
  assert.notEqual(
    confirmado.match(/<svg[^>]*class="([^"]*)"/)[1],
    vencido.match(/<svg[^>]*class="([^"]*)"/)[1],
    "iconos distintos",
  );
});

await verificar("listado: cada pedido con su estado operativo", () => {
  const qc = new m.rq.QueryClient();
  qc.setQueryData([...m.keys.claves.pedidos(undefined), false, 1], {
    items: [m.pedidos.aPedido(pedidoDTO({ id: 1 })), m.pedidos.aPedido({ ...vencidoDTO, id: 2 })],
    totalPages: 1,
  });
  const html = render(h(m.pagina.ListadoPedidosConfirmados, {}), qc);
  assert.match(html, /Pedido #1/);
  assert.match(html, /Pedido #2/);
  assert.match(html, /Pedido confirmado/);
  assert.match(html, /Vencido por falta de pago/);
  assert.doesNotMatch(html, />Confirmado</, "ya no muestra el texto genérico de AUD-07");
});

await verificar("detalle confirmado: sin aviso de vencimiento", () => {
  const html = render(
    h(m.pagina.ContenidoPedidoConfirmado, {
      pedido: m.pedidos.aPedido(pedidoDTO()),
      pago: h("p", null, "SECCION-PAGO"),
      cumplimiento: h("p", null, "SECCION-CUMPLIMIENTO"),
    }),
  );
  assert.match(html, /Pedido confirmado/);
  assert.doesNotMatch(html, /Vencido/);
  // AUD-12 reemplazó el aviso provisional por el seguimiento real (sección inyectada).
  assert.doesNotMatch(html, /próxima etapa/);
  assert.match(html, /SECCION-CUMPLIMIENTO/);
  assert.match(html, /SECCION-PAGO/);
});

await verificar("detalle vencido: fecha y mensaje de vencimiento", () => {
  const html = render(
    h(m.pagina.ContenidoPedidoConfirmado, {
      pedido: m.pedidos.aPedido(vencidoDTO),
      pago: h("p", null, "SECCION-PAGO"),
    }),
  );
  assert.match(html, /Vencido por falta de pago/);
  assert.match(html, /Vencido el <strong[^>]*>[^<]*2026/);
  assert.match(html, /El plazo para registrar o corregir el pago terminó/);
  assert.match(html, /no habían sido manipuladas fueron liberadas/);
  assert.doesNotMatch(html, /próxima etapa/);
  assert.match(html, /SECCION-PAGO/, "la sección de pago (historial) sigue presente");
});

await verificar("pago de pedido vencido: sin formularios, historial visible", () => {
  for (const recibido of [false, true]) {
    const html = render(
      h(m.vista.VistaPago, {
        pago: m.pagosHttp.aPago(pagoObservadoDTO),
        recibido,
        pedidoVencido: true,
      }),
    );
    assert.match(html, /El pedido venció por falta de pago/);
    assert.doesNotMatch(html, /type="file"/);
    assert.doesNotMatch(html, /Corregir pago|Registrar pago|Confirmar pago recibido/);
    assert.match(html, /Pago observado/);
    assert.match(html, /TRX-123/);
    assert.match(html, /comprobante\.pdf/);
    assert.match(html, /Referencia ilegible\./);
  }
});

await verificar("pago pendiente de pedido vencido: tampoco ofrece registrar", () => {
  const html = render(
    h(m.vista.VistaPago, {
      pago: m.pagosHttp.aPago({
        ...pagoObservadoDTO,
        estado: "pendiente",
        intentos: [],
      }),
      recibido: false,
      pedidoVencido: true,
    }),
  );
  assert.match(html, /El pedido venció por falta de pago/);
  assert.doesNotMatch(html, /type="file"/);
});

console.log(`OK: ${grupos} grupos de vencimiento AUD-11.`);
process.exit(0);
