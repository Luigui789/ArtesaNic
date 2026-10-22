import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FOTOGRAFIA_ACCEPT, errorFotografia } from "../imagenes";

/** Preview efímera; se envía el File original, nunca el blob URL. */
export function FotografiaPrincipal({
  actual,
  archivo,
  onChange,
  error,
}: {
  actual?: string | undefined;
  archivo?: File | undefined;
  onChange: (file: File | undefined) => void;
  error?: string | undefined;
}) {
  const [preview, setPreview] = useState<string>();
  const [errorLocal, setErrorLocal] = useState<string>();
  useEffect(() => {
    if (!archivo) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  const mensaje = errorLocal ?? error;
  return (
    <div className="space-y-3">
      <Label htmlFor="p-fotografia">Fotografía principal</Label>
      <p id="p-fotografia-ayuda" className="text-sm text-muted-foreground">
        JPEG, PNG o WebP, hasta 5 MiB. Necesaria para publicar. Sin selección se conserva la actual.
      </p>
      {preview || actual ? (
        <img
          src={preview ?? actual}
          alt="Vista previa de la fotografía principal"
          className="aspect-[4/3] w-full max-w-56 rounded-lg object-cover"
        />
      ) : null}
      <Input
        id="p-fotografia"
        type="file"
        accept={FOTOGRAFIA_ACCEPT}
        aria-invalid={!!mensaje}
        aria-describedby="p-fotografia-ayuda p-fotografia-error"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const invalida = file ? errorFotografia(file) : undefined;
          setErrorLocal(invalida);
          onChange(invalida ? undefined : file);
          if (invalida) event.target.value = "";
        }}
      />
      <p
        id="p-fotografia-error"
        role={mensaje ? "alert" : undefined}
        className="text-sm text-destructive"
      >
        {mensaje}
      </p>
    </div>
  );
}
