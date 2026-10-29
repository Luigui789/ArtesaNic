import { PageContainer } from "@/components/common/page";
import { Link, useParams } from "react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  Clock,
  Facebook,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  ArrowRight,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import {
  ProductCard,
  ProductCardSkeleton,
  ProductImage,
} from "@/features/catalogo/components/product-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { perfilTallerQuery } from "@/features/talleres/queries";
import type { PerfilTaller } from "@/features/talleres/types";
import { UbicacionPublicaTaller } from "@/features/talleres/components/ubicacion-publica-taller";
import {
  ApiError,
  listCatalog,
  type CatalogProduct,
  type Paginated,
} from "@/features/catalogo/api";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";

/** «Información del taller»: dirección textual, horario y contactos publicados. */
function InformacionTaller({ taller: a }: { taller: PerfilTaller }) {
  const contactos = [
    { valor: a.telefono, etiqueta: "Teléfono", Icono: Phone },
    { valor: a.whatsapp, etiqueta: "WhatsApp", Icono: MessageCircle },
    { valor: a.facebook, etiqueta: "Facebook", Icono: Facebook },
    { valor: a.instagram, etiqueta: "Instagram", Icono: Instagram },
    { valor: a.sitioWeb, etiqueta: "Sitio web", Icono: Globe },
  ].filter((c) => c.valor);
  return (
    <aside
      className="min-w-0 scroll-mt-24 rounded-xl border bg-card p-5"
      aria-labelledby="contacto"
    >
      <h2 id="contacto" className="text-base font-semibold">
        Información del taller
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 break-words">{a.direccion}</span>
        </li>
        {a.horario ? (
          <li className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 break-words">{a.horario}</span>
          </li>
        ) : null}
        {contactos.map(({ valor, etiqueta, Icono }) => (
          <li key={etiqueta} className="flex items-start gap-2">
            <Icono className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="break-all">
              {etiqueta}: {valor}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** «Productos publicados» del taller (RF-003), con la consulta que lanza la página. */
function ProductosTaller({
  id,
  productos,
}: {
  id: number;
  productos: UseQueryResult<Paginated<CatalogProduct>>;
}) {
  return (
    <section className="scroll-mt-24 space-y-4" aria-labelledby="productos-taller">
      <h2 id="productos-taller" className="font-display text-xl font-bold">
        Productos publicados
      </h2>
      {productos.isError ? (
        <div className="mt-4">
          <ErrorState onRetry={() => void productos.refetch()} />
        </div>
      ) : productos.isPending ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {productos.data.items.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {productos.data.total > 4 ? (
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
  );
}

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
  const artesano = useQuery(perfilTallerQuery(id));
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
  const portadaUrl = a.imagenPortada ?? a.demo?.portadaUrl;
  const perfilUrl = a.imagenPerfil ?? a.demo?.fotoUrl;

  return (
    <SiteLayout>
      <PageContainer>
        {portadaUrl ? (
          <div className="overflow-hidden rounded-2xl">
            <ProductImage
              src={portadaUrl}
              alt={`Portada del taller ${a.nombre}`}
              className="h-32 sm:h-48"
            />
          </div>
        ) : null}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="w-20 shrink-0 overflow-hidden rounded-xl border">
            <ProductImage src={perfilUrl} alt={`Taller ${a.nombre}`} className="aspect-square" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge
              variant="outline"
              className="max-w-full [overflow-wrap:anywhere] border-secondary/40 text-secondary"
            >
              {a.rubro}
            </Badge>
            <h1 className="mt-2 break-words font-display text-3xl font-semibold sm:text-4xl">
              {a.nombre}
            </h1>
            {a.demo ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                A cargo de {a.demo.responsable}
              </p>
            ) : null}
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{a.direccion}</span>
            </p>
          </div>
        </header>
        <nav aria-label="Explorar este taller" className="flex flex-wrap gap-2 border-b pb-4">
          <a
            href="#productos-taller"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Ver productos <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          <a
            href="#historia"
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium hover:underline"
          >
            Sobre el taller
          </a>
          {a.ubicacionMapa ? (
            <a
              href="#ubicacion-taller"
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium hover:underline"
            >
              Ubicación
            </a>
          ) : null}
          <a
            href="#contacto"
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium hover:underline"
          >
            Contacto
          </a>
        </nav>
        <ProductosTaller id={id} productos={productos} />
        <section className="scroll-mt-24 border-t pt-6" aria-labelledby="historia">
          <h2 id="historia" className="font-display text-xl font-semibold">
            Nuestra historia
          </h2>
          {a.historia.length > 240 ? (
            <>
              <p className="mt-3 max-w-3xl break-words text-base leading-relaxed text-muted-foreground">
                {a.historia.slice(0, 180)}…
              </p>
              <details className="mt-2 max-w-3xl">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary">
                  Conocer la historia del taller
                </summary>
                <p className="whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground">
                  {a.historia}
                </p>
              </details>
            </>
          ) : (
            <p className="mt-3 max-w-3xl whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground">
              {a.historia || "Este taller todavía no ha contado su historia."}
            </p>
          )}
          {a.demo ? (
            <p className="mt-3 max-w-3xl break-words text-sm leading-relaxed text-muted-foreground">
              {a.demo.descripcion}
            </p>
          ) : null}
        </section>
        <div
          className={
            a.ubicacionMapa
              ? "grid items-start gap-6 border-t pt-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
              : "max-w-2xl border-t pt-6"
          }
        >
          <UbicacionPublicaTaller taller={a} />
          <InformacionTaller taller={a} />
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
