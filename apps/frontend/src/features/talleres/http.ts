/**
 * Perfil público del taller contra Django (AUD-02). Contrato: docs/api/talleres.md.
 * Única capa que conoce los nombres de la API del taller (`snake_case`).
 */
import { z } from "zod";
import { solicitar } from "@/features/catalogo/http";
import { solicitar as solicitarComun } from "@/lib/http";
import type { PerfilTaller, TallerPropio } from "./types";

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

/** TallerPropioSerializer: perfil más el resultado de la revisión administrativa. */
const esquemaTallerPropio = z.object({
  id: z.number().int().positive(),
  nombre: z.string(),
  historia: z.string(),
  rubro: z.string(),
  direccion_completa: z.string(),
  horario: z.string(),
  telefono_publico: z.string(),
  whatsapp_publico: z.string(),
  facebook_url: z.string(),
  instagram_url: z.string(),
  sitio_web: z.string(),
  estado: z.enum(["pendiente", "aprobado", "rechazado"]),
  motivo_rechazo: z.string(),
  revisado_en: z.string().nullable(),
});

/**
 * `GET /api/v1/talleres/mi-taller/`: el taller del artesano autenticado, en cualquier
 * estado. El taller sale del token. El estado viene del servidor; la interfaz no lo
 * deduce ni lo cambia.
 */
export async function getMiTaller(signal?: AbortSignal): Promise<TallerPropio> {
  const t = await solicitarComun("/talleres/mi-taller/", {
    autenticada: true,
    signal,
    esquema: esquemaTallerPropio,
    mensajes: {
      401: "Inicia sesión con tu cuenta de artesano.",
      404: "Tu cuenta no tiene un taller registrado.",
    },
  });
  return {
    ...aPerfilTaller(t),
    estado: t.estado,
    motivoRechazo: t.motivo_rechazo,
    revisadoEn: t.revisado_en,
  };
}
