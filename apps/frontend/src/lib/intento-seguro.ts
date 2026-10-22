import { ApiError } from "@/lib/http";
import { crearIntentoIdempotente } from "@/features/solicitudes/idempotencia";
/** Conserva clave y cuerpo de un resultado incierto. No almacena tokens ni estado de negocio. */
export function crearIntentoSeguro() {
  const intento = crearIntentoIdempotente();
  let pendiente: string | null = null;
  return {
    clave(cuerpo: unknown) {
      const serializado = JSON.stringify(cuerpo);
      if (pendiente && serializado !== pendiente)
        throw new ApiError(409, "Resultado pendiente", {}, "resultado_pendiente");
      return intento.clave(cuerpo);
    },
    fallar(error: unknown, cuerpo: unknown) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
        pendiente = JSON.stringify(cuerpo);
    },
    completar() {
      pendiente = null;
      intento.completar();
    },
    get incierto() {
      return pendiente !== null;
    },
  };
}
