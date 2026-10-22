/**
 * Perfil público del taller contra Django (AUD-02). Contrato: docs/api/talleres.md.
 * Única capa que conoce los nombres de la API del taller (`snake_case`).
 */
import { z } from "zod";
import { solicitar } from "@/features/catalogo/http";
import { solicitar as solicitarComun } from "@/lib/http";
import type { PerfilTaller, PerfilTallerEntrada, TallerPropio } from "./types";

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

const MENSAJES_TALLER_PROPIO = {
  401: "Inicia sesión con tu cuenta de artesano.",
  403: "Solo una cuenta de artesano puede gestionar un taller.",
  404: "Tu cuenta no tiene un taller registrado.",
};

function aTallerPropio(t: z.infer<typeof esquemaTallerPropio>): TallerPropio {
  return {
    ...aPerfilTaller(t),
    estado: t.estado,
    motivoRechazo: t.motivo_rechazo,
    revisadoEn: t.revisado_en,
  };
}

/**
 * `GET /api/v1/talleres/mi-taller/`: el taller del artesano autenticado, en cualquier
 * estado. El taller sale del token. El estado viene del servidor; la interfaz no lo
 * deduce ni lo cambia.
 */
export async function getMiTaller(signal?: AbortSignal): Promise<TallerPropio> {
  return aTallerPropio(
    await solicitarComun("/talleres/mi-taller/", {
      autenticada: true,
      signal,
      esquema: esquemaTallerPropio,
      mensajes: MENSAJES_TALLER_PROPIO,
    }),
  );
}

/** Campos de `CAMPOS_PERFIL` (PerfilTallerEntradaSerializer): interfaz → API. */
export const CAMPOS_PERFIL_API = {
  nombre: "nombre",
  rubro: "rubro",
  direccionCompleta: "direccion_completa",
  historia: "historia",
  horario: "horario",
  telefonoPublico: "telefono_publico",
  whatsappPublico: "whatsapp_publico",
  facebookUrl: "facebook_url",
  instagramUrl: "instagram_url",
  sitioWeb: "sitio_web",
} as const satisfies Record<keyof PerfilTallerEntrada, string>;

/**
 * Cuerpo del `PATCH` con lista cerrada: solo campos del perfil. Estado, propietario,
 * revisión e `id` no existen aquí, así que no pueden viajar. `""` retira un opcional.
 */
export function cuerpoPerfilTaller(cambios: Partial<PerfilTallerEntrada>) {
  const cuerpo: Record<string, string> = {};
  for (const [campo, api] of Object.entries(CAMPOS_PERFIL_API)) {
    const valor = cambios[campo as keyof PerfilTallerEntrada];
    if (typeof valor === "string") cuerpo[api] = valor;
  }
  return cuerpo;
}

/**
 * `PATCH /api/v1/talleres/mi-taller/`: actualización parcial del perfil propio en
 * cualquier estado. Editar no cambia la aprobación: la respuesta trae el estado del
 * servidor, que la interfaz muestra tal cual.
 */
export async function actualizarMiTaller(
  cambios: Partial<PerfilTallerEntrada>,
): Promise<TallerPropio> {
  return aTallerPropio(
    await solicitarComun("/talleres/mi-taller/", {
      metodo: "PATCH",
      cuerpo: cuerpoPerfilTaller(cambios),
      autenticada: true,
      esquema: esquemaTallerPropio,
      mensajes: MENSAJES_TALLER_PROPIO,
    }),
  );
}
