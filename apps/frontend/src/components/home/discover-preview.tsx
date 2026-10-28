import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, Shapes } from "lucide-react";
import { categoriasQuery, productosRecientesQuery } from "@/features/catalogo/queries";
import { talleresPublicosQuery } from "@/features/talleres/queries";
import { ProductCard, ProductCardSkeleton } from "@/features/catalogo/components/product-card";
import { ArtisanCard } from "@/features/talleres/components/artisan-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { CATEGORY_IMAGE } from "@/lib/category-images";

const SECTION = "mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 sm:py-10";
const CTA =
  "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4";

export function DiscoverPreview() {
  return (
    <>
      <RecentProducts />
      <CategoryPreview />
      <WorkshopPreview />
    </>
  );
}

function RecentProducts() {
  const productos = useQuery(productosRecientesQuery);
  return (
    <section className={SECTION} aria-labelledby="home-recientes">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="home-recientes" className="font-display text-2xl font-semibold sm:text-3xl">
            Recién publicados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Encontrá una pieza para vos, tu casa o para regalar.
          </p>
        </div>
        <Link to="/catalogo" className={CTA}>
          Ver todos los productos <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {productos.isError ? (
        <ErrorState
          mensaje="No pudimos cargar los productos recientes. Podés explorar el catálogo o volver a intentar."
          onRetry={() => void productos.refetch()}
        />
      ) : productos.isPending ? (
        <div
          role="status"
          aria-label="Cargando productos recientes"
          className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : productos.data.items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {productos.data.items.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          titulo="Pronto habrá nuevas piezas"
          descripcion="Los productos publicados por los talleres aparecerán aquí. Mientras tanto, podés conocer a quienes los elaboran."
        />
      )}
    </section>
  );
}

function CategoryPreview() {
  const categorias = useQuery(categoriasQuery);
  return (
    <section className="border-y bg-surface/30" aria-labelledby="home-categorias">
      <div className={SECTION}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Oficios que dan forma a Masaya
            </p>
            <h2
              id="home-categorias"
              className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
            >
              Explorá por categoría
            </h2>
          </div>
          <Link to="/descubrir#categorias" className={CTA}>
            Ver todas las categorías <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {categorias.isError ? (
          <ErrorState
            mensaje="No pudimos cargar las categorías. Los productos siguen disponibles en el catálogo."
            onRetry={() => void categorias.refetch()}
          />
        ) : categorias.isPending ? (
          <div
            role="status"
            aria-label="Cargando categorías"
            className="grid grid-cols-2 gap-3 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : categorias.data.length ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {categorias.data.slice(0, 6).map((c) => (
              <li key={c.id} className="min-w-0">
                <Link
                  to={`/catalogo?${new URLSearchParams({ categoria: c.codigo })}`}
                  className="group flex h-full min-h-20 min-w-0 items-center gap-3 rounded-xl border bg-card p-2 transition-colors hover:border-primary"
                >
                  {CATEGORY_IMAGE[c.codigo] ? (
                    <img
                      src={CATEGORY_IMAGE[c.codigo]}
                      alt=""
                      loading="lazy"
                      width={80}
                      height={80}
                      className="size-12 shrink-0 rounded-lg object-cover sm:size-16"
                    />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface text-secondary sm:size-16">
                      <Shapes className="size-6" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 break-words text-sm font-medium sm:text-base">
                    {c.nombre}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Las categorías estarán disponibles cuando se publiquen. Podés explorar el catálogo
            completo.
          </p>
        )}
      </div>
    </section>
  );
}

function WorkshopPreview() {
  const talleres = useQuery(talleresPublicosQuery);
  return (
    <section
      id="talleres-home"
      className={`${SECTION} scroll-mt-24`}
      aria-labelledby="home-talleres"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="home-talleres" className="font-display text-2xl font-semibold sm:text-3xl">
            Conocé las manos detrás de cada pieza
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Historias, oficios y talleres de Masaya.
          </p>
        </div>
        <Link to="/descubrir#talleres" className={CTA}>
          Explorar talleres <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {talleres.isError ? (
        <ErrorState
          mensaje="No pudimos cargar los talleres. Podés seguir explorando los productos."
          onRetry={() => void talleres.refetch()}
        />
      ) : talleres.isPending ? (
        <div
          role="status"
          aria-label="Cargando talleres"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : talleres.data.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {talleres.data.slice(0, 3).map((t) => (
            <ArtisanCard key={t.id} artisan={t} />
          ))}
        </div>
      ) : (
        <EmptyState
          titulo="Nuevos talleres por conocer"
          descripcion="Cuando haya talleres disponibles, podrás conocer sus historias y productos aquí."
        />
      )}
    </section>
  );
}
