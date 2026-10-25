import type { Role } from "@/types";

/** Pantalla inicial de cada rol tras iniciar sesión o registrarse. */
export const INICIO_POR_ROL: Record<Role, string> = { comprador: "/catalogo", artesano: "/panel" };

/** Rutas privadas de cada rol: un destino previo solo se respeta si es del rol. */
const PRIVADAS: Record<Role, readonly string[]> = {
  comprador: ["/solicitudes", "/solicitar", "/pedidos"],
  artesano: ["/panel"],
};

const empiezaPor = (ruta: string, prefijo: string) =>
  ruta === prefijo || ruta.startsWith(`${prefijo}/`) || ruta.startsWith(`${prefijo}?`);

/**
 * Destino después del acceso. El rol es el de la respuesta del servidor, nunca el que
 * se eligió en la interfaz. `siguiente` (ruta que pidió la persona antes de iniciar
 * sesión) se acepta solo si es interna y no pertenece al otro rol.
 */
export function destinoTrasAcceso(rol: Role, siguiente?: string | null): string {
  // `//host` y `/\host` saldrían del sitio: solo rutas internas.
  if (!siguiente || !siguiente.startsWith("/") || /^\/[/\\]/.test(siguiente))
    return INICIO_POR_ROL[rol];
  if (empiezaPor(siguiente, "/auth")) return INICIO_POR_ROL[rol];
  const otro: Role = rol === "artesano" ? "comprador" : "artesano";
  if (PRIVADAS[otro].some((p) => empiezaPor(siguiente, p))) return INICIO_POR_ROL[rol];
  return siguiente;
}
