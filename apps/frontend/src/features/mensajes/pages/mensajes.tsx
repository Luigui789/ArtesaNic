import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader } from "@/components/common/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListPagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { OrderChat } from "@/features/mensajes/components/order-chat";
import {
  consultarPedidoConfirmado,
  listarPedidosConfirmados,
  type PedidoConfirmado,
} from "@/features/pedidos/confirmados";
import { EstadoPedidoBadge } from "@/features/pedidos/pages/confirmados";
import { mensajeDominio } from "@/lib/errores-dominio";
import { formatDate } from "@/lib/format";
import { reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mostrarImporte } from "@/lib/importes";
import { claves } from "@/lib/query-keys";
import { parseRouteId } from "@/lib/route-id";
import { cn } from "@/lib/utils";
import { useDocumentHead } from "@/hooks/use-document-head";

function resumenLineas(pedido: PedidoConfirmado): string {
  const primera = pedido.lineas[0];
  if (!primera) return `Pedido #${pedido.id}`;
  if (pedido.lineas.length === 1) return primera.producto.nombre;
  return `${primera.producto.nombre} y ${pedido.lineas.length - 1} más`;
}

function contraparte(pedido: PedidoConfirmado, recibido: boolean): string {
  return recibido ? (pedido.comprador?.nombre ?? "Comprador") : pedido.taller.nombre;
}

export default function MensajesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const { usuario } = useSession();
  const recibido = usuario?.rol === "artesano";

  const parametro = searchParams.get("pedido");
  const tieneParametro = parametro !== null && parametro.trim() !== "";
  const pedidoSolicitado = parseRouteId(parametro);
  const parametroInvalido = tieneParametro && pedidoSolicitado === undefined;

  useDocumentHead({
    title: "Mensajes por pedido | ArtesaNic",
    meta: [
      {
        name: "description",
        content:
          "Conversa con la otra parte sobre tus pedidos confirmados: coordinación, avances y entrega.",
      },
      { property: "og:title", content: "Mensajes por pedido | ArtesaNic" },
      {
        property: "og:description",
        content:
          "Conversaciones privadas asociadas a cada pedido confirmado entre comprador y taller.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    canonical: "/mensajes",
  });

  const pedidosQuery = useQuery({
    queryKey: [...claves.pedidos(usuario?.id), recibido, page],
    queryFn: ({ signal }) => listarPedidosConfirmados(recibido, page, signal),
    enabled: Boolean(usuario),
    placeholderData: keepPreviousData,
    retry: reintentarSalvoErrorDelCliente,
  });

  const enPagina =
    pedidoSolicitado !== undefined
      ? pedidosQuery.data?.items.find((p) => p.id === pedidoSolicitado)
      : undefined;

  const detalleQuery = useQuery({
    queryKey: claves.pedido(usuario?.id, recibido, pedidoSolicitado ?? 0),
    queryFn: ({ signal }) => consultarPedidoConfirmado(recibido, pedidoSolicitado ?? 0, signal),
    enabled:
      Boolean(usuario) && pedidoSolicitado !== undefined && !pedidosQuery.isPending && !enPagina,
    retry: reintentarSalvoErrorDelCliente,
  });

  const seleccionar = (id: number) => {
    const siguientes = new URLSearchParams(searchParams);
    siguientes.set("pedido", String(id));
    setSearchParams(siguientes);
  };

  const limpiarSeleccion = () => {
    const siguientes = new URLSearchParams(searchParams);
    siguientes.delete("pedido");
    setSearchParams(siguientes);
  };

  const itemsPagina = pedidosQuery.data?.items ?? [];
  const pedidoExterno =
    detalleQuery.data && !itemsPagina.some((p) => p.id === detalleQuery.data.id)
      ? detalleQuery.data
      : undefined;
  const conversaciones = pedidoExterno ? [pedidoExterno, ...itemsPagina] : itemsPagina;

  const actual: PedidoConfirmado | undefined = parametroInvalido
    ? undefined
    : pedidoSolicitado !== undefined
      ? (enPagina ?? detalleQuery.data)
      : conversaciones[0];

  const rutaBasePedidos = recibido ? "/panel/pedidos" : "/pedidos";
  const rutaSolicitudes = recibido ? "/panel/solicitudes" : "/solicitudes";

  return (
    <SiteLayout>
      <PageContainer className="max-w-6xl">
        <PageHeader
          title="Mensajes"
          description="Cada conversación privada pertenece a un pedido confirmado entre el comprador y el taller."
          action={
            <Button asChild variant="outline" className="min-h-11 touch-target">
              <Link to={rutaBasePedidos}>
                {recibido ? "Ver pedidos del taller" : "Ver mis pedidos"}
              </Link>
            </Button>
          }
        />

        {pedidosQuery.isPending ? (
          <LoadingState label="Cargando conversaciones…" />
        ) : pedidosQuery.isError ? (
          <ErrorState
            mensaje={mensajeDominio(pedidosQuery.error)}
            onRetry={() => void pedidosQuery.refetch()}
          />
        ) : conversaciones.length === 0 && !tieneParametro ? (
          <EmptyState
            titulo="Todavía no tienes conversaciones"
            descripcion={
              recibido
                ? "Cuando un comprador confirme una propuesta de tu taller, podrás conversar aquí sobre el pedido."
                : "Cuando aceptes la propuesta de una solicitud y se confirme el pedido, podrás conversar aquí con el taller."
            }
            accion={
              <Button asChild variant="outline" className="min-h-11 touch-target">
                <Link to={rutaSolicitudes}>Ver solicitudes</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {conversaciones.length > 0 ? (
                <ul aria-label="Conversaciones por pedido" className="space-y-2.5">
                  {conversaciones.map((p) => {
                    const activo = actual?.id === p.id;
                    return (
                      <li key={p.id} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => seleccionar(p.id)}
                          aria-current={activo ? "true" : undefined}
                          className={cn(
                            "min-h-11 w-full rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-surface",
                            activo && "border-primary/40 bg-primary/5",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-display text-base font-semibold">
                              Pedido #{p.id}
                            </span>
                            <EstadoPedidoBadge estado={p.estado} />
                          </div>
                          <p className="mt-1.5 break-words text-sm font-medium">
                            {resumenLineas(p)}
                          </p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {contraparte(p, recibido)} · {mostrarImporte(p.total)}
                          </p>
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
                            <span>Confirmado el {formatDate(p.confirmadoEn)}</span>
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                  No hay otros pedidos confirmados en esta página.
                </p>
              )}
              {pedidosQuery.data ? (
                <ListPagination
                  page={page}
                  totalPages={pedidosQuery.data.totalPages}
                  onPage={setPage}
                  busy={pedidosQuery.isPlaceholderData}
                />
              ) : null}
            </div>

            <div className="min-w-0 space-y-4">
              {parametroInvalido ? (
                <section
                  aria-labelledby="pedido-invalido-titulo"
                  className="rounded-xl border bg-card p-5 space-y-3"
                >
                  <h2 id="pedido-invalido-titulo" className="font-display text-lg font-semibold">
                    Enlace de conversación no válido
                  </h2>
                  <p className="break-words text-sm text-muted-foreground">
                    El identificador de pedido indicado en la dirección no es válido. Selecciona una
                    conversación de la lista para abrir sus mensajes.
                  </p>
                  {conversaciones.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={limpiarSeleccion}
                      className="min-h-11 touch-target"
                    >
                      Abrir primera conversación disponible
                    </Button>
                  ) : null}
                </section>
              ) : pedidoSolicitado !== undefined && !enPagina && detalleQuery.isPending ? (
                <LoadingState label="Abriendo conversación del pedido…" />
              ) : pedidoSolicitado !== undefined && !enPagina && detalleQuery.isError ? (
                <ErrorState
                  mensaje={mensajeDominio(detalleQuery.error)}
                  onRetry={() => void detalleQuery.refetch()}
                />
              ) : actual ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="font-display text-lg font-semibold">
                          Pedido #{actual.id} · {resumenLineas(actual)}
                        </h2>
                        <EstadoPedidoBadge estado={actual.estado} />
                      </div>
                      <p className="break-words text-sm text-muted-foreground">
                        {recibido
                          ? `Comprador: ${contraparte(actual, true)}`
                          : `Taller: ${contraparte(actual, false)}`}{" "}
                        · Total acordado: {mostrarImporte(actual.total)}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="min-h-11 touch-target">
                      <Link to={`${rutaBasePedidos}/${actual.id}`}>Ver detalle del pedido</Link>
                    </Button>
                  </div>
                  <OrderChat key={actual.id} pedido={actual.id} estado={actual.estado} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
