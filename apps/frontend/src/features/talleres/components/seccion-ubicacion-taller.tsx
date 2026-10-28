import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SelectorUbicacionTaller } from "@/features/talleres/components/selector-ubicacion-taller";
import { conUbicacion, type EstadoUbicacion } from "@/features/talleres/ubicacion";

type Props = {
  value: EstadoUbicacion;
  onChange: (actualizar: (actual: EstadoUbicacion) => EstadoUbicacion) => void;
  /** La ubicación guardada no se pudo leer (datos inesperados del servidor). */
  invalida: boolean;
  error?: string | undefined;
  disabled: boolean;
};

/**
 * «Ubicación del taller» del perfil (FEAT-GEO-02): selector en el mapa y decisión
 * explícita de publicar. Buscar, usar el GPS o mover el pin nunca publica; sin
 * ubicación el switch queda apagado y deshabilitado. No guarda: el formulario envía
 * estos cambios con el resto del perfil.
 */
export function SeccionUbicacionTaller({ value, onChange, invalida, error, disabled }: Props) {
  const sinUbicacion = value.ubicacion === null;
  return (
    <section
      aria-labelledby="perfil-ubicacion-titulo"
      className="space-y-3 rounded-xl border bg-surface/40 p-4"
    >
      <div>
        <h3 id="perfil-ubicacion-titulo" className="font-semibold">
          Ubicación del taller
        </h3>
        <p className="text-sm text-muted-foreground">
          Busca un lugar o selecciona tu taller en el mapa. Los cambios se guardan con «Guardar
          cambios».
        </p>
      </div>
      {invalida ? (
        <p role="alert" className="text-sm text-destructive">
          No pudimos leer la ubicación guardada de tu taller. Selecciónala de nuevo en el mapa.
        </p>
      ) : null}
      <SelectorUbicacionTaller
        value={value.ubicacion}
        onChange={(u) => onChange((actual) => conUbicacion(actual, u))}
        disabled={disabled}
      />
      <div className="space-y-1">
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id="perfil-ubicacion-publica"
            checked={!sinUbicacion && value.publica}
            disabled={sinUbicacion || disabled}
            aria-describedby="perfil-ubicacion-publica-ayuda"
            onCheckedChange={(publica) => onChange((actual) => ({ ...actual, publica }))}
          />
          <Label htmlFor="perfil-ubicacion-publica" className="cursor-pointer py-2">
            Mostrar mi ubicación en el mapa público
          </Label>
        </div>
        <p id="perfil-ubicacion-publica-ayuda" className="text-xs text-muted-foreground">
          {sinUbicacion
            ? "Primero selecciona la ubicación de tu taller."
            : "Si activas esta opción, los compradores podrán ver la posición exacta que selecciones."}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
