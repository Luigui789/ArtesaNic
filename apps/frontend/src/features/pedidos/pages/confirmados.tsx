import { ENTREGA_LABELS } from "@/features/solicitudes/labels";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListPagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { claves } from "@/lib/query-keys";
import { mensajeDominio } from "@/lib/errores-dominio";
import { mostrarImporte } from "@/lib/importes";
import { formatDate } from "@/lib/format";
import { parseRouteId } from "@/lib/route-id";
import { reintentarSalvoErrorDelCliente } from "@/lib/http";
import { MODALIDAD_LABELS } from "@/lib/labels";
import {
  listarPedidosConfirmados,
  consultarPedidoConfirmado,
  type PedidoConfirmado,
} from "../confirmados";
import { ResumenContractual } from "../components/resumen-contractual";
export function ListadoPedidosConfirmados({ recibidos = false }: { recibidos?: boolean }) {
  const { usuario } = useSession();
  const [page, setPage] = useState(1);
  const base = recibidos ? "/panel/pedidos" : "/pedidos";
  const query = useQuery({
    queryKey: [...claves.pedidos(usuario?.id), recibidos, page],
    queryFn: ({ signal }) => listarPedidosConfirmados(recibidos, page, signal),
    placeholderData: keepPreviousData,
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title={recibidos ? "Pedidos del taller" : "Mis pedidos"}
          description="Acuerdos confirmados por el comprador, con sus productos e importes conservados."
          action={
            <Button asChild variant="outline">
              <Link to={recibidos ? "/panel/solicitudes" : "/solicitudes"}>Ver solicitudes</Link>
            </Button>
          }
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data.items.length ? (
          <EmptyState
            titulo="Todavía no hay pedidos confirmados"
            descripcion={
              recibidos
                ? "Cuando un comprador acepte una propuesta, el pedido aparecerá aquí."
                : "Revisa las propuestas de tus solicitudes para confirmar un pedido."
            }
            accion={
              <Button asChild variant="outline">
                <Link to={recibidos ? "/panel/solicitudes" : "/solicitudes"}>Ver solicitudes</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="space-y-4">
              {query.data.items.map((p) => (
                <li key={p.id} className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <StatusBadge tone="success">Confirmado</StatusBadge>
                      <h2 className="font-display text-xl font-semibold">
                        <Link
                          to={`${base}/${p.id}`}
                          className="inline-flex min-h-11 items-center hover:text-primary"
                        >
                          Pedido #{p.id}
                        </Link>
                      </h2>
                      <p className="text-sm">{recibidos ? p.comprador?.nombre : p.taller.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.confirmadoEn)} · {p.lineas.length}{" "}
                        {p.lineas.length === 1 ? "producto" : "productos"}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <p className="text-lg font-semibold tabular-nums text-primary">
                        {mostrarImporte(p.total)}
                      </p>
                      <Button asChild variant="outline">
                        <Link to={`${base}/${p.id}`}>Ver pedido</Link>
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <ListPagination
              page={page}
              totalPages={query.data.totalPages}
              onPage={setPage}
              busy={query.isPlaceholderData}
            />
          </>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
export function ContenidoPedidoConfirmado({
  pedido: p,
  recibido = false,
}: {
  pedido: PedidoConfirmado;
  recibido?: boolean;
}) {
  const solicitud = recibido ? "/panel/solicitudes" : "/solicitudes";
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone="success">Pedido confirmado</StatusBadge>
        <p className="text-sm text-muted-foreground">{formatDate(p.confirmadoEn)}</p>
      </div>
      <p className="text-sm">
        {recibido
          ? `Comprador: ${p.comprador?.nombre ?? "Comprador"}`
          : `Taller: ${p.taller.nombre}`}
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Section
            title="Productos acordados"
            description="Estos datos se conservaron al confirmar el pedido."
          >
            <ol className="divide-y">
              {p.lineas.map((l) => (
                <li key={l.id} className="space-y-2 py-4 first:pt-0">
                  <h3 className="font-semibold">{l.producto.nombre}</h3>
                  <p className="text-sm text-muted-foreground">
                    {l.producto.categoria.nombre} · {MODALIDAD_LABELS[l.modalidad]}
                  </p>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Cantidad</dt>
                      <dd>{l.cantidad}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Precio acordado por unidad</dt>
                      <dd>{mostrarImporte(l.precioUnitario)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Subtotal</dt>
                      <dd>{mostrarImporte(l.subtotal)}</dd>
                    </div>
                    {l.modalidad === "personalizacion" ? (
                      <div>
                        <dt className="text-muted-foreground">Cargo de personalización</dt>
                        <dd>{mostrarImporte(l.cargoPersonalizacion)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {l.caracteristicas ? (
                    <p className="whitespace-pre-wrap text-sm">{l.caracteristicas}</p>
                  ) : null}
                  {l.origenPersonalizacion ? (
                    <p className="text-sm">
                      {l.origenPersonalizacion === "unidad_estandar"
                        ? "Sobre una unidad estándar"
                        : "Fabricación desde cero"}
                    </p>
                  ) : null}
                  {l.fechaComprometida ? (
                    <p className="text-sm">Fecha comprometida: {l.fechaComprometida}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Section>
          <Section title="Entrega acordada">
            <p>{ENTREGA_LABELS[p.modalidadEntrega]}</p>
            {p.descripcionEntrega ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {p.descripcionEntrega}
              </p>
            ) : null}
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Resumen del acuerdo">
            <ResumenContractual datos={p} />
            {p.otrosCargos.length ? (
              <ul className="space-y-2 border-t pt-3 text-sm">
                {p.otrosCargos.map((c) => (
                  <li key={c.posicion} className="flex flex-wrap justify-between gap-2">
                    <span>{c.descripcion}</span>
                    <span>{mostrarImporte(c.monto)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
          <Button asChild variant="outline" className="w-full">
            <Link to={`${solicitud}/${p.solicitud}`}>Ver solicitud y propuesta</Link>
          </Button>
          <p className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
            El registro de pagos y el seguimiento de entregas estarán disponibles en una próxima
            etapa.
          </p>
        </div>
      </div>
    </>
  );
}
export function DetallePedidoConfirmado({ recibido = false }: { recibido?: boolean }) {
  const { id: param } = useParams();
  const id = parseRouteId(param);
  const { usuario } = useSession();
  const query = useQuery({
    queryKey: claves.pedido(usuario?.id, recibido, id ?? 0),
    queryFn: ({ signal }) => consultarPedidoConfirmado(recibido, id!, signal),
    enabled: !!id,
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title={`Pedido #${id ?? "—"}`}
          back={{ to: recibido ? "/panel/pedidos" : "/pedidos", label: "Volver a pedidos" }}
        />
        {!id ? (
          <ErrorState mensaje="El pedido no existe." />
        ) : query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <ContenidoPedidoConfirmado pedido={query.data} recibido={recibido} />
        )}
      </PageContainer>
    </SiteLayout>
  );
}
