/**
 * Validación de los formularios de acceso. Es ayuda de UX alineada con el backend
 * (docs/api/autenticacion.md §4-5, docs/api/talleres.md §2); la autoridad final es el
 * servidor, cuyos mensajes `400` se muestran por campo. No replica los validadores de
 * contraseña de Django (contraseña común o parecida al nombre).
 */
import { z } from "zod";

/** Mismos formatos que normaliza el backend: 8 dígitos con o sin separadores y +505. */
export function esTelefonoNicaragua(valor: string): boolean {
  const compacto = valor.trim().replace(/[\s\-.()]/g, "");
  return /^(\+?505)?\d{8}$/.test(compacto);
}

const telefono = z
  .string()
  .trim()
  .min(1, "Escribe tu teléfono.")
  .refine(esTelefonoNicaragua, "Ingresa un teléfono de Nicaragua de 8 dígitos.");

const nombre = z
  .string()
  .trim()
  .min(1, "Escribe tu nombre completo.")
  .max(150, "Máximo 150 caracteres.");

/** Datos personales editables de `/cuenta` (AUD-15): mismas reglas que el registro. */
export const esquemaDatosPersonales = z.object({ nombre, telefono });

/** Mínimo de `MinimumLengthValidator` (8) y `NumericPasswordValidator`. */
const passwordNueva = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .refine((v) => !/^\d+$/.test(v), "La contraseña no puede ser solo numérica.");

export const esquemaIngreso = z.object({
  telefono,
  password: z.string().min(1, "Escribe tu contraseña."),
});

const camposCuenta = {
  nombre,
  telefono,
  password: passwordNueva,
  confirmacion: z.string(),
};

const coincide = (d: { password: string; confirmacion: string }) => d.password === d.confirmacion;
const errorConfirmacion = {
  message: "Las contraseñas no coinciden.",
  path: ["confirmacion"],
};

export const esquemaRegistroComprador = z.object(camposCuenta).refine(coincide, errorConfirmacion);

const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const telefonoPublico = z
  .string()
  .trim()
  .refine((v) => v === "" || esTelefonoNicaragua(v), "Teléfono de Nicaragua de 8 dígitos.");
const url = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v),
    "Escribe una dirección completa que empiece por http:// o https://.",
  );

/** Datos iniciales del taller: `nombre`, `rubro` y `direccion_completa` obligatorios. */
export const esquemaTaller = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribe el nombre del taller.")
    .max(120, "Máximo 120 caracteres."),
  rubro: z.string().trim().min(1, "Indica el rubro del taller.").max(80, "Máximo 80 caracteres."),
  direccionCompleta: z
    .string()
    .trim()
    .min(1, "Escribe la dirección del taller.")
    .max(255, "Máximo 255 caracteres."),
  historia: opcional(2000),
  horario: opcional(200),
  telefonoPublico,
  whatsappPublico: telefonoPublico,
  facebookUrl: url,
  instagramUrl: url,
  sitioWeb: url,
});

export const esquemaRegistroArtesano = z
  .object({ ...camposCuenta, taller: esquemaTaller })
  .refine(coincide, errorConfirmacion);

export type TallerFormulario = z.input<typeof esquemaTaller>;

export const TALLER_VACIO: TallerFormulario = {
  nombre: "",
  rubro: "",
  direccionCompleta: "",
  historia: "",
  horario: "",
  telefonoPublico: "",
  whatsappPublico: "",
  facebookUrl: "",
  instagramUrl: "",
  sitioWeb: "",
};

/** Errores de Zod como `{campo: mensaje}`, con la ruta anidada (`taller.rubro`). */
export function erroresDeValidacion(error: z.ZodError): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join(".");
    errores[campo] ??= issue.message;
  }
  return errores;
}

/** Campos de la API (`snake_case`) → campos del formulario. */
const CAMPOS_API: Record<string, string> = {
  "taller.direccion_completa": "taller.direccionCompleta",
  "taller.telefono_publico": "taller.telefonoPublico",
  "taller.whatsapp_publico": "taller.whatsappPublico",
  "taller.facebook_url": "taller.facebookUrl",
  "taller.instagram_url": "taller.instagramUrl",
  "taller.sitio_web": "taller.sitioWeb",
};

/** Errores `400` del servidor por campo del formulario; el primer mensaje de cada uno. */
export function erroresDelServidor(campos: Record<string, string[]>): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const [campo, mensajes] of Object.entries(campos)) {
    const mensaje = mensajes[0];
    if (mensaje) errores[CAMPOS_API[campo] ?? campo] = mensaje;
  }
  return errores;
}
