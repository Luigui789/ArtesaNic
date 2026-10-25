/**
 * Estado de transporte de la sesión real (AUD-18, ADR-007): el token de acceso vive
 * solo en esta variable del módulo. Nunca se escribe en localStorage, sessionStorage
 * ni IndexedDB; una recarga lo pierde y la sesión se recupera con la cookie HttpOnly
 * de renovación, que JavaScript no puede leer.
 */
import { z } from "zod";

/** `POST /auth/refrescar/` → `{"access": "…"}` (TokenAccesoSerializer). */
export const esquemaTokenAcceso = z.object({ access: z.string().min(1) });

let acceso: string | null = null;
/**
 * Cambia en cada inicio o cierre de sesión. Una renovación que empezó en otra época
 * no puede instalar su token: pertenecería a la identidad anterior.
 */
let epoca = 0;
const oyentesDeExpiracion = new Set<() => void>();

export function tokenDeAcceso(): string | null {
  return acceso;
}

export function establecerTokenDeAcceso(token: string | null): void {
  acceso = token;
}

export function epocaActual(): number {
  return epoca;
}

/** Descarta el token y empieza una época nueva (login, registro o logout). */
export function nuevaEpoca(): number {
  acceso = null;
  epoca += 1;
  return epoca;
}

/** La renovación respondió 401: la sesión terminó y no se vuelve a intentar. */
export function alExpirarSesion(oyente: () => void): () => void {
  oyentesDeExpiracion.add(oyente);
  return () => {
    oyentesDeExpiracion.delete(oyente);
  };
}

export function notificarExpiracion(): void {
  for (const oyente of [...oyentesDeExpiracion]) oyente();
}
