/**
 * Proveedores externos del mapa del taller (FEAT-GEO-02): único lugar con sus URLs.
 * Cambiar de proveedor es cambiar `VITE_MAP_TILE_URL` o `VITE_GEOCODING_URL`. Sin ellas
 * los tiles usan los servidores públicos de OpenStreetMap (atribución visible; servicio
 * limitado, sin garantía de disponibilidad). El Nominatim público solo se usa como
 * respaldo en desarrollo: su límite de 1 petición/s es para toda la aplicación, y el
 * espaciado de `geocoding.ts` es por navegador, así que no lo garantiza con varios
 * usuarios. En un build de producción la búsqueda exige `VITE_GEOCODING_URL`.
 * Políticas: https://operations.osmfoundation.org/policies/tiles/ y
 * https://operations.osmfoundation.org/policies/nominatim/.
 */
import type { UbicacionTaller } from "./types";

const TILES_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const NOMINATIM_OSM = "https://nominatim.openstreetmap.org/search";

function variable(nombre: string): string | undefined {
  const valor = (import.meta.env[nombre] as string | undefined)?.trim();
  return valor ? valor : undefined;
}

/** Capa base: Leaflet pide solo los tiles del área visible; no hay precarga. */
export const CAPA_MAPA = {
  url: variable("VITE_MAP_TILE_URL") ?? TILES_OSM,
  atribucion:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  zoomMaximo: 19,
} as const;

/**
 * Endpoint de búsqueda compatible con la API `search` de Nominatim, o null si no hay
 * proveedor: en producción sin `VITE_GEOCODING_URL` la búsqueda queda deshabilitada
 * (el mapa manual y la ubicación actual siguen funcionando).
 */
export function resolverUrlGeocodificacion(
  configurada: string | undefined,
  desarrollo: boolean,
): string | null {
  return configurada ?? (desarrollo ? NOMINATIM_OSM : null);
}

export const URL_GEOCODIFICACION = resolverUrlGeocodificacion(
  variable("VITE_GEOCODING_URL"),
  import.meta.env.DEV,
);

/**
 * Centro del mapa cuando el taller aún no tiene ubicación. Solo encuadra la vista:
 * no significa que el taller esté ahí, y el valor seleccionado sigue siendo `null`.
 */
export const CENTRO_INICIAL_MASAYA: UbicacionTaller = { latitud: 11.9744, longitud: -86.0942 };
export const ZOOM_INICIAL = 14;
/** Zoom al mostrar una ubicación concreta (guardada, buscada o detectada). */
export const ZOOM_UBICACION = 17;
