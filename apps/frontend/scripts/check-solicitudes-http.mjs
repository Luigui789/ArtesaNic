// AUD-05/06/08: cliente HTTP de solicitudes contra respuestas controladas (la sesión real se verifica en check-auth-ui.mjs y check-aud18-cierre.mjs).
import assert from "node:assert/strict";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { cargarModulo } from "./cargar-modulo.mjs";

const grupos = [];
async function verificar(nombre, fn) {
  await fn();
  grupos.push(nombre);
}

// Expone el proveedor de token y el cliente desde el mismo bundle de producción.
// No se añade un export ni una implementación de autenticación a la aplicación.
async function cargarClienteReal() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const virtual = fileURLToPath(
    new URL("./__comprobar-solicitudes-http__.ts", import.meta.url),
  ).replaceAll("\\", "/");
  const anterior = process.env["VITE_CATALOGO_API"];
  process.env["VITE_CATALOGO_API"] = "real";
  try {
    const resultado = await build({
      configFile: false,
      root,
      logLevel: "error",
      resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
      plugins: [
        {
          name: "comprobar-solicitudes-http",
          resolveId: (id) => (id.replaceAll("\\", "/") === virtual ? `\0${virtual}` : undefined),
          load: (id) =>
            id === `\0${virtual}`
              ? `export * as api from "@/features/solicitudes/api";
                 export * as http from "@/features/solicitudes/http";
                 export * as idem from "@/features/solicitudes/idempotencia";
                 export * as transporte from "@/features/catalogo/http";
                 export * as sesionHttp from "@/lib/http";`
              : undefined,
        },
      ],
      build: { write: false, minify: false, lib: { entry: virtual, formats: ["es"] } },
    });
    const salida = (Array.isArray(resultado) ? resultado[0] : resultado).output.find(
      (o) => o.type === "chunk",
    );
    return await import(
      `data:text/javascript;base64,${Buffer.from(salida.code).toString("base64")}`
    );
  } finally {
    if (anterior === undefined) delete process.env["VITE_CATALOGO_API"];
    else process.env["VITE_CATALOGO_API"] = anterior;
  }
}

const { api, http, idem, transporte, sesionHttp } = await cargarClienteReal();
const CLAVE = "11111111-2222-4333-8444-555555555555";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let peticiones = [];
let respuestas = [];
globalThis.fetch = async (url, init = {}) => {
  peticiones.push({
    url: String(url),
    metodo: init.method ?? "GET",
    cabeceras: init.headers ?? {},
    cuerpo: init.body ? JSON.parse(init.body) : undefined,
  });
  assert.ok(respuestas.length > 0, "No se esperaba otra petición HTTP.");
  const respuesta = respuestas.shift();
  if (respuesta instanceof Error) throw respuesta;
  return new Response(JSON.stringify(respuesta.cuerpo), {
    status: respuesta.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
};
const responder = (...lista) => {
  peticiones = [];
  respuestas = lista;
};
const ultima = () => peticiones.at(-1);
const pagina = (results, count = results.length) => ({
  count,
  next: null,
  previous: null,
  results,
});
const categoria = { id: 1, codigo: "madera", nombre: "Madera" };
const renglonDTO = {
  id: 11,
  posicion: 1,
  producto: { id: 15, nombre: "Caja de madera", categoria },
  modalidad: "stock",
  cantidad: 2,
  fecha_solicitada: null,
  caracteristicas: "",
  origen_personalizacion: "",
  resolucion: "pendiente",
  motivo_rechazo: "",
  resuelto_en: null,
};
const solicitudDTO = {
  id: 9,
  taller: { id: 3, nombre: "Taller destinatario" },
  estado: "pendiente_revision",
  modalidad_entrega_preferida: "",
  descripcion_entrega_preferida: "",
  creado_en: "2026-10-20T10:30:00-06:00",
  actualizado_en: "2026-10-20T10:30:00-06:00",
  renglones: [
    renglonDTO,
    {
      ...renglonDTO,
      id: 12,
      posicion: 2,
      modalidad: "produccion",
      cantidad: 3,
      fecha_solicitada: "2099-01-01",
    },
    {
      ...renglonDTO,
      id: 13,
      posicion: 3,
      modalidad: "personalizacion",
      cantidad: 1,
      caracteristicas: "Iniciales grabadas",
      origen_personalizacion: "desde_cero",
    },
  ],
};
const recibidaDTO = {
  ...solicitudDTO,
  comprador: { id: 7, nombre: "Compradora", telefono: "dato-privado" },
};
const entrada = {
  renglones: [
    { producto: 15, modalidad: "stock", cantidad: 2 },
    { producto: 15, modalidad: "produccion", cantidad: 3, fechaSolicitada: "2099-01-01" },
    {
      producto: 15,
      modalidad: "personalizacion",
      cantidad: 1,
      caracteristicas: "Iniciales grabadas",
      origenPersonalizacion: "desde_cero",
    },
  ],
};
const usuarioDemo = {
  id: 999,
  nombre: "Identidad demo que no debe enviarse",
  telefono: "dato-privado",
  rol: "artesano",
  artesanoId: 998,
};
let token = "token-de-acceso-exclusivo-de-pruebas";
// El token vive en memoria en el cliente común (AUD-18).
sesionHttp.establecerTokenDeAcceso(token);

await verificar("allowlist y serialización snake_case por modalidad", () => {
  const contaminada = {
    ...entrada,
    comprador: 999,
    comprador_id: 999,
    taller: 998,
    estado: "rechazada",
    propuesta: {},
    pedido: {},
    renglones: entrada.renglones.map((r) => ({
      ...r,
      comprador: 999,
      resolucion: "aceptado",
      motivoRechazo: "No enviable",
      precio: "1.00",
      reserva: {},
      opcion: "personalizada",
    })),
  };
  const anterior = structuredClone(contaminada);
  assert.deepEqual(http.cuerpoSolicitud(contaminada), {
    renglones: [
      { producto: 15, modalidad: "stock", cantidad: 2 },
      { producto: 15, modalidad: "produccion", cantidad: 3, fecha_solicitada: "2099-01-01" },
      {
        producto: 15,
        modalidad: "personalizacion",
        cantidad: 1,
        caracteristicas: "Iniciales grabadas",
        origen_personalizacion: "desde_cero",
      },
    ],
  });
  assert.deepEqual(contaminada, anterior, "Serializar no modifica el borrador.");
});

await verificar("creación real usa Bearer e ignora la identidad de la demo", async () => {
  assert.equal(api.solicitudesReales, true);
  responder({ status: 201, cuerpo: solicitudDTO });
  const solicitud = await api.crearSolicitud(entrada, usuarioDemo, CLAVE);
  assert.equal(ultima().url, "/api/v1/solicitudes/");
  assert.equal(ultima().metodo, "POST");
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  assert.equal(ultima().cabeceras["Content-Type"], "application/json");
  assert.equal(ultima().cabeceras["Idempotency-Key"], CLAVE);
  assert.deepEqual(ultima().cuerpo, http.cuerpoSolicitud(entrada));
  assert.equal(
    JSON.stringify(ultima().cuerpo).includes(CLAVE),
    false,
    "La clave no va en el cuerpo.",
  );
  assert.equal(solicitud.id, solicitudDTO.id);
  assert.equal(solicitud.creadoEn, solicitudDTO.creado_en);
  assert.equal(solicitud.actualizadoEn, solicitudDTO.actualizado_en);
  assert.equal(solicitud.renglones[1].fechaSolicitada, "2099-01-01");
  assert.equal(solicitud.renglones[2].origenPersonalizacion, "desde_cero");
  assert.equal(solicitud.renglones[2].caracteristicas, "Iniciales grabadas");
  assert.equal("comprador" in solicitud, false);
  assert.equal("compradorId" in solicitud, false);
  assert.equal("precio" in solicitud.renglones[0], false);
});

await verificar("cinco endpoints, GET autenticados y paginación reconstruida", async () => {
  responder({ cuerpo: pagina([solicitudDTO], 25) });
  const mias = await api.listarSolicitudes(null, false, 2);
  assert.equal(ultima().url, "/api/v1/solicitudes/mias/?page=2&page_size=12");
  assert.deepEqual(
    { total: mias.total, page: mias.page, pageSize: mias.pageSize, totalPages: mias.totalPages },
    { total: 25, page: 2, pageSize: 12, totalPages: 3 },
  );
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  assert.equal(ultima().cuerpo, undefined);
  responder({ cuerpo: solicitudDTO });
  await api.consultarSolicitud(9, usuarioDemo, false);
  assert.equal(ultima().url, "/api/v1/solicitudes/mias/9/");
  assert.equal(ultima().metodo, "GET");
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  responder({ cuerpo: pagina([recibidaDTO]) });
  const recibidas = await api.listarSolicitudes(null, true);
  assert.equal(ultima().url, "/api/v1/solicitudes/recibidas/?page=1&page_size=12");
  assert.deepEqual(recibidas.items[0].comprador, { id: 7, nombre: "Compradora" });
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  responder({ cuerpo: recibidaDTO });
  const recibida = await api.consultarSolicitud(9, usuarioDemo, true);
  assert.equal(ultima().url, "/api/v1/solicitudes/recibidas/9/");
  assert.deepEqual(recibida.comprador, { id: 7, nombre: "Compradora" });
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
});

await verificar("listado vacío y error de página inexistente", async () => {
  responder({ cuerpo: pagina([]) });
  const vacia = await http.listarMisSolicitudes();
  assert.deepEqual(vacia, { items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 });
  responder({ status: 404, cuerpo: { detail: "Página inválida." } });
  await assert.rejects(http.listarMisSolicitudes(99), (error) => error.status === 404);
});

await verificar("DR-03 conserva rechazo agregado y motivos por renglón", async () => {
  responder({
    cuerpo: {
      ...solicitudDTO,
      estado: "rechazada",
      renglones: solicitudDTO.renglones.map((r) => ({
        ...r,
        resolucion: "rechazado",
        motivo_rechazo: `Motivo individual ${r.posicion}`,
      })),
    },
  });
  const rechazada = await http.consultarMiSolicitud(9);
  assert.equal(rechazada.estado, "rechazada");
  assert.equal(rechazada.renglones.length, 3);
  assert.deepEqual(
    rechazada.renglones.map((r) => [r.resolucion, r.motivoRechazo]),
    [
      ["rechazado", "Motivo individual 1"],
      ["rechazado", "Motivo individual 2"],
      ["rechazado", "Motivo individual 3"],
    ],
  );
  for (const campo of ["propuesta", "pedido", "reserva", "pagos", "chat"])
    assert.equal(campo in rechazada, false);
});

await verificar("400 conserva errores anidados por posición y campo", async () => {
  responder({
    status: 400,
    cuerpo: {
      renglones: [
        {},
        {
          cantidad: ["La cantidad debe ser positiva."],
          fecha_solicitada: ["Indica una fecha válida."],
        },
      ],
    },
  });
  await assert.rejects(http.crearSolicitud(entrada, CLAVE), (error) => {
    assert.ok(error instanceof api.ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.message, "La cantidad debe ser positiva.");
    assert.deepEqual(error.campos, {
      "renglones.1.cantidad": ["La cantidad debe ser positiva."],
      "renglones.1.fecha_solicitada": ["Indica una fecha válida."],
    });
    assert.equal(api.reintentarSalvoErrorDelCliente(0, error), false);
    return true;
  });
  assert.equal(peticiones.length, 1, "El cliente no repite automáticamente una creación.");
});

await verificar("401 sin token no inventa una sesión ni envía usuario demo", async () => {
  token = null;
  sesionHttp.establecerTokenDeAcceso(null);
  responder({ status: 401, cuerpo: { detail: "Authentication credentials were not provided." } });
  await assert.rejects(api.crearSolicitud(entrada, usuarioDemo, CLAVE), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.message, "Inicia sesión para consultar o enviar solicitudes.");
    return true;
  });
  assert.equal(ultima().cabeceras.Authorization, undefined);
  assert.deepEqual(ultima().cuerpo, http.cuerpoSolicitud(entrada));
  token = "token-de-acceso-exclusivo-de-pruebas";
  sesionHttp.establecerTokenDeAcceso(token);
});

await verificar("403 conserva motivo y 404 no revela identidad ajena", async () => {
  responder({ status: 403, cuerpo: { detail: "El taller aún no está aprobado." } });
  await assert.rejects(http.listarSolicitudesRecibidas(), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, "El taller aún no está aprobado.");
    assert.equal(api.reintentarSalvoErrorDelCliente(0, error), false);
    return true;
  });
  responder({ status: 404, cuerpo: { detail: "No encontrado." } });
  await assert.rejects(http.consultarMiSolicitud(999), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.message, "No encontramos esta solicitud.");
    assert.equal(api.reintentarSalvoErrorDelCliente(0, error), false);
    return true;
  });
});

await verificar("fallo de red preserva error y no reenvía POST automáticamente", async () => {
  responder(new TypeError("Red interrumpida"));
  await assert.rejects(http.crearSolicitud(entrada, CLAVE), (error) => {
    assert.equal(error.status, 0);
    assert.match(error.message, /conectar con el servidor/);
    assert.equal(api.reintentarSalvoErrorDelCliente(0, error), true);
    assert.equal(api.reintentarSalvoErrorDelCliente(3, error), false);
    return true;
  });
  assert.equal(peticiones.length, 1);
});

await verificar("origen mock sigue la misma bandera del catálogo y no usa fetch", async () => {
  const demo = await cargarModulo("src/features/solicitudes/api.ts", { VITE_CATALOGO_API: "mock" });
  responder();
  assert.equal(demo.solicitudesReales, false);
  const compradorDemo = { ...usuarioDemo, rol: "comprador", id: 701 };
  assert.equal((await demo.listarSolicitudes(compradorDemo, false)).total, 0);
  const creada = await demo.crearSolicitud(
    { renglones: [{ producto: 1, modalidad: "stock", cantidad: 1 }] },
    compradorDemo,
    CLAVE,
  );
  assert.equal(creada.estado, "pendiente_revision");
  assert.equal((await demo.consultarSolicitud(creada.id, compradorDemo, false)).id, creada.id);
  assert.equal(peticiones.length, 0);
});

await verificar("AUD-08: claves UUID v4, también sin randomUUID", () => {
  const clave = idem.nuevaClaveIdempotencia();
  assert.match(clave, UUID_V4);
  assert.notEqual(clave, idem.nuevaClaveIdempotencia());
  const original = globalThis.crypto.randomUUID;
  try {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    assert.match(idem.nuevaClaveIdempotencia(), UUID_V4);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
  }
});

await verificar("AUD-08: el mismo intento conserva su clave entre envíos", () => {
  let n = 0;
  const intento = idem.crearIntentoIdempotente(() => `clave-generada-${++n}`);
  const cuerpo = http.cuerpoSolicitud(entrada);
  const primera = intento.clave(cuerpo);
  assert.equal(intento.clave(structuredClone(cuerpo)), primera, "Rerender o reintento.");
  assert.equal(intento.clave(cuerpo), primera);
  const otro = { renglones: [{ ...cuerpo.renglones[0], cantidad: 9 }] };
  const cambiada = intento.clave(otro);
  assert.notEqual(cambiada, primera, "Otro cuerpo es otra operación.");
  intento.completar();
  assert.notEqual(intento.clave(otro), cambiada, "Tras el éxito, un envío igual es nuevo.");
  assert.equal(n, 3);
});

await verificar("AUD-08: reintento tras fallo de red reutiliza la clave", async () => {
  const intento = api.crearIntentoDeEnvio();
  responder(new TypeError("Respuesta perdida"), { status: 201, cuerpo: solicitudDTO });
  await assert.rejects(api.crearSolicitud(entrada, usuarioDemo, intento.clave(entrada)), (e) => {
    assert.equal(e.status, 0);
    return true;
  });
  const reintento = await api.crearSolicitud(entrada, usuarioDemo, intento.clave(entrada));
  assert.equal(reintento.id, solicitudDTO.id);
  assert.equal(peticiones.length, 2);
  const [a, b] = peticiones.map((p) => p.cabeceras["Idempotency-Key"]);
  assert.match(a, UUID_V4);
  assert.equal(a, b);
  assert.deepEqual(peticiones[0].cuerpo, peticiones[1].cuerpo);
  intento.completar();
  responder({ status: 201, cuerpo: { ...solicitudDTO, id: 10 } });
  await api.crearSolicitud(entrada, usuarioDemo, intento.clave(entrada));
  assert.notEqual(ultima().cabeceras["Idempotency-Key"], a, "Acción nueva, clave nueva.");
  const otroIntento = api.crearIntentoDeEnvio();
  assert.notEqual(otroIntento.clave(entrada), intento.clave(entrada), "Otra composición.");
});

await verificar("AUD-08: 409 se presenta como conflicto entendible", async () => {
  responder({
    status: 409,
    cuerpo: { detail: "Clave reutilizada.", codigo: "clave_idempotencia_reutilizada" },
  });
  await assert.rejects(http.crearSolicitud(entrada, CLAVE), (error) => {
    assert.ok(error instanceof api.ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.codigo, "clave_idempotencia_reutilizada");
    assert.match(error.message, /ya se había enviado con otros datos/);
    assert.deepEqual(error.campos, {});
    assert.equal(api.reintentarSalvoErrorDelCliente(0, error), false);
    return true;
  });
  responder({ status: 400, cuerpo: { "Idempotency-Key": ["Envía un Idempotency-Key válido."] } });
  await assert.rejects(http.crearSolicitud(entrada, CLAVE), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.codigo, undefined);
    assert.deepEqual(error.campos, { "Idempotency-Key": ["Envía un Idempotency-Key válido."] });
    return true;
  });
});

await verificar("AUD-08: consulta de resultado incierto, propia y de solo lectura", async () => {
  responder({
    cuerpo: {
      tipo: "crear_solicitud",
      estado: "completada",
      recurso: { tipo: "solicitud", id: 9 },
    },
  });
  assert.equal(await http.consultarCreacionSolicitud(CLAVE), 9);
  assert.equal(ultima().url, `/api/v1/operaciones/crear_solicitud/${CLAVE}/`);
  assert.equal(ultima().metodo, "GET");
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  assert.equal(ultima().cabeceras["Idempotency-Key"], undefined);
  responder({ status: 404, cuerpo: { detail: "No encontrado." } });
  assert.equal(await http.consultarCreacionSolicitud(CLAVE), null);
  // AUD-18: un 401 con token intenta una sola renovación; si también responde 401,
  // la sesión terminó y la consulta falla sin más reintentos.
  responder(
    { status: 401, cuerpo: { detail: "Sin sesión." } },
    { cuerpo: { csrf_token: "csrf-de-prueba" } },
    { status: 401, cuerpo: { detail: "La sesión no es válida o expiró." } },
  );
  await assert.rejects(http.consultarCreacionSolicitud(CLAVE), (e) => e.status === 401);
  assert.deepEqual(
    peticiones.map((p) => p.url),
    [
      `/api/v1/operaciones/crear_solicitud/${CLAVE}/`,
      "/api/v1/auth/csrf/",
      "/api/v1/auth/refrescar/",
    ],
  );
  assert.equal(sesionHttp.tokenDeAcceso(), null);
  sesionHttp.establecerTokenDeAcceso(token);
});

await verificar("AUD-08: mock equivalente por usuario demo, sin fetch", async () => {
  const demo = await cargarModulo("src/features/solicitudes/api.ts", { VITE_CATALOGO_API: "mock" });
  responder();
  const ana = { ...usuarioDemo, rol: "comprador", id: 801 };
  const beto = { ...usuarioDemo, rol: "comprador", id: 802 };
  const cuerpo = { renglones: [{ producto: 1, modalidad: "stock", cantidad: 1 }] };
  const clave = "clave-demo-compartida-0001";
  const primera = await demo.crearSolicitud(cuerpo, ana, clave);
  const repetida = await demo.crearSolicitud(cuerpo, ana, clave);
  assert.equal(repetida.id, primera.id);
  await assert.rejects(
    demo.crearSolicitud({ renglones: [{ ...cuerpo.renglones[0], cantidad: 2 }] }, ana, clave),
    (e) => e.status === 409 && e.codigo === "clave_idempotencia_reutilizada",
  );
  const deBeto = await demo.crearSolicitud(cuerpo, beto, clave);
  assert.notEqual(deBeto.id, primera.id, "La clave no se comparte entre usuarios demo.");
  const nueva = await demo.crearSolicitud(cuerpo, ana, "otra-clave-demo-0002");
  assert.notEqual(nueva.id, primera.id, "Mismo contenido con otra clave es otra solicitud.");
  assert.equal((await demo.listarSolicitudes(ana, false)).total, 2);
  assert.equal(peticiones.length, 0);
});

await verificar("AUD-06: preferencia de entrega se serializa solo si se indicó", () => {
  assert.equal("modalidad_entrega_preferida" in http.cuerpoSolicitud(entrada), false);
  assert.deepEqual(
    http.cuerpoSolicitud({
      ...entrada,
      modalidadEntregaPreferida: "otra",
      descripcionEntregaPreferida: "Encomienda a Granada",
    }),
    {
      modalidad_entrega_preferida: "otra",
      descripcion_entrega_preferida: "Encomienda a Granada",
      renglones: http.cuerpoSolicitud(entrada).renglones,
    },
  );
  const intento = api.crearIntentoDeEnvio();
  const sin = intento.clave(entrada);
  assert.notEqual(
    intento.clave({ ...entrada, modalidadEntregaPreferida: "retiro_taller" }),
    sin,
    "Otra preferencia es otra operación: el cliente nunca provoca un 409.",
  );
});

await verificar("AUD-06: lectura conserva preferencia, revisión y revisor", async () => {
  responder({
    cuerpo: {
      ...recibidaDTO,
      estado: "lista_propuesta",
      modalidad_entrega_preferida: "punto_encuentro",
      descripcion_entrega_preferida: "Parque central",
      renglones: recibidaDTO.renglones.map((r) => ({
        ...r,
        resolucion: "aceptado",
        resuelto_en: "2026-10-21T09:00:00-06:00",
        resuelto_por: { id: 3, nombre: "Artesana", telefono: "privado" },
      })),
    },
  });
  const recibida = await http.consultarSolicitudRecibida(9);
  assert.equal(recibida.estado, "lista_propuesta");
  assert.equal(recibida.modalidadEntregaPreferida, "punto_encuentro");
  assert.equal(recibida.descripcionEntregaPreferida, "Parque central");
  assert.equal(recibida.renglones[0].resueltoEn, "2026-10-21T09:00:00-06:00");
  assert.deepEqual(recibida.renglones[0].resueltoPor, { id: 3, nombre: "Artesana" });
});

await verificar("AUD-06: resolver un renglón usa POST idempotente y allowlist", async () => {
  responder({
    cuerpo: {
      ...recibidaDTO,
      renglones: recibidaDTO.renglones.map((r) => ({ ...r, resuelto_por: null })),
    },
  });
  await api.resolverRenglon(
    9,
    12,
    { resolucion: "rechazado", motivoRechazo: "Sin barro", cantidad: 1, precio: "1.00" },
    CLAVE,
  );
  assert.equal(ultima().url, "/api/v1/solicitudes/recibidas/9/renglones/12/resolver/");
  assert.equal(ultima().metodo, "POST");
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  assert.equal(ultima().cabeceras["Idempotency-Key"], CLAVE);
  assert.deepEqual(ultima().cuerpo, { resolucion: "rechazado", motivo_rechazo: "Sin barro" });
  assert.deepEqual(http.cuerpoResolucion({ resolucion: "aceptado", motivoRechazo: "x" }), {
    resolucion: "aceptado",
  });
});

await verificar("AUD-06: cada renglón y cada propuesta tienen su propio intento", () => {
  const intento = api.crearIntentoDeRevision();
  const aceptar = { resolucion: "aceptado" };
  const a = intento.claveResolucion(9, 11, aceptar);
  assert.equal(intento.claveResolucion(9, 11, aceptar), a, "Reintento: misma clave.");
  assert.notEqual(intento.claveResolucion(9, 12, aceptar), a, "Otro renglón: otra clave.");
  const condiciones = {
    modalidadEntrega: "retiro_taller",
    costoEntrega: "0.00",
    lineas: [{ renglon: 11 }],
  };
  const p = intento.clavePropuesta(9, condiciones);
  assert.notEqual(intento.clavePropuesta(10, condiciones), p, "Otra solicitud: otra clave.");
});

const propuestaDTO = {
  id: 4,
  solicitud: 9,
  emitida_en: "2026-10-21T10:00:00-06:00",
  moneda: "NIO",
  modalidad_entrega: "entrega_artesano",
  descripcion_entrega: "Masaya centro",
  lineas: [
    {
      id: 1,
      renglon: 12,
      posicion: 2,
      producto: { id: 15, nombre: "Caja de madera", categoria },
      modalidad: "produccion",
      cantidad: 3,
      precio_unitario: "100.10",
      subtotal: "300.30",
      cargo_personalizacion: "0.00",
      fecha_solicitada: "2099-01-01",
      fecha_comprometida: "2099-01-05",
    },
  ],
  otros_cargos: [{ posicion: 1, descripcion: "Empaque", monto: "0.10", renglon: null }],
  costo_entrega: "0.20",
  subtotal_productos: "300.30",
  total_personalizacion: "0.00",
  total_otros_cargos: "0.10",
  total: "300.60",
};

await verificar("AUD-06: emitir propuesta no envía precios ni totales", async () => {
  responder({ status: 201, cuerpo: propuestaDTO });
  const propuesta = await api.emitirPropuesta(
    9,
    {
      modalidadEntrega: "entrega_artesano",
      descripcionEntrega: "Masaya centro",
      costoEntrega: "0.20",
      lineas: [{ renglon: 12, fechaComprometida: "2099-01-05", precioUnitario: "1.00" }],
      otrosCargos: [{ descripcion: "Empaque", monto: "0.10" }],
      total: "1.00",
      comprador: 999,
    },
    CLAVE,
  );
  assert.equal(ultima().url, "/api/v1/solicitudes/recibidas/9/propuesta/");
  assert.equal(ultima().metodo, "POST");
  assert.equal(ultima().cabeceras["Idempotency-Key"], CLAVE);
  assert.deepEqual(ultima().cuerpo, {
    modalidad_entrega: "entrega_artesano",
    descripcion_entrega: "Masaya centro",
    costo_entrega: "0.20",
    lineas: [{ renglon: 12, fecha_comprometida: "2099-01-05" }],
    otros_cargos: [{ descripcion: "Empaque", monto: "0.10" }],
  });
  // Importes como cadenas exactas del servidor: 0.1 + 0.2 nunca se recalcula en float.
  assert.equal(propuesta.total, "300.60");
  assert.equal(propuesta.lineas[0].precioUnitario, "100.10");
  assert.equal(propuesta.lineas[0].fechaComprometida, "2099-01-05");
  assert.deepEqual(propuesta.otrosCargos, [
    { posicion: 1, descripcion: "Empaque", monto: "0.10", renglon: null },
  ]);
  for (const campo of ["pedido", "reserva", "pago"]) assert.equal(campo in propuesta, false);
});

await verificar("AUD-06: lectura de propuesta por parte y 404 sin propuesta", async () => {
  responder({ cuerpo: propuestaDTO });
  assert.equal((await api.consultarPropuesta(9, usuarioDemo, false)).id, 4);
  assert.equal(ultima().url, "/api/v1/solicitudes/mias/9/propuesta/");
  assert.equal(ultima().metodo, "GET");
  responder({ cuerpo: propuestaDTO });
  await api.consultarPropuesta(9, usuarioDemo, true);
  assert.equal(ultima().url, "/api/v1/solicitudes/recibidas/9/propuesta/");
  responder({ status: 404, cuerpo: { detail: "No encontrado." } });
  await assert.rejects(http.consultarPropuesta(9, false), (e) => {
    assert.equal(e.status, 404);
    assert.match(e.message, /todavía no tiene una propuesta/);
    return true;
  });
});

await verificar("AUD-06: 409 de negocio conserva código y mensaje del servidor", async () => {
  for (const codigo of [
    "renglon_ya_resuelto",
    "solicitud_con_renglones_pendientes",
    "solicitud_rechazada",
    "propuesta_ya_emitida",
    "clave_idempotencia_reutilizada",
  ]) {
    responder({ status: 409, cuerpo: { detail: `Mensaje ${codigo}`, codigo } });
    await assert.rejects(http.resolverRenglon(9, 11, { resolucion: "aceptado" }, CLAVE), (e) => {
      assert.equal(e.status, 409);
      assert.equal(e.codigo, codigo);
      assert.equal(e.message, `Mensaje ${codigo}`);
      assert.equal(api.reintentarSalvoErrorDelCliente(0, e), false);
      return true;
    });
  }
});

await verificar("AUD-06: la demo no simula revisión ni propuesta y no usa fetch", async () => {
  const demo = await cargarModulo("src/features/solicitudes/api.ts", { VITE_CATALOGO_API: "mock" });
  responder();
  await assert.rejects(
    demo.resolverRenglon(1, 1, { resolucion: "aceptado" }, CLAVE),
    (e) => e.status === 501,
  );
  await assert.rejects(
    demo.emitirPropuesta(1, { modalidadEntrega: "otra", costoEntrega: "0", lineas: [] }, CLAVE),
    (e) => e.status === 501,
  );
  const comprador = { ...usuarioDemo, rol: "comprador", id: 901 };
  const creada = await demo.crearSolicitud(
    {
      renglones: [{ producto: 1, modalidad: "stock", cantidad: 1 }],
      modalidadEntregaPreferida: "otra",
      descripcionEntregaPreferida: "Encomienda",
    },
    comprador,
    "clave-demo-entrega-0001",
  );
  assert.equal(creada.modalidadEntregaPreferida, "otra");
  assert.equal(creada.renglones[0].resueltoEn, null);
  await assert.rejects(
    demo.crearSolicitud(
      { renglones: [{ producto: 1, modalidad: "stock", cantidad: 1 }] },
      comprador,
      "clave-demo-entrega-0001",
    ),
    (e) => e.status === 409,
    "Misma clave con otra preferencia es otra petición.",
  );
  await assert.rejects(
    demo.consultarPropuesta(creada.id, comprador, false),
    (e) => e.status === 404,
  );
  assert.equal(peticiones.length, 0);
});

console.log(`OK: solicitudes HTTP, ${grupos.length} grupos de contrato verificados.`);
