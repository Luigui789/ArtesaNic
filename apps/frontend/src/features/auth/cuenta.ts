/**
 * Reglas de la página «Mi cuenta» (AUD-15), sin React para poder probarlas en Node.
 *
 * Solo `nombre` y `telefono` son editables. Un cambio efectivo del teléfono exige la
 * contraseña actual porque es el identificador de acceso; uno que normaliza al actual
 * no es un cambio. Es ayuda de UX: la autoridad es el servidor, que vuelve a decidirlo
 * sobre la cuenta bloqueada y responde `400` en `password_actual` si hace falta.
 */
import { z } from "zod";
import type { ActualizarPerfilEntrada, SesionUsuario } from "./types";
import { esquemaDatosPersonales } from "./validacion";

export interface ValoresCuenta {
  nombre: string;
  telefono: string;
  passwordActual: string;
}

export const valoresDeCuenta = (usuario: SesionUsuario): ValoresCuenta => ({
  nombre: usuario.nombre,
  telefono: usuario.telefono,
  passwordActual: "",
});

/**
 * Los 8 dígitos que guarda el backend, o `null` si el formato no es válido. Solo sirve
 * para comparar con el teléfono actual; la normalización con autoridad es la del servidor.
 */
export function telefonoCanonico(valor: string): string | null {
  const compacto = valor
    .normalize("NFKC")
    .trim()
    .replace(/[\s\-.()]/g, "");
  return /^(?:\+505|505)?(\d{8})$/.exec(compacto)?.[1] ?? null;
}

export function cambiaTelefono(usuario: SesionUsuario, escrito: string): boolean {
  const actual = telefonoCanonico(usuario.telefono) ?? usuario.telefono;
  return (telefonoCanonico(escrito) ?? escrito.trim()) !== actual;
}

/** Validación del formulario: la contraseña actual solo se pide si cambia el teléfono. */
export function esquemaCuenta(usuario: SesionUsuario) {
  return esquemaDatosPersonales.extend({ passwordActual: z.string() }).superRefine((datos, ctx) => {
    if (cambiaTelefono(usuario, datos.telefono) && !datos.passwordActual)
      ctx.addIssue({
        code: "custom",
        path: ["passwordActual"],
        message: "Confirma tu contraseña actual para cambiar el teléfono.",
      });
  });
}

/**
 * Cuerpo de `PATCH /auth/perfil/` con solo lo que cambió. La contraseña actual viaja
 * únicamente junto a un teléfono nuevo; nunca se envían rol, id ni otros datos de la sesión.
 */
export function entradaDeCambios(
  usuario: SesionUsuario,
  valores: ValoresCuenta,
): ActualizarPerfilEntrada {
  const entrada: ActualizarPerfilEntrada = {};
  const nombre = valores.nombre.trim();
  if (nombre !== usuario.nombre) entrada.nombre = nombre;
  if (cambiaTelefono(usuario, valores.telefono)) {
    entrada.telefono = valores.telefono.trim();
    entrada.passwordActual = valores.passwordActual;
  }
  return entrada;
}

/** Errores `400` del servidor → campos del formulario. */
export const CAMPOS_SERVIDOR_CUENTA: Record<string, keyof ValoresCuenta> = {
  nombre: "nombre",
  telefono: "telefono",
  password_actual: "passwordActual",
};

/**
 * Envía como mucho una petición a la vez: un segundo envío mientras la primera sigue en
 * curso devuelve `null` sin llamar al servidor (doble clic, Enter repetido).
 */
export function crearEnvioUnico<A extends unknown[], R>(enviar: (...args: A) => Promise<R>) {
  let enCurso = false;
  return async (...args: A): Promise<R | null> => {
    if (enCurso) return null;
    enCurso = true;
    try {
      return await enviar(...args);
    } finally {
      enCurso = false;
    }
  };
}
