import { Link } from "react-router";
import type { Product } from "@/types";
import { useCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { UnitAvailability } from "./unit-availability";

/**
 * Tarjeta del catálogo (RF-003). Muestra solo datos con respaldo: fotografía,
 * rubro, nombre, taller, precio y unidades disponibles derivadas por el mock.
 */
export function ProductCard({ product, artisanName }: { product: Product; artisanName?: string }) {
  const { format } = useCurrency();
  return (
    <article className="group h-full overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background">
      <Link
        to={`/producto/${product.id}`}
        className="flex h-full flex-col focus-visible:outline-none"
      >
        <div className="aspect-[4/3] overflow-hidden bg-surface">
          <img
            src={product.imagenes[0]}
            alt=""
            loading="lazy"
            width={1024}
            height={768}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <Badge variant="outline" className="w-fit border-secondary/40 text-secondary">
            {product.categoria.nombre}
          </Badge>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
            {product.nombre}
          </h3>
          <UnitAvailability product={product} />
          {artisanName ? (
            <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">{artisanName}</p>
          ) : null}
          <p className="mt-auto pt-1 text-base font-bold text-primary sm:text-lg">
            {format(product.precio)}
          </p>
        </div>
      </Link>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="aspect-[4/3] animate-pulse bg-surface" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-surface" />
        <div className="h-4 w-full animate-pulse rounded bg-surface" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
      </div>
    </div>
  );
}
