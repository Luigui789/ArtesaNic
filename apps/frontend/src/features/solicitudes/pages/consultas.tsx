import { ListPagination } from "@/components/common/pagination";
import { formatDate } from "@/lib/format";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/common/page";
import { LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PropuestaFinal } from "../components/propuesta";
import { FormularioPropuesta, RevisionRenglon } from "../components/revision";
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
import type { EstadoSolicitud, Solicitud } from "../api";

const ESTADO: Record<EstadoSolicitud, string> = {
  pendiente_revision: "Pendiente de revisión",
  lista_propuesta: "Revisada; propuesta en preparación",
  propuesta_emitida: "Propuesta emitida",
  rechazada: "Rechazada",
};
const AVISO: Record<EstadoSolicitud, string> = {
  pendiente_revision:
    "El taller revisará cada producto. Esta solicitud no confirma un pedido ni reserva inventario.",
  lista_propuesta:
    "El taller ya resolvió todos los productos y preparará su propuesta final con precios y entrega.",
  propuesta_emitida:
    "Consulta la propuesta para conocer sus condiciones, la decisión del comprador y los siguientes pasos.",
  rechazada:
    "La solicitud terminó rechazada. Se conservan los productos y sus motivos; no hay propuesta confirmable ni pedido confirmado.",
};
const ENTREGA: Record<Solicitud["modalidadEntregaPreferida"], string> = {
  "": "Sin preferencia",
  retiro_taller: "Retiro en taller",
  punto_encuentro: "Punto de encuentro",
  entrega_artesano: "Entrega por el artesano",
  otra: "Otra",
};
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
      <PageContainer>
        <PageHeader
          title={recibidas ? "Solicitudes recibidas" : "Mis solicitudes"}
          description="Consulta cada solicitud, revisa la propuesta y sigue el avance hacia tu pedido."
        />
        {!recibidas ? (
          <Button asChild>
            <Link to="/solicitudes/nueva">Nueva solicitud</Link>
          </Button>
        ) : null}
        {solicitudes.isPending ? (
          <LoadingState label="Cargando solicitudes…" />
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
                  {"comprador" in s ? s.comprador.nombre : s.taller.nombre} · {s.renglones.length}{" "}
                  {s.renglones.length === 1 ? "producto" : "productos"}
                </p>
                <p className="mb-2 text-xs text-muted-foreground">{formatDate(s.creadoEn)}</p>
                <StatusBadge tone={s.estado === "rechazada" ? "danger" : "pending"}>
                  {ESTADO[s.estado]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
        {solicitudes.data ? (
          <ListPagination page={page} totalPages={solicitudes.data.totalPages} onPage={setPage} />
        ) : null}
      </PageContainer>
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
      <PageContainer>
        <Link
          to={recibidas ? "/panel/solicitudes" : "/solicitudes"}
          className="inline-flex min-h-11 items-center text-primary"
        >
          Volver a solicitudes
        </Link>
        <h1 className="font-display text-3xl font-bold">Solicitud #{id}</h1>
        {solicitud.isPending ? (
          <LoadingState label="Cargando solicitud…" />
        ) : solicitud.isError ? (
          <ErrorState mensaje={solicitud.error.message} onRetry={() => void solicitud.refetch()} />
        ) : s ? (
          <>
            <p>
              {s.taller.nombre} · {ESTADO[s.estado]}
            </p>
            {"comprador" in s ? <p>Comprador: {s.comprador.nombre}</p> : null}
            <p>
              Entrega preferida: {ENTREGA[s.modalidadEntregaPreferida]}
              {s.descripcionEntregaPreferida ? ` — ${s.descripcionEntregaPreferida}` : ""}
            </p>
            <p className="rounded-lg border p-4 text-sm">{AVISO[s.estado]}</p>
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
                  {solicitudesReales &&
                  recibidas &&
                  r.resolucion === "pendiente" &&
                  s.estado === "pendiente_revision" ? (
                    <RevisionRenglon solicitud={s.id} renglon={r.id} />
                  ) : null}
                  {r.motivoRechazo ? (
                    <p className="whitespace-pre-wrap break-words">
                      Motivo de rechazo: {r.motivoRechazo}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {solicitudesReales && recibidas && s.estado === "lista_propuesta" ? (
              <FormularioPropuesta solicitud={s} />
            ) : null}
            {solicitudesReales && s.estado === "propuesta_emitida" ? (
              <PropuestaFinal solicitud={s.id} recibida={recibidas} />
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </SiteLayout>
  );
}
