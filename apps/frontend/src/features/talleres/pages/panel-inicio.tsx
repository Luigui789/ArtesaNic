import { PageContainer } from "@/components/common/page";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Hammer, Package, Wallet } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { StatusPair } from "@/features/pedidos/components/status-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { artisanSummary, listOrders } from "@/features/pedidos/api";
import { DEMO_ARTISAN_ID } from "@/features/auth/api";
import { getArtisan } from "@/features/talleres/api";
import { listProducts } from "@/features/catalogo/api";
import { formatDate } from "@/lib/format";
import { orderTotal } from "@/lib/order-amounts";
import { useCurrency } from "@/hooks/use-currency";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";

export default function Panel() {
  useDocumentHead({
    title: "Panel del artesano | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Resumen del taller: solicitudes pendientes, pedidos activos, pagos por confirmar y productos publicados.",
      },
      { property: "og:title", content: "Panel del artesano" },
      { property: "og:description", content: "Gestiona las solicitudes y pedidos de tu taller." },
      { property: "og:url", content: "/panel" },
      { name: "robots", content: "noindex" },
    ],
    canonical: "/panel",
  });

  const { usuario } = useSession();
  const { format } = useCurrency();
  const artesanoId = usuario?.artesanoId ?? DEMO_ARTISAN_ID;

  const taller = useQuery({
    queryKey: ["artesano", artesanoId],
    queryFn: () => getArtisan(artesanoId),
  });
  const resumen = useQuery({
    queryKey: ["resumen-artesano", artesanoId],
    queryFn: () => artisanSummary(artesanoId),
  });
  const pedidos = useQuery({
    queryKey: ["pedidos", "artesano", artesanoId],
    queryFn: () => listOrders({ rol: "artesano", artesanoId }),
  });
  const productos = useQuery({
    queryKey: ["catalogo-nombres"],
    queryFn: () => listProducts({ pageSize: 1000 }),
  });

  const nombreProducto = (id: number) =>
    productos.data?.items.find((p) => p.id === id)?.nombre ?? "Producto artesanal";

  const tarjetas = [
    {
      label: "Solicitudes pendientes",
      value: resumen.data?.solicitudesPendientes,
      icon: ClipboardList,
    },
    { label: "Pedidos activos", value: resumen.data?.activos, icon: Hammer },
    { label: "Pagos por confirmar", value: resumen.data?.pagosPorConfirmar, icon: Wallet },
    { label: "Productos publicados", value: resumen.data?.productos, icon: Package },
  ];

  return (
    <SiteLayout>
      <PageContainer className="max-w-6xl">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-secondary">Panel del artesano</p>
            <h1 className="font-display text-3xl font-bold">
              {taller.data?.nombreTaller ?? "Mi taller"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {taller.data
                ? `A cargo de ${taller.data.responsable} · ${taller.data.rubro.nombre}`
                : "Gestión de tu taller y tus pedidos."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="touch-target">
              <Link to="/panel/perfil">Perfil del taller</Link>
            </Button>
            <Button asChild variant="outline" className="touch-target">
              <Link to="/panel/productos">Mis productos</Link>
            </Button>
            <Button asChild className="touch-target">
              <Link to="/panel/pedidos">Ver pedidos</Link>
            </Button>
          </div>
        </header>

        <section className="mt-10" aria-labelledby="recientes">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recientes" className="font-display text-xl font-bold">
              Pedidos recientes
            </h2>
            <Link
              to="/panel/pedidos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {pedidos.isError ? (
              <ErrorState onRetry={() => void pedidos.refetch()} />
            ) : pedidos.isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))
            ) : pedidos.data.length === 0 ? (
              <EmptyState
                titulo="Todavía no recibes solicitudes"
                descripcion="Publica más productos para que los compradores te encuentren."
              />
            ) : (
              pedidos.data.slice(0, 5).map((o) => (
                <article key={o.id} className="rounded-xl border bg-card p-5">
                  <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {o.codigo} · {formatDate(o.creadoEn)} · {o.compradorNombre}
                      </p>
                      <h3 className="mt-1 line-clamp-2 font-medium">
                        {nombreProducto(o.productoId)}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Cantidad: {o.cantidad} · Total {format(orderTotal(o))}
                      </p>
                      <div className="mt-3">
                        <StatusPair estado={o.estado} estadoPago={o.estadoPago} />
                      </div>
                    </div>
                    <Button asChild variant="outline" className="touch-target w-full sm:w-auto">
                      <Link to={`/panel/pedidos/${o.id}`}>Ver pedido</Link>
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <details className="mt-6 rounded-xl border p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Consultar indicadores de la demostración
          </summary>{" "}
          <section
            className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
            aria-label="Resumen del taller"
          >
            {tarjetas.map((t) => (
              <div key={t.label} className="rounded-xl border bg-card p-4 sm:p-5">
                <t.icon className="size-5 text-secondary" aria-hidden="true" />
                <div className="mt-3 text-3xl font-bold">
                  {resumen.isPending ? <Skeleton className="h-9 w-12" /> : (t.value ?? 0)}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.label}</p>
              </div>
            ))}
          </section>
        </details>
      </PageContainer>
    </SiteLayout>
  );
}
