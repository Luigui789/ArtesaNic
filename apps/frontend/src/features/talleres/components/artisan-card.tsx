import { Link } from "react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { ProductImage } from "@/features/catalogo/components/product-card";
import type { PerfilTaller } from "@/features/talleres/types";
import { Badge } from "@/components/ui/badge";

export function ArtisanCard({ artisan }: { artisan: PerfilTaller }) {
  const imagen = artisan.imagenPerfil ?? artisan.imagenPortada ?? artisan.demo?.fotoUrl;
  return (
    <article className="h-full min-w-0 overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background">
      <Link
        to={`/artesano/${artisan.id}`}
        aria-label={`Ver taller: ${artisan.nombre}`}
        className="flex h-full flex-col focus-visible:outline-none"
      >
        <ProductImage src={imagen} alt={`Taller ${artisan.nombre}`} className="aspect-[16/9]" />
        <div className="flex flex-1 flex-col items-start gap-2 p-4">
          <h3 className="line-clamp-2 break-words text-base font-semibold">{artisan.nombre}</h3>
          <Badge
            variant="outline"
            className="max-w-full [overflow-wrap:anywhere] border-secondary/40 text-secondary"
          >
            {artisan.rubro}
          </Badge>
          {artisan.historia ? (
            <p className="line-clamp-2 break-words text-sm text-muted-foreground">
              {artisan.historia}
            </p>
          ) : null}
          <p className="flex w-full min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 min-w-0 break-words">{artisan.direccion}</span>
          </p>
          <span className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
            Ver taller <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  );
}
