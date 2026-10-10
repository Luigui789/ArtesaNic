// Verifica las reglas del servicio con Node, sin añadir un framework de pruebas.
import assert from "node:assert/strict";
import { build } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  configFile: false,
  root,
  logLevel: "error",
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  build: {
    write: false,
    minify: false,
    lib: { entry: "src/mocks/index.ts", formats: ["es"] },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output.find((o) => o.type === "chunk");
const api = await import(
  `data:text/javascript;base64,${Buffer.from(output.code).toString("base64")}`
);
const actor = "Verificación de la demo";
const buyer = { id: api.DEMO_USER_ID, rol: "comprador" };
const artisan = { id: api.DEMO_USER_ID, rol: "artesano", artesanoId: api.DEMO_ARTISAN_ID };
const input = {
  nombre: "Pieza de verificación",
  precio: 100,
  categoria: "cuero_y_calzado",
  descripcion: "Producto para la verificación funcional de la demo.",
  tipoUnidades: "pieza_unica",
  existenciasFisicas: 1,
  admitePersonalizacion: true,
};
const unique = await api.createProduct(api.DEMO_ARTISAN_ID, input, actor);
const request = {
  productoId: unique.id,
  cantidad: 1,
  opcion: "estandar",
  personalizacion: "",
  observaciones: "",
  entregaPreferida: { modalidad: "retiro_en_taller" },
};
for (const cantidad of [0, -1, 1.5, 2, NaN, Infinity])
  await assert.rejects(api.createOrderRequest({ ...request, cantidad }, actor));
await assert.rejects(
  api.createOrderRequest(
    { ...request, opcion: "personalizada", cantidad: 2, personalizacion: "Cambio de color" },
    actor,
  ),
);
const [first, second] = await Promise.all([
  api.createOrderRequest(request, actor),
  api.createOrderRequest(request, actor),
]);
assert.notEqual(first.id, second.id);
await assert.rejects(api.changeOrderStatus(first.id, "aceptado", actor), /cotización/);
await assert.rejects(api.setDeliveryQuote(first.id, 10, undefined, actor), /C\$ 0/);
for (const o of [first, second]) await api.setDeliveryQuote(o.id, 0, undefined, actor);
const accepted = await Promise.allSettled([
  api.changeOrderStatus(first.id, "aceptado", actor),
  api.changeOrderStatus(second.id, "aceptado", actor),
]);
assert.equal(accepted.filter((r) => r.status === "fulfilled").length, 1);
assert.equal((await api.getProduct(unique.id)).unidadesDisponibles, 0);
assert.equal((await api.getOrder(second.id)).estado, "pendiente");
const frozen = (await api.getOrder(first.id)).cotizacionCongelada;
assert.equal(frozen.total, 100);
await assert.rejects(api.setDeliveryQuote(first.id, 30, undefined, actor), /Pendiente/);
await assert.rejects(
  api.setDeliveryCoordination(first.id, { fechaRecogida: "2030-02-30" }, actor),
  /fecha válida/,
);
await api.setDeliveryCoordination(first.id, { fechaRecogida: "2030-10-04" }, actor);
assert.equal((await api.getOrder(first.id)).entrega.fechaRecogida, "2030-10-04");
assert.deepEqual((await api.getOrder(first.id)).cotizacionCongelada, frozen);
await assert.rejects(api.changeOrderStatus(first.id, "listo_para_entrega", actor), /pago/);
await assert.rejects(api.changeOrderStatus(first.id, "en_produccion", actor), /No se puede/);
const receipt = {
  nombreArchivo: "comprobante.png",
  tipo: "image/png",
  tamano: 68,
  src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKfkAAAAASUVORK5CYII=",
};
await assert.rejects(
  api.registerPayment(
    first.id,
    { metodo: "transferencia", comprobante: { ...receipt, tipo: "image/svg+xml" } },
    actor,
  ),
);
await assert.rejects(
  api.registerPayment(
    first.id,
    { metodo: "transferencia", comprobante: { ...receipt, tamano: 6 * 1024 * 1024 } },
    actor,
  ),
);
let o = await api.registerPayment(
  first.id,
  { metodo: "transferencia", comprobante: receipt },
  actor,
);
const attempt = o.pagos[0];
assert.equal(o.estadoPago, "registrado");
assert.equal(JSON.stringify(o).includes("data:image"), false);
for (const session of [buyer, artisan])
  assert.equal(
    await api.getPaymentReceipt(o.id, attempt.id, attempt.comprobantes[0].id, session),
    receipt.src,
  );
for (const session of [
  null,
  { id: 999, rol: "comprador" },
  { ...artisan, artesanoId: 999 },
  { id: buyer.id, rol: "administrador" },
])
  await assert.rejects(
    api.getPaymentReceipt(o.id, attempt.id, attempt.comprobantes[0].id, session),
    /partes/,
  );
await assert.rejects(api.reviewPayment(first.id, "observado", actor), /motivo/);
// El mock toma la fecha del evento y el plazo en dos lecturas del reloj.
// Verificar la ventana real evita fallos de 1 ms sin cambiar la lógica de pagos.
const observationStarted = Date.now();
o = await api.reviewPayment(first.id, "observado", actor, "No se aprecia el monto");
const observationFinished = Date.now();
const correctionDeadline = Date.parse(o.pagos[0].eventos.at(-1).plazoHasta);
assert.ok(correctionDeadline >= observationStarted + 48 * 3600000);
assert.ok(correctionDeadline <= observationFinished + 48 * 3600000);
const realNow = Date.now;
try {
  Date.now = () => Date.parse(o.pagos[0].eventos.at(-1).plazoHasta) + 1;
  await assert.rejects(api.correctPayment(first.id, receipt, actor), /Venció/);
  assert.equal((await api.getOrder(first.id)).estadoPago, "observado");
} finally {
  Date.now = realNow;
}
o = await api.correctPayment(first.id, { ...receipt, nombreArchivo: "correccion.png" }, actor);
assert.equal(o.pagos[0].comprobantes.length, 2);
assert.equal(o.pagos[0].eventos.length, 3);
await api.reviewPayment(first.id, "no_recibido", actor, "Fondos no recibidos");
o = await api.registerPayment(first.id, { metodo: "otro", nota: "Segundo intento" }, actor);
assert.equal(o.pagos.length, 2);
await api.confirmPayment(first.id, actor);
await api.changeOrderStatus(first.id, "listo_para_entrega", actor);
await api.changeOrderStatus(first.id, "entregado", actor);
let p = await api.getProduct(unique.id);
assert.equal(p.existenciasFisicas, 0);
assert.equal(p.unidadesReservadas, 0);
await assert.rejects(
  api.updateProduct(unique.id, { ...input, existenciasFisicas: 2, motivoAjuste: "Alta" }, actor),
  /sola/,
);
const stocked = await api.createProduct(
  api.DEMO_ARTISAN_ID,
  { ...input, tipoUnidades: "existencias", existenciasFisicas: 4 },
  actor,
);
await assert.rejects(
  api.updateProduct(
    stocked.id,
    { ...input, tipoUnidades: "existencias", existenciasFisicas: 5 },
    actor,
  ),
  /motivo/,
);
const personalized = await api.createOrderRequest(
  {
    ...request,
    productoId: stocked.id,
    cantidad: 3,
    opcion: "personalizada",
    personalizacion: "Grabar las iniciales de prueba",
    entregaPreferida: { modalidad: "entrega_directa", ubicacion: "Punto de referencia de prueba" },
  },
  actor,
);
await api.setDeliveryQuote(personalized.id, 25, "Por coordinar", actor);
await api.changeOrderStatus(personalized.id, "aceptado", actor);
await assert.rejects(
  api.updateProduct(
    stocked.id,
    { ...input, tipoUnidades: "existencias", existenciasFisicas: 2, motivoAjuste: "Ajuste" },
    actor,
  ),
  /comprometidas/,
);
await api.registerPayment(personalized.id, { metodo: "transferencia" }, actor);
await api.confirmPayment(personalized.id, actor);
await assert.rejects(
  api.changeOrderStatus(personalized.id, "listo_para_entrega", actor),
  /No se puede/,
);
await api.changeOrderStatus(personalized.id, "en_produccion", actor);
await assert.rejects(
  api.changeOrderStatus(personalized.id, "cancelado", actor, "Cancelación de prueba"),
  /producción/,
);
assert.equal((await api.getOrder(personalized.id)).estado, "en_produccion");
assert.equal((await api.getProduct(stocked.id)).unidadesReservadas, 3);
await api.changeOrderStatus(personalized.id, "listo_para_entrega", actor);
await api.changeOrderStatus(personalized.id, "entregado", actor);
await api.updateProduct(
  stocked.id,
  {
    ...input,
    tipoUnidades: "existencias",
    existenciasFisicas: 4,
    motivoAjuste: "Reposición para verificar cancelación desde Aceptado",
  },
  actor,
);
const cancellable = await api.createOrderRequest(
  { ...request, productoId: stocked.id, cantidad: 3 },
  actor,
);
await api.setDeliveryQuote(cancellable.id, 0, undefined, actor);
await api.changeOrderStatus(cancellable.id, "aceptado", actor);
await api.changeOrderStatus(cancellable.id, "cancelado", actor, "Cancelación antes de producción");
p = await api.getProduct(stocked.id);
assert.equal(p.unidadesReservadas, 0);
assert.equal(p.unidadesPorClasificar, 3);
assert.equal(p.unidadesDisponibles, 1);
await assert.rejects(api.classifyCancelledUnits(cancellable.id, 3, 1, "Motivo", actor), /suma/);
await api.classifyCancelledUnits(
  cancellable.id,
  2,
  1,
  "Dos unidades recuperadas y una dañada",
  actor,
);
p = await api.getProduct(stocked.id);
assert.equal(p.existenciasFisicas, 3);
assert.equal(p.unidadesDisponibles, 3);
assert.equal(p.unidadesPorClasificar, 0);
assert.equal((await api.listUnitMovements(stocked.id)).at(-1).tipo, "baja");
// Un error de IndexedDB revierte la mutación; nunca se comunica un guardado falso.
try {
  globalThis.indexedDB = {
    open() {
      throw new Error("Fallo de almacenamiento simulado");
    },
  };
  await assert.rejects(
    api.createProduct(api.DEMO_ARTISAN_ID, { ...input, nombre: "No debe persistir" }, actor),
    /almacenamiento/,
  );
} finally {
  delete globalThis.indexedDB;
}
assert.equal(
  (await api.listMyProducts(api.DEMO_ARTISAN_ID)).some((p) => p.nombre === "No debe persistir"),
  false,
);
await api.resetDemo();
assert.equal((await api.listOrders({ rol: "comprador" })).length, 10);
await assert.rejects(api.getProduct(unique.id), /No encontramos/);
console.log(
  "OK: cantidades, concurrencia, reservas, congelación, entrega, pagos, plazo, privacidad, clasificación, fallo de persistencia y restablecimiento.",
);
