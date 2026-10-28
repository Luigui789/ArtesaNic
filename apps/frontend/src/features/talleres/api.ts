/**
 * API de talleres que consume la interfaz.
 *
 * El listado y el perfil público (`listPerfilesTalleres`, `getPerfilTaller`) siguen la
 * misma fuente que el catálogo: por defecto (`VITE_CATALOGO_API=real`) leen
 * `GET /api/v1/talleres/` y `GET /api/v1/talleres/{id}/` (AUD-02 y AUD-18), de modo que
 * `/descubrir` y el `taller.id` de un producto real abren talleres aprobados reales.
 * Las lecturas simuladas se conservan únicamente para `VITE_CATALOGO_API=mock`.
 */
import { catalogoReal } from "@/features/catalogo/api";
import { getArtisan, listArtisans } from "@/mocks/talleres";
import type { Artisan } from "@/types";
import * as http from "./http";
import type { PerfilTaller } from "./types";

function aPerfilTallerDemo(a: Artisan): PerfilTaller {
  return {
    id: a.id,
    nombre: a.nombreTaller,
    historia: a.historia,
    rubro: a.rubro.nombre,
    direccion: a.ubicacion,
    horario: a.horario,
    telefono: a.telefono,
    whatsapp: a.whatsapp,
    facebook: a.redes.facebook ?? "",
    instagram: a.redes.instagram ?? "",
    sitioWeb: "",
    demo: {
      responsable: a.responsable,
      descripcion: a.descripcion,
      fotoUrl: a.fotoUrl,
      portadaUrl: a.portadaUrl,
    },
  };
}

/** Adapta el taller de la demo al perfil público del contrato. */
async function getPerfilTallerDemo(id: number): Promise<PerfilTaller> {
  return aPerfilTallerDemo(await getArtisan(id));
}

export const listPerfilesTalleres: (signal?: AbortSignal) => Promise<PerfilTaller[]> = catalogoReal
  ? http.listPerfilesTalleres
  : async () => (await listArtisans()).map(aPerfilTallerDemo);

export const getPerfilTaller: (id: number) => Promise<PerfilTaller> = catalogoReal
  ? http.getPerfilTaller
  : getPerfilTallerDemo;

/** Taller propio con su estado de aprobación. Solo existe en la API real (AUD-18). */
export const getMiTaller = http.getMiTaller;
/** Edición del perfil propio (RF-008). Solo API real: la demo usa `updateArtisan`. */
export const actualizarMiTaller = http.actualizarMiTaller;

/** Selector de ubicación (FEAT-GEO-02): búsqueda explícita y posición del dispositivo. */
export { buscarLugar, ErrorGeocodificacion, type ResultadoLugar } from "./geocoding";
export {
  MENSAJES_GEOLOCALIZACION,
  obtenerUbicacionActual,
  type FalloGeolocalizacion,
} from "./geolocation";

export { featuredArtisans, getArtisan, listArtisans, updateArtisan } from "@/mocks/talleres";
export type {
  ActualizarPerfilTallerInput,
  EstadoTaller,
  PerfilTaller,
  PerfilTallerEntrada,
  TallerPropio,
  UbicacionTaller,
} from "./types";
