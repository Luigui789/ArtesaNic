import { useEffect, useState } from "react";
import { ImageIcon, Store, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FOTOGRAFIA_ACCEPT, errorFotografia } from "@/features/catalogo/imagenes";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  etiqueta: string;
  ayuda: string;
  forma: "cuadrada" | "portada";
  /** Imagen guardada en el servidor, si existe. */
  actual: string | undefined;
  alt: string;
  /** Archivo nuevo elegido y válido; viaja en el mismo `PATCH` al guardar. */
  archivo: File | undefined;
  onArchivo: (archivo: File | undefined) => void;
  /** Error del archivo elegido (local) o del servidor. */
  error: string | undefined;
  onErrorLocal: (error: string | undefined) => void;
  disabled?: boolean;
};

/**
 * Foto del taller o portada: vista previa de la actual, acción explícita para elegir
 * otra y deshacer la elección. Un archivo inválido muestra el motivo y no reemplaza ni
 * la imagen guardada ni una selección válida anterior.
 */
export function CampoImagenTaller({
  id,
  etiqueta,
  ayuda,
  forma,
  actual,
  alt,
  archivo,
  onArchivo,
  error,
  onErrorLocal,
  disabled = false,
}: Props) {
  const [preview, setPreview] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!archivo) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const mostrada = preview ?? actual;
  const Vacio = forma === "cuadrada" ? Store : ImageIcon;
  const accion = archivo || actual ? "Elegir otra imagen" : "Elegir imagen";

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <p id={`${id}-etiqueta`} className="text-sm font-medium">
          {etiqueta} <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
        </p>
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-surface",
          forma === "cuadrada" ? "size-24" : "aspect-[3/1] w-full",
        )}
      >
        {mostrada ? (
          <img src={mostrada} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <Vacio className="size-6" aria-hidden="true" />
            Sin imagen
          </div>
        )}
      </div>
      <p className="text-xs font-medium" aria-live="polite">
        {archivo ? (
          <span className="text-secondary">Imagen nueva elegida: se guardará con los cambios.</span>
        ) : actual ? (
          <span className="text-muted-foreground">Imagen actual.</span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={id}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "touch-target cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          {accion}
          <input
            id={id}
            type="file"
            accept={FOTOGRAFIA_ACCEPT}
            className="sr-only"
            disabled={disabled}
            aria-labelledby={`${id}-etiqueta ${id}`}
            aria-invalid={!!error}
            aria-describedby={[error ? `${id}-error` : null, `${id}-ayuda`]
              .filter(Boolean)
              .join(" ")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Permite volver a elegir el mismo archivo; el File queda en el estado.
              event.target.value = "";
              if (!file) return;
              const invalida = errorFotografia(file);
              onErrorLocal(invalida);
              if (!invalida) onArchivo(file);
            }}
          />
        </label>
        {archivo ? (
          <Button
            type="button"
            variant="ghost"
            className="touch-target"
            disabled={disabled}
            onClick={() => {
              onArchivo(undefined);
              onErrorLocal(undefined);
            }}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            {actual ? "Mantener la imagen actual" : "Quitar la imagen elegida"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
