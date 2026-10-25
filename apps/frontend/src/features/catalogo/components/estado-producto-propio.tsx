import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { OwnProduct } from "@/features/catalogo/types";

export const MENSAJE_SIN_REPUBLICAR =
  "Este producto fue retirado por moderación y no puede volver a publicarse.";

/**
 * Estado del producto propio (RF-019). La moderación administrativa se muestra primero y
 * con texto explícito: no depende solo del color.
 */
export function EstadoProductoPropio({ producto }: { producto: OwnProduct }) {
  if (producto.moderacion) return <Badge variant="destructive">Retirado por moderación</Badge>;
  return (
    <Badge variant={producto.publicado ? "default" : "outline"}>
      {producto.publicado ? "Publicado" : "No publicado"}
    </Badge>
  );
}

/** Motivo y fecha de la moderación; nunca la identidad del administrador. */
export function AvisoModeracion({ producto }: { producto: OwnProduct }) {
  const moderacion = producto.moderacion;
  if (!moderacion) return null;
  return (
    <div
      role="note"
      aria-label="Retirado por moderación"
      className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="flex items-center gap-1.5 font-medium text-destructive">
        <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
        Retirado por moderación
      </p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">Motivo:</p>
      <p className="whitespace-pre-line break-words">{moderacion.motivo}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        <time dateTime={moderacion.moderadoEn}>{formatDate(moderacion.moderadoEn)}</time>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        No aparece en el catálogo ni en nuevas solicitudes. Puedes editarlo; los pedidos ya
        acordados no cambian.
      </p>
    </div>
  );
}
