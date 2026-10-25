/**
 * Cliente HTTP de la configuración pública: `GET /configuracion/` (docs/api/configuracion.md).
 *
 * Lectura anónima. La tasa llega como texto decimal; se convierte a número solo para
 * mostrar la conversión. Un valor no finito o no positivo se trata como "sin tasa": nunca
 * se sustituye por una tasa inventada (D-AUD14-06).
 */
import { solicitar } from "@/lib/http";
import type { ConfiguracionPublica } from "./types";

interface ConfiguracionDTO {
  tasa_cambio: string | null;
  actualizada_en: string | null;
}

export function aConfiguracion(dto: ConfiguracionDTO): ConfiguracionPublica {
  const tasa = dto.tasa_cambio === null ? NaN : Number(dto.tasa_cambio);
  if (!Number.isFinite(tasa) || tasa <= 0) return { tasaCambio: null, actualizadaEn: null };
  return { tasaCambio: tasa, actualizadaEn: dto.actualizada_en };
}

export async function getConfiguracion(signal?: AbortSignal): Promise<ConfiguracionPublica> {
  return aConfiguracion(await solicitar<ConfiguracionDTO>("/configuracion/", { signal }));
}
