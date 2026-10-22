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

/** Campos de `CAMPOS_PERFIL` del backend (PerfilTallerEntradaSerializer). */
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
}

export interface RegistroArtesanoEntrada extends RegistroCompradorEntrada {
  taller: TallerEntrada;
}
