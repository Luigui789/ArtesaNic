/**
 * Ubicación del taller en el panel (FEAT-GEO-02), sin dependencias del navegador.
 * La API entrega las coordenadas como texto decimal y admite hasta 6 decimales
 * (docs/api/talleres.md, FEAT-GEO-01); el mapa trabaja con números.
 */
import type {
  ActualizarPerfilTallerInput,
  MarcadorTaller,
  PerfilTaller,
  TallerPropio,
  UbicacionTaller,
} from "./types";

export const DECIMALES_COORDENADA = 6;
const FACTOR = 10 ** DECIMALES_COORDENADA;
const DECIMAL = /^-?\d{1,3}(\.\d+)?$/;

/** Redondea al sexto decimal, el máximo que acepta el backend (11.97123449 → 11.971234). */
export function redondearCoordenada(valor: number): number {
  const redondeado = Math.round(valor * FACTOR) / FACTOR;
  return Object.is(redondeado, -0) ? 0 : redondeado;
}

/** Ubicación redondeada, o null si no son coordenadas WGS 84 válidas. */
export function crearUbicacion(latitud: number, longitud: number): UbicacionTaller | null {
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) return null;
  return { latitud: redondearCoordenada(latitud), longitud: redondearCoordenada(longitud) };
}

function numeroDecimal(texto: string): number | null {
  const limpio = texto.trim();
  if (!DECIMAL.test(limpio)) return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Única conversión de texto decimal de la API (`"11.971234"`) a ubicación del mapa,
 * para el taller propio y para `ubicacion_mapa` del perfil público (FEAT-GEO-04).
 * null si falta una coordenada, no es numérica o está fuera de rango.
 */
export function ubicacionDesdeDecimales(
  latitud: string | null,
  longitud: string | null,
): UbicacionTaller | null {
  const lat = latitud === null ? null : numeroDecimal(latitud);
  const lng = longitud === null ? null : numeroDecimal(longitud);
  return lat === null || lng === null ? null : crearUbicacion(lat, lng);
}

/**
 * Conversión API → mapa del taller propio. `invalida` indica datos inesperados del
 * servidor (una sola coordenada, texto no numérico o fuera de rango): se tratan como
 * sin ubicación en vez de romper el panel.
 */
export function ubicacionDeTaller(t: Pick<TallerPropio, "latitud" | "longitud">): {
  ubicacion: UbicacionTaller | null;
  invalida: boolean;
} {
  if (t.latitud === null && t.longitud === null) return { ubicacion: null, invalida: false };
  const ubicacion = ubicacionDesdeDecimales(t.latitud, t.longitud);
  return { ubicacion, invalida: ubicacion === null };
}

/** Lo que edita la sección «Ubicación del taller». */
export interface EstadoUbicacion {
  ubicacion: UbicacionTaller | null;
  publica: boolean;
}

/** Estado guardado: sin coordenadas válidas la ubicación nunca figura como pública. */
export function estadoUbicacionDe(t: TallerPropio): EstadoUbicacion & { invalida: boolean } {
  const { ubicacion, invalida } = ubicacionDeTaller(t);
  return { ubicacion, publica: ubicacion !== null && t.ubicacionPublica, invalida };
}

/** «Quitar ubicación»: sin coordenadas no se puede publicar (FEAT-GEO-01). */
export function quitarUbicacion(): EstadoUbicacion {
  return { ubicacion: null, publica: false };
}

/** Cambiar la posición conserva la decisión de publicar; quitarla la desactiva. */
export function conUbicacion(
  estado: EstadoUbicacion,
  ubicacion: UbicacionTaller | null,
): EstadoUbicacion {
  return ubicacion === null ? quitarUbicacion() : { ubicacion, publica: estado.publica };
}

const mismaUbicacion = (a: UbicacionTaller | null, b: UbicacionTaller | null) =>
  a === b || (a !== null && b !== null && a.latitud === b.latitud && a.longitud === b.longitud);

/**
 * Cambios para el `PATCH`. Si algo cambió se envía el estado completo (coordenadas
 * y publicación), así una eliminación es siempre `null`/`null`/`false`. Sin cambios,
 * nada: mover el marcador sin guardar no genera peticiones.
 */
export function cambiosDeUbicacion(
  original: EstadoUbicacion,
  editado: EstadoUbicacion,
): Pick<ActualizarPerfilTallerInput, "ubicacion" | "ubicacionPublica"> {
  const publica = editado.ubicacion !== null && editado.publica;
  if (mismaUbicacion(original.ubicacion, editado.ubicacion) && original.publica === publica)
    return {};
  return { ubicacion: editado.ubicacion, ubicacionPublica: publica };
}

/**
 * Marcadores del mapa público (FEAT-GEO-04): uno por taller con `ubicacionMapa`, que la
 * API solo envía si el taller está aprobado y autorizó publicarla. Los demás talleres
 * no generan marcador ni dejan rastro de su posición.
 */
export function marcadoresDeTalleres(talleres: readonly PerfilTaller[]): MarcadorTaller[] {
  return talleres.flatMap(({ id, nombre, rubro, direccion, ubicacionMapa }) =>
    ubicacionMapa ? [{ id, nombre, rubro, direccion, ubicacion: ubicacionMapa }] : [],
  );
}
