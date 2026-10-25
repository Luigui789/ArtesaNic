/**
 * Envío de bajo nivel compartido por el cliente y el token CSRF. Toda petición a la
 * API sale con `credentials: "include"`, para que el navegador guarde y envíe las
 * cookies `csrftoken` y `refresh` aunque frontend y API usen orígenes distintos.
 */
import type { ZodType, ZodTypeDef } from "zod";
import { ApiError, MENSAJE_SIN_CONEXION, RespuestaInvalidaError } from "./errores";

export const BASE_API = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api/v1";

export type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Envio {
  metodo: Metodo;
  cuerpo?: unknown;
  cabeceras: Record<string, string>;
  signal?: AbortSignal | undefined;
}

function esCancelacion(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function enviar(ruta: string, { metodo, cuerpo, cabeceras, signal }: Envio) {
  const headers: Record<string, string> = { ...cabeceras, Accept: "application/json" };
  const multipart = cuerpo instanceof FormData;
  if (multipart) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-type") delete headers[key];
    }
  } else if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${BASE_API}${ruta}`, {
      method: metodo,
      headers,
      body: multipart ? cuerpo : cuerpo === undefined ? null : JSON.stringify(cuerpo),
      credentials: "include",
      signal: signal ?? null,
    });
  } catch (error) {
    // La cancelación (TanStack Query, desmontaje) no es un fallo de red.
    if (esCancelacion(error)) throw error;
    throw new ApiError(0, MENSAJE_SIN_CONEXION);
  }
}

/** Lee el cuerpo JSON y, si hay esquema, lo valida en tiempo de ejecución. */
export async function leerJson<T>(
  respuesta: Response,
  ruta: string,
  esquema?: ZodType<T, ZodTypeDef, unknown>,
): Promise<T> {
  let cuerpo: unknown;
  try {
    cuerpo = await respuesta.json();
  } catch {
    throw new RespuestaInvalidaError(ruta);
  }
  if (!esquema) return cuerpo as T;
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) throw new RespuestaInvalidaError(ruta);
  return resultado.data;
}
