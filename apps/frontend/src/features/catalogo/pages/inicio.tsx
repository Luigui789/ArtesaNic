import { Link, useLocation } from "react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, HandCoins, PackageCheck, ThumbsUp } from "lucide-react";
import heroImg from "@/assets/hero-masaya.jpg";
import { CATEGORY_IMAGE } from "@/lib/category-images";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/layout/site-layout";
import { ProductCard, ProductCardSkeleton } from "@/features/catalogo/components/product-card";
import { ArtisanCard } from "@/features/talleres/components/artisan-card";
import { ErrorState } from "@/components/common/states";
import { listArtisans } from "@/features/talleres/api";
import { listCategories, listProducts } from "@/features/catalogo/api";
import { useDocumentHead } from "@/hooks/use-document-head";

/** RF-009, RF-005, RF-011, RF-010 y RF-016, en el orden en que ocurren. */
const PASOS = [
  {
    icon: ClipboardList,
    titulo: "Envías una solicitud",
    texto: "Eliges una pieza e indicas la cantidad y los detalles que necesitas.",
  },
  {
    icon: ThumbsUp,
    titulo: "El taller la evalúa",
    texto: "El artesano revisa la solicitud y la acepta o la rechaza, indicando el motivo.",
  },
  {
    icon: HandCoins,
    titulo: "Registras el pago",
    texto:
      "Pagas fuera de la plataforma, por transferencia u otro medio, y registras la referencia. El taller confirma que lo recibió.",
  },
  {
    icon: PackageCheck,
    titulo: "Elaboración y entrega",
    texto:
      "Con el pago confirmado, el taller prepara tu pedido y coordinan la entrega por la mensajería del pedido.",
  },
];

export default function Index() {
  useDocumentHead({
    title: "ArtesaNic | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Catálogo de piezas artesanales de los talleres de Masaya. Solicita tu pedido directamente al taller.",
      },
      { property: "og:title", content: "ArtesaNic | Artesanías de Masaya" },
      {
        property: "og:description",
        content: "Piezas artesanales de las PYMEs de Masaya, solicitadas directamente al taller.",
      },
      { property: "og:url", content: "/" },
    ],
    canonical: "/",
  });

  // Enlaces a «Cómo funciona» desde otras páginas.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  const categorias = useQuery({ queryKey: ["categorias"], queryFn: listCategories });
  // Contrato §12.1: la portada no muestra «destacados», sino lo más reciente.
  const productos = useQuery({
    queryKey: ["catalogo", "portada"],
    queryFn: () => listProducts({ orden: "recientes", pageSize: 8 }),
  });
  const artesanos = useQuery({ queryKey: ["artesanos"], queryFn: listArtisans });

  const nombreTaller = (id: number) => artesanos.data?.find((a) => a.id === id)?.nombreTaller ?? "";

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b">
        <img
          src={heroImg}
          alt="Artesano tejiendo una hamaca en un taller de Masaya"
          width={1600}
          height={1080}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        {/* Velo para la legibilidad del texto; la fotografía queda visible a la derecha. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-background/85 md:bg-transparent md:bg-linear-to-r md:from-background md:via-background/90 md:to-background/15"
        />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              ArtesaNic · Masaya, Nicaragua
            </p>
            <h1 className="mt-3 text-balance font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Artesanía de Masaya, directo del taller
            </h1>
            <p className="mt-5 max-w-xl text-base text-foreground/80 sm:text-lg">
              ArtesaNic reúne las piezas de los talleres artesanales del municipio. Cada compra
              empieza con una solicitud al taller: el artesano la revisa, la acepta y coordinan
              contigo el pago y la entrega.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="touch-target text-base">
                <Link to="/catalogo">
                  Explorar el catálogo
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="touch-target text-base">
                <a href="#como-funciona">Cómo funciona</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Categorías */}
      {/*
        Sección de descubrimiento: si las categorías no cargan se oculta por
        completo, en lugar de plantar un estado de error en la portada.
      */}
      {categorias.isError ? null : (
        <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="titulo-categorias">
          <h2 id="titulo-categorias" className="font-display text-2xl font-bold sm:text-3xl">
            Rubros artesanales
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Explora el catálogo por el oficio que más te interesa.
          </p>
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

      {/* Productos recientes */}
      <section className="mx-auto max-w-7xl px-4 py-8" aria-labelledby="titulo-recientes">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titulo-recientes" className="font-display text-2xl font-bold sm:text-3xl">
              Productos recientes
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Las últimas piezas publicadas por los talleres.
            </p>
          </div>
          <Link
            to="/catalogo"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
          >
            Ver todo el catálogo
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
              : productos.data.items.map((p) => (
                  <ProductCard key={p.id} product={p} artisanName={nombreTaller(p.artesanoId)} />
                ))}
          </div>
        )}
      </section>

      {/* Cómo funciona */}
      <section
        id="como-funciona"
        className="scroll-mt-20 bg-surface"
        aria-labelledby="titulo-modelo"
      >
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 id="titulo-modelo" className="font-display text-2xl font-bold sm:text-3xl">
            Cómo funciona una compra
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            El pedido y el pago avanzan por separado, y el taller no empieza a elaborar tu pedido
            hasta confirmar que recibió el pago.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <p.icon className="size-5 text-secondary" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-semibold">{p.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <Button asChild size="lg" className="touch-target">
              <Link to="/catalogo">Solicitar una pieza</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Talleres */}
      <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="titulo-talleres">
        <h2 id="titulo-talleres" className="font-display text-2xl font-bold sm:text-3xl">
          Talleres de Masaya
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cada taller publica su historia, su horario y sus productos.
        </p>
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
    </SiteLayout>
  );
}
