import { PageContainer } from "@/components/common/page";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { CurrencySwitcher } from "@/components/common/currency-switcher";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getArtisan } from "@/features/talleres/api";
import {
  ApiError,
  catalogoReal,
  getCatalogProduct,
  reintentarSalvoErrorDelCliente,
} from "@/features/catalogo/api";
import { ModalidadesTexto, ProductImage } from "@/features/catalogo/components/product-card";
import { useCurrency } from "@/hooks/use-currency";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";

export default function DetalleProducto() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = parseRouteId(idParam);
  const { format, currency } = useCurrency();

  useDocumentHead({
    title: "Producto artesanal | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Detalle del producto artesanal: precio, taller que lo elabora y solicitud de pedido personalizado.",
      },
      { property: "og:title", content: "Producto artesanal | Artesanías de Masaya" },
      { property: "og:description", content: "Pieza artesanal de un taller de Masaya." },
      { property: "og:url", content: `/producto/${id}` },
    ],
    canonical: `/producto/${id}`,
  });

  const producto = useQuery({
    queryKey: ["producto", id],
    queryFn: () => getCatalogProduct(id!),
    enabled: id !== undefined,
    // Un 404 (despublicado o de un taller no aprobado) no se reintenta.
    retry: reintentarSalvoErrorDelCliente,
  });
  // Los datos ampliados del taller siguen en el servidor simulado (dominio talleres).
  const artesano = useQuery({
    queryKey: ["artesano", producto.data?.taller.id],
    queryFn: () => getArtisan(producto.data!.taller.id),
    enabled: !!producto.data && !catalogoReal,
  });

  if (id === undefined) return <NotFound />;

  if (producto.error instanceof ApiError && producto.error.status === 404) return <NotFound />;

  if (producto.isError) {
    return (
      <SiteLayout>
        <PageContainer>
          <ErrorState
            mensaje="No pudimos cargar este producto."
            onRetry={() => void producto.refetch()}
          />
        </PageContainer>
      </SiteLayout>
    );
  }

  if (producto.isPending) {
    return (
      <SiteLayout>
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-2">
          <div className="aspect-[4/3] animate-pulse rounded-xl bg-surface" />
          <div className="space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded bg-surface" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-surface" />
            <div className="h-24 w-full animate-pulse rounded bg-surface" />
          </div>
        </div>
      </SiteLayout>
    );
  }

  const p = producto.data;

  return (
    <SiteLayout>
      <PageContainer>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Inicio</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/catalogo">Catálogo</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="line-clamp-1">{p.nombre}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <div className="overflow-hidden rounded-xl border">
              <ProductImage src={p.imagen} alt={p.nombre} className="aspect-[4/3]" />
            </div>
          </div>

          <div>
            <Badge variant="outline" className="border-secondary/40 text-secondary">
              {p.categoria.nombre}
            </Badge>
            <h1 className="mt-3 text-balance font-display text-3xl font-semibold sm:text-4xl">
              {p.nombre}
            </h1>
            <Link
              to={`/artesano/${p.taller.id}`}
              className="mt-2 inline-flex min-h-11 items-center text-sm text-secondary underline-offset-4 hover:underline"
            >
              Hecho por {p.taller.nombre}
            </Link>

            <ModalidadesTexto modalidades={p.modalidades} className="mt-2" />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-3xl font-bold text-primary">{format(p.precio)}</p>
              <CurrencySwitcher />
            </div>
            {currency === "USD" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Valor en dólares solo informativo: el precio acordado es en córdobas.
              </p>
            ) : null}

            <div className="mt-6">
              <h2 className="text-base font-semibold">Descripción</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {p.descripcion}
              </p>
            </div>

            <div className="mt-8">
              <Button asChild size="lg" className="w-full touch-target text-base sm:w-auto">
                <Link to={`/solicitar/${p.id}`}>
                  Preparar solicitud
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </Button>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                El taller revisará cada renglón. Confirmar una propuesta y coordinar pago y entrega
                son etapas posteriores.
              </p>
            </div>

            {catalogoReal ? (
              <section className="mt-8 rounded-xl border bg-card p-5" aria-labelledby="taller">
                <h2 id="taller" className="text-base font-semibold">
                  Elaborado por
                </h2>
                <p className="mt-2 font-medium">{p.taller.nombre}</p>
                <Link
                  to={`/artesano/${p.taller.id}`}
                  className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  Ver perfil del taller
                </Link>
              </section>
            ) : artesano.data ? (
              <section className="mt-8 rounded-xl border bg-card p-5" aria-labelledby="taller">
                <h2 id="taller" className="text-base font-semibold">
                  Elaborado por
                </h2>
                <div className="mt-3 flex items-start gap-3">
                  <img
                    src={artesano.data.fotoUrl}
                    alt=""
                    loading="lazy"
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{artesano.data.nombreTaller}</p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-4 shrink-0" aria-hidden="true" />
                      {artesano.data.ubicacion}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-4 shrink-0" aria-hidden="true" />
                      {artesano.data.horario}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="size-4 shrink-0" aria-hidden="true" />
                      {artesano.data.telefono}
                    </p>
                    <Link
                      to={`/artesano/${artesano.data.id}`}
                      className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                    >
                      Ver perfil del taller
                    </Link>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
