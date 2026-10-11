import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { StatusPair } from "@/features/pedidos/components/status-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function MisPedidos() {
  useDocumentHead({
    title: "Mis pedidos | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Consulta el estado de tus solicitudes de pedidos artesanales: evaluación, producción, pago y entrega.",
      },
      { property: "og:title", content: "Mis pedidos | Artesanías de Masaya" },
      { property: "og:description", content: "Seguimiento de tus pedidos a talleres de Masaya." },
      { property: "og:url", content: "/pedidos" },
    ],
    canonical: "/pedidos",
  });

  const { usuario } = useSession();
  const { format } = useCurrency();
  const [estado, setEstado] = useState<OrderStatus | "todos">("todos");

  const pedidos = useQuery({
    queryKey: ["pedidos", "comprador", estado],
    queryFn: () => listOrders({ rol: "comprador", estado }),
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
        <h1 className="font-display text-3xl font-bold">Mis pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sesión de {usuario?.nombre ?? "invitada"}. Aquí ves cada solicitud y su avance.
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
              titulo="Aún no tienes pedidos en este estado"
              descripcion="Explora el catálogo y envía tu primera solicitud a un taller de Masaya."
              accion={
                <Button asChild className="touch-target">
                  <Link to="/catalogo">Ver catálogo</Link>
                </Button>
              }
            />
          ) : (
            pedidos.data.map((o) => (
              <article key={o.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {o.codigo} · {formatDate(o.creadoEn)}
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
                  <Button asChild variant="outline" className="touch-target w-full sm:w-auto">
                    <Link to={`/pedidos/${o.id}`}>Ver detalle</Link>
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
