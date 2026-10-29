import { Suspense, lazy, useCallback, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarcadorTaller } from "@/features/talleres/types";
import { cn } from "@/lib/utils";
import { LimiteErrorMapa, useEnNavegador } from "./mapa-diferido";

// Leaflet necesita `window` al importarse: se carga aparte y solo en el navegador.
const MapaTalleresPublicoLeaflet = lazy(() => import("./mapa-talleres-publico-leaflet"));

type Props = {
  marcadores: readonly MarcadorTaller[];
  /** Nombre accesible de la región del mapa. */
  etiqueta: string;
  /** Popup con «Ver taller» hacia `/artesano/{id}` (mapa general). */
  enlaces?: boolean;
  /** Aviso si Leaflet o los tiles fallan; la página sigue funcionando sin el mapa. */
  mensajeError: string;
  className?: string;
};

/**
 * Mapa público de talleres, de solo lectura (FEAT-GEO-04). Sirve para uno o varios
 * marcadores; las páginas lo montan solo cuando hace falta, así el chunk de Leaflet se
 * descarga bajo demanda. En Node (pruebas sin navegador) renderiza solo el contenedor.
 * No pide la ubicación del comprador ni usa geocodificación: las posiciones vienen
 * únicamente de `ubicacion_mapa`.
 */
export function MapaTalleresPublico({
  marcadores,
  etiqueta,
  enlaces = false,
  mensajeError,
  className,
}: Props) {
  const enNavegador = useEnNavegador();
  const [errorTiles, setErrorTiles] = useState(false);
  const alFallarTiles = useCallback(() => setErrorTiles(true), []);
  return (
    <div className="space-y-2">
      <div
        role="region"
        aria-label={etiqueta}
        className={cn(
          "relative z-0 h-80 w-full overflow-hidden rounded-xl border bg-surface",
          className,
        )}
      >
        {enNavegador ? (
          <LimiteErrorMapa mensaje={mensajeError}>
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <MapaTalleresPublicoLeaflet
                marcadores={marcadores}
                enlaces={enlaces}
                onErrorTiles={alFallarTiles}
              />
            </Suspense>
          </LimiteErrorMapa>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>
      {errorTiles ? (
        <p role="alert" className="text-sm text-destructive">
          {mensajeError}
        </p>
      ) : null}
    </div>
  );
}
