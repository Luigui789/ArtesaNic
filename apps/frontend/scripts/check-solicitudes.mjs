// AUD-05: composición y servidor de demostración. No verifica sesión real (AUD-18).
import assert from "node:assert/strict";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { cargarModulo } from "./cargar-modulo.mjs";

const validacion = await cargarModulo("src/features/solicitudes/validacion.ts");
const tipos = await cargarModulo("src/features/solicitudes/types.ts");
const grupos = [];
async function verificar(nombre, fn) {
  await fn();
  grupos.push(nombre);
}

// IndexedDB conserva instantáneas entre dos cargas independientes del bundle.
// Solo se sustituyen las operaciones del navegador; los servicios son los reales del mock.
let instantanea;
globalThis.indexedDB = {
  open() {
    const peticion = {};
    const db = {
      close() {},
      transaction() {
        const transaccion = {
          objectStore() {
            const completar = (result) => {
              const operacion = { result };
              queueMicrotask(() => transaccion.oncomplete?.());
              return operacion;
            };
            return {
              get: () => completar(structuredClone(instantanea)),
              put: (valor) => {
                instantanea = structuredClone(valor);
                return completar("instantanea");
              },
              delete: () => {
                instantanea = undefined;
                return completar(undefined);
              },
            };
          },
        };
        return transaccion;
      },
    };
    queueMicrotask(() => {
      peticion.result = db;
      peticion.onsuccess?.();
    });
    return peticion;
  },
};

// Un bundle único comparte exactamente el store entre api, catálogo y observaciones.
async function cargarDemo(carga) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const virtual = fileURLToPath(
    new URL("./__comprobar-solicitudes__.ts", import.meta.url),
  ).replaceAll("\\", "/");
  const anterior = process.env["VITE_CATALOGO_API"];
  process.env["VITE_CATALOGO_API"] = "mock";
  try {
    const resultado = await build({
      configFile: false,
      root,
      logLevel: "error",
      resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
      plugins: [
        {
          name: "comprobar-solicitudes",
          resolveId: (id) => (id.replaceAll("\\", "/") === virtual ? `\0${virtual}` : undefined),
          load: (id) =>
            id === `\0${virtual}`
              ? `export * as api from "@/features/solicitudes/api";
                 export * as catalogo from "@/mocks/catalogo";
                 export * as core from "@/mocks/core";
                 export { VERSION_INSTANTANEA } from "@/mocks/persistence";
                 export const carga = ${JSON.stringify(carga)};`
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

const { api, catalogo, core, VERSION_INSTANTANEA } = await cargarDemo("primera");
let peticionesHTTP = 0;
globalThis.fetch = async () => {
  peticionesHTTP++;
  throw new Error("Una operación demo intentó llamar a HTTP.");
};
const comprador = { id: 501, nombre: "Compradora de prueba", telefono: "", rol: "comprador" };
const otroComprador = { ...comprador, id: 502, nombre: "Otra compradora" };
const artesano = {
  id: 601,
  nombre: "Artesano de prueba",
  telefono: "",
  rol: "artesano",
  artesanoId: core.DEMO_ARTISAN_ID,
};
const otroArtesano = { ...artesano, id: 602, artesanoId: 2 };
const productoCreado = await catalogo.createOwnProduct({
  nombre: "Producto de composición V1",
  descripcion: "Admite las tres modalidades de solicitud.",
  precio: 10,
  categoria: core.store.categories[0].codigo,
  modalidades: ["stock", "produccion", "personalizacion"],
  inventarioDemo: { tipoUnidades: "existencias", existenciasFisicas: 3 },
});
const producto = await catalogo.publishOwnProduct(productoCreado.id);
const otroProducto = (await catalogo.listCatalog({ artesanoId: 2, pageSize: 1 })).items[0];
assert.ok(otroProducto, "La fixture incluye un segundo taller.");
const stock = validacion.nuevoRenglon(producto);
const produccion = {
  ...stock,
  modalidad: "produccion",
  fechaSolicitada: validacion.fechaLocalISO(),
};
const personalizacion = {
  ...stock,
  modalidad: "personalizacion",
  caracteristicas: "Iniciales y acabado azul",
  origenPersonalizacion: "unidad_estandar",
};
const entrada = validacion.crearEntradaSolicitud([stock, produccion, personalizacion]);
const codigo = (esperado) => (error) => error.status === esperado;
const efectos = () =>
  structuredClone({
    orders: core.store.orders,
    movements: core.store.movements,
    messages: core.store.messages,
    receiptFiles: core.store.receiptFiles,
    inventario: core.store.products.map((p) => ({
      id: p.id,
      existencias: p.existenciasFisicas,
      reservadas: p.unidadesReservadas,
      clasificar: p.unidadesPorClasificar,
      disponibles: p.unidadesDisponibles,
    })),
  });
const efectosAntes = efectos();
let solicitud;

await verificar("composición de uno y varios renglones, modalidades independientes", () => {
  assert.equal(validacion.validarSolicitudBorrador([stock]).success, true);
  assert.equal(validacion.validarSolicitudBorrador([]).success, false);
  assert.equal(
    validacion.validarSolicitudBorrador([stock, produccion, personalizacion]).success,
    true,
  );
  assert.deepEqual(
    entrada.renglones.map((r) => r.modalidad),
    ["stock", "produccion", "personalizacion"],
  );
  assert.equal(validacion.crearEntradaSolicitud([stock, stock]).renglones.length, 2);
});

await verificar("límites espejo del backend: renglones y características", () => {
  const maximo = Array(validacion.MAX_RENGLONES).fill(stock);
  assert.equal(validacion.validarSolicitudBorrador(maximo).success, true);
  assert.equal(validacion.validarSolicitudBorrador([...maximo, stock]).success, false);
  const largo = (n) => ({ ...personalizacion, caracteristicas: "a".repeat(n) });
  const max = validacion.MAX_CARACTERISTICAS;
  assert.equal(validacion.validarSolicitudBorrador([largo(max)]).success, true);
  assert.equal(validacion.validarSolicitudBorrador([largo(max + 1)]).success, false);
});

await verificar("mismo taller y bloqueo visual de un taller diferente", () => {
  assert.equal(validacion.puedeAgregarProducto([], otroProducto), true);
  assert.equal(validacion.puedeAgregarProducto([stock], producto), true);
  assert.equal(validacion.puedeAgregarProducto([stock], otroProducto), false);
  assert.equal(
    validacion.validarSolicitudBorrador([stock, validacion.nuevoRenglon(otroProducto)]).success,
    false,
  );
  assert.equal(
    validacion.validarSolicitudBorrador([
      { ...stock, producto: { ...producto, modalidades: ["produccion"] } },
    ]).success,
    false,
  );
});

await verificar("cantidades enteras positivas y máximo PostgreSQL", () => {
  for (const cantidad of [0, -1, 1.5, NaN, Infinity, 2_147_483_648])
    assert.equal(validacion.validarSolicitudBorrador([{ ...stock, cantidad }]).success, false);
  for (const cantidad of [1, 2_147_483_647])
    assert.equal(validacion.validarSolicitudBorrador([{ ...stock, cantidad }]).success, true);
});

await verificar("fecha de producción válida y no pasada", () => {
  for (const fechaSolicitada of ["", "2000-01-01", "2099-02-29", "2099-13-01", "mañana"])
    assert.equal(
      validacion.validarSolicitudBorrador([{ ...produccion, fechaSolicitada }]).success,
      false,
    );
  assert.equal(validacion.validarSolicitudBorrador([produccion]).success, true);
  assert.equal(entrada.renglones[1].fechaSolicitada, validacion.fechaLocalISO());
});

await verificar("personalización desde cero o unidad estándar", () => {
  for (const origenPersonalizacion of ["desde_cero", "unidad_estandar"])
    assert.equal(
      validacion.validarSolicitudBorrador([{ ...personalizacion, origenPersonalizacion }]).success,
      true,
    );
  for (const caracteristicas of ["", "   "])
    assert.equal(
      validacion.validarSolicitudBorrador([{ ...personalizacion, caracteristicas }]).success,
      false,
    );
  assert.equal(
    validacion.validarSolicitudBorrador([{ ...personalizacion, origenPersonalizacion: "" }])
      .success,
    false,
  );
});

await verificar(
  "payload sin identidad, economía, OrderOption ni datos de otras modalidades",
  () => {
    const contaminado = {
      ...stock,
      comprador: 900,
      estado: "rechazada",
      fechaSolicitada: "2099-01-01",
      caracteristicas: "No corresponde a stock",
      origenPersonalizacion: "desde_cero",
    };
    assert.deepEqual(validacion.crearEntradaSolicitud([contaminado]), {
      renglones: [{ producto: producto.id, modalidad: "stock", cantidad: 1 }],
    });
    for (const campo of ["comprador", "taller", "estado", "propuesta", "pedido", "opcion"])
      assert.equal(
        validacion.esquemaSolicitudEntrada.safeParse({ ...entrada, [campo]: "privilegiado" })
          .success,
        false,
      );
    assert.equal(
      validacion.esquemaSolicitudEntrada.safeParse({
        renglones: [{ producto: producto.id, cantidad: 1, opcion: "estandar" }],
      }).success,
      false,
    );
    assert.equal(
      validacion.esquemaSolicitudEntrada.safeParse({
        renglones: [
          { producto: producto.id, cantidad: 1, modalidad: "stock", resolucion: "aceptado" },
        ],
      }).success,
      false,
    );
  },
);

await verificar("AUD-06: estados explícitos de revisión, propuesta y DR-03", () => {
  assert.deepEqual(tipos.ESTADOS_SOLICITUD, [
    "pendiente_revision",
    "lista_propuesta",
    "propuesta_emitida",
    "rechazada",
  ]);
  assert.deepEqual(tipos.MODALIDADES_ENTREGA, [
    "retiro_taller",
    "punto_encuentro",
    "entrega_artesano",
    "otra",
  ]);
  assert.deepEqual(tipos.RESOLUCIONES_RENGLON, ["pendiente", "aceptado", "rechazado"]);
  assert.deepEqual(tipos.ORIGENES_PERSONALIZACION, ["desde_cero", "unidad_estandar"]);
});

await verificar("RF-016: preferencia de entrega opcional; «otra» exige descripción", () => {
  const base = { renglones: [{ producto: producto.id, modalidad: "stock", cantidad: 1 }] };
  const valida = (extra) =>
    validacion.esquemaSolicitudEntrada.safeParse({ ...base, ...extra }).success;
  assert.equal(valida({}), true, "Sin preferencia no se inventa una.");
  assert.equal(valida({ modalidadEntregaPreferida: "retiro_taller" }), true);
  assert.equal(
    valida({ modalidadEntregaPreferida: "otra", descripcionEntregaPreferida: "Encomienda" }),
    true,
  );
  assert.equal(valida({ modalidadEntregaPreferida: "otra" }), false);
  assert.equal(
    valida({ modalidadEntregaPreferida: "otra", descripcionEntregaPreferida: "  " }),
    false,
  );
  assert.equal(valida({ descripcionEntregaPreferida: "Sin modalidad" }), false);
  assert.equal(valida({ modalidadEntregaPreferida: "dron" }), false);
});

await verificar("API demo crea uno y varios renglones sin limitarse al stock actual", async () => {
  assert.equal(api.solicitudesReales, false);
  const simple = await api.crearSolicitud(
    { renglones: [{ producto: producto.id, modalidad: "stock", cantidad: 100 }] },
    comprador,
  );
  assert.equal(simple.estado, "pendiente_revision");
  assert.equal(simple.renglones[0].cantidad, 100, "Disponibilidad definitiva: AUD-07.");
  solicitud = await api.crearSolicitud(entrada, comprador);
  assert.equal(solicitud.taller.id, producto.taller.id);
  assert.equal(solicitud.renglones.length, 3);
  assert.deepEqual(
    solicitud.renglones.map((r) => [r.posicion, r.modalidad, r.resolucion]),
    [
      [1, "stock", "pendiente"],
      [2, "produccion", "pendiente"],
      [3, "personalizacion", "pendiente"],
    ],
  );
  assert.equal(solicitud.renglones[1].fechaSolicitada, produccion.fechaSolicitada);
  assert.equal(solicitud.renglones[2].caracteristicas, personalizacion.caracteristicas);
  assert.equal(solicitud.renglones[2].origenPersonalizacion, "unidad_estandar");
  const desdeCero = await api.crearSolicitud(
    validacion.crearEntradaSolicitud([{ ...personalizacion, origenPersonalizacion: "desde_cero" }]),
    comprador,
  );
  assert.equal(desdeCero.renglones[0].origenPersonalizacion, "desde_cero");
  const duplicados = await api.crearSolicitud(
    validacion.crearEntradaSolicitud([stock, stock]),
    comprador,
  );
  assert.equal(duplicados.renglones.length, 2);
});

await verificar(
  "atomicidad demo al rechazar talleres, productos y entradas inválidas",
  async () => {
    const cantidadAntes = core.store.solicitudes.length;
    for (const invalida of [
      { renglones: [] },
      { ...entrada, comprador: 900 },
      { renglones: [{ producto: 999_999, modalidad: "stock", cantidad: 1 }] },
      {
        renglones: [
          { producto: producto.id, modalidad: "stock", cantidad: 1 },
          { producto: otroProducto.id, modalidad: "stock", cantidad: 1 },
        ],
      },
    ]) {
      await assert.rejects(api.crearSolicitud(invalida, comprador), codigo(400));
      assert.equal(core.store.solicitudes.length, cantidadAntes);
    }
  },
);

await verificar("autenticación y roles demo: 401/403", async () => {
  await assert.rejects(api.crearSolicitud(entrada, null), codigo(401));
  await assert.rejects(api.listarSolicitudes(null, false), codigo(401));
  await assert.rejects(api.consultarSolicitud(solicitud.id, null, false), codigo(401));
  await assert.rejects(api.crearSolicitud(entrada, artesano), codigo(403));
  await assert.rejects(api.listarSolicitudes(comprador, true), codigo(403));
  await assert.rejects(api.listarSolicitudes(artesano, false), codigo(403));
});

await verificar("ownership comprador/artesano, lectura privada y paginación", async () => {
  const mia = await api.consultarSolicitud(solicitud.id, comprador, false);
  assert.equal("comprador" in mia, false);
  assert.equal("compradorId" in mia, false);
  assert.equal((await api.listarSolicitudes(comprador, false)).total, 4);
  assert.equal((await api.listarSolicitudes(otroComprador, false)).total, 0);
  await assert.rejects(api.consultarSolicitud(solicitud.id, otroComprador, false), codigo(404));
  const recibida = await api.consultarSolicitud(solicitud.id, artesano, true);
  assert.deepEqual(recibida.comprador, { id: comprador.id, nombre: comprador.nombre });
  assert.equal((await api.listarSolicitudes(artesano, true)).total, 4);
  assert.equal((await api.listarSolicitudes(otroArtesano, true)).total, 0);
  await assert.rejects(api.consultarSolicitud(solicitud.id, otroArtesano, true), codigo(404));
  await assert.rejects(api.consultarSolicitud(999_999, comprador, false), codigo(404));
  await assert.rejects(api.listarSolicitudes(comprador, false, 0), codigo(404));
  await assert.rejects(api.listarSolicitudes(comprador, false, 2), codigo(404));
});

await verificar("crear solicitudes no modifica pedidos, inventario, pagos ni conversación", () => {
  assert.deepEqual(efectos(), efectosAntes);
  for (const clave of [
    "precio",
    "total",
    "cotizacion",
    "propuesta",
    "pedido",
    "reserva",
    "pagos",
    "chat",
  ])
    assert.equal(clave in solicitud, false);
  for (const renglon of solicitud.renglones)
    for (const clave of ["precio", "precioUnitario", "total", "reserva", "cantidadPropuesta"])
      assert.equal(clave in renglon, false);
  assert.equal(peticionesHTTP, 0);
});

await verificar("despublicar impide nuevas solicitudes y conserva las existentes", async () => {
  const cantidadAntes = core.store.solicitudes.length;
  await catalogo.unpublishOwnProduct(producto.id);
  await assert.rejects(api.crearSolicitud(entrada, comprador), codigo(400));
  assert.equal(core.store.solicitudes.length, cantidadAntes);
  assert.deepEqual(await api.consultarSolicitud(solicitud.id, comprador, false), solicitud);
});

await verificar("persistencia IndexedDB conserva renglones al cargar de nuevo", async () => {
  assert.equal(instantanea.version, VERSION_INSTANTANEA);
  assert.equal(instantanea.datos.solicitudes.length, 4);
  const recargada = await cargarDemo("segunda");
  assert.deepEqual(
    await recargada.api.consultarSolicitud(solicitud.id, comprador, false),
    solicitud,
  );
  assert.equal(recargada.core.store.products.find((p) => p.id === producto.id).publicado, false);
  assert.deepEqual(recargada.core.store.orders, efectosAntes.orders);
  assert.deepEqual(recargada.core.store.movements, efectosAntes.movements);
  assert.deepEqual(recargada.core.store.messages, efectosAntes.messages);
});

console.log(
  `OK: solicitudes V1, ${grupos.length} grupos de composición, permisos y demo persistente.`,
);
