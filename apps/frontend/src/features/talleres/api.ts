/**
 * API de talleres que consume la interfaz.
 *
 * El perfil público (`getPerfilTaller`) sigue la misma fuente que el catálogo: con
 * `VITE_CATALOGO_API=real` lee `GET /api/v1/talleres/{id}/` (AUD-02), de modo que el
 * `taller.id` de un producto real abre su taller real. El resto todavía delega en el
 * servidor simulado, que usan el panel, pedidos y mensajes.
 */
import { catalogoReal } from "@/features/catalogo/api";
import { getArtisan } from "@/mocks/talleres";
import * as http from "./http";
import type { PerfilTaller } from "./types";

/** Adapta el taller de la demo al perfil público del contrato. */
async function getPerfilTallerDemo(id: number): Promise<PerfilTaller> {
  const a = await getArtisan(id);
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

export const getPerfilTaller: (id: number) => Promise<PerfilTaller> = catalogoReal
  ? http.getPerfilTaller
  : getPerfilTallerDemo;

export { featuredArtisans, getArtisan, listArtisans, updateArtisan } from "@/mocks/talleres";
export type { PerfilTaller } from "./types";
