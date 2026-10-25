import { textoTasa } from "@/features/configuracion/moneda";
import { useCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * RF-007: selector de moneda C$ / US$ con la tasa que configura la administración. Sin
 * tasa válida (o si la configuración falla) solo hay córdobas y se explica por qué.
 */
export function CurrencySwitcher({ className }: { className?: string }) {
  const { currency, setCurrency, tasaCambio, actualizadaEn } = useCurrency();
  if (tasaCambio === null) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Precios en córdobas (C$). Conversión a dólares no disponible.
      </p>
    );
  }
  const actualizada = actualizadaEn ? `Actualizada ${formatDate(actualizadaEn)}` : null;
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <div
        className="inline-flex items-center gap-1 rounded-lg border bg-card p-1"
        role="group"
        aria-label={`Moneda de visualización. Conversión informativa: ${textoTasa(tasaCambio)}`}
      >
        {(["NIO", "USD"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={cn(
              "min-h-11 rounded-md px-3 text-sm font-medium transition-colors",
              currency === c
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            {c === "NIO" ? "C$ Córdobas" : "US$ Dólares"}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {textoTasa(tasaCambio)}
        {actualizada ? ` · ${actualizada}` : null}
      </p>
    </div>
  );
}
