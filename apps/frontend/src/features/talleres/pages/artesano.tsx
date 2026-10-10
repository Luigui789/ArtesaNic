import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Facebook, Instagram, MapPin, Phone, MessageCircle } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { ProductCard, ProductCardSkeleton } from "@/features/catalogo/components/product-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { getArtisan } from "@/features/talleres/api";
import { listMyProducts } from "@/features/catalogo/api";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";

export default function PerfilArtesano() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = parseRouteId(idParam);

  useDocumentHead({
    title: "Artesano | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Perfil del taller artesanal: historia, rubro, ubicación, horario, contacto y productos publicados.",
      },
      { property: "og:title", content: "Artesano | Artesanías de Masaya" },
      { property: "og:description", content: "Conoce el taller que elabora cada pieza en Masaya." },
      { property: "og:url", content: `/artesano/${id}` },
    ],
    canonical: `/artesano/${id}`,
  });

  const artesano = useQuery({
    queryKey: ["artesano", id],
    queryFn: () => getArtisan(id!),
    enabled: id !== undefined,
  });
  const productos = useQuery({
    queryKey: ["productos-artesano", id],
    queryFn: () => listMyProducts(id!),
    enabled: id !== undefined,
  });

  if (id === undefined) return <NotFound />;

  if (artesano.isError) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <ErrorState
            mensaje="No pudimos cargar este taller."
            onRetry={() => void artesano.refetch()}
          />
        </div>
      </SiteLayout>
    );
  }

  if (artesano.isPending) {
    return (
      <SiteLayout>
        <div className="h-56 animate-pulse bg-surface" />
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
          <div className="h-8 w-64 animate-pulse rounded bg-surface" />
          <div className="h-24 w-full animate-pulse rounded bg-surface" />
        </div>
      </SiteLayout>
    );
  }

  const a = artesano.data;

  return (
    <SiteLayout>
      <div className="relative aspect-[2/1] overflow-hidden bg-surface sm:aspect-[4/1]">
        <img
          src={a.portadaUrl}
          alt={`Portada del taller ${a.nombreTaller}`}
          width={1024}
          height={768}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <header className="relative z-10 -mt-8 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4 rounded-xl border bg-card p-5 sm:flex sm:items-center">
          <img
            src={a.fotoUrl}
            alt=""
            className="size-20 shrink-0 rounded-xl border-4 border-card object-cover"
          />
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">
              {a.nombreTaller}
            </h1>
            <p className="text-sm text-muted-foreground">A cargo de {a.responsable}</p>
            <Badge variant="outline" className="mt-2 border-secondary/40 text-secondary">
              {a.rubro.nombre}
            </Badge>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-labelledby="historia">
            <h2 id="historia" className="font-display text-xl font-bold">
              Nuestra historia
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.historia}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.descripcion}</p>
          </section>

          <aside className="rounded-xl border bg-card p-5" aria-labelledby="contacto">
            <h2 id="contacto" className="text-base font-semibold">
              Información del taller
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>{a.ubicacion}</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>{a.horario}</span>
              </li>
              <li className="flex items-start gap-2">
                <Phone
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>Teléfono: {a.telefono}</span>
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>WhatsApp: {a.whatsapp}</span>
              </li>
              {a.redes.facebook ? (
                <li className="flex items-start gap-2">
                  <Facebook
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-all">{a.redes.facebook}</span>
                </li>
              ) : null}
              {a.redes.instagram ? (
                <li className="flex items-start gap-2">
                  <Instagram
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-all">{a.redes.instagram}</span>
                </li>
              ) : null}
            </ul>
          </aside>
        </div>

        <section className="mt-12 pb-4" aria-labelledby="productos-taller">
          <h2 id="productos-taller" className="font-display text-xl font-bold">
            Productos publicados
          </h2>
          {productos.isError ? (
            <div className="mt-4">
              <ErrorState onRetry={() => void productos.refetch()} />
            </div>
          ) : productos.isPending ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : productos.data.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                titulo="Este taller aún no tiene productos publicados"
                descripcion="Vuelve más adelante o explora otros talleres del catálogo."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {productos.data.slice(0, 12).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    </SiteLayout>
  );
}
