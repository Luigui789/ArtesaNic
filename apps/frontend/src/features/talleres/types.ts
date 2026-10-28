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
  /** URL persistida de la imagen de perfil/logo del taller (cuando existe). */
  imagenPerfil?: string | undefined;
  /** URL persistida de la imagen horizontal de portada del taller (cuando existe). */
  imagenPortada?: string | undefined;
  /**
   * Posición pública del taller (`ubicacion_mapa`, FEAT-GEO-04): solo existe si el taller
   * está aprobado y el artesano autorizó publicarla. null: sin mapa ni «Cómo llegar».
   */
  ubicacionMapa: UbicacionTaller | null;
  /**
   * Datos que solo tiene el servidor simulado. La API pública no publica al
   * responsable.
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

/**
 * Posición del taller en el mapa del panel, en grados decimales (WGS 84). Es el estado
 * de la interfaz: la API la entrega como texto decimal (`TallerPropio.latitud`) y la
 * conversión ocurre solo en `ubicacionDeTaller` (FEAT-GEO-02).
 */
export interface UbicacionTaller {
  latitud: number;
  longitud: number;
}

/** Un marcador del mapa público: solo lo que muestra su popup y su posición. */
export interface MarcadorTaller {
  id: number;
  nombre: string;
  rubro: string;
  direccion: string;
  ubicacion: UbicacionTaller;
}

/**
 * Taller del artesano autenticado (`GET /api/v1/talleres/mi-taller/`). No trae
 * `ubicacion_mapa`: su ubicación (pública o privada) está en `latitud`/`longitud`.
 */
export interface TallerPropio extends Omit<PerfilTaller, "ubicacionMapa"> {
  estado: EstadoTaller;
  motivoRechazo: string;
  revisadoEn: string | null;
  /** Texto decimal tal como lo serializa DRF (`"11.971234"`), o null sin ubicación. */
  latitud: string | null;
  longitud: string | null;
  /** El artesano autorizó mostrar la posición en el mapa público (FEAT-GEO-01). */
  ubicacionPublica: boolean;
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

/** Cambios admitidos por `PATCH /api/v1/talleres/mi-taller/`. */
export interface ActualizarPerfilTallerInput extends Partial<PerfilTallerEntrada> {
  imagenPerfil?: File | undefined;
  imagenPortada?: File | undefined;
  /** Las coordenadas viajan juntas; `null` quita la ubicación. */
  ubicacion?: UbicacionTaller | null | undefined;
  ubicacionPublica?: boolean | undefined;
}
