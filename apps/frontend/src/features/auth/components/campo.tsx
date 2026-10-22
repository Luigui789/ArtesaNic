import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  id: string;
  etiqueta: string;
  error?: string | undefined;
  ayuda?: string;
  valor: string;
  onCambio: (valor: string) => void;
  multilinea?: boolean;
} & Omit<ComponentProps<"input">, "id" | "value" | "onChange">;

/** Etiqueta, control y error accesible de los formularios de acceso. */
export function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  valor,
  onCambio,
  multilinea,
  ...resto
}: Props) {
  const descripcion = [error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null]
    .filter(Boolean)
    .join(" ");
  const comunes = {
    id,
    value: valor,
    "aria-invalid": !!error,
    "aria-describedby": descripcion || undefined,
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {multilinea ? (
        <Textarea {...comunes} rows={3} onChange={(e) => onCambio(e.target.value)} />
      ) : (
        <Input
          {...resto}
          {...comunes}
          className="min-h-11"
          onChange={(e) => onCambio(e.target.value)}
        />
      )}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
