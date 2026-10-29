/**
 * Configuración pública que consume la interfaz.
 *
 * Con `VITE_CATALOGO_API=real` la tasa sale de Django, igual que los precios del
 * catálogo. La demo conserva una tasa simulada propia y explícita: no es la autoridad
 * real y nunca se usa como respaldo del modo real (D-AUD14-05/06).
 */
import * as http from "./http";
import type { ConfiguracionPublica } from "./types";

const configuracionReal = import.meta.env["VITE_CATALOGO_API"] === "real";

/** Solo servidor simulado (RF-007 en la demo). */
export const TASA_CAMBIO_DEMO = 36.8;

const configuracionDemo = (): Promise<ConfiguracionPublica> =>
  Promise.resolve({ tasaCambio: TASA_CAMBIO_DEMO, actualizadaEn: null });

export const getConfiguracion: (signal?: AbortSignal) => Promise<ConfiguracionPublica> =
  configuracionReal ? http.getConfiguracion : configuracionDemo;

export type { ConfiguracionPublica } from "./types";
