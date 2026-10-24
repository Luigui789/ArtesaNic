// AUD-10: contrato HTTP de pagos, whitelist de comprobantes y estados de la interfaz.
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
    pagos: "@/features/pagos/api",
    pagosHttp: "@/features/pagos/http",
    comprobante: "@/features/pagos/comprobante",
    vista: "@/features/pagos/components/pago-pedido",
    archivo: "@/features/pagos/components/comprobante-archivo",
    pedido: "@/features/pedidos/pages/confirmados",
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
let binario = null;
globalThis.fetch = async (url, init) => {
  peticiones.push({ url, ...init });
  if (binario)
    return new Response(binario, { status: 200, headers: { "Content-Type": "application/pdf" } });
  return new Response(JSON.stringify(respuesta), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
};
m.http.establecerTokenDeAcceso("access-en-memoria");

const intento = (cambios = {}) => ({
  id: 7,
  numero: 1,
  origen: "inicial",
  intento_previo: null,
  metodo: "transferencia",
  referencia: "TRX-123",
  registrado_en: "2026-10-24T10:00:00-06:00",
  comprobante: {
    nombre: "comprobante.pdf",
    tipo: "application/pdf",
    tamano: 862201,
    url: "/pedidos/mios/42/pago/intentos/7/comprobante/",
  },
  resolucion: null,
  ...cambios,
});
const pagoDTO = (cambios = {}) => ({
  pedido: 42,
  estado: "registrado",
  moneda: "NIO",
  total: "1250.00",
  registrable_hasta: null,
  plazo_vencido: false,
  revision_pendiente: true,
  confirmado_en: null,
  intentos: [intento()],
  ...cambios,
});
const archivoPdf = new File(["%PDF-1.4 contenido"], "pago.pdf", { type: "application/pdf" });

await verificar("lectura: DTO snake_case → camelCase, sin rutas físicas", async () => {
  respuesta = pagoDTO({
    estado: "observado",
    registrable_hasta: "2026-10-26T14:35:00-06:00",
    revision_pendiente: false,
    intentos: [
      intento({
        resolucion: {
          estado: "observado",
          motivo: "Referencia ilegible.",
          revisado_en: "2026-10-24T14:35:00-06:00",
          plazo_hasta: "2026-10-26T14:35:00-06:00",
        },
      }),
    ],
  });
  const pago = await m.pagos.consultarPago(false, 42);
  assert.equal(peticiones.at(-1).url, "/api/v1/pedidos/mios/42/pago/");
  assert.equal(peticiones.at(-1).headers.Authorization, "Bearer access-en-memoria");
  assert.equal(pago.registrableHasta, "2026-10-26T14:35:00-06:00");
  assert.equal(pago.intentos[0].registradoEn, "2026-10-24T10:00:00-06:00");
  assert.equal(pago.intentos[0].resolucion.plazoHasta, "2026-10-26T14:35:00-06:00");
  assert.equal(pago.intentos[0].intentoPrevio, null);
  assert.ok(!("registrado_en" in pago.intentos[0]));
  await m.pagos.consultarPago(true, 42);
  assert.equal(peticiones.at(-1).url, "/api/v1/pedidos/recibidos/42/pago/");
});

await verificar(
  "registro: multipart sin monto, Idempotency-Key y referencia recortada",
  async () => {
    respuesta = pagoDTO();
    await m.pagos.registrarIntento(
      42,
      { metodo: "transferencia", referencia: "  TRX-9  ", comprobante: archivoPdf },
      "clave-registro-123456",
    );
    const p = peticiones.at(-1);
    assert.equal(p.url, "/api/v1/pedidos/mios/42/pago/intentos/");
    assert.equal(p.method, "POST");
    assert.equal(p.headers["Idempotency-Key"], "clave-registro-123456");
    assert.ok(!("Content-Type" in p.headers), "el navegador fija el boundary del multipart");
    assert.ok(p.body instanceof FormData);
    assert.deepEqual([...p.body.keys()].sort(), ["comprobante", "metodo", "referencia"]);
    assert.equal(p.body.get("referencia"), "TRX-9");
    for (const prohibido of ["monto", "moneda", "estado", "total", "comprador_id", "taller_id"])
      assert.equal(p.body.get(prohibido), null);
  },
);

await verificar("corrección: el intento previo va en la URL; resolución JSON acotada", async () => {
  respuesta = pagoDTO();
  await m.pagos.corregirIntento(
    42,
    7,
    { metodo: "otro", referencia: "TRX-9B", comprobante: archivoPdf },
    "clave-correccion-1234",
  );
  assert.equal(peticiones.at(-1).url, "/api/v1/pedidos/mios/42/pago/intentos/7/corregir/");
  assert.equal(peticiones.at(-1).body.get("intento_previo"), null);
  await m.pagos.resolverIntento(42, 7, { estado: "confirmado" }, "clave-resolver-123456");
  assert.equal(peticiones.at(-1).url, "/api/v1/pedidos/recibidos/42/pago/intentos/7/resolver/");
  assert.deepEqual(JSON.parse(peticiones.at(-1).body), { estado: "confirmado" });
  await m.pagos.resolverIntento(
    42,
    7,
    { estado: "no_recibido", motivo: "  Fondos no acreditados. " },
    "clave-resolver-abcdef",
  );
  assert.deepEqual(JSON.parse(peticiones.at(-1).body), {
    estado: "no_recibido",
    motivo: "Fondos no acreditados.",
  });
});

await verificar("idempotencia: misma clave en reintentos; otra con otro archivo", async () => {
  const intentoPago = m.pagos.crearIntentoDePago();
  const entrada = { metodo: "transferencia", referencia: "TRX-1", comprobante: archivoPdf };
  const claves = [];
  estado = 503;
  await assert.rejects(
    intentoPago.ejecutar(m.pagos.huellaIntento(42, "registrar", entrada), async (k) => {
      claves.push(k);
      return m.pagos.registrarIntento(42, entrada, k);
    }),
  );
  assert.ok(intentoPago.incierto);
  estado = 201;
  respuesta = pagoDTO();
  await intentoPago.ejecutar(m.pagos.huellaIntento(42, "registrar", entrada), async (k) => {
    claves.push(k);
    return m.pagos.registrarIntento(42, entrada, k);
  });
  assert.equal(claves[0], claves[1], "un reintento incierto conserva la clave");
  const otro = {
    ...entrada,
    comprobante: new File(["otro"], "pago.pdf", { type: "application/pdf" }),
  };
  await intentoPago.ejecutar(m.pagos.huellaIntento(42, "registrar", otro), async (k) => {
    claves.push(k);
    return m.pagos.registrarIntento(42, otro, k);
  });
  assert.notEqual(claves[2], claves[1]);
  estado = 200;
});

await verificar(
  "comprobante: descarga binaria autenticada solo por endpoint protegido",
  async () => {
    binario = new Uint8Array([37, 80, 68, 70]);
    const blob = await m.pagos.descargarComprobante(
      "/pedidos/mios/42/pago/intentos/7/comprobante/",
    );
    assert.ok(blob instanceof Blob);
    assert.equal(blob.size, 4);
    assert.equal(peticiones.at(-1).headers.Authorization, "Bearer access-en-memoria");
    binario = null;
    const antes = peticiones.length;
    for (const url of ["/media/pagos/a.pdf", "https://evil.example/x", "/pedidos/mios/42/pago/"])
      await assert.rejects(m.pagos.descargarComprobante(url));
    assert.equal(peticiones.length, antes, "rutas ajenas al contrato no se piden");
  },
);

await verificar("errores de negocio de pagos con mensaje propio", () => {
  for (const codigo of [
    "pago_ya_confirmado",
    "pago_en_revision",
    "correccion_pendiente",
    "correccion_no_permitida",
    "intento_ya_resuelto",
    "plazo_pago_vencido",
    "correccion_fuera_plazo",
    "nuevo_intento_fuera_plazo",
  ]) {
    const mensaje = m.errores.mensajeDominio(new m.http.ApiError(409, "x", {}, codigo));
    assert.notEqual(mensaje, "x", codigo);
  }
});

await verificar("whitelist del frontend: accept, formatos, 10 MB y vacío", () => {
  const c = m.comprobante;
  assert.equal(
    c.ACCEPT_COMPROBANTE,
    ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf",
  );
  assert.equal(c.MAX_COMPROBANTE_BYTES, 10 * 1024 * 1024);
  const ok = (name, type, size = 10) => c.errorComprobante({ name, type, size });
  assert.equal(ok("a.jpg", "image/jpeg"), null);
  assert.equal(ok("a.JPEG", "image/jpeg"), null);
  assert.equal(ok("a.png", "image/png"), null);
  assert.equal(ok("a.webp", "image/webp"), null);
  assert.equal(ok("a.pdf", "application/pdf"), null);
  assert.equal(ok("a.pdf", ""), null, "sin tipo del navegador decide el servidor");
  for (const [name, type] of [
    ["a.svg", "image/svg+xml"],
    ["a.html", "text/html"],
    ["a.exe", "application/x-msdownload"],
    ["a.heic", "image/heic"],
    ["a.gif", "image/gif"],
    ["a.zip", "application/zip"],
  ])
    assert.match(ok(name, type), /JPG, JPEG, PNG, WebP o PDF/);
  assert.match(ok("a.jpg", "application/pdf"), /no coinciden/);
  assert.match(ok("a.pdf", "application/pdf", 0), /vacío/);
  assert.equal(ok("a.pdf", "application/pdf", 10 * 1024 * 1024), null);
  assert.match(ok("a.pdf", "application/pdf", 10 * 1024 * 1024 + 1), /10 MB/);
  assert.equal(c.tamanoLegible(862201), "842 KB");
});

await verificar("modo mock: el contrato real no se simula (501)", async () => {
  const mock = await cargarModulos(
    { pagos: "@/features/pagos/api" },
    { VITE_AUTH_API: "mock", VITE_CATALOGO_API: "mock" },
  );
  await assert.rejects(mock.pagos.consultarPago(false, 1), (e) => e.status === 501);
});

const h = m.React.createElement;
const qc = new m.rq.QueryClient();
const render = (nodo) =>
  m.server.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(m.sesionReact.SessionProvider, null, h(m.router.MemoryRouter, null, nodo)),
    ),
  );
const vista = (dto, recibido = false) =>
  render(h(m.vista.VistaPago, { pago: m.pagosHttp.aPago(dto), recibido }));
const resuelto = (estado, motivo) =>
  intento({
    resolucion: {
      estado,
      motivo,
      revisado_en: "2026-10-24T14:35:00-06:00",
      plazo_hasta: estado === "confirmado" ? null : "2026-10-26T14:35:00-06:00",
    },
  });

await verificar("pendiente: formulario con total, método, referencia y archivo", () => {
  const html = vista(
    pagoDTO({
      estado: "pendiente",
      registrable_hasta: "2026-10-26T10:00:00-06:00",
      revision_pendiente: false,
      intentos: [],
    }),
  );
  assert.match(html, /Pendiente de pago/);
  assert.match(html, /Total a pagar/);
  assert.match(html, /C\$ 1,250\.00/);
  assert.match(html, /Método de pago/);
  assert.match(html, /Transferencia/);
  assert.match(html, /Otro método/);
  assert.match(html, /Referencia/);
  assert.match(html, /type="file"/);
  assert.match(html, /accept="\.jpg,\.jpeg,\.png,\.webp,\.pdf,image\/jpeg/);
  assert.match(html, /Formatos permitidos: JPG, JPEG, PNG, WebP y PDF\. Máximo 10 MB\./);
  assert.match(html, /<label[^>]*for="([^"]+)"[^>]*>Comprobante<\/label>/);
  assert.match(html, /Registrar pago/);
  assert.doesNotMatch(html, /name="monto"|Monto pagado/i);
});

await verificar("pendiente vencido: sin formulario", () => {
  const html = vista(
    pagoDTO({
      estado: "pendiente",
      registrable_hasta: "2026-10-26T10:00:00-06:00",
      plazo_vencido: true,
      revision_pendiente: false,
      intentos: [],
    }),
  );
  assert.match(html, /El plazo venció/);
  assert.doesNotMatch(html, /type="file"|Registrar pago/);
});

await verificar("registrado: comprador sin envío; artesano con las tres acciones", () => {
  const comprador = vista(pagoDTO());
  assert.match(comprador, /Pago registrado/);
  assert.match(comprador, /en revisión/);
  assert.doesNotMatch(comprador, /type="file"|Registrar pago|Confirmar pago recibido/);
  const artesano = vista(pagoDTO(), true);
  assert.match(artesano, /Confirmar pago recibido/);
  assert.match(artesano, /Observar comprobante/);
  assert.match(artesano, /Pago no recibido/);
  assert.match(artesano, /Motivo \(obligatorio/);
  assert.match(artesano, /Total del pedido/);
});

await verificar("observado: motivo, plazo y botón Corregir pago", () => {
  const html = vista(
    pagoDTO({
      estado: "observado",
      registrable_hasta: "2026-10-26T14:35:00-06:00",
      revision_pendiente: false,
      intentos: [resuelto("observado", "La referencia no es legible.")],
    }),
  );
  assert.match(html, /Pago observado/);
  assert.match(html, /<h3[^>]*>Motivo de la observación<\/h3>/);
  assert.match(html, /La referencia no es legible\./);
  assert.match(html, /Puedes corregir hasta/);
  assert.match(html, /Corregir pago/);
  assert.doesNotMatch(html, /Registrar nuevo intento/);
  const artesano = vista(
    pagoDTO({
      estado: "observado",
      registrable_hasta: "2026-10-26T14:35:00-06:00",
      revision_pendiente: false,
      intentos: [resuelto("observado", "Ilegible")],
    }),
    true,
  );
  assert.doesNotMatch(artesano, /Confirmar pago recibido/);
});

await verificar("no recibido: motivo, plazo y Registrar nuevo intento (no Corregir)", () => {
  const html = vista(
    pagoDTO({
      estado: "no_recibido",
      registrable_hasta: "2026-10-26T14:35:00-06:00",
      revision_pendiente: false,
      intentos: [resuelto("no_recibido", "Los fondos no aparecen acreditados en la cuenta.")],
    }),
  );
  assert.match(html, /Pago no recibido/);
  assert.match(html, /<h3[^>]*>Motivo<\/h3>/);
  assert.match(html, /Los fondos no aparecen acreditados en la cuenta\./);
  assert.match(html, /Puedes registrar un nuevo intento hasta/);
  assert.match(html, /Registrar nuevo intento/);
  assert.doesNotMatch(html, /Corregir pago|Corregir comprobante/);
});

await verificar("plazo de corrección vencido: sin acción", () => {
  const html = vista(
    pagoDTO({
      estado: "observado",
      registrable_hasta: "2026-10-26T14:35:00-06:00",
      plazo_vencido: true,
      revision_pendiente: false,
      intentos: [resuelto("observado", "Ilegible")],
    }),
  );
  assert.match(html, /El plazo venció/);
  assert.doesNotMatch(html, /Corregir pago/);
});

await verificar("confirmado: sin nuevas acciones para ninguna parte", () => {
  const dto = pagoDTO({
    estado: "confirmado",
    revision_pendiente: false,
    confirmado_en: "2026-10-24T15:00:00-06:00",
    intentos: [resuelto("confirmado", "")],
  });
  for (const html of [vista(dto), vista(dto, true)]) {
    assert.match(html, /Pago confirmado/);
    assert.doesNotMatch(
      html,
      /type="file"|Registrar pago|Corregir pago|Registrar nuevo intento|Confirmar pago recibido|Observar comprobante/,
    );
  }
});

await verificar("historial: intentos, origen, revisión, motivo e intento actual", () => {
  const html = vista(
    pagoDTO({
      intentos: [
        resuelto("observado", "Captura incompleta."),
        intento({
          id: 8,
          numero: 2,
          origen: "correccion",
          intento_previo: 7,
          referencia: "TRX-123-B",
          comprobante: {
            nombre: "captura.png",
            tipo: "image/png",
            tamano: 2048,
            url: "/pedidos/mios/42/pago/intentos/8/comprobante/",
          },
        }),
      ],
    }),
  );
  assert.match(html, /Historial de intentos/);
  assert.match(html, /Intento 1/);
  assert.match(html, /Intento 2/);
  assert.match(html, /Corrección del intento 1/);
  assert.match(html, /Revisión: Pago observado/);
  assert.match(html, /Captura incompleta\./);
  assert.match(html, /Intento actual/);
  assert.match(html, /Pendiente de revisión del taller/);
  assert.match(html, /Ver comprobante/);
  assert.ok(html.indexOf("Intento 1") < html.indexOf("Intento 2"), "orden cronológico");
  assert.doesNotMatch(html, /\/media\/|private_media/);
});

await verificar("vista previa: imagen como <img>; PDF como tarjeta, nunca <img>", () => {
  const imagen = render(
    h(m.archivo.VistaPreviaArchivo, {
      nombre: "captura.png",
      tipo: "image/png",
      tamano: 2048,
      src: "blob:local/1",
      alt: "Vista previa",
    }),
  );
  assert.match(imagen, /<img[^>]*src="blob:local\/1"/);
  const pdf = render(
    h(m.archivo.VistaPreviaArchivo, {
      nombre: "comprobante.pdf",
      tipo: "application/pdf",
      tamano: 862201,
      src: "blob:local/2",
      alt: "Vista previa",
      acciones: true,
    }),
  );
  assert.doesNotMatch(pdf, /<img/);
  assert.match(pdf, /comprobante\.pdf/);
  assert.match(pdf, /PDF · 842 KB/);
  assert.match(pdf, /Abrir/);
  assert.match(pdf, /download="comprobante\.pdf"/);
});

await verificar("caché: claves privadas con identidad", () => {
  assert.deepEqual(m.keys.claves.pago(5, false, 42), ["pago-real", 5, false, 42]);
  assert.notDeepEqual(m.keys.claves.pago(5, false, 42), m.keys.claves.pago(6, false, 42));
  assert.deepEqual(m.keys.claves.comprobante(5, "/x/"), ["comprobante-real", 5, "/x/"]);
});

await verificar("pedido confirmado incluye la sección de pago inyectada", () => {
  const html = render(
    h(m.pedido.ContenidoPedidoConfirmado, {
      pedido: {
        id: 42,
        solicitud: 1,
        propuesta: 1,
        taller: { id: 1, nombre: "Taller" },
        confirmadoEn: "2026-10-24T10:00:00-06:00",
        moneda: "NIO",
        modalidadEntrega: "retiro_taller",
        descripcionEntrega: "",
        lineas: [],
        otrosCargos: [],
        costoEntrega: "0.00",
        subtotalProductos: "1250.00",
        totalPersonalizacion: "0.00",
        totalOtrosCargos: "0.00",
        total: "1250.00",
      },
      pago: h("p", null, "SECCION-PAGO"),
    }),
  );
  assert.match(html, /SECCION-PAGO/);
  assert.doesNotMatch(html, /registro de pagos/);
});

console.log(`OK: ${grupos} grupos de pagos AUD-10.`);
process.exit(0);
