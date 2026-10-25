export type Currency = "NIO" | "USD";

/**
 * RF-007: precio en córdobas o su conversión informativa a dólares. Función pura: la tasa
 * (C$ por US$) la recibe del servidor; sin tasa válida solo hay córdobas. Nunca altera el
 * importe en córdobas, que es el contractual.
 */
export function formatPrice(
  cordobas: number,
  currency: Currency,
  tasaCambio: number | null,
): string {
  if (currency === "USD" && tasaCambio !== null && Number.isFinite(tasaCambio) && tasaCambio > 0) {
    const usd = cordobas / tasaCambio;
    return `US$ ${usd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `C$ ${cordobas.toLocaleString("es-NI", { maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Fecha de calendario `YYYY-MM-DD` (sin hora). Se formatea en UTC porque `new Date` la
 * interpreta como medianoche UTC; en la zona local (UTC-6) mostraría el día anterior.
 */
export function formatCalendarDate(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Date(`${fecha}T00:00:00Z`).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function relativeSeconds(from: number): string {
  const secs = Math.max(0, Math.round((Date.now() - from) / 1000));
  if (secs < 60) return `hace ${secs} segundo${secs === 1 ? "" : "s"}`;
  const mins = Math.round(secs / 60);
  return `hace ${mins} minuto${mins === 1 ? "" : "s"}`;
}
