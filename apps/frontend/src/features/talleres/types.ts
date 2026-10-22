/**
 * Perfil público del taller (RF-008), con la forma de `GET /api/v1/talleres/{id}/`
 * (docs/api/talleres.md). Los contactos vacíos significan que el artesano no los publica.
 */
export interface PerfilTaller {
  id: number;
  nombre: string;
  historia: string;
  /** Texto propio del taller; no es una categoría de producto (D-AUD02-03). */
  rubro: string;
  direccion: string;
  horario: string;
  telefono: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  sitioWeb: string;
  /**
   * Datos que solo tiene el servidor simulado. La API pública no publica al
   * responsable ni ofrece fotografías del taller.
   */
  demo?: {
    responsable: string;
    descripcion: string;
    fotoUrl: string;
    portadaUrl: string;
  };
}

/** Estados de aprobación del taller (D-AUD02-01). Los decide la administración. */
export type EstadoTaller = "pendiente" | "aprobado" | "rechazado";

/** Taller del artesano autenticado (`GET /api/v1/talleres/mi-taller/`). */
export interface TallerPropio extends PerfilTaller {
  estado: EstadoTaller;
  motivoRechazo: string;
  revisadoEn: string | null;
}

/** Perfil editable por el artesano: exactamente `CAMPOS_PERFIL` del backend. */
export interface PerfilTallerEntrada {
  nombre: string;
  rubro: string;
  direccionCompleta: string;
  historia: string;
  horario: string;
  telefonoPublico: string;
  whatsappPublico: string;
  facebookUrl: string;
  instagramUrl: string;
  sitioWeb: string;
}
