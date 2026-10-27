import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { CATEGORY_IMAGE } from "@/lib/category-images";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/layout/public-layout";
import { ProductCard, ProductCardSkeleton } from "@/features/catalogo/components/product-card";
import { ArtisanCard } from "@/features/talleres/components/artisan-card";
import { ErrorState } from "@/components/common/states";
import { listPerfilesTalleres } from "@/features/talleres/api";
import { listCatalog, listCategories } from "@/features/catalogo/api";
import { useDocumentHead } from "@/hooks/use-document-head";

export default function Index() {
  useDocumentHead({
    title: "Descubrir | ArtesaNic",
    meta: [
      {
        name: "description",
        content:
          "Descubre nuevas piezas, categorías y talleres artesanales disponibles en ArtesaNic.",
      },
      { property: "og:title", content: "Descubrir | ArtesaNic" },
      {
        property: "og:description",
        content:
          "Descubre nuevas piezas, categorías y talleres artesanales disponibles en ArtesaNic.",
      },
      { property: "og:url", content: "/descubrir" },
    ],
    canonical: "/descubrir",
  });

  const categorias = useQuery({ queryKey: ["categorias"], queryFn: listCategories });
  // Contrato §12.1: se muestran los productos más recientes publicados.
  const productos = useQuery({
    queryKey: ["catalogo", "portada"],
    queryFn: () => listCatalog({ orden: "recientes", pageSize: 8 }),
  });
  const artesanos = useQuery({
    queryKey: ["talleres-publicos"],
    queryFn: ({ signal }) => listPerfilesTalleres(signal),
  });

  return (
    <PublicLayout>
      {/* Hero corto editorial */}
      <section className="border-b bg-surface py-12 sm:py-16">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Exploración y novedades · Masaya
            </p>
            <h1 className="mt-2 text-balance font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Descubre lo nuevo en ArtesaNic
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Recorre las piezas recién publicadas por los talleres artesanales del municipio,
              explora los oficios tradicionales y conoce a quienes elaboran cada creación.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="touch-target">
              <Link to="/catalogo">
                <Search className="size-4" aria-hidden="true" />
                Ir al marketplace completo
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categorías */}
      {categorias.isError ? null : (
        <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="titulo-categorias">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="titulo-categorias" className="font-display text-2xl font-bold sm:text-3xl">
                Rubros artesanales
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Explora el catálogo por el oficio tradicional que más te interesa.
              </p>
            </div>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {categorias.isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i}>
                    <div className="overflow-hidden rounded-xl border bg-card">
                      <div className="aspect-square animate-pulse bg-surface" />
                      <div className="flex min-h-11 items-center justify-center px-2">
                        <div className="h-4 w-20 animate-pulse rounded bg-surface" />
                      </div>
                    </div>
                  </li>
                ))
              : categorias.data.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/catalogo?categoria=${c.codigo}`}
                      className="group block overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40"
                    >
                      <div className="aspect-square overflow-hidden bg-surface">
                        <img
                          src={CATEGORY_IMAGE[c.codigo]}
                          alt=""
                          loading="lazy"
                          width={1024}
                          height={768}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <span className="flex min-h-11 items-center justify-center px-2 text-center text-sm font-medium">
                        {c.nombre}
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
        </section>
      )}

      {/* Nuevas piezas / productos recientes */}
      <section className="mx-auto max-w-7xl px-4 py-8" aria-labelledby="titulo-recientes">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titulo-recientes" className="font-display text-2xl font-bold sm:text-3xl">
              Nuevas piezas
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Productos recién publicados por los talleres de Masaya.
            </p>
          </div>
          <Link
            to="/catalogo"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todo en el marketplace
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {productos.isError ? (
          <div className="mt-6">
            <ErrorState onRetry={() => void productos.refetch()} />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {productos.isPending
              ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : productos.data.items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Talleres para descubrir */}
      <section
        id="talleres"
        className="mx-auto scroll-mt-20 max-w-7xl px-4 py-12"
        aria-labelledby="titulo-talleres"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titulo-talleres" className="font-display text-2xl font-bold sm:text-3xl">
              Talleres para descubrir
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Conoce algunos de nuestros talleres artesanales, su historia, su horario y sus
              productos.
            </p>
          </div>
        </div>
        {artesanos.isError ? (
          <div className="mt-6">
            <ErrorState onRetry={() => void artesanos.refetch()} />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {artesanos.isPending
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-64 animate-pulse rounded-xl bg-surface" />
                ))
              : artesanos.data.slice(0, 4).map((a) => <ArtisanCard key={a.id} artisan={a} />)}
          </div>
        )}
      </section>

      {/* Pequeño CTA al marketplace */}
      <section className="mx-auto max-w-7xl px-4 pt-4" aria-labelledby="titulo-cta-catalogo">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="max-w-xl">
            <h2 id="titulo-cta-catalogo" className="font-display text-2xl font-bold">
              ¿Buscas una pieza o taller en particular?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
              Utiliza el buscador y los filtros por categoría, rango de precio y taller en el
              marketplace completo.
            </p>
          </div>
          <Button asChild size="lg" className="w-full touch-target shrink-0 sm:w-auto">
            <Link to="/catalogo">
              Explorar marketplace
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
