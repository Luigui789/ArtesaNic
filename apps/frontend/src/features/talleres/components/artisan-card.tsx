import { Link } from "react-router";
import { MapPin, Store } from "lucide-react";
import type { PerfilTaller } from "@/features/talleres/types";
import { Badge } from "@/components/ui/badge";

export function ArtisanCard({ artisan }: { artisan: PerfilTaller }) {
  const imagen = artisan.imagenPerfil ?? artisan.imagenPortada ?? artisan.demo?.fotoUrl;
  return (
    <article className="h-full overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background">
      <Link to={`/artesano/${artisan.id}`} className="block h-full focus-visible:outline-none">
        <div className="aspect-[16/9] overflow-hidden bg-surface">
          {imagen ? (
            <img
              src={imagen}
              alt=""
              loading="lazy"
              width={1024}
              height={768}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Store className="size-8" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="space-y-2 p-4">
          <h3 className="text-base font-semibold">{artisan.nombre}</h3>
          <Badge variant="outline" className="border-secondary/40 text-secondary">
            {artisan.rubro}
          </Badge>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{artisan.direccion}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
