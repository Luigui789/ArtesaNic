import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { MODALIDAD_LABELS } from "@/lib/labels";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";
import {
  ApiError,
  consultarSolicitud,
  listarSolicitudes,
  reintentarSalvoErrorDelCliente,
  solicitudesReales,
} from "../api";

const ESTADO = { pendiente_revision: "Pendiente de revisión", rechazada: "Rechazada" };
const RESOLUCION = { pendiente: "Pendiente", aceptado: "Aceptado", rechazado: "Rechazado" };

export function ListadoSolicitudes({ recibidas = false }: { recibidas?: boolean }) {
  const { usuario } = useSession();
  const [page, setPage] = useState(1);
  const base = recibidas ? "/panel/solicitudes" : "/solicitudes";
  const solicitudes = useQuery({
    queryKey: [
      "solicitudes",
      solicitudesReales,
      usuario?.id,
      usuario?.rol,
      usuario?.artesanoId,
      recibidas,
      page,
    ],
    queryFn: () => listarSolicitudes(usuario, recibidas, page),
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 [&_button]:min-h-11">
        <h1 className="font-display text-3xl font-bold">
          {recibidas ? "Solicitudes recibidas" : "Mis solicitudes"}
        </h1>
        <p>Solicitudes con uno o varios productos. Todavía no son pedidos confirmados.</p>
        {!recibidas ? (
          <Button asChild>
            <Link to="/solicitudes/nueva">Nueva solicitud</Link>
          </Button>
        ) : null}
        {solicitudes.isPending ? (
          <p role="status">Cargando solicitudes…</p>
        ) : solicitudes.isError ? (
          <ErrorState
            mensaje={solicitudes.error.message}
            onRetry={() => void solicitudes.refetch()}
          />
        ) : solicitudes.data.items.length === 0 ? (
          <EmptyState
            titulo="Aún no hay solicitudes"
            descripcion={
              recibidas
                ? "Aquí aparecerán las solicitudes enviadas a tu taller."
                : "Prepara una solicitud desde el catálogo."
            }
          />
        ) : (
          <ul className="space-y-3">
            {solicitudes.data.items.map((s) => (
              <li key={s.id} className="rounded-xl border p-4">
                <Link
                  to={`${base}/${s.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary"
                >
                  Solicitud #{s.id}
                </Link>
                <p>
                  {s.taller.nombre} · {s.renglones.length}{" "}
                  {s.renglones.length === 1 ? "producto" : "productos"}
                </p>
                <p>{ESTADO[s.estado]}</p>
              </li>
            ))}
          </ul>
        )}
        {solicitudes.data && solicitudes.data.totalPages > 1 ? (
          <nav className="flex items-center gap-4" aria-label="Paginación de solicitudes">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span>
              Página {page} de {solicitudes.data.totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= solicitudes.data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </nav>
        ) : null}
      </div>
    </SiteLayout>
  );
}

export function DetalleSolicitud({ recibidas = false }: { recibidas?: boolean }) {
  const { id: parametro } = useParams();
  const id = parseRouteId(parametro);
  const { usuario } = useSession();
  const solicitud = useQuery({
    queryKey: [
      "solicitud",
      solicitudesReales,
      usuario?.id,
      usuario?.rol,
      usuario?.artesanoId,
      recibidas,
      id,
    ],
    queryFn: () => consultarSolicitud(id!, usuario, recibidas),
    enabled: id !== undefined,
    retry: reintentarSalvoErrorDelCliente,
  });
  if (id === undefined || (solicitud.error instanceof ApiError && solicitud.error.status === 404))
    return <NotFound />;
  const s = solicitud.data;
  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link
          to={recibidas ? "/panel/solicitudes" : "/solicitudes"}
          className="inline-flex min-h-11 items-center text-primary"
        >
          Volver a solicitudes
        </Link>
        <h1 className="font-display text-3xl font-bold">Solicitud #{id}</h1>
        {solicitud.isPending ? (
          <p role="status">Cargando solicitud…</p>
        ) : solicitud.isError ? (
          <ErrorState mensaje={solicitud.error.message} onRetry={() => void solicitud.refetch()} />
        ) : s ? (
          <>
            <p>
              {s.taller.nombre} · {ESTADO[s.estado]}
            </p>
            {"comprador" in s ? <p>Comprador: {s.comprador.nombre}</p> : null}
            <p className="rounded-lg border p-4 text-sm">
              {s.estado === "rechazada"
                ? "La solicitud terminó rechazada. Se conservan los productos y sus motivos; no hay propuesta confirmable ni pedido confirmado."
                : "El taller revisará cada producto. Esta solicitud no confirma un pedido ni reserva inventario. La revisión del taller aún no está habilitada."}
            </p>
            <ol className="space-y-4">
              {s.renglones.map((r) => (
                <li key={r.id} className="space-y-2 rounded-xl border p-4">
                  <h2 className="font-semibold">
                    {r.posicion}. {r.producto.nombre}
                  </h2>
                  <p>
                    {MODALIDAD_LABELS[r.modalidad]} · Cantidad: {r.cantidad}
                  </p>
                  {r.fechaSolicitada ? <p>Fecha solicitada: {r.fechaSolicitada}</p> : null}
                  {r.caracteristicas ? (
                    <p className="whitespace-pre-wrap break-words">
                      Características: {r.caracteristicas}
                    </p>
                  ) : null}
                  {r.origenPersonalizacion ? (
                    <p>
                      {r.origenPersonalizacion === "desde_cero"
                        ? "Fabricación desde cero"
                        : "Unidad estándar como base"}
                    </p>
                  ) : null}
                  <p>Resolución: {RESOLUCION[r.resolucion]}</p>
                  {r.motivoRechazo ? (
                    <p className="whitespace-pre-wrap break-words">
                      Motivo de rechazo: {r.motivoRechazo}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </SiteLayout>
  );
}
