// Protege los avisos del resumen y los paneles persistentes del detalle del artesano.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";
const m = await cargarModulos(
  {
    React: "react",
    ssr: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    session: "@/features/auth/use-session",
    sesion: "@/features/auth/sesion",
    keys: "@/lib/query-keys",
    detalle: "@/features/pedidos/components/pedido-artesano",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
const fecha = "2026-10-27T12:00:00Z";
const usuario = { id: 42, nombre: "Artesano de prueba", telefono: "87779090", rol: "artesano" };
async function render({
  estadoPago = "confirmado",
  revision = false,
  estado = "en_cumplimiento",
  cierre = false,
  discrepancia = false,
  reembolso = false,
  fallo = false,
} = {}) {
  const h = m.React.createElement;
  const qc = new m.rq.QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, retryOnMount: false } },
  });
  const ctrl = m.sesion.crearControladorSesion(
    {
      restaurar: async () => usuario,
      iniciarSesion: async () => usuario,
      alExpirar: () => () => {},
    },
    qc,
  );
  await ctrl.iniciarSesion({ telefono: "", password: "" });
  qc.setQueryData(m.keys.claves.pago(42, true, 21), {
    estado: estadoPago,
    revisionPendiente: revision,
    registrableHasta: estadoPago === "observado" ? fecha : null,
  });
  qc.setQueryData(m.keys.claves.cumplimiento(42, true, 21), {
    entregas: discrepancia ? [{ recepcion: { resultado: "discrepancia" } }] : [],
  });
  qc.setQueryData(m.keys.claves.resolucion(42, true, 21), {
    cancelacion: estado === "cancelado_artesano" ? { motivo: "Motivo del servidor" } : null,
    cierresParciales: cierre ? [{ estado: "pendiente" }] : [],
    reembolso: reembolso ? { estado: "pendiente" } : null,
  });
  if (fallo) {
    qc.removeQueries({ queryKey: m.keys.claves.pago(42, true, 21) });
    await assert.rejects(
      qc.fetchQuery({
        queryKey: m.keys.claves.pago(42, true, 21),
        queryFn: async () => {
          throw new Error("Sin conexión");
        },
      }),
    );
  }
  const pedido = {
    id: 21,
    estado,
    comprador: { id: 41, nombre: "Comprador de prueba" },
    confirmadoEn: fecha,
    total: "2700.00",
    solicitud: 11,
  };
  const form = h("input", { name: "borrador", defaultValue: "Texto escrito" });
  const node = h(m.detalle.PedidoArtesano, {
    pedido,
    resumen: "Acuerdo conservado",
    productos: "Productos conservados",
    entrega: "Entrega conservada",
    pago: form,
    cumplimiento: "Cumplimiento conservado",
    progreso: "Progreso conservado",
    resolucion: "Resolución conservada",
    mensajes: "Mensajes conservados",
  });
  return m.ssr.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(
        m.session.SessionProvider,
        { controlador: ctrl },
        h(m.router.MemoryRouter, { initialEntries: ["/panel/pedidos/21"] }, node),
      ),
    ),
  );
}
const html = await render();
assert.equal(
  (html.match(/role="tabpanel"/g) ?? []).length,
  6,
  "Todos los paneles se montan, incluidos los formularios de las secciones inactivas",
);
assert.match(html, /name="borrador"[^>]*value="Texto escrito"/);
assert.match(html, /Ver preparación y entregas/);
assert.match(html, /Estado del pago/);
assert.match(html, /Estado del pedido/);
assert.match(html, /Comprador de prueba/);
assert.match(html, /2,700/);
assert.match(html, /href="\/panel\/solicitudes\/11"/);
assert.match(await render({ estadoPago: "registrado", revision: true }), /Revisar comprobante/);
const critical = await render({
  estadoPago: "observado",
  cierre: true,
  discrepancia: true,
  reembolso: true,
});
const summary = critical.slice(0, critical.indexOf('role="tablist"'));
for (const aviso of [
  "comprobante necesita corrección",
  "Plazo para registrar o corregir",
  "cierre parcial pendiente",
  "reembolso pendiente",
  "discrepancia registrada",
])
  assert.ok(summary.includes(aviso), `Aviso fuera de los paneles: ${aviso}`);
assert.match(await render({ estado: "cancelado_artesano" }), /Motivo del servidor/);
assert.match(await render({ estado: "vencido_falta_pago" }), /El pedido venció por falta de pago/);
assert.match(await render({ fallo: true }), /No pudimos comprobar todos los avisos/);
console.log(
  "check-artisan-ux: resumen, próxima acción, alertas críticas fuera de pestañas, fallo seguro y paneles montados OK",
);
process.exit(0);
