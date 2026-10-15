/**
 * Persistencia de la DEMOSTRACIÓN, no del sistema.
 *
 * Guarda en IndexedDB del navegador una instantánea del estado del mock para que
 * una recarga conserve productos, imágenes, perfil del taller, pedidos, reservas,
 * pagos y mensajes. Se usa IndexedDB y no `localStorage` porque las imágenes
 * (fotografías y comprobantes en base64) superan con facilidad su cuota de ~5 MB.
 *
 * Es un artefacto temporal del prototipo: desaparece junto con `src/mocks/`
 * cuando exista el backend (PostgreSQL). Los datos viven solo en este navegador
 * y no se comparten entre dispositivos.
 */

const DB_NOMBRE = "artesanic-demo";
const ALMACEN = "estado";
const CLAVE = "instantanea";

/**
 * Versión de la forma del estado. Si el modelo cambia, una instantánea antigua
 * se descarta en lugar de cargarse con campos que ya no existen.
 */
export const VERSION_INSTANTANEA = 3;

interface Instantanea<T> {
  version: number;
  datos: T;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function operar<R>(
  modo: IDBTransactionMode,
  fn: (almacen: IDBObjectStore) => IDBRequest,
): Promise<R> {
  const db = await abrir();
  try {
    return await new Promise<R>((resolve, reject) => {
      const tx = db.transaction(ALMACEN, modo);
      const peticion = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolve(peticion.result as R);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Resultado de leer la instantánea. Se distinguen los casos porque no son
 * equivalentes: «vacía» permite empezar desde el seed y guardar, pero «otra
 * versión» o «error» significan que hay datos que no se pudieron usar, y
 * guardar encima los borraría sin avisar.
 */
export type LecturaInstantanea<T> =
  | { estado: "vacia" }
  | { estado: "cargada"; datos: T }
  | { estado: "otra_version"; version: number }
  | { estado: "error"; mensaje: string };

export async function leerInstantanea<T>(): Promise<LecturaInstantanea<T>> {
  try {
    if (typeof indexedDB === "undefined") return { estado: "vacia" };
    const guardada = await operar<Instantanea<T> | undefined>("readonly", (a) => a.get(CLAVE));
    if (!guardada) return { estado: "vacia" };
    if (guardada.version !== VERSION_INSTANTANEA) {
      return { estado: "otra_version", version: guardada.version };
    }
    return { estado: "cargada", datos: guardada.datos };
  } catch (error) {
    return { estado: "error", mensaje: error instanceof Error ? error.message : String(error) };
  }
}

export async function guardarInstantanea<T>(datos: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const instantanea: Instantanea<T> = { version: VERSION_INSTANTANEA, datos };
  await operar("readwrite", (a) => a.put(instantanea, CLAVE));
}

export async function borrarInstantanea(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await operar("readwrite", (a) => a.delete(CLAVE));
}
