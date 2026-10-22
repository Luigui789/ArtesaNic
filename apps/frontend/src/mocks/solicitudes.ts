/**
 * Demo AUD-05 separada de orders: no cotiza, reserva, paga ni habilita conversación.
 * La revisión y la propuesta de AUD-06 solo existen con la API real; su flujo de
 * interfaz pertenece a AUD-09.
 */
import type { SesionUsuario } from "@/features/auth/use-session";
import type { Paginated } from "@/features/catalogo/types";
import { ApiError } from "@/features/catalogo/http";
import type {
  Propuesta,
  Solicitud,
  SolicitudArtesano,
  SolicitudEntrada,
} from "@/features/solicitudes/types";
import { esquemaSolicitudEntrada } from "@/features/solicitudes/validacion";
import { api, nextId, nowIso, store } from "./core";
import type { SolicitudDemo } from "./core";

function exigirSesion(usuario: SesionUsuario | null, recibidas = false): SesionUsuario {
  if (!usuario) throw new ApiError(401, "Inicia sesión para consultar tus solicitudes.");
  if (usuario.rol !== (recibidas ? "artesano" : "comprador"))
    throw new ApiError(403, "Esta operación no corresponde a tu vista de demostración.");
  return usuario;
}

function lectura(solicitud: SolicitudDemo, recibidas: boolean): Solicitud | SolicitudArtesano {
  const resultado: Solicitud = {
    id: solicitud.id,
    taller: solicitud.taller,
    estado: solicitud.estado,
    modalidadEntregaPreferida: solicitud.modalidadEntregaPreferida ?? "",
    descripcionEntregaPreferida: solicitud.descripcionEntregaPreferida ?? "",
    creadoEn: solicitud.creadoEn,
    actualizadoEn: solicitud.actualizadoEn,
    renglones: solicitud.renglones.map((r) => {
      const producto = store.products.find((p) => p.id === r.producto.id);
      const actual = producto
        ? { id: producto.id, nombre: producto.nombre, categoria: producto.categoria }
        : r.producto;
      return { ...r, producto: actual, resueltoEn: null };
    }),
  };
  return recibidas
    ? {
        ...resultado,
        comprador: solicitud.comprador,
        renglones: resultado.renglones.map((r) => ({ ...r, resueltoPor: null })),
      }
    : resultado;
}

function pertenece(s: SolicitudDemo, usuario: SesionUsuario, recibidas: boolean): boolean {
  return recibidas ? s.taller.id === usuario.artesanoId : s.compradorId === usuario.id;
}

/**
 * Equivalente simple de AUD-08 para la demo: memoria de la pestaña, por usuario demo y
 * clave. La autoridad real es el servidor; esta tabla no se guarda en IndexedDB.
 */
const operaciones = new Map<string, { cuerpo: string; solicitudId: number }>();

export function crearSolicitud(
  entrada: SolicitudEntrada,
  usuario: SesionUsuario | null,
  clave?: string,
) {
  return api(
    () => {
      const comprador = exigirSesion(usuario);
      const llave = clave === undefined ? undefined : `${comprador.id}:${clave}`;
      // Misma huella que el servidor: la preferencia de entrega forma parte del intento.
      const cuerpo = JSON.stringify([
        entrada.renglones,
        entrada.modalidadEntregaPreferida ?? "",
        entrada.descripcionEntregaPreferida ?? "",
      ]);
      const previa = llave === undefined ? undefined : operaciones.get(llave);
      if (previa) {
        if (previa.cuerpo !== cuerpo)
          throw new ApiError(
            409,
            "Esta solicitud ya se había enviado con otros datos.",
            {},
            "clave_idempotencia_reutilizada",
          );
        const existente = store.solicitudes.find((s) => s.id === previa.solicitudId);
        if (existente) return lectura(existente, false) as Solicitud;
      }
      const validada = esquemaSolicitudEntrada.safeParse(entrada);
      if (!validada.success) {
        const campos = Object.fromEntries(
          validada.error.issues.map((i) => [i.path.join("."), [i.message]]),
        );
        throw new ApiError(400, "Revisa los productos de la solicitud.", campos);
      }
      let tallerId: number | undefined;
      const renglones: SolicitudDemo["renglones"] = validada.data.renglones.map((r, i) => {
        const producto = store.products.find((p) => p.id === r.producto && p.publicado);
        if (!producto)
          throw new ApiError(400, "El producto no está disponible para nuevas solicitudes.");
        if (tallerId !== undefined && tallerId !== producto.artesanoId)
          throw new ApiError(400, "Todos los productos deben pertenecer al mismo taller.");
        tallerId = producto.artesanoId;
        if (!producto.modalidades.includes(r.modalidad))
          throw new ApiError(400, "El producto no admite esta modalidad.");
        return {
          id: i + 1,
          posicion: i + 1,
          producto: { id: producto.id, nombre: producto.nombre, categoria: producto.categoria },
          modalidad: r.modalidad,
          cantidad: r.cantidad,
          fechaSolicitada: r.modalidad === "produccion" ? r.fechaSolicitada : null,
          caracteristicas: r.modalidad === "personalizacion" ? r.caracteristicas : "",
          origenPersonalizacion: r.modalidad === "personalizacion" ? r.origenPersonalizacion : "",
          resolucion: "pendiente",
          motivoRechazo: "",
        };
      });
      const taller = store.artisans.find((a) => a.id === tallerId);
      if (!taller) throw new ApiError(400, "No encontramos el taller destinatario.");
      const solicitud: SolicitudDemo = {
        id: nextId(store.solicitudes),
        compradorId: comprador.id,
        comprador: { id: comprador.id, nombre: comprador.nombre },
        taller: { id: taller.id, nombre: taller.nombreTaller },
        estado: "pendiente_revision",
        modalidadEntregaPreferida: validada.data.modalidadEntregaPreferida ?? "",
        descripcionEntregaPreferida: validada.data.descripcionEntregaPreferida ?? "",
        creadoEn: nowIso(),
        actualizadoEn: nowIso(),
        renglones,
      };
      store.solicitudes.push(solicitud);
      if (llave !== undefined) operaciones.set(llave, { cuerpo, solicitudId: solicitud.id });
      return lectura(solicitud, false) as Solicitud;
    },
    undefined,
    true,
  );
}

export function listarSolicitudes(
  usuario: SesionUsuario | null,
  recibidas: boolean,
  page = 1,
): Promise<Paginated<Solicitud | SolicitudArtesano>> {
  return api(() => {
    const actor = exigirSesion(usuario, recibidas);
    const propias = store.solicitudes
      .filter((s) => pertenece(s, actor, recibidas))
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.id - a.id);
    const totalPages = Math.max(1, Math.ceil(propias.length / 12));
    if (!Number.isInteger(page) || page < 1 || page > totalPages)
      throw new ApiError(404, "No encontramos esta página de solicitudes.");
    return {
      items: propias.slice((page - 1) * 12, page * 12).map((s) => lectura(s, recibidas)),
      total: propias.length,
      page,
      pageSize: 12,
      totalPages,
    };
  });
}

export function consultarSolicitud(id: number, usuario: SesionUsuario | null, recibidas: boolean) {
  return api(() => {
    const actor = exigirSesion(usuario, recibidas);
    const solicitud = store.solicitudes.find((s) => s.id === id && pertenece(s, actor, recibidas));
    if (!solicitud) throw new ApiError(404, "No encontramos esta solicitud.");
    return lectura(solicitud, recibidas);
  });
}

/** AUD-06 sin simulación local: evita aparentar una revisión que la demo no persiste. */
export function revisionNoDisponible(): Promise<never> {
  return Promise.reject(
    new ApiError(
      501,
      "La revisión de renglones y la propuesta solo están disponibles con la API real.",
    ),
  );
}

/** La demo nunca emite propuestas: la consulta responde como el servidor sin propuesta. */
export function consultarPropuesta(
  id: number,
  usuario: SesionUsuario | null,
  recibidas: boolean,
): Promise<Propuesta> {
  return api(() => {
    const actor = exigirSesion(usuario, recibidas);
    const existe = store.solicitudes.some((s) => s.id === id && pertenece(s, actor, recibidas));
    throw new ApiError(
      404,
      existe
        ? "Esta solicitud todavía no tiene una propuesta final."
        : "No encontramos esta solicitud.",
    );
  });
}
