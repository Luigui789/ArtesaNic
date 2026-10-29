import type { UbicacionTaller } from "@/features/talleres/types";
import type { Role } from "@/types";

/**
 * Identidad de la sesión. En modo real es exactamente `usuario` de la respuesta de
 * login/registro o `GET /auth/perfil/`. `artesanoId` solo existe en la demo: la API
 * real no lo expone y el taller propio se consulta en `GET /talleres/mi-taller/`.
 */
export interface SesionUsuario {
  id: number;
  nombre: string;
  telefono: string;
  rol: Role;
  artesanoId?: number;
}

export interface Credenciales {
  telefono: string;
  password: string;
}

export interface RegistroCompradorEntrada {
  nombre: string;
  telefono: string;
  password: string;
}

/**
 * `PATCH /auth/perfil/` (AUD-15): solo los datos personales editables. Cada campo se
 * envía únicamente si cambia; `passwordActual` solo acompaña a un teléfono nuevo.
 */
export interface ActualizarPerfilEntrada {
  nombre?: string;
  telefono?: string;
  passwordActual?: string;
}

/**
 * Campos de `CAMPOS_PERFIL` + `CAMPOS_UBICACION` del backend
 * (PerfilTallerEntradaSerializer). La ubicación es opcional (FEAT-GEO-03): sin ella
 * el cuerpo no lleva campos geográficos y el servidor aplica sus valores por defecto.
 */
export interface TallerEntrada {
  nombre: string;
  rubro: string;
  direccionCompleta: string;
  historia?: string;
  horario?: string;
  telefonoPublico?: string;
  whatsappPublico?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  sitioWeb?: string;
  ubicacion?: UbicacionTaller | null;
  /** Solo cuenta si hay `ubicacion`: sin coordenadas nunca se publica. */
  ubicacionPublica?: boolean;
}

export interface RegistroArtesanoEntrada extends RegistroCompradorEntrada {
  taller: TallerEntrada;
}
