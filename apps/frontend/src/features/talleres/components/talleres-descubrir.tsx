import { useMemo, useState } from "react";
import { List, Map as IconoMapa, MapPin } from "lucide-react";
import { ArtisanCard } from "@/features/talleres/components/artisan-card";
import { MapaTalleresPublico } from "@/features/talleres/components/mapa-talleres-publico";
import type { PerfilTaller } from "@/features/talleres/types";
import { marcadoresDeTalleres } from "@/features/talleres/ubicacion";
import { cn } from "@/lib/utils";

export type VistaTalleres = "lista" | "mapa";

/** Tarjetas destacadas en la vista de lista; el mapa usa todos los talleres. */
const TARJETAS_DESTACADAS = 4;

const VISTAS: { valor: VistaTalleres; etiqueta: string; Icono: typeof List }[] = [
  { valor: "lista", etiqueta: "Ver talleres", Icono: List },
  { valor: "mapa", etiqueta: "Ver mapa", Icono: IconoMapa },
];

function Tarjetas({ talleres }: { talleres: readonly PerfilTaller[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {talleres.slice(0, TARJETAS_DESTACADAS).map((a) => (
        <ArtisanCard key={a.id} artisan={a} />
      ))}
    </div>
  );
}

/**
 * «Talleres para descubrir» con vista de lista o de mapa (FEAT-GEO-04). La lista es la
 * vista inicial y sigue siendo la forma principal de descubrir talleres; el mapa es una
 * mejora progresiva que solo se monta (y descarga Leaflet) al elegirlo. El mapa muestra
 * todos los talleres de la respuesta con `ubicacionMapa`, no solo las tarjetas.
 */
export function TalleresDescubrir({
  talleres,
  vistaInicial = "lista",
}: {
  talleres: readonly PerfilTaller[];
  vistaInicial?: VistaTalleres;
}) {
  const [vista, setVista] = useState<VistaTalleres>(vistaInicial);
  const marcadores = useMemo(() => marcadoresDeTalleres(talleres), [talleres]);
  const n = marcadores.length;

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Cómo ver los talleres"
        className="inline-flex max-w-full items-center gap-1 rounded-lg border bg-card p-1"
      >
        {VISTAS.map(({ valor, etiqueta, Icono }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setVista(valor)}
            aria-pressed={vista === valor}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              vista === valor
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            <Icono className="size-4" aria-hidden="true" />
            {etiqueta}
          </button>
        ))}
      </div>

      {vista === "lista" ? (
        <Tarjetas talleres={talleres} />
      ) : n === 0 ? (
        <>
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border bg-surface p-4 text-sm text-muted-foreground"
          >
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Estos talleres todavía no han publicado su ubicación en el mapa.
          </p>
          <Tarjetas talleres={talleres} />
        </>
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {n === 1
              ? "1 taller ha publicado su ubicación en el mapa."
              : `${n} talleres han publicado su ubicación en el mapa.`}{" "}
            Toca un marcador para ver el taller.
          </p>
          <MapaTalleresPublico
            marcadores={marcadores}
            etiqueta="Mapa de los talleres artesanales"
            enlaces
            mensajeError="No pudimos cargar el mapa en este momento. Puedes seguir explorando los talleres en la lista."
            className="h-80 sm:h-[26rem] lg:h-[30rem]"
          />
        </>
      )}
    </div>
  );
}
