/**
 * Perfil público del taller contra Django (AUD-02). Contrato: docs/api/talleres.md.
 * Única capa que conoce los nombres de la API del taller (`snake_case`).
 */
import { solicitar } from "@/features/catalogo/http";
import type { PerfilTaller } from "./types";

interface TallerPublicoDTO {
  id: number;
  nombre: string;
  historia: string;
  rubro: string;
  direccion_completa: string;
  horario: string;
  telefono_publico: string;
  whatsapp_publico: string;
  facebook_url: string;
  instagram_url: string;
  sitio_web: string;
}

export function aPerfilTaller(t: TallerPublicoDTO): PerfilTaller {
  return {
    id: t.id,
    nombre: t.nombre,
    historia: t.historia,
    rubro: t.rubro,
    direccion: t.direccion_completa,
    horario: t.horario,
    telefono: t.telefono_publico,
    whatsapp: t.whatsapp_publico,
    facebook: t.facebook_url,
    instagram: t.instagram_url,
    sitioWeb: t.sitio_web,
  };
}

/** `GET /api/v1/talleres/{id}/`: solo talleres aprobados; los demás responden 404. */
export async function getPerfilTaller(id: number): Promise<PerfilTaller> {
  return aPerfilTaller(
    await solicitar<TallerPublicoDTO>(`/talleres/${id}/`, {
      mensajes: { 404: "No encontramos este taller." },
    }),
  );
}
