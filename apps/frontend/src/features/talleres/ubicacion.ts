/**
 * Ubicación del taller en el panel (FEAT-GEO-02), sin dependencias del navegador.
 * La API entrega las coordenadas como texto decimal y admite hasta 6 decimales
 * (docs/api/talleres.md, FEAT-GEO-01); el mapa trabaja con números.
 */
import type { ActualizarPerfilTallerInput, TallerPropio, UbicacionTaller } from "./types";

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
 * Única conversión API → mapa. `invalida` indica datos inesperados del servidor
 * (una sola coordenada, texto no numérico o fuera de rango): se tratan como sin
 * ubicación en vez de romper el panel.
 */
export function ubicacionDeTaller(t: Pick<TallerPropio, "latitud" | "longitud">): {
  ubicacion: UbicacionTaller | null;
  invalida: boolean;
} {
  if (t.latitud === null && t.longitud === null) return { ubicacion: null, invalida: false };
  const latitud = t.latitud === null ? null : numeroDecimal(t.latitud);
  const longitud = t.longitud === null ? null : numeroDecimal(t.longitud);
  const ubicacion =
    latitud === null || longitud === null ? null : crearUbicacion(latitud, longitud);
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
