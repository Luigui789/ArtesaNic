import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapaTalleresPublico } from "@/features/talleres/components/mapa-talleres-publico";
import { urlComoLlegar } from "@/features/talleres/mapa";
import type { PerfilTaller } from "@/features/talleres/types";
import { marcadoresDeTalleres } from "@/features/talleres/ubicacion";

/**
 * «Dónde encontrarnos» del perfil público (FEAT-GEO-04): mapa de un solo marcador y
 * «Cómo llegar». Sin `ubicacionMapa` no se renderiza nada: la dirección textual del
 * perfil sigue siendo la referencia y no tener mapa no hace incompleto al taller.
 */
export function UbicacionPublicaTaller({ taller }: { taller: PerfilTaller }) {
  if (!taller.ubicacionMapa) return null;
  return (
    <section className="mt-12 space-y-4" aria-labelledby="ubicacion-taller">
      <h2 id="ubicacion-taller" className="font-display text-xl font-bold">
        Dónde encontrarnos
      </h2>
      <MapaTalleresPublico
        marcadores={marcadoresDeTalleres([taller])}
        etiqueta={`Mapa con la ubicación del taller ${taller.nombre}`}
        mensajeError={`No pudimos cargar el mapa en este momento. La dirección del taller es: ${taller.direccion}.`}
        className="h-72 sm:h-96"
      />
      <Button asChild variant="outline" className="touch-target">
        <a href={urlComoLlegar(taller.ubicacionMapa)} target="_blank" rel="noreferrer">
          Cómo llegar
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </Button>
    </section>
  );
}
