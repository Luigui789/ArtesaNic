import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SelectorUbicacionTaller } from "@/features/talleres/components/selector-ubicacion-taller";
import { conUbicacion, type EstadoUbicacion } from "@/features/talleres/ubicacion";

type Contexto = "perfil" | "registro";

type Props = {
  value: EstadoUbicacion;
  onChange: (actualizar: (actual: EstadoUbicacion) => EstadoUbicacion) => void;
  /** La ubicación guardada no se pudo leer (datos inesperados del servidor). */
  invalida?: boolean;
  error?: string | undefined;
  disabled: boolean;
  /** Formulario que la contiene; solo cambia textos e identificadores. */
  contexto?: Contexto;
};

const TEXTOS: Record<Contexto, { titulo: string; descripcion: string; publica: string }> = {
  perfil: {
    titulo: "Ubicación del taller",
    descripcion:
      "Busca un lugar o selecciona tu taller en el mapa. Los cambios se guardan con «Guardar cambios».",
    publica:
      "Si activas esta opción, los compradores podrán ver la posición exacta que selecciones.",
  },
  // El taller recién registrado queda pendiente: nada se publica antes de la aprobación.
  registro: {
    titulo: "Ubicación del taller (opcional)",
    descripcion:
      "Puedes indicar dónde se encuentra tu taller ahora o hacerlo después desde tu perfil.",
    publica:
      "Si activas esta opción, los compradores podrán ver la posición exacta seleccionada una vez que tu taller sea aprobado.",
  },
};

/**
 * «Ubicación del taller» del perfil (FEAT-GEO-02) y del registro de artesano
 * (FEAT-GEO-03): selector en el mapa y decisión explícita de publicar. Buscar, usar el
 * GPS o mover el pin nunca publica; sin ubicación el switch queda apagado y
 * deshabilitado. No guarda: el formulario envía estos datos con el resto.
 */
export function SeccionUbicacionTaller({
  value,
  onChange,
  invalida = false,
  error,
  disabled,
  contexto = "perfil",
}: Props) {
  const sinUbicacion = value.ubicacion === null;
  const textos = TEXTOS[contexto];
  const id = `${contexto}-ubicacion`;
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="space-y-3 rounded-xl border bg-surface/40 p-4"
    >
      <div>
        <h3 id={`${id}-titulo`} className="font-semibold">
          {textos.titulo}
        </h3>
        <p className="text-sm text-muted-foreground">{textos.descripcion}</p>
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
            id={`${id}-publica`}
            checked={!sinUbicacion && value.publica}
            disabled={sinUbicacion || disabled}
            aria-describedby={`${id}-publica-ayuda`}
            onCheckedChange={(publica) => onChange((actual) => ({ ...actual, publica }))}
          />
          <Label htmlFor={`${id}-publica`} className="cursor-pointer py-2">
            Mostrar mi ubicación en el mapa público
          </Label>
        </div>
        <p id={`${id}-publica-ayuda`} className="text-xs text-muted-foreground">
          {sinUbicacion ? "Primero selecciona la ubicación de tu taller." : textos.publica}
        </p>
      </div>
      {error ? (
        // Sin control propio: el formulario enfoca este mensaje al mostrar errores.
        <p role="alert" tabIndex={-1} data-error-foco className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
