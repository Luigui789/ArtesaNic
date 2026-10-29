import { PageContainer } from "@/components/common/page";
import { Link, useParams } from "react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, MapPin } from "lucide-react";
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
import { perfilTallerQuery } from "@/features/talleres/queries";
import {
  ApiError,
  getCatalogProduct,
  reintentarSalvoErrorDelCliente,
} from "@/features/catalogo/api";
import { ProductImage } from "@/features/catalogo/components/product-card";
import { useCurrency } from "@/hooks/use-currency";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";
import type { CatalogProduct } from "@/features/catalogo/types";
import type { getPerfilTaller } from "@/features/talleres/api";

function stockAvailability(stock: CatalogProduct["disponibleStock"]) {
  if (typeof stock !== "number") return "";
  if (!(stock > 0)) return " Sin unidades disponibles ahora.";
  return ` ${stock} ${stock === 1 ? "unidad disponible" : "unidades disponibles"}.`;
}

function ProductOptions({ p }: { p: CatalogProduct }) {
  return (
    <section className="mt-5 space-y-2" aria-labelledby="opciones-producto">
      <h2 id="opciones-producto" className="text-base font-semibold">
        Cómo podés solicitarlo
      </h2>
      <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
        {p.modalidades.includes("stock") ? (
          <li>
            Pieza estándar ya elaborada.
            {stockAvailability(p.disponibleStock)}
          </li>
        ) : null}
        {p.modalidades.includes("produccion") ? (
          <li>Pieza estándar elaborada por cantidad, según lo que acordés con el taller.</li>
        ) : null}
        {p.modalidades.includes("personalizacion") ? (
          <li>Personalizado: podés indicar los detalles que querés al preparar tu solicitud.</li>
        ) : null}
      </ul>
    </section>
  );
}

function ProductWorkshop({
  p,
  artesano,
}: {
  p: CatalogProduct;
  artesano: UseQueryResult<Awaited<ReturnType<typeof getPerfilTaller>>>;
}) {
  return (
    <section className="mt-6 border-t pt-5" aria-labelledby="taller">
      <h2 id="taller" className="text-base font-semibold">
        Elaborado por
      </h2>
      <div className="mt-3 flex items-start gap-3">
        {artesano.data ? (
          <div className="w-16 shrink-0 overflow-hidden rounded-lg">
            <ProductImage
              src={artesano.data.imagenPerfil ?? artesano.data.demo?.fotoUrl}
              alt={`Taller ${artesano.data.nombre}`}
              className="aspect-square"
            />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="break-words font-semibold">{p.taller.nombre}</p>
          {artesano.data ? (
            <>
              <p className="break-words text-sm text-muted-foreground">{artesano.data.rubro}</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{artesano.data.direccion}</span>
              </p>
            </>
          ) : null}
          <Link
            to={`/artesano/${p.taller.id}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            Ver taller <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          {artesano.isError ? (
            <p className="text-sm text-muted-foreground">
              No pudimos cargar los datos adicionales. Podés visitar el taller para reintentar.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

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
  const artesano = useQuery(perfilTallerQuery(producto.data?.taller.id));

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
              <BreadcrumbLink asChild className="inline-flex min-h-11 items-center">
                <Link to="/">Inicio</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild className="inline-flex min-h-11 items-center">
                <Link to="/catalogo">Catálogo</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0 max-w-full">
              <BreadcrumbPage className="min-w-0 truncate">{p.nombre}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid gap-6 md:grid-cols-2 lg:gap-10">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-xl border">
              <ProductImage src={p.imagen} alt={p.nombre} className="aspect-[4/3]" />
            </div>
          </div>

          <div className="min-w-0">
            <Badge
              variant="outline"
              className="max-w-full [overflow-wrap:anywhere] border-secondary/40 text-secondary"
            >
              {p.categoria.nombre}
            </Badge>
            <h1 className="mt-3 break-words font-display text-3xl font-semibold sm:text-4xl">
              {p.nombre}
            </h1>
            <Link
              to={`/artesano/${p.taller.id}`}
              className="mt-2 inline-flex min-h-11 max-w-full items-center break-words text-sm text-secondary underline-offset-4 hover:underline"
            >
              Hecho por {p.taller.nombre}
            </Link>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-3xl font-bold text-primary">{format(p.precio)}</p>
              <CurrencySwitcher />
            </div>
            {currency === "USD" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Valor en dólares solo informativo: el precio acordado es en córdobas.
              </p>
            ) : null}

            <ProductOptions p={p} />

            <div className="mt-5">
              <Button asChild size="lg" className="w-full touch-target text-base sm:w-auto">
                <Link to={`/solicitar/${p.id}`}>
                  Solicitar producto
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </Button>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Contale al taller qué necesitás. Revisará tu solicitud y te enviará una propuesta
                para acordar los detalles antes de confirmar el pedido.
              </p>
            </div>

            <p className="mt-3 line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">
              {p.descripcion}
            </p>
            <a
              href="#descripcion-producto"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Leer descripción completa
            </a>
            <ProductWorkshop p={p} artesano={artesano} />
          </div>
        </div>
        <section className="max-w-3xl border-t pt-6" aria-labelledby="descripcion-producto">
          <h2 id="descripcion-producto" className="font-display text-xl font-semibold">
            Sobre esta pieza
          </h2>
          <p className="mt-3 whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground">
            {p.descripcion}
          </p>
        </section>
      </PageContainer>
    </SiteLayout>
  );
}
