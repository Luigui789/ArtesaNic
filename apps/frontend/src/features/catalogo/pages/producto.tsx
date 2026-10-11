import { UnitAvailability } from "@/features/catalogo/components/unit-availability";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { getProduct } from "@/features/catalogo/api";
import { useCurrency } from "@/hooks/use-currency";
import { TASA_CAMBIO } from "@/lib/format";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";

export default function DetalleProducto() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = parseRouteId(idParam);
  const { format } = useCurrency();
  const [imagen, setImagen] = useState(0);

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
    queryFn: () => getProduct(id!),
    enabled: id !== undefined,
  });
  const artesano = useQuery({
    queryKey: ["artesano", producto.data?.artesanoId],
    queryFn: () => getArtisan(producto.data!.artesanoId),
    enabled: !!producto.data,
  });

  if (id === undefined) return <NotFound />;

  if (producto.isError) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <ErrorState
            mensaje="No pudimos cargar este producto."
            onRetry={() => void producto.refetch()}
          />
        </div>
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
      <div className="mx-auto max-w-7xl px-4 py-6">
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
            <div className="aspect-[4/3] overflow-hidden rounded-xl border bg-surface">
              <img
                src={p.imagenes[imagen]}
                alt={p.nombre}
                width={1024}
                height={768}
                className="h-full w-full object-cover"
              />
            </div>
            {p.imagenes.length > 1 ? (
              <ul className="mt-3 flex gap-3">
                {p.imagenes.map((img, i) => (
                  <li key={img}>
                    <button
                      type="button"
                      onClick={() => setImagen(i)}
                      aria-label={`Ver imagen ${i + 1} de ${p.nombre}`}
                      aria-pressed={imagen === i}
                      className={`size-20 overflow-hidden rounded-lg border-2 ${
                        imagen === i ? "border-primary" : "border-border"
                      }`}
                    >
                      <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <Badge variant="outline" className="border-secondary/40 text-secondary">
              {p.categoria.nombre}
            </Badge>
            <h1 className="mt-3 font-display text-3xl font-bold">{p.nombre}</h1>

            <UnitAvailability product={p} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-3xl font-bold text-primary">{format(p.precio)}</p>
              <CurrencySwitcher />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tasa simulada: 1 US$ = C$ {TASA_CAMBIO}
            </p>

            <div className="mt-6">
              <h2 className="text-base font-semibold">Descripción</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {p.descripcion}
              </p>
            </div>

            <div className="mt-8">
              {p.unidadesDisponibles > 0 ? (
                <Button asChild size="lg" className="w-full touch-target text-base sm:w-auto">
                  <Link to={`/solicitar/${p.id}`}>
                    Solicitar pedido
                    <ArrowRight className="size-5" aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" disabled aria-describedby="no-units">
                    Solicitar pedido
                  </Button>
                  <p id="no-units" className="mt-2 text-sm">
                    Sin unidades disponibles. Las reservas y las unidades por clasificar no pueden
                    solicitarse.
                  </p>
                </>
              )}
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Enviarás una solicitud al taller. El artesano la revisa y, si la acepta, coordinan
                el pago y la entrega.
              </p>
            </div>

            {artesano.data ? (
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
      </div>
    </SiteLayout>
  );
}
