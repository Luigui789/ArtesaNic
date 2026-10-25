import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processImage } from "@/features/catalogo/api";
import { IMAGE_ACCEPT, IMAGE_RULES_TEXT } from "@/lib/image-files";

type Estado = "vacio" | "procesando" | "listo" | "error";

/**
 * RF-002: simula selección, previsualización, procesamiento, éxito y error.
 * La imagen se conserva en la instantánea local cuando se guarda el formulario.
 */
export function ImageUploader({
  value,
  onChange,
  label = "Fotografía del producto",
  aspectRatio = "4 / 3",
  onBusyChange,
}: {
  value?: string | undefined;
  onChange: (dataUrl: string) => void;
  label?: string | undefined;
  aspectRatio?: string;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>(value ? "listo" : "vacio");
  const [error, setError] = useState<string>("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setEstado("procesando");
    onBusyChange?.(true);
    setError("");
    try {
      const dataUrl = await processImage(file);
      onChange(dataUrl);
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos procesar la imagen.");
      setEstado("error");
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">{label}</span>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          style={{ aspectRatio }}
          className="grid w-full max-w-56 place-items-center overflow-hidden rounded-lg border border-dashed bg-surface"
        >
          {value ? (
            <img
              src={value}
              alt="Vista previa de la fotografía"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="p-4 text-center text-xs text-muted-foreground">
              Aún no has elegido una fotografía
            </span>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            aria-label={`Elegir ${label.toLowerCase()}`}
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="touch-target"
            onClick={() => inputRef.current?.click()}
            disabled={estado === "procesando"}
          >
            {estado === "procesando" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-4" aria-hidden="true" />
            )}
            {value ? "Cambiar fotografía" : "Elegir fotografía"}
          </Button>

          <p className="text-xs text-muted-foreground">{IMAGE_RULES_TEXT}</p>

          {estado === "procesando" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Optimizando la imagen…
            </p>
          ) : null}

          {estado === "listo" && value ? (
            <p className="flex items-center gap-2 text-sm text-success" role="status">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Imagen lista
            </p>
          ) : null}

          {estado === "error" ? (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
