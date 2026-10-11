import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { StatusPair } from "@/features/pedidos/components/status-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_ARTISAN_ID } from "@/features/auth/api";
import { listOrders } from "@/features/pedidos/api";
import { listProducts } from "@/features/catalogo/api";
import { formatDate } from "@/lib/format";
import { orderTotal } from "@/lib/order-amounts";
import { useCurrency } from "@/hooks/use-currency";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";
import { ORDER_STATUS_LABELS } from "@/lib/labels";
import { ORDER_STATES, type OrderStatus } from "@/types";

const FILTROS: (OrderStatus | "todos")[] = ["todos", ...ORDER_STATES];

export default function PedidosTaller() {
  useDocumentHead({
    title: "Pedidos del taller | Panel del artesano",
    meta: [
      {
        name: "description",
        content:
          "Gestiona las solicitudes recibidas: evalúa, produce, marca listo para entrega y confirma pagos.",
      },
      { property: "og:title", content: "Pedidos del taller | Panel del artesano" },
      { property: "og:description", content: "Bandeja de solicitudes y pedidos en curso." },
      { property: "og:url", content: "/panel/pedidos" },
      { name: "robots", content: "noindex" },
    ],
    canonical: "/panel/pedidos",
  });

  const { usuario } = useSession();
  const { format } = useCurrency();
  const artesanoId = usuario?.artesanoId ?? DEMO_ARTISAN_ID;
  const [estado, setEstado] = useState<OrderStatus | "todos">("todos");

  const pedidos = useQuery({
    queryKey: ["pedidos", "artesano", artesanoId, estado],
    queryFn: () => listOrders({ rol: "artesano", artesanoId, estado }),
  });
  const productos = useQuery({
    queryKey: ["catalogo-nombres"],
    queryFn: () => listProducts({ pageSize: 1000 }),
  });

  const nombreProducto = (id: number) =>
    productos.data?.items.find((p) => p.id === id)?.nombre ?? "Producto artesanal";

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          to="/panel"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold">Pedidos del taller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Evalúa cada solicitud antes de producir. El comprador ve cada cambio de estado.
        </p>

        <Tabs
          value={estado}
          onValueChange={(v) => setEstado(v as OrderStatus | "todos")}
          className="mt-6"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {FILTROS.map((f) => (
              <TabsTrigger key={f} value={f} className="min-h-11">
                {f === "todos" ? "Todos" : ORDER_STATUS_LABELS[f]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-6 space-y-3">
          {pedidos.isError ? (
            <ErrorState onRetry={() => void pedidos.refetch()} />
          ) : pedidos.isPending ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))
          ) : pedidos.data.length === 0 ? (
            <EmptyState
              titulo="No hay pedidos en este estado"
              descripcion="Cuando un comprador envíe una solicitud, aparecerá aquí."
            />
          ) : (
            pedidos.data.map((o) => (
              <article key={o.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {o.codigo} · {formatDate(o.creadoEn)} · {o.compradorNombre}
                    </p>
                    <h2 className="mt-1 line-clamp-2 font-display text-lg font-semibold">
                      {nombreProducto(o.productoId)}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Cantidad: {o.cantidad} · Total {format(orderTotal(o))}
                    </p>
                    <div className="mt-3">
                      <StatusPair estado={o.estado} estadoPago={o.estadoPago} />
                    </div>
                  </div>
                  <Button asChild className="touch-target w-full sm:w-auto">
                    <Link to={`/panel/pedidos/${o.id}`}>Gestionar</Link>
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
