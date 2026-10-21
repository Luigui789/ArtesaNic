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
import type { Solicitud, SolicitudArtesano, SolicitudEntrada } from "./types";

export const solicitudesReales = catalogoReal;

export function crearSolicitud(
  entrada: SolicitudEntrada,
  usuario: SesionUsuario | null,
): Promise<Solicitud> {
  return solicitudesReales ? http.crearSolicitud(entrada) : mock.crearSolicitud(entrada, usuario);
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

export { ApiError, reintentarSalvoErrorDelCliente } from "@/features/catalogo/http";
export type {
  EstadoSolicitud,
  OrigenPersonalizacion,
  RenglonBorrador,
  RenglonSolicitud,
  RenglonSolicitudEntrada,
  ResolucionRenglon,
  Solicitud,
  SolicitudArtesano,
  SolicitudEntrada,
} from "./types";
