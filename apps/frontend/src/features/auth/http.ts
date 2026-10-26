/**
 * Cuentas y sesión contra Django (AUD-18). Contrato: docs/api/autenticacion.md.
 *
 * Única capa que conoce los nombres de la API de cuentas. Los cuerpos se construyen
 * con una lista cerrada de campos: el cliente nunca envía `rol` ni privilegios, porque
 * el rol lo asigna el servidor según el endpoint. Las respuestas se validan con Zod
 * antes de convertirse en sesión.
 */
import { z } from "zod";
import {
  establecerTokenDeAcceso,
  esperarRenovacion,
  nuevaEpoca,
  renovarAcceso,
  solicitar,
} from "@/lib/http";
import type {
  ActualizarPerfilEntrada,
  Credenciales,
  RegistroArtesanoEntrada,
  RegistroCompradorEntrada,
  SesionUsuario,
  TallerEntrada,
} from "./types";

// ---------- Esquemas de respuesta ----------

/** UsuarioSerializer: `rol` solo puede ser comprador o artesano (la API no autentica admins). */
export const esquemaUsuario = z.object({
  id: z.number().int().positive(),
  nombre: z.string(),
  telefono: z.string(),
  rol: z.enum(["comprador", "artesano"]),
});

/** SesionSerializer: respuesta de login y de ambos registros. */
export const esquemaSesion = z.object({
  access: z.string().min(1),
  usuario: esquemaUsuario,
});

const aSesionUsuario = (u: z.infer<typeof esquemaUsuario>): SesionUsuario => ({
  id: u.id,
  nombre: u.nombre,
  telefono: u.telefono,
  rol: u.rol,
});

// ---------- Cuerpos (lista cerrada de campos) ----------

export function cuerpoLogin({ telefono, password }: Credenciales) {
  return { telefono, password };
}

export function cuerpoRegistroComprador({ nombre, telefono, password }: RegistroCompradorEntrada) {
  return { nombre, telefono, password };
}

/** Solo los campos opcionales que el artesano escribió: nada se publica por omisión. */
export function cuerpoTaller(t: TallerEntrada) {
  const opcionales = {
    historia: t.historia,
    horario: t.horario,
    telefono_publico: t.telefonoPublico,
    whatsapp_publico: t.whatsappPublico,
    facebook_url: t.facebookUrl,
    instagram_url: t.instagramUrl,
    sitio_web: t.sitioWeb,
  };
  return {
    nombre: t.nombre,
    rubro: t.rubro,
    direccion_completa: t.direccionCompleta,
    ...Object.fromEntries(Object.entries(opcionales).filter(([, v]) => v?.trim())),
  };
}

/** Lista cerrada: nombre, teléfono y contraseña actual, solo los que se enviaron. */
export function cuerpoActualizarPerfil({
  nombre,
  telefono,
  passwordActual,
}: ActualizarPerfilEntrada) {
  return {
    ...(nombre !== undefined ? { nombre } : {}),
    ...(telefono !== undefined ? { telefono } : {}),
    ...(telefono !== undefined && passwordActual ? { password_actual: passwordActual } : {}),
  };
}

export function cuerpoRegistroArtesano(entrada: RegistroArtesanoEntrada) {
  return { ...cuerpoRegistroComprador(entrada), taller: cuerpoTaller(entrada.taller) };
}

// ---------- Endpoints ----------

/** Inicia una sesión nueva: descarta la anterior y guarda el token solo en memoria. */
async function abrirSesion(ruta: string, cuerpo: unknown): Promise<SesionUsuario> {
  // Una renovación de la identidad anterior no debe pisar la cookie de la nueva.
  await esperarRenovacion();
  const { access, usuario } = await solicitar(ruta, {
    metodo: "POST",
    cuerpo,
    csrf: true,
    esquema: esquemaSesion,
  });
  // Época nueva: una renovación iniciada antes no puede instalar el token anterior.
  nuevaEpoca();
  establecerTokenDeAcceso(access);
  return aSesionUsuario(usuario);
}

export function iniciarSesion(credenciales: Credenciales): Promise<SesionUsuario> {
  return abrirSesion("/auth/login/", cuerpoLogin(credenciales));
}

export function registrarComprador(entrada: RegistroCompradorEntrada): Promise<SesionUsuario> {
  return abrirSesion("/auth/registro/comprador/", cuerpoRegistroComprador(entrada));
}

export function registrarArtesano(entrada: RegistroArtesanoEntrada): Promise<SesionUsuario> {
  return abrirSesion("/auth/registro/artesano/", cuerpoRegistroArtesano(entrada));
}

export async function consultarPerfil(signal?: AbortSignal): Promise<SesionUsuario> {
  return aSesionUsuario(
    await solicitar("/auth/perfil/", { autenticada: true, esquema: esquemaUsuario, signal }),
  );
}

/**
 * `PATCH /auth/perfil/` (AUD-15): Bearer, sin CSRF. No emite tokens: la sesión sigue
 * siendo la misma y la respuesta es la identidad actualizada, que reemplaza a la anterior.
 */
export async function actualizarPerfil(entrada: ActualizarPerfilEntrada): Promise<SesionUsuario> {
  return aSesionUsuario(
    await solicitar("/auth/perfil/", {
      metodo: "PATCH",
      cuerpo: cuerpoActualizarPerfil(entrada),
      autenticada: true,
      esquema: esquemaUsuario,
    }),
  );
}

/**
 * Arranque o recarga: el token no sobrevive a la recarga, así que primero se renueva
 * con la cookie y después se pide el perfil. `null` = sin sesión (renovación `401`).
 */
export async function restaurarSesion(): Promise<SesionUsuario | null> {
  const access = await renovarAcceso();
  return access ? consultarPerfil() : null;
}

/**
 * `POST /auth/logout/`: revoca la cookie en el servidor. No exige el token de acceso,
 * así que funciona aunque haya caducado. El token se descarta solo si el servidor
 * confirma el cierre; si falla, la sesión sigue abierta y la interfaz lo dice.
 */
export async function cerrarSesion(): Promise<void> {
  await esperarRenovacion();
  await solicitar<void>("/auth/logout/", { metodo: "POST", csrf: true });
  nuevaEpoca();
}
