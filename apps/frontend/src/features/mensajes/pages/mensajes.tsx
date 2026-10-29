import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, MessageSquare } from "lucide-react";
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

const META_MENSAJES = [
  {
    name: "description",
    content:
      "Conversa con la otra parte sobre tus pedidos confirmados: coordinación, avances y entrega.",
  },
  { property: "og:title", content: "Mensajes por pedido | ArtesaNic" },
  {
    property: "og:description",
    content: "Conversaciones privadas asociadas a cada pedido confirmado entre comprador y taller.",
  },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary" },
];

function resumenLineas(pedido: PedidoConfirmado): string {
  const primera = pedido.lineas[0];
  if (!primera) return `Pedido #${pedido.id}`;
  if (pedido.lineas.length === 1) return primera.producto.nombre;
  return `${primera.producto.nombre} y ${pedido.lineas.length - 1} más`;
}

function contraparte(pedido: PedidoConfirmado, recibido: boolean): string {
  if (!recibido) return pedido.taller.nombre;
  return pedido.comprador?.nombre ?? "Comprador";
}

function combinarConversaciones(
  itemsPagina: PedidoConfirmado[] | undefined,
  detalle: PedidoConfirmado | undefined,
): PedidoConfirmado[] {
  const base = itemsPagina ?? [];
  if (!detalle || base.some((p) => p.id === detalle.id)) return base;
  return [detalle, ...base];
}

function resolverPedidoActual(
  parametroInvalido: boolean,
  pedidoSolicitado: number | undefined,
  enPagina: PedidoConfirmado | undefined,
  detalle: PedidoConfirmado | undefined,
  conversaciones: PedidoConfirmado[],
): PedidoConfirmado | undefined {
  if (parametroInvalido) return undefined;
  if (pedidoSolicitado !== undefined) return enPagina ?? detalle;
  return conversaciones[0];
}

function TarjetaConversacion({
  pedido,
  recibido,
  activo,
  onSelect,
}: {
  pedido: PedidoConfirmado;
  recibido: boolean;
  activo: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onSelect(pedido.id)}
        aria-current={activo ? "true" : undefined}
        className={cn(
          "min-h-11 w-full rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-surface",
          activo && "border-2 border-primary/40 bg-primary/5",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-display text-base font-semibold">
            Pedido #{pedido.id}
            {activo ? <Check className="size-4" aria-label="Conversación seleccionada" /> : null}
          </span>
          <EstadoPedidoBadge estado={pedido.estado} />
        </div>
        <p className="mt-1.5 break-words text-sm font-medium">{resumenLineas(pedido)}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {contraparte(pedido, recibido)} · {mostrarImporte(pedido.total)}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Confirmado el {formatDate(pedido.confirmadoEn)}</span>
        </p>
      </button>
    </li>
  );
}

function ListaConversaciones({
  conversaciones,
  recibido,
  actualId,
  page,
  totalPages,
  busy,
  onSelect,
  onPage,
}: {
  conversaciones: PedidoConfirmado[];
  recibido: boolean;
  actualId: number | undefined;
  page: number;
  totalPages: number | undefined;
  busy: boolean;
  onSelect: (id: number) => void;
  onPage: (page: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-4">
      {conversaciones.length > 0 ? (
        <ul aria-label="Conversaciones por pedido" className="space-y-2.5">
          {conversaciones.map((p) => (
            <TarjetaConversacion
              key={p.id}
              pedido={p}
              recibido={recibido}
              activo={actualId === p.id}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          No hay otros pedidos confirmados en esta página.
        </p>
      )}
      {totalPages !== undefined ? (
        <ListPagination page={page} totalPages={totalPages} onPage={onPage} busy={busy} />
      ) : null}
    </div>
  );
}

function AvisoEnlaceInvalido({
  mostrarBoton,
  onLimpiar,
}: {
  mostrarBoton: boolean;
  onLimpiar: () => void;
}) {
  return (
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
      {mostrarBoton ? (
        <Button
          type="button"
          variant="outline"
          onClick={onLimpiar}
          className="min-h-11 touch-target"
        >
          Abrir primera conversación disponible
        </Button>
      ) : null}
    </section>
  );
}

function PanelConversacionActiva({
  actual,
  recibido,
  rutaBasePedidos,
}: {
  actual: PedidoConfirmado;
  recibido: boolean;
  rutaBasePedidos: string;
}) {
  const etiquetaParte = recibido
    ? `Comprador: ${contraparte(actual, true)}`
    : `Taller: ${contraparte(actual, false)}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="min-w-0 [overflow-wrap:anywhere] font-display text-lg font-semibold">
              Pedido #{actual.id}
            </h2>
            <EstadoPedidoBadge estado={actual.estado} />
          </div>
          <p className="line-clamp-1 break-words text-sm">{resumenLineas(actual)}</p>
          <p className="line-clamp-2 break-words text-sm text-muted-foreground">{etiquetaParte}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-11 touch-target">
          <Link to={`${rutaBasePedidos}/${actual.id}`}>Ver detalle del pedido</Link>
        </Button>
      </div>
      <OrderChat key={actual.id} pedido={actual.id} estado={actual.estado} />
    </>
  );
}

function ColumnaConversacion({
  parametroInvalido,
  cargandoDetalle,
  errorDetalle,
  actual,
  recibido,
  rutaBasePedidos,
  tieneConversaciones,
  onLimpiar,
  onReintentarDetalle,
}: {
  parametroInvalido: boolean;
  cargandoDetalle: boolean;
  errorDetalle: unknown;
  actual: PedidoConfirmado | undefined;
  recibido: boolean;
  rutaBasePedidos: string;
  tieneConversaciones: boolean;
  onLimpiar: () => void;
  onReintentarDetalle: () => void;
}) {
  if (parametroInvalido) {
    return (
      <div className="min-w-0 space-y-4">
        <AvisoEnlaceInvalido mostrarBoton={tieneConversaciones} onLimpiar={onLimpiar} />
      </div>
    );
  }
  if (cargandoDetalle) {
    return (
      <div className="min-w-0 space-y-4">
        <LoadingState label="Abriendo conversación del pedido…" />
      </div>
    );
  }
  if (errorDetalle !== null) {
    return (
      <div className="min-w-0 space-y-4">
        <ErrorState mensaje={mensajeDominio(errorDetalle)} onRetry={onReintentarDetalle} />
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4">
      {actual ? (
        <PanelConversacionActiva
          actual={actual}
          recibido={recibido}
          rutaBasePedidos={rutaBasePedidos}
        />
      ) : null}
    </div>
  );
}

function useConversacionesPedido(
  usuarioId: number | undefined,
  recibido: boolean,
  page: number,
  parametro: string | null,
) {
  const tieneParametro = Boolean(parametro && parametro.trim() !== "");
  const pedidoSolicitado = parseRouteId(parametro);
  const parametroInvalido = tieneParametro && pedidoSolicitado === undefined;

  const pedidosQuery = useQuery({
    queryKey: [...claves.pedidos(usuarioId), recibido, page],
    queryFn: ({ signal }) => listarPedidosConfirmados(recibido, page, signal),
    enabled: usuarioId !== undefined,
    placeholderData: keepPreviousData,
    retry: reintentarSalvoErrorDelCliente,
  });

  const enPagina =
    pedidoSolicitado !== undefined
      ? pedidosQuery.data?.items.find((p) => p.id === pedidoSolicitado)
      : undefined;

  const consultarExterno =
    usuarioId !== undefined &&
    pedidoSolicitado !== undefined &&
    !pedidosQuery.isPending &&
    !enPagina;

  const detalleQuery = useQuery({
    queryKey: claves.pedido(usuarioId, recibido, pedidoSolicitado ?? 0),
    queryFn: ({ signal }) => consultarPedidoConfirmado(recibido, pedidoSolicitado ?? 0, signal),
    enabled: consultarExterno,
    retry: reintentarSalvoErrorDelCliente,
  });

  const conversaciones = combinarConversaciones(pedidosQuery.data?.items, detalleQuery.data);
  const actual = resolverPedidoActual(
    parametroInvalido,
    pedidoSolicitado,
    enPagina,
    detalleQuery.data,
    conversaciones,
  );

  return {
    pedidosQuery,
    detalleQuery,
    conversaciones,
    actual,
    tieneParametro,
    parametroInvalido,
    cargandoDetalle: consultarExterno && detalleQuery.isPending,
    errorDetalle: consultarExterno && detalleQuery.isError ? detalleQuery.error : null,
  };
}

export default function MensajesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const { usuario } = useSession();
  const recibido = usuario?.rol === "artesano";

  useDocumentHead({
    title: "Mensajes por pedido | ArtesaNic",
    meta: META_MENSAJES,
    canonical: "/mensajes",
  });

  const estado = useConversacionesPedido(usuario?.id, recibido, page, searchParams.get("pedido"));

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

  const rutaBasePedidos = recibido ? "/panel/pedidos" : "/pedidos";
  const rutaSolicitudes = recibido ? "/panel/solicitudes" : "/solicitudes";
  const descripcionVacia = recibido
    ? "Cuando un comprador confirme una propuesta de tu taller, podrás conversar aquí sobre el pedido."
    : "Cuando aceptes la propuesta de una solicitud y se confirme el pedido, podrás conversar aquí con el taller.";

  return (
    <SiteLayout>
      <PageContainer className="max-w-6xl">
        <PageHeader
          title="Mensajes"
          description="Elige un pedido para conversar con la otra parte sobre sus detalles y entrega."
          action={
            <Button asChild variant="outline" className="min-h-11 touch-target">
              <Link to={rutaBasePedidos}>
                {recibido ? "Ver pedidos del taller" : "Ver mis pedidos"}
              </Link>
            </Button>
          }
        />

        {estado.pedidosQuery.isPending ? (
          <LoadingState label="Cargando conversaciones…" />
        ) : estado.pedidosQuery.isError ? (
          <ErrorState
            mensaje={mensajeDominio(estado.pedidosQuery.error)}
            onRetry={() => void estado.pedidosQuery.refetch()}
          />
        ) : estado.conversaciones.length === 0 && !estado.tieneParametro ? (
          <EmptyState
            titulo="Todavía no tienes conversaciones"
            descripcion={descripcionVacia}
            accion={
              <Button asChild variant="outline" className="min-h-11 touch-target">
                <Link to={rutaSolicitudes}>Ver solicitudes</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
            <details className="min-w-0 rounded-xl border bg-card p-4 lg:hidden">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
                Elegir conversación{estado.actual ? ` · Pedido #${estado.actual.id}` : ""}
              </summary>
              <ListaConversaciones
                conversaciones={estado.conversaciones}
                recibido={recibido}
                actualId={estado.actual?.id}
                page={page}
                totalPages={estado.pedidosQuery.data?.totalPages}
                busy={estado.pedidosQuery.isPlaceholderData}
                onSelect={seleccionar}
                onPage={setPage}
              />
            </details>
            <div className="hidden min-w-0 lg:block">
              <ListaConversaciones
                conversaciones={estado.conversaciones}
                recibido={recibido}
                actualId={estado.actual?.id}
                page={page}
                totalPages={estado.pedidosQuery.data?.totalPages}
                busy={estado.pedidosQuery.isPlaceholderData}
                onSelect={seleccionar}
                onPage={setPage}
              />
            </div>
            <ColumnaConversacion
              parametroInvalido={estado.parametroInvalido}
              cargandoDetalle={estado.cargandoDetalle}
              errorDetalle={estado.errorDetalle}
              actual={estado.actual}
              recibido={recibido}
              rutaBasePedidos={rutaBasePedidos}
              tieneConversaciones={estado.conversaciones.length > 0}
              onLimpiar={limpiarSeleccion}
              onReintentarDetalle={() => void estado.detalleQuery.refetch()}
            />
          </div>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
