/**
 * Errores del cliente HTTP común (AUD-18). Forma de los errores del contrato:
 * docs/api/autenticacion.md §1. No contiene mensajes de un dominio concreto: cada
 * dominio pasa los suyos por código de estado.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Errores por campo de un `400`, con los nombres de campo de la API. */
    readonly campos: Record<string, string[]> = {},
    /** `codigo` legible por máquina de un `409` (contrato §1.9). */
    readonly codigo?: string,
    /** Segundos de `Retry-After` de un `429`, si la cabecera es legible. */
    readonly reintentarEn?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * La respuesta llegó, pero no tiene la forma del contrato. Se rechaza en lugar de
 * convertirla con una aserción de tipos: un DTO incompatible nunca se vuelve sesión.
 */
export class RespuestaInvalidaError extends Error {
  constructor(readonly ruta: string) {
    super("El servidor respondió con datos inesperados. Intenta de nuevo más tarde.");
    this.name = "RespuestaInvalidaError";
  }
}

export const MENSAJE_SIN_CONEXION = "No pudimos conectar con el servidor. Revisa tu conexión.";
const MENSAJE_SERVIDOR = "El servidor no pudo completar la operación.";

/**
 * Inicio del mensaje del 403 de CSRF del backend (`apps/accounts/api/csrf.py`). DRF no
 * envía el código del error, así que el texto documentado es lo único que lo distingue
 * del 403 de una cuenta de administración.
 */
export const PREFIJO_MENSAJE_CSRF = "Falta el token CSRF";

/**
 * Criterio de reintento para TanStack Query: un 4xx (sesión, permiso, inexistente o
 * validación) no cambia al repetir la petición; los fallos de red o del servidor sí.
 */
export function reintentarSalvoErrorDelCliente(intentos: number, error: Error): boolean {
  const delCliente = error instanceof ApiError && error.status >= 400 && error.status < 500;
  return !delCliente && intentos < 3;
}

/** DRF también devuelve errores anidados (renglones, `taller`); conserva campo y posición. */
export function camposDeError(cuerpo: unknown, prefijo = ""): Record<string, string[]> {
  if (Array.isArray(cuerpo) && cuerpo.every((v) => typeof v === "string"))
    return { [prefijo]: cuerpo };
  if (cuerpo && typeof cuerpo === "object")
    return Object.assign(
      {},
      ...Object.entries(cuerpo).map(([campo, valor]) =>
        camposDeError(valor, prefijo ? `${prefijo}.${campo}` : campo),
      ),
    );
  return cuerpo == null ? {} : { [prefijo]: [String(cuerpo)] };
}

/** `Retry-After` en segundos. La forma de fecha HTTP no la usa DRF; se ignora. */
function segundosDeEspera(respuesta: Response): number | undefined {
  const valor = Number(respuesta.headers.get("Retry-After"));
  return Number.isFinite(valor) && valor > 0 ? Math.ceil(valor) : undefined;
}

export function mensajeDeEspera(segundos: number | undefined): string {
  if (segundos === undefined)
    return "Hiciste demasiados intentos. Espera un momento antes de volver a intentarlo.";
  const minutos = Math.ceil(segundos / 60);
  const espera =
    segundos < 60
      ? `${segundos} ${segundos === 1 ? "segundo" : "segundos"}`
      : `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  return `Hiciste demasiados intentos. Vuelve a intentarlo en ${espera}.`;
}

export async function leerDetalle(respuesta: Response): Promise<string | undefined> {
  try {
    const cuerpo: unknown = await respuesta.json();
    return cuerpo && typeof cuerpo === "object" && "detail" in cuerpo
      ? String((cuerpo as { detail: unknown }).detail)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function aError(
  respuesta: Response,
  mensajes: Partial<Record<number, string>> = {},
): Promise<ApiError> {
  let cuerpo: unknown;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = undefined;
  }
  const detalle =
    cuerpo && typeof cuerpo === "object" && "detail" in cuerpo
      ? String((cuerpo as { detail: unknown }).detail)
      : undefined;
  if (respuesta.status === 400 && cuerpo && typeof cuerpo === "object" && !detalle) {
    const campos = camposDeError(cuerpo);
    const primero = Object.values(campos)[0]?.[0];
    return new ApiError(400, primero ?? "Revisa los datos enviados.", campos);
  }
  if (respuesta.status === 429) {
    const segundos = segundosDeEspera(respuesta);
    return new ApiError(429, mensajeDeEspera(segundos), {}, undefined, segundos);
  }
  const codigo =
    respuesta.status === 409 && cuerpo && typeof cuerpo === "object" && "codigo" in cuerpo
      ? String((cuerpo as { codigo: unknown }).codigo)
      : undefined;
  // 403 trae el motivo del servidor (taller no aprobado, CSRF, cuenta de administración).
  const mensaje =
    respuesta.status === 403 && detalle
      ? detalle
      : (mensajes[respuesta.status] ?? detalle ?? MENSAJE_SERVIDOR);
  return new ApiError(respuesta.status, mensaje, {}, codigo);
}
