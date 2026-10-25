import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConfiguracion } from "@/features/configuracion/api";
import { monedaEfectiva } from "@/features/configuracion/moneda";
import { claves } from "@/lib/query-keys";
import { formatPrice, type Currency } from "@/lib/format";

interface CurrencyContextValue {
  /** Moneda efectiva: USD solo mientras exista una tasa válida del servidor. */
  currency: Currency;
  setCurrency: (c: Currency) => void;
  format: (cordobas: number) => string;
  /** Córdobas por un dólar; `null` sin tasa o si la configuración no está disponible. */
  tasaCambio: number | null;
  actualizadaEn: string | null;
  usdDisponible: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

/** Configuración pública: la tasa cambia a mano en Django Admin; sin sondeo agresivo. */
const CINCO_MINUTOS = 5 * 60 * 1000;

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [preferida, setCurrency] = useState<Currency>("NIO");
  const configuracion = useQuery({
    queryKey: claves.configuracion(),
    queryFn: ({ signal }) => getConfiguracion(signal),
    staleTime: CINCO_MINUTOS,
    refetchOnWindowFocus: true,
  });
  // Un error de la consulta anula la tasa anterior: sin fuente vigente no hay conversión,
  // y una preferencia por USD vuelve a NIO automáticamente.
  const { currency, tasaCambio, actualizadaEn } = monedaEfectiva(
    preferida,
    configuracion.data,
    configuracion.isError,
  );
  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      format: (c: number) => formatPrice(c, currency, tasaCambio),
      tasaCambio,
      actualizadaEn,
      usdDisponible: tasaCambio !== null,
    }),
    [currency, tasaCambio, actualizadaEn],
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency debe usarse dentro de CurrencyProvider");
  return ctx;
}
