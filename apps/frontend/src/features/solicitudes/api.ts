/**
 * Solicitudes V1: mismo origen que el catálogo para no mezclar identificadores.
 * El usuario local sirve solo al servidor simulado; la API real identifica las
 * partes con el Bearer que integrará la sesión de AUD-18.
 */
import type { SesionUsuario } from "@/features/auth/use-session";
import { catalogoReal } from "@/features/catalogo/api";
import type { Paginated } from "@/features/catalogo/types";
import * as mock from "@/mocks/solicitudes";
import * as http from "./http";
import { crearIntentoIdempotente } from "./idempotencia";
import type {
  Propuesta,
  PropuestaEntrada,
  ResolucionEntrada,
  Solicitud,
  SolicitudArtesano,
  SolicitudEntrada,
} from "./types";

export const solicitudesReales = catalogoReal;

/** `clave`: `Idempotency-Key` del intento; obtenerla con `crearIntentoDeEnvio`. */
export function crearSolicitud(
  entrada: SolicitudEntrada,
  usuario: SesionUsuario | null,
  clave: string,
): Promise<Solicitud> {
  return solicitudesReales
    ? http.crearSolicitud(entrada, clave)
    : mock.crearSolicitud(entrada, usuario, clave);
}

/**
 * Un intento de envío por composición: misma clave mientras el cuerpo no cambie, para
 * que un reintento no duplique la solicitud; clave nueva para una solicitud nueva.
 */
export function crearIntentoDeEnvio() {
  const intento = crearIntentoIdempotente();
  return {
    clave: (entrada: SolicitudEntrada) => intento.clave(http.cuerpoSolicitud(entrada)),
    completar: intento.completar,
  };
}

export function listarSolicitudes(
  usuario: SesionUsuario | null,
  recibidas: boolean,
  page = 1,
): Promise<Paginated<Solicitud | SolicitudArtesano>> {
  if (!solicitudesReales) return mock.listarSolicitudes(usuario, recibidas, page);
  return recibidas ? http.listarSolicitudesRecibidas(page) : http.listarMisSolicitudes(page);
}

export function consultarSolicitud(
  id: number,
  usuario: SesionUsuario | null,
  recibidas: boolean,
): Promise<Solicitud | SolicitudArtesano> {
  if (!solicitudesReales) return mock.consultarSolicitud(id, usuario, recibidas);
  return recibidas ? http.consultarSolicitudRecibida(id) : http.consultarMiSolicitud(id);
}

/**
 * Intento idempotente de una revisión o emisión (AUD-08). La huella del servidor incluye
 * la solicitud y el renglón: cada acción deliberada obtiene su propio intento.
 */
export function crearIntentoDeRevision() {
  const intento = crearIntentoIdempotente();
  return {
    claveResolucion: (solicitudId: number, renglonId: number, entrada: ResolucionEntrada) =>
      intento.clave({ solicitudId, renglonId, ...http.cuerpoResolucion(entrada) }),
    clavePropuesta: (solicitudId: number, entrada: PropuestaEntrada) =>
      intento.clave({ solicitudId, ...http.cuerpoPropuesta(entrada) }),
    completar: intento.completar,
  };
}

/** AUD-06: resolución final de un renglón. La demo no la simula (AUD-09). */
export function resolverRenglon(
  solicitudId: number,
  renglonId: number,
  entrada: ResolucionEntrada,
  clave: string,
): Promise<SolicitudArtesano> {
  return solicitudesReales
    ? http.resolverRenglon(solicitudId, renglonId, entrada, clave)
    : mock.revisionNoDisponible();
}

/** AUD-06: propuesta final del artesano. No confirma pedido ni reserva (AUD-07). */
export function emitirPropuesta(
  solicitudId: number,
  entrada: PropuestaEntrada,
  clave: string,
): Promise<Propuesta> {
  return solicitudesReales
    ? http.emitirPropuesta(solicitudId, entrada, clave)
    : mock.revisionNoDisponible();
}

export function consultarPropuesta(
  solicitudId: number,
  usuario: SesionUsuario | null,
  recibidas: boolean,
): Promise<Propuesta> {
  return solicitudesReales
    ? http.consultarPropuesta(solicitudId, recibidas)
    : mock.consultarPropuesta(solicitudId, usuario, recibidas);
}

export { ApiError, reintentarSalvoErrorDelCliente } from "@/features/catalogo/http";
export type {
  CargoPropuesta,
  CodigoConflictoSolicitud,
  EntregaPreferidaBorrador,
  EstadoSolicitud,
  LineaPropuesta,
  ModalidadEntrega,
  OrigenPersonalizacion,
  Propuesta,
  PropuestaEntrada,
  RenglonBorrador,
  RenglonSolicitud,
  RenglonSolicitudArtesano,
  RenglonSolicitudEntrada,
  ResolucionEntrada,
  ResolucionRenglon,
  Solicitud,
  SolicitudArtesano,
  SolicitudEntrada,
} from "./types";
