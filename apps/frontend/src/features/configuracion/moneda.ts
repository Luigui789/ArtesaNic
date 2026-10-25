import type { Currency } from "@/lib/format";
import type { ConfiguracionPublica } from "./types";

/**
 * Moneda efectiva a partir de la preferencia y la configuración. Sin tasa válida, o si la
 * consulta falló (aunque haya un dato anterior en caché), solo córdobas (D-AUD14-06).
 */
export function monedaEfectiva(
  preferida: Currency,
  configuracion: ConfiguracionPublica | undefined,
  conError: boolean,
): { currency: Currency; tasaCambio: number | null; actualizadaEn: string | null } {
  const tasaCambio = conError ? null : (configuracion?.tasaCambio ?? null);
  return {
    currency: tasaCambio === null ? "NIO" : preferida,
    tasaCambio,
    actualizadaEn: tasaCambio === null ? null : (configuracion?.actualizadaEn ?? null),
  };
}

/** `1 US$ = C$ 36.8000`: la tasa del servidor, con sus cuatro decimales. */
export function textoTasa(tasaCambio: number): string {
  return `1 US$ = C$ ${tasaCambio.toFixed(4)}`;
}
