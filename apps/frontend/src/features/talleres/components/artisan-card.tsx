import { Link } from "react-router";
import { MapPin } from "lucide-react";
import type { Artisan } from "@/types";
import { Badge } from "@/components/ui/badge";

export function ArtisanCard({ artisan }: { artisan: Artisan }) {
  return (
    <article className="h-full overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background">
      <Link to={`/artesano/${artisan.id}`} className="block h-full focus-visible:outline-none">
        <div className="aspect-[16/9] overflow-hidden bg-surface">
          {/* La foto del taller muestra su oficio; la portada se reserva para el perfil. */}
          <img
            src={artisan.fotoUrl}
            alt=""
            loading="lazy"
            width={1024}
            height={768}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="space-y-2 p-4">
          <h3 className="text-base font-semibold">{artisan.nombreTaller}</h3>
          <Badge variant="outline" className="border-secondary/40 text-secondary">
            {artisan.rubro.nombre}
          </Badge>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{artisan.ubicacion}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
