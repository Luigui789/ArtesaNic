// AUD-05: cliente HTTP contra respuestas controladas. No es E2E de sesión (AUD-18).
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
                 export * as transporte from "@/features/catalogo/http";`
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

const { api, http, transporte } = await cargarClienteReal();
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
};
const solicitudDTO = {
  id: 9,
  taller: { id: 3, nombre: "Taller destinatario" },
  estado: "pendiente_revision",
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
transporte.configurarTokenDeAcceso(() => token);

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
  const solicitud = await api.crearSolicitud(entrada, usuarioDemo);
  assert.equal(ultima().url, "/api/v1/solicitudes/");
  assert.equal(ultima().metodo, "POST");
  assert.equal(ultima().cabeceras.Authorization, `Bearer ${token}`);
  assert.equal(ultima().cabeceras["Content-Type"], "application/json");
  assert.deepEqual(ultima().cuerpo, http.cuerpoSolicitud(entrada));
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
  await assert.rejects(http.crearSolicitud(entrada), (error) => {
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
  responder({ status: 401, cuerpo: { detail: "Authentication credentials were not provided." } });
  await assert.rejects(api.crearSolicitud(entrada, usuarioDemo), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.message, "Inicia sesión para consultar o enviar solicitudes.");
    return true;
  });
  assert.equal(ultima().cabeceras.Authorization, undefined);
  assert.deepEqual(ultima().cuerpo, http.cuerpoSolicitud(entrada));
  token = "token-de-acceso-exclusivo-de-pruebas";
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
  await assert.rejects(http.crearSolicitud(entrada), (error) => {
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
  );
  assert.equal(creada.estado, "pendiente_revision");
  assert.equal((await demo.consultarSolicitud(creada.id, compradorDemo, false)).id, creada.id);
  assert.equal(peticiones.length, 0);
});

console.log(
  `OK: solicitudes HTTP, ${grupos.length} grupos de contrato; sesión E2E pendiente de AUD-18.`,
);
