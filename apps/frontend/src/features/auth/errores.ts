import { ApiError, MENSAJE_SIN_CONEXION, RespuestaInvalidaError } from "@/lib/http";
import { erroresDelServidor } from "./validacion";

export interface FalloFormulario {
  /** Mensaje por campo del formulario (`telefono`, `taller.rubro`, …). */
  campos: Record<string, string>;
  /** Mensaje general, o `null` si todos los errores tienen campo. */
  general: string | null;
}

const MENSAJE_SERVICIO =
  "El servicio no está disponible en este momento. Intenta de nuevo más tarde.";

/**
 * Traduce un fallo de login o registro a la interfaz sin mezclar causas: `400` por
 * campo, `401` credenciales o sesión, `403` CSRF o cuenta sin acceso, `429` espera y
 * red o `5xx` servicio. Los textos `401`/`403` son los del servidor, que no revelan si
 * un teléfono está registrado.
 */
export function interpretarFallo(error: unknown, camposDelFormulario: string[]): FalloFormulario {
  if (error instanceof RespuestaInvalidaError) return { campos: {}, general: error.message };
  if (!(error instanceof ApiError)) return { campos: {}, general: MENSAJE_SERVICIO };
  if (error.status === 400) {
    const todos = erroresDelServidor(error.campos);
    const campos = Object.fromEntries(
      Object.entries(todos).filter(([c]) => camposDelFormulario.includes(c)),
    );
    const sinCampo = Object.entries(todos).find(([c]) => !camposDelFormulario.includes(c));
    return {
      campos,
      general: sinCampo
        ? sinCampo[1]
        : Object.keys(campos).length
          ? "Revisa los datos marcados."
          : error.message,
    };
  }
  if (error.status === 0) return { campos: {}, general: MENSAJE_SIN_CONEXION };
  if (error.status >= 500) return { campos: {}, general: MENSAJE_SERVICIO };
  return { campos: {}, general: error.message };
}
