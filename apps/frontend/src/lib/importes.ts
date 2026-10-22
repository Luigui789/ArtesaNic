/** Presentación exacta de una cadena decimal; no reconstruye importes contractuales. */
export function mostrarImporte(importe: string): string {
  const match = /^(\d+)\.(\d{2})$/.exec(importe);
  if (!match) return "Importe no disponible";
  return `C$ ${BigInt(match[1]!).toLocaleString("es-NI")}.${match[2]}`;
}
