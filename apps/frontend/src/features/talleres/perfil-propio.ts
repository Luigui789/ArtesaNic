/**
 * Edición del perfil propio del taller (RF-008) con la API real. Sin reglas nuevas:
 * el servidor valida y decide; editar no cambia la aprobación (docs/api/talleres.md §2).
 */
import type { QueryClient } from "@tanstack/react-query";
import { CAMPOS_PERFIL_API } from "./http";
import type { PerfilTallerEntrada, TallerPropio } from "./types";

/** Clave de la consulta del taller propio; incluye la cuenta para no compartir caché. */
export const claveMiTaller = (usuarioId: number | undefined) => ["mi-taller", usuarioId] as const;

export function perfilEditableDe(t: TallerPropio): PerfilTallerEntrada {
  return {
    nombre: t.nombre,
    rubro: t.rubro,
    direccionCompleta: t.direccion,
    historia: t.historia,
    horario: t.horario,
    telefonoPublico: t.telefono,
    whatsappPublico: t.whatsapp,
    facebookUrl: t.facebook,
    instagramUrl: t.instagram,
    sitioWeb: t.sitioWeb,
  };
}

/**
 * Solo los campos que cambiaron, recortados. Vaciar un opcional envía `""`, que el
 * contrato interpreta como retirarlo. Sin cambios no hay petición.
 */
export function cambiosDelPerfil(
  original: PerfilTallerEntrada,
  editado: PerfilTallerEntrada,
): Partial<PerfilTallerEntrada> {
  const cambios: Partial<PerfilTallerEntrada> = {};
  for (const campo of Object.keys(CAMPOS_PERFIL_API) as (keyof PerfilTallerEntrada)[]) {
    const valor = editado[campo].trim();
    if (valor !== original[campo].trim()) cambios[campo] = valor;
  }
  return cambios;
}

const CAMPO_DE_API: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CAMPOS_PERFIL_API).map(([campo, api]) => [api, campo])),
  imagen_perfil: "imagenPerfil",
  imagen_portada: "imagenPortada",
};

/** Errores `400` del `PATCH` (`{"direccion_completa": [...]}`) por campo del formulario. */
export function erroresDelPerfil(campos: Record<string, string[]>): {
  campos: Record<string, string>;
  general: string | null;
} {
  const porCampo: Record<string, string> = {};
  let general: string | null = null;
  for (const [api, mensajes] of Object.entries(campos)) {
    const mensaje = mensajes[0];
    if (!mensaje) continue;
    const campo = CAMPO_DE_API[api];
    if (campo) porCampo[campo] = mensaje;
    else general ??= mensaje;
  }
  return { campos: porCampo, general: general ?? "Revisa los datos marcados." };
}

/**
 * Tras un `PATCH` exitoso: la respuesta del servidor reemplaza al taller propio en caché
 * y se invalidan las lecturas públicas que muestran sus datos. La sesión no se toca.
 */
export function aplicarTallerActualizado(
  queryClient: QueryClient,
  usuarioId: number | undefined,
  taller: TallerPropio,
): void {
  queryClient.setQueryData(claveMiTaller(usuarioId), taller);
  void queryClient.invalidateQueries({ queryKey: ["perfil-taller", taller.id] });
  void queryClient.invalidateQueries({ queryKey: ["talleres-catalogo"] });
  void queryClient.invalidateQueries({ queryKey: ["catalogo"] });
  void queryClient.invalidateQueries({ queryKey: ["productos-artesano", taller.id] });
}
