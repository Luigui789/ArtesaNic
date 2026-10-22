/**
 * Cliente de solicitudes V1 (AUD-05/06). La identidad procede del Bearer del transporte
 * compartido; este módulo no recibe usuarios ni identidades de la demostración.
 */
import { ApiError, solicitar } from "@/features/catalogo/http";
import type { Paginated } from "@/features/catalogo/types";
import type {
  Propuesta,
  PropuestaEntrada,
  RenglonSolicitud,
  RenglonSolicitudArtesano,
  ResolucionEntrada,
  Solicitud,
  SolicitudArtesano,
  SolicitudEntrada,
} from "./types";

const PAGE_SIZE = 12;
const MENSAJES = {
  401: "Inicia sesión para consultar o enviar solicitudes.",
  404: "No encontramos esta solicitud.",
  409: "Esta solicitud ya se había enviado con otros datos. Revisa tus solicitudes antes de enviarla de nuevo.",
};
/** Revisión y propuesta: un `409` conserva el mensaje del servidor y su `codigo` estable. */
const MENSAJES_REVISION = {
  401: "Inicia sesión con tu cuenta de artesano para revisar solicitudes.",
  404: "No encontramos esta solicitud o el renglón indicado.",
};
const MENSAJES_PROPUESTA = {
  401: "Inicia sesión para consultar la propuesta.",
  404: "Esta solicitud todavía no tiene una propuesta final.",
};
export const CABECERA_IDEMPOTENCIA = "Idempotency-Key";

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
  resuelto_en: string | null;
}

interface RenglonArtesanoDTO extends RenglonDTO {
  resuelto_por: RenglonSolicitudArtesano["resueltoPor"];
}

interface SolicitudDTO {
  id: number;
  taller: Solicitud["taller"];
  estado: Solicitud["estado"];
  modalidad_entrega_preferida: Solicitud["modalidadEntregaPreferida"];
  descripcion_entrega_preferida: string;
  creado_en: string;
  actualizado_en: string;
  renglones: RenglonDTO[];
}

interface SolicitudArtesanoDTO extends SolicitudDTO {
  comprador: SolicitudArtesano["comprador"];
  renglones: RenglonArtesanoDTO[];
}

interface LineaPropuestaDTO {
  id: number;
  renglon: number;
  posicion: number;
  producto: RenglonDTO["producto"];
  modalidad: RenglonDTO["modalidad"];
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
  cargo_personalizacion: string;
  fecha_solicitada: string | null;
  fecha_comprometida: string | null;
}

interface PropuestaDTO {
  id: number;
  solicitud: number;
  emitida_en: string;
  decision?: Propuesta["decision"];
  decidida_en?: string | null;
  pedido_id?: number | null;
  moneda: "NIO";
  modalidad_entrega: Propuesta["modalidadEntrega"];
  descripcion_entrega: string;
  lineas: LineaPropuestaDTO[];
  otros_cargos: { posicion: number; descripcion: string; monto: string; renglon: number | null }[];
  costo_entrega: string;
  subtotal_productos: string;
  total_personalizacion: string;
  total_otros_cargos: string;
  total: string;
}

interface PaginaDTO<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function aProducto(producto: RenglonDTO["producto"]): RenglonSolicitud["producto"] {
  return {
    id: producto.id,
    nombre: producto.nombre,
    categoria: {
      id: producto.categoria.id,
      codigo: producto.categoria.codigo,
      nombre: producto.categoria.nombre,
    },
  };
}

function aRenglon(renglon: RenglonDTO): RenglonSolicitud {
  return {
    id: renglon.id,
    posicion: renglon.posicion,
    producto: aProducto(renglon.producto),
    modalidad: renglon.modalidad,
    cantidad: renglon.cantidad,
    fechaSolicitada: renglon.fecha_solicitada,
    caracteristicas: renglon.caracteristicas,
    origenPersonalizacion: renglon.origen_personalizacion,
    resolucion: renglon.resolucion,
    motivoRechazo: renglon.motivo_rechazo,
    resueltoEn: renglon.resuelto_en,
  };
}

function aSolicitud(datos: SolicitudDTO): Solicitud {
  return {
    id: datos.id,
    taller: { id: datos.taller.id, nombre: datos.taller.nombre },
    estado: datos.estado,
    modalidadEntregaPreferida: datos.modalidad_entrega_preferida,
    descripcionEntregaPreferida: datos.descripcion_entrega_preferida,
    creadoEn: datos.creado_en,
    actualizadoEn: datos.actualizado_en,
    renglones: datos.renglones.map(aRenglon),
  };
}

function aSolicitudArtesano(datos: SolicitudArtesanoDTO): SolicitudArtesano {
  return {
    ...aSolicitud(datos),
    comprador: { id: datos.comprador.id, nombre: datos.comprador.nombre },
    renglones: datos.renglones.map((renglon) => ({
      ...aRenglon(renglon),
      resueltoPor: renglon.resuelto_por
        ? { id: renglon.resuelto_por.id, nombre: renglon.resuelto_por.nombre }
        : null,
    })),
  };
}

/** Los importes se conservan como cadenas decimales: nunca se recalculan con float. */
function aPropuesta(datos: PropuestaDTO): Propuesta {
  return {
    id: datos.id,
    solicitud: datos.solicitud,
    emitidaEn: datos.emitida_en,
    ...(datos.decision
      ? {
          decision: datos.decision,
          decididaEn: datos.decidida_en ?? null,
          pedidoId: datos.pedido_id ?? null,
        }
      : {}),
    moneda: datos.moneda,
    modalidadEntrega: datos.modalidad_entrega,
    descripcionEntrega: datos.descripcion_entrega,
    lineas: datos.lineas.map((linea) => ({
      id: linea.id,
      renglon: linea.renglon,
      posicion: linea.posicion,
      producto: aProducto(linea.producto),
      modalidad: linea.modalidad,
      cantidad: linea.cantidad,
      precioUnitario: linea.precio_unitario,
      subtotal: linea.subtotal,
      cargoPersonalizacion: linea.cargo_personalizacion,
      fechaSolicitada: linea.fecha_solicitada,
      fechaComprometida: linea.fecha_comprometida,
    })),
    otrosCargos: datos.otros_cargos.map((cargo) => ({
      posicion: cargo.posicion,
      descripcion: cargo.descripcion,
      monto: cargo.monto,
      renglon: cargo.renglon,
    })),
    costoEntrega: datos.costo_entrega,
    subtotalProductos: datos.subtotal_productos,
    totalPersonalizacion: datos.total_personalizacion,
    totalOtrosCargos: datos.total_otros_cargos,
    total: datos.total,
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
  // La preferencia de entrega se omite si no se indicó: el servidor no presupone una.
  const entrega = entrada.modalidadEntregaPreferida
    ? {
        modalidad_entrega_preferida: entrada.modalidadEntregaPreferida,
        ...(entrada.descripcionEntregaPreferida
          ? { descripcion_entrega_preferida: entrada.descripcionEntregaPreferida }
          : {}),
      }
    : {};
  return {
    ...entrega,
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

/**
 * `clave` identifica el intento (AUD-08): repetirla con el mismo cuerpo devuelve la
 * solicitud ya creada en lugar de crear otra. Ver `idempotencia.ts`.
 */
export async function crearSolicitud(entrada: SolicitudEntrada, clave: string): Promise<Solicitud> {
  return aSolicitud(
    await solicitar<SolicitudDTO>("/solicitudes/", {
      metodo: "POST",
      cuerpo: cuerpoSolicitud(entrada),
      autenticada: true,
      mensajes: MENSAJES,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

interface OperacionDTO {
  tipo: "crear_solicitud";
  estado: "completada";
  recurso: { tipo: string; id: number };
}

/**
 * Resultado incierto tras perder la respuesta: devuelve el ID de la solicitud creada
 * con esa clave, o `null` si no se registró (el servidor no revela claves ajenas).
 */
export async function consultarCreacionSolicitud(clave: string): Promise<number | null> {
  try {
    const operacion = await solicitar<OperacionDTO>(
      `/operaciones/crear_solicitud/${encodeURIComponent(clave)}/`,
      { autenticada: true, mensajes: MENSAJES },
    );
    return operacion.recurso.id;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
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

/** Allowlist: solo resolución y, al rechazar, motivo. Nunca cantidad ni producto. */
export function cuerpoResolucion(entrada: ResolucionEntrada) {
  return entrada.resolucion === "rechazado"
    ? { resolucion: "rechazado", motivo_rechazo: entrada.motivoRechazo }
    : { resolucion: "aceptado" };
}

/** Allowlist: condiciones del artesano; precios, subtotales y total los calcula el servidor. */
export function cuerpoPropuesta(entrada: PropuestaEntrada) {
  return {
    modalidad_entrega: entrada.modalidadEntrega,
    ...(entrada.descripcionEntrega ? { descripcion_entrega: entrada.descripcionEntrega } : {}),
    costo_entrega: entrada.costoEntrega,
    lineas: entrada.lineas.map((linea) => ({
      renglon: linea.renglon,
      ...(linea.fechaComprometida ? { fecha_comprometida: linea.fechaComprometida } : {}),
      ...(linea.cargoPersonalizacion !== undefined
        ? { cargo_personalizacion: linea.cargoPersonalizacion }
        : {}),
    })),
    otros_cargos: (entrada.otrosCargos ?? []).map((cargo) => ({
      descripcion: cargo.descripcion,
      monto: cargo.monto,
      ...(cargo.renglon !== undefined ? { renglon: cargo.renglon } : {}),
    })),
  };
}

/**
 * Resolución final de un renglón (AUD-06). `clave` identifica el intento (AUD-08); la
 * huella incluye solicitud y renglón, así que cada renglón necesita su propia clave.
 */
export async function resolverRenglon(
  solicitudId: number,
  renglonId: number,
  entrada: ResolucionEntrada,
  clave: string,
): Promise<SolicitudArtesano> {
  return aSolicitudArtesano(
    await solicitar<SolicitudArtesanoDTO>(
      `/solicitudes/recibidas/${solicitudId}/renglones/${renglonId}/resolver/`,
      {
        metodo: "POST",
        cuerpo: cuerpoResolucion(entrada),
        autenticada: true,
        mensajes: MENSAJES_REVISION,
        cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
      },
    ),
  );
}

/** Emite la propuesta final (AUD-06). No confirma pedido ni reserva (AUD-07). */
export async function emitirPropuesta(
  solicitudId: number,
  entrada: PropuestaEntrada,
  clave: string,
): Promise<Propuesta> {
  return aPropuesta(
    await solicitar<PropuestaDTO>(`/solicitudes/recibidas/${solicitudId}/propuesta/`, {
      metodo: "POST",
      cuerpo: cuerpoPropuesta(entrada),
      autenticada: true,
      mensajes: MENSAJES_REVISION,
      cabeceras: { [CABECERA_IDEMPOTENCIA]: clave },
    }),
  );
}

/** Propuesta de una solicitud propia (comprador) o recibida (artesano); `404` si no existe. */
export async function consultarPropuesta(
  solicitudId: number,
  recibidas: boolean,
): Promise<Propuesta> {
  const parte = recibidas ? "recibidas" : "mias";
  return aPropuesta(
    await solicitar<PropuestaDTO>(`/solicitudes/${parte}/${solicitudId}/propuesta/`, {
      autenticada: true,
      mensajes: MENSAJES_PROPUESTA,
    }),
  );
}
