import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UbicacionTaller } from "@/features/talleres/types";
import { crearUbicacion } from "@/features/talleres/ubicacion";

// Leaflet necesita `window` al importarse: se carga aparte y solo en el navegador.
const MapaUbicacionLeaflet = lazy(() => import("./mapa-ubicacion-leaflet"));

const sinSuscripcion = () => () => undefined;
/** true en el navegador, false al renderizar en Node (pruebas con react-dom/server). */
function useEnNavegador(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => typeof window !== "undefined",
    () => false,
  );
}

/** Si Leaflet no carga, el resto del formulario sigue funcionando. */
class LimiteErrorMapa extends Component<{ children: ReactNode }, { fallo: boolean }> {
  override state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  override render() {
    if (this.state.fallo)
      return (
        <p role="alert" className="p-4 text-sm text-destructive">
          No pudimos mostrar el mapa. Puedes seguir editando el resto del perfil.
        </p>
      );
    return this.props.children;
  }
}

type Props = {
  value: UbicacionTaller | null;
  onChange: (ubicacion: UbicacionTaller | null) => void;
  disabled?: boolean;
};

/**
 * Selector visual de la ubicación del taller (FEAT-GEO-02). Solo elige coordenadas y
 * las emite redondeadas: no guarda en la API ni decide si la ubicación es pública.
 * El artesano no escribe latitud ni longitud: hace clic/tap en el mapa o arrastra el pin.
 */
export function SelectorUbicacionTaller({ value, onChange, disabled = false }: Props) {
  const enNavegador = useEnNavegador();
  const [enfoque, setEnfoque] = useState(0);
  const [errorTiles, setErrorTiles] = useState(false);

  const seleccionar = useCallback(
    (latitud: number, longitud: number) => {
      const ubicacion = crearUbicacion(latitud, longitud);
      if (ubicacion) onChange(ubicacion);
    },
    [onChange],
  );
  const alFallarTiles = useCallback(() => setErrorTiles(true), []);

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Mapa para seleccionar la ubicación del taller"
        className="relative z-0 h-72 w-full overflow-hidden rounded-xl border bg-surface sm:h-96"
      >
        {enNavegador ? (
          <LimiteErrorMapa>
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <MapaUbicacionLeaflet
                ubicacion={value}
                enfoque={enfoque}
                disabled={disabled}
                onSeleccionar={seleccionar}
                onErrorTiles={alFallarTiles}
              />
            </Suspense>
          </LimiteErrorMapa>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>
      {errorTiles ? (
        <p role="alert" className="text-xs text-destructive">
          Algunas partes del mapa no cargaron. Puedes seguir seleccionando la ubicación.
        </p>
      ) : null}
      <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {value
          ? "Ubicación seleccionada. Puedes mover el marcador para ajustarla."
          : "Aún no has seleccionado la ubicación. Haz clic o toca el mapa sobre tu taller."}
      </p>
      {value ? (
        <Button
          type="button"
          variant="outline"
          className="touch-target"
          disabled={disabled}
          onClick={() => {
            setEnfoque(0);
            onChange(null);
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Quitar ubicación
        </Button>
      ) : null}
    </div>
  );
}
