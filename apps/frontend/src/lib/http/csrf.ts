/**
 * Token CSRF de la SPA (docs/api/autenticacion.md §2). Se obtiene de
 * `GET /auth/csrf/`, que además fija la cookie `csrftoken`, y se guarda solo en
 * memoria. Lo exigen registro, login, refrescar y logout.
 */
import { z } from "zod";
import { aError } from "./errores";
import { enviar, leerJson } from "./transporte";

const esquemaCsrf = z.object({ csrf_token: z.string().min(1) });

let token: string | null = null;
let enCurso: Promise<string> | null = null;

/** Devuelve el token en memoria o pide uno; las peticiones simultáneas comparten la misma. */
export function obtenerTokenCsrf({ forzar = false }: { forzar?: boolean } = {}): Promise<string> {
  if (forzar) token = null;
  if (token) return Promise.resolve(token);
  if (!enCurso) {
    enCurso = (async () => {
      try {
        const ruta = "/auth/csrf/";
        const respuesta = await enviar(ruta, { metodo: "GET", cabeceras: {} });
        if (!respuesta.ok) throw await aError(respuesta);
        token = (await leerJson(respuesta, ruta, esquemaCsrf)).csrf_token;
        return token;
      } finally {
        enCurso = null;
      }
    })();
  }
  return enCurso;
}
