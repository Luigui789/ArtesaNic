import type { SesionUsuario } from "@/features/auth/use-session";
import type { QueryClient } from "@tanstack/react-query";
import { solicitudesReales } from "./api";
export const claveSolicitudes = (u: SesionUsuario | null, recibidas: boolean) =>
  ["solicitudes", solicitudesReales, u?.id, u?.rol, u?.artesanoId, recibidas] as const;
export const claveSolicitud = (u: SesionUsuario | null, recibida: boolean, id: number) =>
  ["solicitud", solicitudesReales, u?.id, u?.rol, u?.artesanoId, recibida, id] as const;
export function invalidarSolicitud(
  client: QueryClient,
  u: SesionUsuario | null,
  recibida: boolean,
  id: number,
) {
  void client.invalidateQueries({ queryKey: claveSolicitud(u, recibida, id) });
  void client.invalidateQueries({ queryKey: claveSolicitudes(u, recibida) });
  if (recibida) void client.invalidateQueries({ queryKey: ["solicitudes-resumen", u?.id] });
}
