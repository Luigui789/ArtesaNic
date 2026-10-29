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
  /** Filas visibles del área de texto (`multilinea`). */
  filas?: number;
  /** Dato obligatorio: marca el control como requerido para tecnologías de apoyo. */
  requerido?: boolean;
  /** Dato opcional: lo indica con texto junto a la etiqueta, no con símbolos. */
  opcional?: boolean;
} & Omit<ComponentProps<"input">, "id" | "value" | "onChange" | "required">;

/**
 * Etiqueta, control y error accesible de los formularios. La ayuda y el error quedan
 * asociados al control con `aria-describedby`; el error se anuncia y marca el control
 * con `aria-invalid`, que usan los formularios para enfocar el primer campo inválido.
 */
export function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  valor,
  onCambio,
  multilinea,
  filas = 3,
  requerido,
  opcional,
  className,
  ref,
  maxLength,
  autoComplete,
  ...resto
}: Props) {
  const descripcion = [error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null]
    .filter(Boolean)
    .join(" ");
  const comunes = {
    id,
    value: valor,
    maxLength,
    autoComplete,
    required: requerido,
    "aria-invalid": !!error,
    "aria-describedby": descripcion || undefined,
  };
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2">
        {etiqueta}
        {opcional ? (
          <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
        ) : null}
      </Label>
      {multilinea ? (
        <Textarea
          {...comunes}
          ref={ref as ComponentProps<"textarea">["ref"]}
          rows={filas}
          className={className}
          onChange={(e) => onCambio(e.target.value)}
        />
      ) : (
        <Input
          {...resto}
          {...comunes}
          ref={ref}
          className={className ?? "min-h-11"}
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
