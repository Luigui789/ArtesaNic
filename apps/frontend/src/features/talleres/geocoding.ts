/**
 * Búsqueda de lugares para el selector de ubicación (FEAT-GEO-02). Único punto que
 * llama al geocodificador externo; los componentes lo usan mediante `api.ts`.
 *
 * Por defecto es el Nominatim público de OpenStreetMap, cuya política
 * (https://operations.osmfoundation.org/policies/nominatim/) obliga a: búsquedas
 * iniciadas por el usuario, sin autocompletado, como máximo 1 petición por segundo,
 * atribución y caché de resultados. Por eso aquí no hay búsqueda al escribir: solo
 * `buscar()` con acción explícita (botón o Enter), espaciada y en caché por consulta.
 * El espaciado y la caché son por navegador: no limitan el tráfico total de todos los
 * usuarios, por eso el Nominatim público es solo el respaldo de desarrollo (`mapa.ts`).
 */
import { URL_GEOCODIFICACION } from "./mapa";
import type { UbicacionTaller } from "./types";
import { crearUbicacion } from "./ubicacion";

export interface ResultadoLugar {
  id: string;
  nombre: string;
  ubicacion: UbicacionTaller;
}

export class ErrorGeocodificacion extends Error {
  override name = "ErrorGeocodificacion";
}

export const LIMITE_RESULTADOS = 5;
export const INTERVALO_MINIMO_MS = 1000;
const MAXIMO_EN_CACHE = 30;
const COORDENADA = /^-?\d{1,3}(\.\d+)?$/;
export const MENSAJE_ERROR_BUSQUEDA =
  "No pudimos buscar ese lugar. Puedes intentarlo nuevamente o seleccionarlo manualmente en el mapa.";

export const MENSAJE_SIN_PROVEEDOR =
  "La búsqueda de lugares no está disponible. Selecciona tu taller en el mapa o usa tu ubicación actual.";

/** Clave de caché: sin mayúsculas, tildes ni espacios repetidos. */
export function normalizarConsulta(consulta: string): string {
  return consulta
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function aResultados(datos: unknown): ResultadoLugar[] {
  if (!Array.isArray(datos)) throw new ErrorGeocodificacion(MENSAJE_ERROR_BUSQUEDA);
  const resultados: ResultadoLugar[] = [];
  for (const item of datos as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const { lat, lon, display_name: nombre, place_id: id } = item;
    if (typeof lat !== "string" || typeof lon !== "string" || typeof nombre !== "string") continue;
    if (!COORDENADA.test(lat) || !COORDENADA.test(lon)) continue;
    const ubicacion = crearUbicacion(Number(lat), Number(lon));
    if (!ubicacion) continue;
    resultados.push({ id: String(id ?? `${lat},${lon}`), nombre, ubicacion });
    if (resultados.length === LIMITE_RESULTADOS) break;
  }
  return resultados;
}

interface Dependencias {
  /** null: sin proveedor configurado; `buscar` rechaza sin hacer peticiones. */
  url?: string | null;
  fetch?: typeof globalThis.fetch;
  ahora?: () => number;
  esperar?: (ms: number) => Promise<void>;
}

/** Geocodificador con caché en memoria y espaciado mínimo entre peticiones. */
export function crearGeocodificador({
  url = URL_GEOCODIFICACION,
  fetch = (...args) => globalThis.fetch(...args),
  ahora = () => Date.now(),
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: Dependencias = {}) {
  const cache = new Map<string, ResultadoLugar[]>();
  let siguienteTurno = 0;

  async function buscar(consulta: string, signal?: AbortSignal): Promise<ResultadoLugar[]> {
    const clave = normalizarConsulta(consulta);
    if (!clave) return [];
    if (!url) throw new ErrorGeocodificacion(MENSAJE_SIN_PROVEEDOR);
    const guardado = cache.get(clave);
    if (guardado) return guardado;

    // Reserva el turno antes de esperar: dos búsquedas seguidas quedan a ≥ 1 s.
    const momento = ahora();
    const espera = Math.max(0, siguienteTurno - momento);
    siguienteTurno = momento + espera + INTERVALO_MINIMO_MS;
    if (espera > 0) await esperar(espera);
    signal?.throwIfAborted();

    const parametros = new URLSearchParams({
      q: consulta.trim(),
      format: "jsonv2",
      limit: String(LIMITE_RESULTADOS),
      countrycodes: "ni",
    });
    let respuesta: Response;
    try {
      respuesta = await fetch(`${url}?${parametros}`, {
        headers: { Accept: "application/json", "Accept-Language": "es" },
        credentials: "omit",
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ErrorGeocodificacion(MENSAJE_ERROR_BUSQUEDA);
    }
    if (!respuesta.ok) throw new ErrorGeocodificacion(MENSAJE_ERROR_BUSQUEDA);
    let datos: unknown;
    try {
      datos = await respuesta.json();
    } catch {
      throw new ErrorGeocodificacion(MENSAJE_ERROR_BUSQUEDA);
    }
    const resultados = aResultados(datos);
    if (cache.size >= MAXIMO_EN_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(clave, resultados);
    return resultados;
  }

  return { buscar, disponible: url !== null };
}

/** Instancia de la aplicación: una sola caché y un solo turno para toda la sesión. */
const geocodificador = crearGeocodificador();
export const buscarLugar = geocodificador.buscar;
/** false en producción sin `VITE_GEOCODING_URL`: la interfaz oculta la búsqueda. */
export const busquedaDisponible = geocodificador.disponible;
