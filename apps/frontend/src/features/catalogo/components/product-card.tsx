import { Link } from "react-router";
import { ImageOff } from "lucide-react";
import type { CatalogProduct } from "@/features/catalogo/types";
import { useCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { MODALIDAD_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Tarjeta del catálogo (RF-003). Muestra solo datos con respaldo en el contrato:
 * fotografía, categoría, nombre, modalidades, taller y precio.
 */
export function ProductCard({ product }: { product: CatalogProduct }) {
  const { format } = useCurrency();
  return (
    <article className="group h-full overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background">
      <Link
        to={`/producto/${product.id}`}
        className="flex h-full flex-col focus-visible:outline-none"
      >
        <ProductImage
          src={product.imagen}
          className="aspect-[4/3] transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <Badge variant="outline" className="w-fit border-secondary/40 text-secondary">
            {product.categoria.nombre}
          </Badge>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
            {product.nombre}
          </h3>
          <ModalidadesTexto modalidades={product.modalidades} />
          {product.taller.nombre ? (
            <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">
              {product.taller.nombre}
            </p>
          ) : null}
          <p className="mt-auto pt-1 text-base font-bold text-primary sm:text-lg">
            {format(product.precio)}
          </p>
        </div>
      </Link>
    </article>
  );
}

/** Modalidades de venta como texto, no solo como color o icono (RNF-001.3). */
export function ModalidadesTexto({
  modalidades,
  className,
}: {
  modalidades: CatalogProduct["modalidades"];
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {modalidades.map((m) => MODALIDAD_LABELS[m]).join(" · ")}
    </p>
  );
}

/**
 * Fotografía persistida, o placeholder neutral para históricos sin fotografía.
 */
export function ProductImage({
  src,
  alt = "",
  className,
}: {
  src?: string | undefined;
  alt?: string;
  className?: string;
}) {
  return (
    <div className="overflow-hidden bg-surface">
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={1024}
          height={768}
          className={cn("h-full w-full object-cover", className)}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground",
            className,
          )}
        >
          <ImageOff className="size-8" aria-hidden="true" />
          <span className="text-xs">Sin fotografía</span>
        </div>
      )}
    </div>
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
