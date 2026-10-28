/**
 * Decisión del registro público, sin React: valida la cuenta (y el taller si la
 * intención es vender) y arma la entrada del endpoint que corresponde. La ubicación
 * del taller (FEAT-GEO-03) vive fuera del formulario de texto y se combina con los
 * datos ya validados; el comprador nunca recibe taller ni geodatos.
 */
import type { EstadoUbicacion } from "@/features/talleres/ubicacion";
import type { Role } from "@/types";
import type { RegistroArtesanoEntrada, RegistroCompradorEntrada, TallerEntrada } from "./types";
import {
  erroresDeValidacion,
  esquemaRegistroArtesano,
  esquemaRegistroComprador,
  type TallerFormulario,
} from "./validacion";

/** «Ubicación del taller» al abrir el registro: sin posición y sin publicar. */
export const UBICACION_REGISTRO_INICIAL: EstadoUbicacion = { ubicacion: null, publica: false };

/** Taller validado + ubicación: sin posición, solo los datos de texto. */
export function tallerDeRegistro(taller: TallerEntrada, estado: EstadoUbicacion): TallerEntrada {
  if (estado.ubicacion === null) return taller;
  return { ...taller, ubicacion: estado.ubicacion, ubicacionPublica: estado.publica === true };
}

export interface CuentaFormulario {
  nombre: string;
  telefono: string;
  password: string;
  confirmacion: string;
}

export type SolicitudRegistro =
  | { valida: false; errores: Record<string, string> }
  | { valida: true; rol: "comprador"; entrada: RegistroCompradorEntrada }
  | { valida: true; rol: "artesano"; entrada: RegistroArtesanoEntrada };

/**
 * La intención decide el endpoint; el cuerpo nunca lleva `rol` ni la confirmación.
 * La ubicación se agrega después de validar el texto del taller y solo al artesano.
 */
export function solicitudDeRegistro(
  intencion: Role,
  cuenta: CuentaFormulario,
  taller: TallerFormulario,
  ubicacion: EstadoUbicacion,
): SolicitudRegistro {
  if (intencion === "artesano") {
    const r = esquemaRegistroArtesano.safeParse({ ...cuenta, taller });
    if (!r.success) return { valida: false, errores: erroresDeValidacion(r.error) };
    const { nombre, telefono, password } = r.data;
    return {
      valida: true,
      rol: "artesano",
      entrada: { nombre, telefono, password, taller: tallerDeRegistro(r.data.taller, ubicacion) },
    };
  }
  const r = esquemaRegistroComprador.safeParse(cuenta);
  if (!r.success) return { valida: false, errores: erroresDeValidacion(r.error) };
  const { nombre, telefono, password } = r.data;
  return { valida: true, rol: "comprador", entrada: { nombre, telefono, password } };
}
