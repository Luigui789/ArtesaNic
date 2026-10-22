/**
 * Sesión simulada de la demo (`VITE_AUTH_API=mock`). No es el modelo de identidad del
 * sistema: los dos perfiles son **vistas alternativas** del prototipo y comparten
 * `DEMO_USER_ID` a propósito, para demostrar ambas navegaciones con un solo dataset.
 * `features/auth/api.ts` solo lo elige con la sesión simulada; nunca en modo real.
 *
 * `id` identifica a la persona; `artesanoId`, al taller. No son el mismo dato.
 */
import { z } from "zod";
import type { AdaptadorSesion } from "@/features/auth/sesion";
import type { SesionUsuario } from "@/features/auth/types";
import { DEMO_ARTISAN_ID, DEMO_ARTISAN_RESPONSABLE, DEMO_USER_ID } from "./core";

const COMPRADOR: SesionUsuario = {
  id: DEMO_USER_ID,
  nombre: "Ana Lucía Delgado",
  telefono: "8555 1234",
  rol: "comprador",
};

const ARTESANO: SesionUsuario = {
  id: DEMO_USER_ID,
  nombre: DEMO_ARTISAN_RESPONSABLE,
  telefono: "8777 9090",
  rol: "artesano",
  artesanoId: DEMO_ARTISAN_ID,
};

/**
 * Clave versionada. La v1 guardaba identificadores de texto ("art-1"). La lectura se
 * valida: un objeto con otra forma se descarta en lugar de convertirse en sesión.
 */
const KEY = "masaya-artisan-connect.session.v2";

const esquemaSesionDemo = z.object({
  id: z.number().int(),
  nombre: z.string(),
  telefono: z.string(),
  rol: z.enum(["comprador", "artesano"]),
  artesanoId: z.number().int().optional(),
});

const soloDigitos = (telefono: string) => telefono.replace(/\D/g, "").slice(-8);

function guardar(usuario: SesionUsuario | null): SesionUsuario | null {
  try {
    if (usuario) localStorage.setItem(KEY, JSON.stringify(usuario));
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible */
  }
  return usuario;
}

function leer(): SesionUsuario {
  try {
    const raw = localStorage.getItem(KEY);
    const r = raw ? esquemaSesionDemo.safeParse(JSON.parse(raw)) : null;
    if (!r?.success) return COMPRADOR;
    const { artesanoId, ...resto } = r.data;
    return artesanoId === undefined ? resto : { ...resto, artesanoId };
  } catch {
    return COMPRADOR;
  }
}

/**
 * La demo empieza en la vista de comprador, como antes. El login elige la vista por el
 * teléfono de la persona de demostración; el registro, por la intención elegida.
 */
export const adaptadorDemo: AdaptadorSesion = {
  restaurar: async () => leer(),
  iniciarSesion: async ({ telefono }) =>
    guardar(soloDigitos(telefono) === soloDigitos(ARTESANO.telefono) ? ARTESANO : COMPRADOR)!,
  registrarComprador: async ({ nombre }) => guardar({ ...COMPRADOR, nombre })!,
  registrarArtesano: async ({ nombre }) => guardar({ ...ARTESANO, nombre })!,
  cerrarSesion: async () => {
    guardar(null);
  },
  alExpirar: () => () => undefined,
  cambiarVista: (rol) => guardar(rol === "artesano" ? ARTESANO : COMPRADOR)!,
};
