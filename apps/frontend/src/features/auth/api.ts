/**
 * Sesión que consume la interfaz (AUD-18).
 *
 * `VITE_AUTH_API=real` usa exclusivamente `http.ts` (Django); `mock` usa la sesión
 * simulada de `src/mocks/sesion.ts`. La elección es explícita (`modo.ts`): el modo real
 * nunca vuelve a la demo, ni siquiera si el servidor falla.
 */
import { adaptadorDemo } from "@/mocks/sesion";
import { alExpirarSesion } from "@/lib/http";
import * as http from "./http";
import { authReal } from "./modo";
import type { AdaptadorSesion } from "./sesion";

const adaptadorReal: AdaptadorSesion = {
  restaurar: http.restaurarSesion,
  iniciarSesion: http.iniciarSesion,
  registrarComprador: http.registrarComprador,
  registrarArtesano: http.registrarArtesano,
  cerrarSesion: http.cerrarSesion,
  alExpirar: alExpirarSesion,
};

export const adaptadorSesion: AdaptadorSesion = authReal ? adaptadorReal : adaptadorDemo;

/**
 * Identidades codificadas de la demo. Solo las usan las pantallas que siguen simuladas
 * (pedidos, mensajes, pagos, panel de la demo), que en modo real no se muestran.
 */
export { DEMO_ARTISAN_ID, DEMO_ARTISAN_RESPONSABLE, DEMO_USER_ID } from "@/mocks/core";
export { authReal, modoAuth, type ModoAuth } from "./modo";
