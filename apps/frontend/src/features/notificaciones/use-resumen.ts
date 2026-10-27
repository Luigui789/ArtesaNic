import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/use-session";
import { claves } from "@/lib/query-keys";
import { consultarResumen } from "./http";

export function useResumenNotificaciones() {
  const { modo, usuario } = useSession();
  return useQuery({
    queryKey: claves.notificacionesResumen(usuario?.id),
    queryFn: ({ signal }) => consultarResumen(signal),
    enabled: modo === "real" && !!usuario,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
}
