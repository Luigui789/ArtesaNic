/**
 * Configuración pública de la plataforma (RF-007). La tasa la administra Django Admin;
 * `null` significa "sin tasa configurada" y la interfaz muestra solo córdobas (D-AUD14-06).
 */
export interface ConfiguracionPublica {
  /** Córdobas por un dólar. Solo informativa: los importes contractuales están en C$. */
  tasaCambio: number | null;
  /** Fecha del servidor de la última actualización de la tasa. */
  actualizadaEn: string | null;
}
