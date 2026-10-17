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
