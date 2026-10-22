import { PageContainer } from "@/components/common/page";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Facebook,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  Store,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { ProductCard, ProductCardSkeleton } from "@/features/catalogo/components/product-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { getPerfilTaller } from "@/features/talleres/api";
import { ApiError, listCatalog, reintentarSalvoErrorDelCliente } from "@/features/catalogo/api";
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

  // Con VITE_CATALOGO_API=real, GET /api/v1/talleres/{id}/; si no, el taller de la demo.
  const artesano = useQuery({
    queryKey: ["perfil-taller", id],
    queryFn: () => getPerfilTaller(id!),
    enabled: id !== undefined,
    retry: reintentarSalvoErrorDelCliente,
  });
  const productos = useQuery({
    queryKey: ["productos-artesano", id],
    // RF-003: el perfil público muestra el catálogo publicado del taller, paginado.
    queryFn: () => listCatalog({ artesanoId: id!, pageSize: 12 }),
    enabled: id !== undefined,
  });

  if (id === undefined) return <NotFound />;

  // Pendiente, rechazado o inexistente: la API pública responde 404.
  if (artesano.error instanceof ApiError && artesano.error.status === 404) return <NotFound />;

  if (artesano.isError) {
    return (
      <SiteLayout>
        <PageContainer>
          <ErrorState
            mensaje="No pudimos cargar este taller."
            onRetry={() => void artesano.refetch()}
          />
        </PageContainer>
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
  const contactos = [
    { valor: a.telefono, etiqueta: "Teléfono", Icono: Phone },
    { valor: a.whatsapp, etiqueta: "WhatsApp", Icono: MessageCircle },
    { valor: a.facebook, etiqueta: "Facebook", Icono: Facebook },
    { valor: a.instagram, etiqueta: "Instagram", Icono: Instagram },
    { valor: a.sitioWeb, etiqueta: "Sitio web", Icono: Globe },
  ].filter((c) => c.valor);

  return (
    <SiteLayout>
      <div className="relative aspect-[2/1] overflow-hidden bg-surface sm:aspect-[4/1]">
        {a.demo ? (
          <img
            src={a.demo.portadaUrl}
            alt={`Portada del taller ${a.nombre}`}
            width={1024}
            height={768}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <header className="relative z-10 -mt-8 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4 rounded-xl border bg-card p-5 sm:flex sm:items-center">
          {a.demo ? (
            <img
              src={a.demo.fotoUrl}
              alt=""
              className="size-20 shrink-0 rounded-xl border-4 border-card object-cover"
            />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border-4 border-card bg-surface text-muted-foreground">
              <Store className="size-8" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">{a.nombre}</h1>
            {a.demo ? (
              <p className="text-sm text-muted-foreground">A cargo de {a.demo.responsable}</p>
            ) : null}
            <Badge variant="outline" className="mt-2 border-secondary/40 text-secondary">
              {a.rubro}
            </Badge>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-labelledby="historia">
            <h2 id="historia" className="font-display text-xl font-bold">
              Nuestra historia
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {a.historia || "Este taller todavía no ha contado su historia."}
            </p>
            {a.demo ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {a.demo.descripcion}
              </p>
            ) : null}
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
                <span>{a.direccion}</span>
              </li>
              {a.horario ? (
                <li className="flex items-start gap-2">
                  <Clock
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{a.horario}</span>
                </li>
              ) : null}
              {contactos.map(({ valor, etiqueta, Icono }) => (
                <li key={etiqueta} className="flex items-start gap-2">
                  <Icono
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-all">
                    {etiqueta}: {valor}
                  </span>
                </li>
              ))}
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
          ) : productos.data.items.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                titulo="Este taller aún no tiene productos publicados"
                descripcion="Vuelve más adelante o explora otros talleres del catálogo."
              />
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {productos.data.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {productos.data.totalPages > 1 ? (
                <Link
                  to={`/catalogo?artesanoId=${id}`}
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  Ver los {productos.data.total} productos en el catálogo
                </Link>
              ) : null}
            </>
          )}
        </section>
      </div>
    </SiteLayout>
  );
}
