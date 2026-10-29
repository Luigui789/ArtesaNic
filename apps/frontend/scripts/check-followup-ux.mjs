// Presentación modificada, sin duplicar contratos de pagos/mensajes/notificaciones.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const m = await cargarModulos(
  {
    React: "react",
    ssr: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    sesion: "@/features/auth/sesion",
    session: "@/features/auth/use-session",
    keys: "@/lib/query-keys",
    pago: "@/features/pagos/components/pago-pedido",
    labels: "@/features/pagos/labels",
    notis: "@/features/notificaciones/pages/notificaciones",
    grupos: "@/features/notificaciones/presentacion",
    chat: "@/features/mensajes/components/order-chat",
    moneda: "@/hooks/use-currency",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
const h = m.React.createElement;
const user = { id: 42, nombre: "Comprador", telefono: "87779090", rol: "comprador" };
const qc = new m.rq.QueryClient({
  defaultOptions: {
    queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity },
  },
});
const ctrl = m.sesion.crearControladorSesion(
  { restaurar: async () => user, alExpirar: () => () => {} },
  qc,
);
await ctrl.reintentar();
const render = (node) =>
  m.ssr.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(
        m.session.SessionProvider,
        { controlador: ctrl },
        h(m.moneda.CurrencyProvider, null, h(m.router.MemoryRouter, null, node)),
      ),
    ),
  );
const pago = {
  pedido: 21,
  estado: "registrado",
  moneda: "NIO",
  total: "450.00",
  registrableHasta: null,
  plazoVencido: false,
  revisionPendiente: true,
  confirmadoEn: null,
  intentos: [
    {
      id: 1,
      numero: 1,
      origen: "inicial",
      intentoPrevio: null,
      metodo: "transferencia",
      referencia: "PRUEBA",
      registradoEn: "2026-10-28T12:00:00Z",
      comprobante: {
        nombre: "recibo.pdf",
        tipo: "application/pdf",
        tamano: 1234,
        url: "/pedidos/mios/21/pago/intentos/1/comprobante/",
      },
      resolucion: null,
    },
  ],
};
assert.match(m.labels.siguientePasoPago(pago, true, false), /Tu turno: revisa/);
assert.match(m.labels.siguientePasoPago(pago, false, false), /Le toca al taller/);
assert.match(
  m.labels.siguientePasoPago({ ...pago, estado: "observado" }, false, false),
  /envía la corrección/,
);
assert.match(
  m.labels.siguientePasoPago({ ...pago, estado: "no_recibido" }, false, false),
  /registrar un nuevo pago/,
);
assert.match(
  m.labels.siguientePasoPago({ ...pago, estado: "confirmado" }, false, false),
  /Pago resuelto/,
);
assert.match(
  m.labels.siguientePasoPago({ ...pago, estado: "observado", plazoVencido: true }, false, false),
  /ya terminó/,
);
assert.match(m.labels.siguientePasoPago(pago, true, true), /Solo consulta/);
const vista = render(h(m.pago.VistaPago, { pago, recibido: true }));
assert.match(vista, /Ver comprobante/);
assert.match(vista, /<details[^>]*><summary[^>]*>Hay un problema con el pago/);
assert.match(vista, /Ver historial de pagos y comprobantes/);
assert.doesNotMatch(vista, /role="dialog"/);
assert.ok(vista.indexOf("Tu turno") < vista.indexOf("Confirmar pago recibido"));
assert.ok(vista.indexOf("Confirmar pago recibido") < vista.indexOf("Hay un problema con el pago"));
const avisos = [
  {
    id: 1,
    tipo: "pago_observado",
    titulo: "Comprobante necesita corrección",
    detalle: "Revisa el motivo.",
    solicitudId: null,
    pedidoId: 21,
    creadaEn: "2026-10-29T05:30:00Z",
    leida: false,
    leidaEn: null,
  },
  {
    id: 2,
    tipo: "propuesta_lista",
    titulo: "Propuesta disponible",
    detalle: "Conoce las condiciones.",
    solicitudId: 11,
    pedidoId: null,
    creadaEn: "2026-10-28T05:30:00Z",
    leida: true,
    leidaEn: "2026-10-28T06:00Z",
  },
  {
    id: 3,
    tipo: "pago_confirmado",
    titulo: "Pago confirmado",
    detalle: "El taller recibió el dinero.",
    solicitudId: null,
    pedidoId: 21,
    creadaEn: "2026-10-20T12:00:00Z",
    leida: true,
    leidaEn: "2026-10-20T13:00Z",
  },
];
const grupos = m.grupos.agruparAvisos(avisos, new Date("2026-10-29T03:00:00Z"));
assert.deepEqual(
  grupos.map((g) => [g.titulo, g.items.map((n) => n.id)]),
  [
    ["Hoy", [1]],
    ["Ayer", [2]],
    ["Anteriores", [3]],
  ],
);
assert.deepEqual(m.grupos.agruparAvisos([], new Date()), []);
qc.setQueryData(m.keys.claves.notificaciones(42, 1), {
  results: avisos,
  count: 90,
  next: "?page=2",
  previous: null,
});
const noti = render(h(m.notis.default));
assert.match(noti, /Avisos de esta página/);
assert.match(noti, /Sin leer/);
assert.match(noti, /Leída/);
assert.match(noti, /href="\/pedidos\/21"/);
assert.match(noti, /href="\/solicitudes\/11"/);
assert.match(noti, /Ver pedido/);
assert.match(noti, /Ver solicitud/);
assert.match(noti, /Marcar todas como leídas/);
const chat = render(
  h(m.chat.VistaConversacion, {
    pedido: 21,
    contraparte: "Taller familiar",
    estado: "lista",
    mensajes: [],
    usuarioId: 42,
    soloLectura: false,
    errorCarga: null,
    onReintentar: () => {},
    errorSondeo: false,
    texto: "Borrador conservado",
    onTexto: () => {},
    enviando: false,
    errorEnvio: "Sin conexión",
    onEnviar: () => {},
  }),
);
assert.match(chat, /Mensajes del pedido #21/);
assert.match(chat, /Conversación con Taller familiar/);
assert.match(chat, /Borrador conservado/);
assert.match(chat, /No pudimos enviar/);
console.log(
  "check-followup-ux: próxima acción por rol, lectura sin cambios, comprobante bajo demanda, revelado de acciones, agrupación local y destinos existentes OK",
);
process.exit(0);
