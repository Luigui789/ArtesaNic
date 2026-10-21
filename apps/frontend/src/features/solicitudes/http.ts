/**
 * Cliente de solicitudes V1 (AUD-05). La identidad procede del Bearer del transporte
 * compartido; este módulo no recibe usuarios ni identidades de la demostración.
 */
import { solicitar } from "@/features/catalogo/http";
import type { Paginated } from "@/features/catalogo/types";
import type { RenglonSolicitud, Solicitud, SolicitudArtesano, SolicitudEntrada } from "./types";

const PAGE_SIZE = 12;
const MENSAJES = {
  401: "Inicia sesión para consultar o enviar solicitudes.",
  404: "No encontramos esta solicitud.",
};

interface RenglonDTO {
  id: number;
  posicion: number;
  producto: RenglonSolicitud["producto"];
  modalidad: RenglonSolicitud["modalidad"];
  cantidad: number;
  fecha_solicitada: string | null;
  caracteristicas: string;
  origen_personalizacion: RenglonSolicitud["origenPersonalizacion"];
  resolucion: RenglonSolicitud["resolucion"];
  motivo_rechazo: string;
}

interface SolicitudDTO {
  id: number;
  taller: Solicitud["taller"];
  estado: Solicitud["estado"];
  creado_en: string;
  actualizado_en: string;
  renglones: RenglonDTO[];
}

interface SolicitudArtesanoDTO extends SolicitudDTO {
  comprador: SolicitudArtesano["comprador"];
}

interface PaginaDTO<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function aSolicitud(datos: SolicitudDTO): Solicitud {
  return {
    id: datos.id,
    taller: { id: datos.taller.id, nombre: datos.taller.nombre },
    estado: datos.estado,
    creadoEn: datos.creado_en,
    actualizadoEn: datos.actualizado_en,
    renglones: datos.renglones.map((renglon) => ({
      id: renglon.id,
      posicion: renglon.posicion,
      producto: {
        id: renglon.producto.id,
        nombre: renglon.producto.nombre,
        categoria: {
          id: renglon.producto.categoria.id,
          codigo: renglon.producto.categoria.codigo,
          nombre: renglon.producto.categoria.nombre,
        },
      },
      modalidad: renglon.modalidad,
      cantidad: renglon.cantidad,
      fechaSolicitada: renglon.fecha_solicitada,
      caracteristicas: renglon.caracteristicas,
      origenPersonalizacion: renglon.origen_personalizacion,
      resolucion: renglon.resolucion,
      motivoRechazo: renglon.motivo_rechazo,
    })),
  };
}

function aSolicitudArtesano(datos: SolicitudArtesanoDTO): SolicitudArtesano {
  return {
    ...aSolicitud(datos),
    comprador: { id: datos.comprador.id, nombre: datos.comprador.nombre },
  };
}

function aPagina<D, T>(datos: PaginaDTO<D>, page: number, mapear: (dto: D) => T): Paginated<T> {
  return {
    items: datos.results.map(mapear),
    total: datos.count,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(datos.count / PAGE_SIZE)),
  };
}

/** Allowlist por modalidad: no copia comprador, taller, estado, resolución ni importes. */
export function cuerpoSolicitud(entrada: SolicitudEntrada) {
  return {
    renglones: entrada.renglones.map((renglon) => {
      const base = {
        producto: renglon.producto,
        modalidad: renglon.modalidad,
        cantidad: renglon.cantidad,
      };
      switch (renglon.modalidad) {
        case "produccion":
          return { ...base, fecha_solicitada: renglon.fechaSolicitada };
        case "personalizacion":
          return {
            ...base,
            caracteristicas: renglon.caracteristicas,
            origen_personalizacion: renglon.origenPersonalizacion,
          };
        default:
          return base;
      }
    }),
  };
}

export async function crearSolicitud(entrada: SolicitudEntrada): Promise<Solicitud> {
  return aSolicitud(
    await solicitar<SolicitudDTO>("/solicitudes/", {
      metodo: "POST",
      cuerpo: cuerpoSolicitud(entrada),
      autenticada: true,
      mensajes: MENSAJES,
    }),
  );
}

/** Solicitudes del comprador autenticado. La API admite hasta 48; el cliente solicita 12. */
export async function listarMisSolicitudes(page = 1): Promise<Paginated<Solicitud>> {
  const parametros = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  const datos = await solicitar<PaginaDTO<SolicitudDTO>>(`/solicitudes/mias/?${parametros}`, {
    autenticada: true,
    mensajes: MENSAJES,
  });
  return aPagina(datos, page, aSolicitud);
}

export async function consultarMiSolicitud(id: number): Promise<Solicitud> {
  return aSolicitud(
    await solicitar<SolicitudDTO>(`/solicitudes/mias/${id}/`, {
      autenticada: true,
      mensajes: MENSAJES,
    }),
  );
}

export async function listarSolicitudesRecibidas(page = 1): Promise<Paginated<SolicitudArtesano>> {
  const parametros = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  const datos = await solicitar<PaginaDTO<SolicitudArtesanoDTO>>(
    `/solicitudes/recibidas/?${parametros}`,
    { autenticada: true, mensajes: MENSAJES },
  );
  return aPagina(datos, page, aSolicitudArtesano);
}

export async function consultarSolicitudRecibida(id: number): Promise<SolicitudArtesano> {
  return aSolicitudArtesano(
    await solicitar<SolicitudArtesanoDTO>(`/solicitudes/recibidas/${id}/`, {
      autenticada: true,
      mensajes: MENSAJES,
    }),
  );
}
