import { Link } from "react-router";
import type { MarcadorTaller } from "@/features/talleres/types";

/**
 * Contenido liviano del popup de un taller en el mapa público (FEAT-GEO-04): nombre,
 * rubro, dirección y, en el mapa general, el enlace interno al perfil. Sin Leaflet,
 * para poder renderizarse en Node.
 */
export function PopupTaller({ marcador, enlace }: { marcador: MarcadorTaller; enlace: boolean }) {
  return (
    <div className="min-w-0 max-w-56 space-y-1 font-sans">
      <p className="m-0 break-words text-sm font-semibold text-foreground">{marcador.nombre}</p>
      <p className="m-0 text-xs text-muted-foreground">{marcador.rubro}</p>
      <p className="m-0 break-words text-xs text-muted-foreground">{marcador.direccion}</p>
      {enlace ? (
        <Link
          to={`/artesano/${marcador.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Ver taller
        </Link>
      ) : null}
    </div>
  );
}
