import type { Notificacion } from "./http";

/** Agrupa únicamente los avisos recibidos, sin consultar ni reordenar otras páginas. */
export function agruparAvisos(avisos: readonly Notificacion[], ahora = new Date()) {
  const fecha = (valor: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Managua",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(valor);
  const hoy = fecha(ahora);
  const ayer = fecha(new Date(ahora.getTime() - 86_400_000));
  const grupos = new Map<string, Notificacion[]>();
  for (const aviso of avisos) {
    const dia = fecha(new Date(aviso.creadaEn));
    const titulo = dia === hoy ? "Hoy" : dia === ayer ? "Ayer" : "Anteriores";
    const items = grupos.get(titulo) ?? [];
    items.push(aviso);
    grupos.set(titulo, items);
  }
  return Array.from(grupos, ([titulo, items]) => ({ titulo, items }));
}
