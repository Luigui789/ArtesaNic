/**
 * Núcleo del servidor simulado.
 * Simula operaciones sobre un store con instantáneas locales en IndexedDB.
 * Las extensiones de esta demo requieren homologación y contrato antes de Django.
 *
 * Los dominios (`catalogo.ts`, `pedidos.ts`, …) comparten este único store
 * porque, como en el backend, una operación puede afectar a varios: aceptar un
 * pedido reserva unidades del producto. La interfaz no importa este módulo: usa
 * `src/features/<dominio>/api.ts`.
 */
import {
  buildArtisans,
  buildCategories,
  buildMessages,
  buildOrders,
  buildProducts,
  applyScenarioUnits,
  RESPONSABLE_TALLER_DEMO,
  TALLER_DEMO_ID,
} from "./seed";
import { borrarInstantanea, guardarInstantanea, leerInstantanea } from "./persistence";
import type { RenglonSolicitud, SolicitudArtesano } from "@/features/solicitudes/types";

/**
 * Las instantáneas v4 anteriores a AUD-06 no guardan preferencia de entrega ni revisión:
 * esos campos son opcionales aquí y la lectura los completa con valores vacíos, de modo
 * que no hace falta cambiar la versión de IndexedDB. La demo no simula la revisión.
 */
export interface SolicitudDemo extends Omit<
  SolicitudArtesano,
  "modalidadEntregaPreferida" | "descripcionEntregaPreferida" | "renglones"
> {
  compradorId: number;
  modalidadEntregaPreferida?: SolicitudArtesano["modalidadEntregaPreferida"];
  descripcionEntregaPreferida?: string;
  renglones: Omit<RenglonSolicitud, "resueltoEn">[];
}

const categories = buildCategories();
const artisans = buildArtisans(categories);
const products = buildProducts(artisans);
const { orders, receiptFiles } = buildOrders(products);
const messages = buildMessages();
const movements = applyScenarioUnits(products, orders);

export let store = {
  categories,
  artisans,
  products,
  orders,
  messages,
  receiptFiles,
  movements,
  solicitudes: [] as SolicitudDemo[],
};
const initial = structuredClone(store);
/**
 * Estado de la persistencia de la demo. Si había datos guardados que no se
 * pudieron usar (error de lectura u otra versión), el mock trabaja solo en
 * memoria y no guarda: hacerlo sobrescribiría esos datos sin avisar. La
 * interfaz lo comunica y «Restablecer» es la única forma de reemplazarlos.
 */
export type PersistenceStatus =
  { modo: "guardando" } | { modo: "solo_memoria"; motivo: "error_lectura" | "otra_version" };

let persistencia: PersistenceStatus = { modo: "guardando" };

const ready = leerInstantanea<typeof store>().then((lectura) => {
  if (lectura.estado === "cargada") store = lectura.datos;
  else if (lectura.estado === "error") {
    persistencia = { modo: "solo_memoria", motivo: "error_lectura" };
  } else if (lectura.estado === "otra_version") {
    persistencia = { modo: "solo_memoria", motivo: "otra_version" };
  }
});
let queue: Promise<unknown> = Promise.resolve();

export async function getPersistenceStatus(): Promise<PersistenceStatus> {
  await ready;
  return persistencia;
}

async function guardar() {
  if (persistencia.modo !== "guardando") return;
  try {
    await guardarInstantanea(store);
  } catch {
    throw new Error(
      "No se pudo guardar en el almacenamiento del navegador; el cambio no se aplicó. Intenta de nuevo o libera espacio.",
    );
  }
}

/** Taller cuyo panel se demuestra en el prototipo. */
export const DEMO_ARTISAN_ID = TALLER_DEMO_ID;

/** Persona responsable del taller demo: nombre de la sesión de artesano. */
export const DEMO_ARTISAN_RESPONSABLE = RESPONSABLE_TALLER_DEMO;

/**
 * Persona usuaria del prototipo. Identifica a la persona, no al taller: en la
 * sesión de artesano conviven `DEMO_USER_ID` (quien actúa) y `DEMO_ARTISAN_ID`
 * (el taller sobre el que actúa), y no deben confundirse.
 */
export const DEMO_USER_ID = 4;

/**
 * El mock ocupa el lugar del backend: aquí los identificadores se asignan como
 * lo haría el servidor (enteros crecientes). La interfaz nunca los construye.
 */
export const nextId = (items: { id: number }[]) => Math.max(0, ...items.map((x) => x.id)) + 1;

/** Latencia simulada fija: la demostración debe comportarse igual en cada ensayo. */
const delay = (ms = 450) => new Promise((r) => setTimeout(r, ms));

let failNext = false;
/** Permite demostrar el estado de error / "Reintentar" (RNF-006). */
export function simularFalloProximaPeticion() {
  failNext = true;
}

export async function api<T>(fn: () => T, ms?: number, write = false): Promise<T> {
  await ready;
  await delay(ms);
  if (failNext) {
    failNext = false;
    throw new Error("No pudimos conectar con el servicio. Intenta de nuevo.");
  }
  const operation = queue.then(async () => {
    const before = write ? structuredClone(store) : undefined;
    try {
      const result = structuredClone(fn());
      if (write) await guardar();
      return result;
    } catch (error) {
      if (before) store = before;
      throw error;
    }
  });
  queue = operation.catch(() => undefined);
  return operation;
}

export async function resetDemo(): Promise<void> {
  await ready;
  const operation = queue.then(async () => {
    await borrarInstantanea();
    store = structuredClone(initial);
    // Tras borrar lo ilegible u obsoleto, la demo vuelve a guardar normalmente.
    persistencia = { modo: "guardando" };
  });
  queue = operation.catch(() => undefined);
  await operation;
}

export const nowIso = () => new Date().toISOString();
