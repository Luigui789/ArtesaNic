import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

const m = await cargarModulos(
  {
    http: "@/lib/http",
    api: "@/features/notificaciones/http",
    keys: "@/lib/query-keys",
    rutas: "@/features/notificaciones/rutas",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
let llamadas = [];
let respuesta;
globalThis.fetch = async (url, init = {}) => {
  llamadas.push({
    url: String(url),
    method: init.method ?? "GET",
    headers: new Headers(init.headers),
  });
  return new Response(JSON.stringify(respuesta), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
m.http.establecerTokenDeAcceso("test");
const dto = {
  id: 7,
  tipo: "pago_observado",
  titulo: "Pago observado",
  detalle: "Pedido #8",
  solicitud_id: null,
  pedido_id: 8,
  creada_en: "2026-10-26T12:00:00Z",
  leida: false,
  leida_en: null,
};
respuesta = { count: 1, next: null, previous: null, results: [dto] };
const pagina = await m.api.listarNotificaciones(2);
assert.equal(llamadas[0].url, "/api/v1/notificaciones/?page=2");
assert.equal(llamadas[0].headers.get("Authorization"), "Bearer test");
assert.equal(pagina.results[0].pedidoId, 8);
assert.equal(pagina.results[0].creadaEn, dto.creada_en);
assert.equal(m.rutas.rutaNotificacion(pagina.results[0], "comprador"), "/pedidos/8");
assert.equal(m.rutas.rutaNotificacion(pagina.results[0], "artesano"), "/panel/pedidos/8");
const solicitud = { ...pagina.results[0], pedidoId: null, solicitudId: 9 };
assert.equal(m.rutas.rutaNotificacion(solicitud, "comprador"), "/solicitudes/9");
assert.equal(m.rutas.rutaNotificacion(solicitud, "artesano"), "/panel/solicitudes/9");
respuesta = { no_leidas: 2 };
assert.equal(await m.api.consultarResumen(), 2);
respuesta = { ...dto, leida: true, leida_en: "2026-10-26T12:01:00Z" };
assert.equal((await m.api.marcarLeida(7)).leida, true);
assert.equal(llamadas.at(-1).method, "POST");
respuesta = { actualizadas: 1, no_leidas: 0 };
assert.equal((await m.api.marcarTodasLeidas()).actualizadas, 1);
respuesta = { no_leidas: "dos" };
await assert.rejects(m.api.consultarResumen());
assert.notDeepEqual(m.keys.claves.notificaciones(1, 1), m.keys.claves.notificaciones(2, 1));
assert.notDeepEqual(m.keys.claves.notificacionesResumen(1), m.keys.claves.notificacionesResumen(2));
console.log("AUD-17: cliente y claves privadas OK");
