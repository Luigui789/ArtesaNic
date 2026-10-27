/**
 * API de talleres que consume la interfaz.
 *
 * El perfil público (`getPerfilTaller`) sigue la misma fuente que el catálogo: con
 * `VITE_CATALOGO_API=real` lee `GET /api/v1/talleres/{id}/` (AUD-02), de modo que el
 * `taller.id` de un producto real abre su taller real. El resto todavía delega en el
 * servidor simulado, que usan el panel, pedidos y mensajes.
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

export const listPerfilesTalleres: () => Promise<PerfilTaller[]> = catalogoReal
  ? http.listPerfilesTalleres
  : async () => (await listArtisans()).map(aPerfilTallerDemo);

export const getPerfilTaller: (id: number) => Promise<PerfilTaller> = catalogoReal
  ? http.getPerfilTaller
  : getPerfilTallerDemo;

/** Taller propio con su estado de aprobación. Solo existe en la API real (AUD-18). */
export const getMiTaller = http.getMiTaller;
/** Edición del perfil propio (RF-008). Solo API real: la demo usa `updateArtisan`. */
export const actualizarMiTaller = http.actualizarMiTaller;

export { featuredArtisans, getArtisan, listArtisans, updateArtisan } from "@/mocks/talleres";
export type {
  ActualizarPerfilTallerInput,
  EstadoTaller,
  PerfilTaller,
  PerfilTallerEntrada,
  TallerPropio,
} from "./types";
