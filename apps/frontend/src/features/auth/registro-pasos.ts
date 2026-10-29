/**
 * Pasos del registro público, sin React. Dividen la presentación, no el contrato: el
 * formulario es uno solo y la cuenta se crea con un único `POST` al final. Cada paso se
 * valida con los mismos esquemas de `solicitudDeRegistro`, filtrando sus campos.
 */
import type { EstadoUbicacion } from "@/features/talleres/ubicacion";
import type { Role } from "@/types";
import { solicitudDeRegistro, type CuentaFormulario } from "./registro";
import { CAMPO_UBICACION_TALLER, type TallerFormulario } from "./validacion";

export type PasoRegistro = "tipo" | "datos" | "taller" | "ubicacion" | "revision";

/** El comprador no tiene pasos de taller; la ubicación sigue siendo opcional. */
export const PASOS_POR_ROL: Record<Role, PasoRegistro[]> = {
  comprador: ["tipo", "datos", "revision"],
  artesano: ["tipo", "datos", "taller", "ubicacion", "revision"],
};

export const TITULOS_PASO: Record<PasoRegistro, string> = {
  tipo: "Tipo de cuenta",
  datos: "Tus datos de acceso",
  taller: "Datos de tu taller",
  ubicacion: "Ubicación del taller",
  revision: "Revisar y crear la cuenta",
};

/**
 * Aceptación de términos y privacidad. Solo existe en la interfaz: el contrato de
 * registro no la admite (rechaza campos desconocidos), así que nunca se envía.
 */
export const CAMPO_ACEPTACION = "aceptacion";
export const MENSAJE_ACEPTACION =
  "Debes aceptar los términos y la política de privacidad para crear tu cuenta.";

/**
 * Destinos de «Términos y condiciones» y «Política de privacidad». Todavía no existen
 * documentos legales propios: se enlazan las normas y la sección de privacidad de la
 * ayuda. El texto legal definitivo queda pendiente (docs/auditorias/frontend-ux-cuenta-registro.md).
 */
export const ENLACES_LEGALES = {
  terminos: "/ayuda",
  privacidad: "/ayuda#privacidad",
} as const;

const CAMPOS_DATOS = new Set(["nombre", "telefono", "password", "confirmacion"]);

/** Paso donde se corrige un campo; lo desconocido se muestra en la revisión. */
export function pasoDeCampo(campo: string): PasoRegistro {
  if (campo === CAMPO_UBICACION_TALLER) return "ubicacion";
  if (campo.startsWith("taller.")) return "taller";
  if (CAMPOS_DATOS.has(campo)) return "datos";
  return "revision";
}

/** Primer paso, en el orden del rol, que tiene algún error. */
export function primerPasoConError(
  pasos: PasoRegistro[],
  errores: Record<string, string>,
): PasoRegistro | null {
  const conError = new Set(Object.keys(errores).map(pasoDeCampo));
  return pasos.find((p) => conError.has(p)) ?? null;
}

export interface DatosRegistro {
  intencion: Role;
  cuenta: CuentaFormulario;
  taller: TallerFormulario;
  ubicacion: EstadoUbicacion;
  aceptacion: boolean;
}

/** Todos los errores de cliente del registro, incluida la aceptación. */
export function erroresDelRegistro(datos: DatosRegistro): Record<string, string> {
  const solicitud = solicitudDeRegistro(
    datos.intencion,
    datos.cuenta,
    datos.taller,
    datos.ubicacion,
  );
  const errores = solicitud.valida ? {} : { ...solicitud.errores };
  if (!datos.aceptacion) errores[CAMPO_ACEPTACION] = MENSAJE_ACEPTACION;
  return errores;
}

/** Errores que impiden salir de `paso`: solo los de sus propios campos. */
export function erroresDelPaso(paso: PasoRegistro, datos: DatosRegistro): Record<string, string> {
  return Object.fromEntries(
    Object.entries(erroresDelRegistro(datos)).filter(([campo]) => pasoDeCampo(campo) === paso),
  );
}
