import type { Product } from "@/types";
import { UNIT_TYPE_LABELS } from "@/lib/labels";

export function UnitAvailability({ product: p }: { product: Product }) {
  return (
    <p className="text-sm text-muted-foreground">
      {UNIT_TYPE_LABELS[p.tipoUnidades]} ·{" "}
      {p.unidadesDisponibles > 0
        ? `${p.unidadesDisponibles} ${p.unidadesDisponibles === 1 ? "disponible" : "disponibles"}`
        : p.unidadesReservadas > 0
          ? "Reservada · sin unidades disponibles"
          : p.unidadesPorClasificar > 0
            ? "Pendiente de clasificación · sin unidades disponibles"
            : "Sin unidades disponibles"}
    </p>
  );
}
