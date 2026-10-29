/**
 * Perfil público del taller contra Django (AUD-02). Contrato: docs/api/talleres.md.
 * Única capa que conoce los nombres de la API del taller (`snake_case`).
 */
import { z } from "zod";
import { solicitar } from "@/features/catalogo/http";
import { solicitar as solicitarComun } from "@/lib/http";
import { redondearCoordenada, ubicacionDesdeDecimales } from "./ubicacion";
import type {
  ActualizarPerfilTallerInput,
  PerfilTaller,
  PerfilTallerEntrada,
  TallerPropio,
  UbicacionTaller,
} from "./types";

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
  imagen_perfil_url?: string | null | undefined;
  imagen_portada_url?: string | null | undefined;
  /** UbicacionMapaSerializer: texto decimal, o null si el taller no la publica. */
  ubicacion_mapa?: { latitud: string; longitud: string } | null | undefined;
}

function resolverImagenTaller(url: string): string {
  const base = import.meta.env["VITE_API_URL"] as string | undefined;
  if (base && /^https?:\/\//.test(base)) return new URL(url, base).href;
  return url;
}

/**
 * `ubicacion_mapa` → `ubicacionMapa`. Única autoridad de la posición pública: sin ella
 * no hay marcador. Datos inesperados (texto no numérico, una coordenada, fuera de rango
 * o con otra forma) se tratan como sin ubicación pública, igual que en el panel.
 */
export function aUbicacionMapa(dto: unknown): UbicacionTaller | null {
  if (typeof dto !== "object" || dto === null) return null;
  const { latitud, longitud } = dto as Record<string, unknown>;
  if (typeof latitud !== "string" || typeof longitud !== "string") return null;
  return ubicacionDesdeDecimales(latitud, longitud);
}

/** Campos comunes del perfil público y del taller propio. */
function camposPerfil(
  t: Omit<TallerPublicoDTO, "ubicacion_mapa">,
): Omit<PerfilTaller, "ubicacionMapa"> {
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
    ...(t.imagen_perfil_url ? { imagenPerfil: resolverImagenTaller(t.imagen_perfil_url) } : {}),
    ...(t.imagen_portada_url ? { imagenPortada: resolverImagenTaller(t.imagen_portada_url) } : {}),
  };
}

export function aPerfilTaller(t: TallerPublicoDTO): PerfilTaller {
  return { ...camposPerfil(t), ubicacionMapa: aUbicacionMapa(t.ubicacion_mapa) };
}

/** `GET /api/v1/talleres/`: talleres aprobados visibles públicamente. */
export async function listPerfilesTalleres(signal?: AbortSignal): Promise<PerfilTaller[]> {
  const lista = await solicitar<TallerPublicoDTO[]>("/talleres/", signal ? { signal } : undefined);
  return lista.map(aPerfilTaller);
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
  imagen_perfil_url: z.string().nullable().optional(),
  imagen_portada_url: z.string().nullable().optional(),
  // DRF serializa los DecimalField como texto ("11.971234"); ver `ubicacionDeTaller`.
  latitud: z.string().nullable(),
  longitud: z.string().nullable(),
  ubicacion_publica: z.boolean(),
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
    ...camposPerfil(t),
    estado: t.estado,
    motivoRechazo: t.motivo_rechazo,
    revisadoEn: t.revisado_en,
    latitud: t.latitud,
    longitud: t.longitud,
    ubicacionPublica: t.ubicacion_publica,
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

type ValorPerfil = string | number | boolean | null;

/**
 * Cuerpo del `PATCH` con lista cerrada: solo campos del perfil y la ubicación. Estado,
 * propietario, revisión e `id` no existen aquí, así que no pueden viajar. `""` retira un
 * opcional. Las coordenadas viajan juntas y redondeadas a 6 decimales; `ubicacion: null`
 * envía `latitud` y `longitud` en null.
 * Cuando se incluyen archivos reales (`imagenPerfil` o `imagenPortada`), devuelve `FormData`
 * con todos los campos en el mismo `PATCH`: ahí null viaja como `""`, que DRF convierte en
 * null para los campos que lo admiten (`Field.get_value` con formularios HTML), y los
 * booleanos como `"true"`/`"false"`.
 */
export function cuerpoPerfilTaller(
  cambios: ActualizarPerfilTallerInput,
): Record<string, ValorPerfil> | FormData {
  const cuerpo: Record<string, ValorPerfil> = {};
  for (const [campo, api] of Object.entries(CAMPOS_PERFIL_API)) {
    const valor = cambios[campo as keyof PerfilTallerEntrada];
    if (typeof valor === "string") cuerpo[api] = valor;
  }
  if (cambios.ubicacion !== undefined) {
    cuerpo["latitud"] = cambios.ubicacion ? redondearCoordenada(cambios.ubicacion.latitud) : null;
    cuerpo["longitud"] = cambios.ubicacion ? redondearCoordenada(cambios.ubicacion.longitud) : null;
  }
  if (typeof cambios.ubicacionPublica === "boolean")
    cuerpo["ubicacion_publica"] = cambios.ubicacionPublica;
  if (!cambios.imagenPerfil && !cambios.imagenPortada) return cuerpo;
  const form = new FormData();
  for (const [api, valor] of Object.entries(cuerpo))
    form.set(api, valor === null ? "" : String(valor));
  if (cambios.imagenPerfil) form.set("imagen_perfil", cambios.imagenPerfil);
  if (cambios.imagenPortada) form.set("imagen_portada", cambios.imagenPortada);
  return form;
}

/**
 * `PATCH /api/v1/talleres/mi-taller/`: actualización parcial del perfil propio en
 * cualquier estado. Editar no cambia la aprobación: la respuesta trae el estado del
 * servidor, que la interfaz muestra tal cual.
 */
export async function actualizarMiTaller(
  cambios: ActualizarPerfilTallerInput,
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
