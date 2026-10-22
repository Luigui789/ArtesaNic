/**
 * Cliente HTTP común de la API (AUD-18). Contrato de sesión: docs/api/autenticacion.md.
 *
 * Se encarga del transporte: base `/api/v1`, JSON, `credentials: "include"`, Bearer,
 * CSRF, errores y validación de respuestas. No conoce reglas de negocio: cada dominio
 * traduce su DTO y el servidor decide permisos, roles y estados.
 *
 * Renovación (§2): ante un `401` de una petición autenticada se hace **una** renovación
 * compartida por todas las peticiones que fallen a la vez, y **un** reintento. Si la
 * renovación responde `401`, la sesión terminó: se descarta el token, se avisa a la
 * sesión y no se reintenta más.
 */
import type { ZodType, ZodTypeDef } from "zod";
import { obtenerTokenCsrf } from "./csrf";
import { ApiError, PREFIJO_MENSAJE_CSRF, aError, leerDetalle } from "./errores";
import {
  epocaActual,
  establecerTokenDeAcceso,
  esquemaTokenAcceso,
  notificarExpiracion,
  tokenDeAcceso,
} from "./sesion";
import { enviar, leerJson, type Metodo } from "./transporte";

export interface Opciones<T = unknown> {
  metodo?: Metodo;
  cuerpo?: unknown;
  /** Envía `Authorization: Bearer <access>` y renueva una vez ante un `401`. */
  autenticada?: boolean;
  /** Envía `X-CSRFToken`: endpoints que emiten, leen o borran la cookie de renovación. */
  csrf?: boolean;
  /** Mensajes propios del recurso por código de estado (por ejemplo, el 404 de un taller). */
  mensajes?: Partial<Record<number, string>>;
  /** Cabeceras propias de la operación, como `Idempotency-Key` (AUD-08). */
  cabeceras?: Record<string, string>;
  signal?: AbortSignal | undefined;
  /** Esquema de la respuesta: una forma distinta del contrato se rechaza. */
  esquema?: ZodType<T, ZodTypeDef, unknown>;
}

let renovacionEnCurso: Promise<string | null> | null = null;

async function esErrorCsrf(respuesta: Response): Promise<boolean> {
  if (respuesta.status !== 403) return false;
  return (await leerDetalle(respuesta.clone()))?.startsWith(PREFIJO_MENSAJE_CSRF) ?? false;
}

/**
 * `POST /auth/refrescar/` con la cookie HttpOnly. Devuelve el token nuevo, o `null`
 * si el servidor da la sesión por terminada (`401`). Los fallos de red o del servidor
 * se propagan: no significan que la sesión haya terminado.
 */
export function renovarAcceso(): Promise<string | null> {
  if (renovacionEnCurso) return renovacionEnCurso;
  const epoca = epocaActual();
  const renovacion = (async () => {
    try {
      const { access } = await solicitar("/auth/refrescar/", {
        metodo: "POST",
        csrf: true,
        esquema: esquemaTokenAcceso,
      });
      // Un login o logout posterior manda: este token sería de la identidad anterior.
      if (epoca !== epocaActual()) return tokenDeAcceso();
      establecerTokenDeAcceso(access);
      return access;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      if (epoca === epocaActual()) {
        establecerTokenDeAcceso(null);
        notificarExpiracion();
      }
      return null;
    }
  })();
  renovacionEnCurso = renovacion;
  void renovacion.then(
    () => (renovacionEnCurso = null),
    () => (renovacionEnCurso = null),
  );
  return renovacion;
}

/** Espera la renovación en curso, si la hay (por ejemplo, la del arranque). */
export async function esperarRenovacion(): Promise<void> {
  await renovacionEnCurso?.catch(() => null);
}

export async function solicitar<T>(ruta: string, opciones: Opciones<T> = {}): Promise<T> {
  const { metodo = "GET", cuerpo, autenticada, csrf, mensajes, signal, esquema } = opciones;
  // Sin token todavía, una petición autenticada espera la recuperación de la sesión.
  if (autenticada && !tokenDeAcceso()) await esperarRenovacion();

  let token = autenticada ? tokenDeAcceso() : null;
  let tokenCsrf = csrf ? await obtenerTokenCsrf() : null;
  const intentar = () => {
    const cabeceras: Record<string, string> = { ...opciones.cabeceras };
    if (token) cabeceras["Authorization"] = `Bearer ${token}`;
    if (tokenCsrf) cabeceras["X-CSRFToken"] = tokenCsrf;
    return enviar(ruta, { metodo, cuerpo, cabeceras, signal });
  };

  let respuesta = await intentar();

  // La cookie csrftoken pudo cambiar o caducar: un token nuevo y un único reintento.
  if (csrf && (await esErrorCsrf(respuesta))) {
    tokenCsrf = await obtenerTokenCsrf({ forzar: true });
    respuesta = await intentar();
  }

  // Solo se renueva si se envió un token: sin sesión, un 401 es la respuesta correcta.
  if (autenticada && token && respuesta.status === 401) {
    const actual = tokenDeAcceso();
    const nuevo = actual && actual !== token ? actual : await renovarAcceso();
    if (nuevo) {
      token = nuevo;
      respuesta = await intentar();
    }
  }

  if (!respuesta.ok) throw await aError(respuesta, mensajes);
  if (respuesta.status === 204) return undefined as T;
  return leerJson(respuesta, ruta, esquema);
}
