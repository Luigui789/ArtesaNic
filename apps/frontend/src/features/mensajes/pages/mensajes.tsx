import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { OrderChat } from "@/features/mensajes/components/order-chat";
import { OrderStatusBadge } from "@/features/pedidos/components/status-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getArtisan } from "@/features/talleres/api";
import { listOrders } from "@/features/pedidos/api";
import { listProducts } from "@/features/catalogo/api";
import { DEMO_ARTISAN_ID } from "@/features/auth/api";
import { chatMode } from "@/lib/order-state";
import { formatDate } from "@/lib/format";
import { useSession } from "@/features/auth/use-session";
import { useNotifications } from "@/features/notificaciones/use-notifications";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

export default function MensajesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Un identificador inválido no es un 404: se cae en la primera conversación.
  const seleccionado = parseRouteId(searchParams.get("pedido"));
  const { usuario } = useSession();
  const rol = usuario?.rol ?? "comprador";
  const { noLeidos, marcarLeido } = useNotifications();

  useDocumentHead({
    title: "Mensajes por pedido | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Conversa con el taller artesanal sobre cada pedido: detalles, materiales y coordinación de entrega.",
      },
      { property: "og:title", content: "Mensajes por pedido | Artesanías de Masaya" },
      {
        property: "og:description",
        content: "Mensajería simulada asociada a cada pedido artesanal de Masaya.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    canonical: "/mensajes",
  });

  const pedidos = useQuery({
    queryKey: ["mensajes-pedidos", rol],
    queryFn: () => listOrders(rol === "artesano" ? { rol, artesanoId: DEMO_ARTISAN_ID } : { rol }),
  });
  const productos = useQuery({
    queryKey: ["catalogo-nombres"],
    queryFn: () => listProducts({ pageSize: 1000 }),
  });

  const nombreProducto = (id: number) =>
    productos.data?.items.find((p) => p.id === id)?.nombre ?? "Producto artesanal";

  const conversaciones = (pedidos.data ?? []).filter((o) => chatMode(o.estado) !== "none");
  const actual =
    conversaciones.find((o) => o.id === seleccionado) ?? conversaciones[0] ?? undefined;

  const taller = useQuery({
    queryKey: ["artesano", actual?.artesanoId],
    queryFn: () => getArtisan(actual!.artesanoId),
    enabled: rol === "comprador" && !!actual,
  });

  const seleccionar = (id: number) => {
    marcarLeido(id);
    setSearchParams({ pedido: String(id) });
  };

  // La conversación visible se marca como leída.
  useEffect(() => {
    if (actual) marcarLeido(actual.id);
  }, [actual, marcarLeido]);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold">Mensajes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada conversación pertenece a un pedido. La mensajería se habilita cuando el artesano
          acepta la solicitud.
        </p>

        {pedidos.isPending ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        ) : pedidos.isError ? (
          <div className="mt-6">
            <ErrorState
              mensaje="No pudimos cargar tus conversaciones."
              onRetry={() => void pedidos.refetch()}
            />
          </div>
        ) : conversaciones.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              titulo="Todavía no tienes conversaciones"
              descripcion="Cuando envíes una solicitud de pedido podrás conversar aquí con el taller artesanal."
              accion={
                <Button asChild className="touch-target">
                  <Link to="/catalogo">Explorar el catálogo</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
            <ul aria-label="Conversaciones" className="space-y-2">
              {conversaciones.map((o) => {
                const activo = actual?.id === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => seleccionar(o.id)}
                      aria-current={activo ? "true" : undefined}
                      className={cn(
                        "w-full rounded-xl border bg-card p-3 text-left transition-colors hover:bg-surface",
                        activo && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          {o.codigo}
                          {(noLeidos[o.id] ?? 0) > 0 ? (
                            <span
                              aria-label={`${noLeidos[o.id]} mensajes nuevos`}
                              className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground"
                            >
                              {noLeidos[o.id]}
                            </span>
                          ) : null}
                        </span>
                        <OrderStatusBadge estado={o.estado} />
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm">{nombreProducto(o.productoId)}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        {formatDate(o.creadoEn)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-3">
              {actual ? (
                <>
                  <div className="rounded-xl border bg-card px-4 py-3">
                    <h2 className="font-display text-lg font-semibold">
                      {actual.codigo} · {nombreProducto(actual.productoId)}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {rol === "artesano"
                        ? actual.compradorNombre
                        : (taller.data?.nombreTaller ?? "Taller artesanal")}
                    </p>
                  </div>
                  <OrderChat pedidoId={actual.id} estado={actual.estado} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
