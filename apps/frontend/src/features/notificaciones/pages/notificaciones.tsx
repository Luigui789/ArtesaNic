import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { formatDateTime } from "@/lib/format";
import { claves } from "@/lib/query-keys";
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from "../http";
import { rutaNotificacion } from "../rutas";

export default function Notificaciones() {
  const { usuario } = useSession();
  const [pagina, setPagina] = useState(1);
  const cliente = useQueryClient();
  const lista = useQuery({
    queryKey: claves.notificaciones(usuario?.id, pagina),
    queryFn: ({ signal }) => listarNotificaciones(pagina, signal),
    enabled: !!usuario,
  });
  const actualizar = () => {
    void cliente.invalidateQueries({ queryKey: ["notificaciones-reales", usuario?.id] });
    void cliente.invalidateQueries({ queryKey: claves.notificacionesResumen(usuario?.id) });
  };
  const leer = useMutation({ mutationFn: marcarLeida, onSuccess: actualizar });
  const todas = useMutation({ mutationFn: marcarTodasLeidas, onSuccess: actualizar });
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title="Notificaciones"
          description="Avisos de tus solicitudes y pedidos."
          action={
            <Button variant="outline" disabled={todas.isPending} onClick={() => todas.mutate()}>
              Marcar todas como leídas
            </Button>
          }
        />
        {lista.isPending ? (
          <p>Cargando notificaciones…</p>
        ) : lista.isError ? (
          <div role="alert">
            No se pudieron cargar las notificaciones.{" "}
            <Button variant="outline" onClick={() => void lista.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : lista.data.results.length ? (
          <ul className="space-y-3">
            {lista.data.results.map((n) => (
              <li key={n.id} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold">{n.titulo}</h2>
                  <StatusBadge tone={n.leida ? "neutral" : "pending"}>
                    {n.leida ? "Leída" : "Sin leer"}
                  </StatusBadge>
                </div>
                <p className="break-words text-sm">{n.detalle}</p>
                <time dateTime={n.creadaEn} className="text-xs text-muted-foreground">
                  {formatDateTime(n.creadaEn)}
                </time>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link
                      to={rutaNotificacion(
                        n,
                        usuario?.rol === "artesano" ? "artesano" : "comprador",
                      )}
                      onClick={() => {
                        if (!n.leida) leer.mutate(n.id);
                      }}
                    >
                      Abrir
                    </Link>
                  </Button>
                  {!n.leida && (
                    <Button
                      variant="ghost"
                      disabled={leer.isPending}
                      onClick={() => leer.mutate(n.id)}
                    >
                      Marcar como leída
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState titulo="Estás al día" descripcion="No tienes notificaciones pendientes." />
        )}
        {(leer.isError || todas.isError) && (
          <p role="alert">No se pudo actualizar la lectura. Inténtalo de nuevo.</p>
        )}
        {lista.data && (
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!lista.data.previous}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </Button>
            <span>Página {pagina}</span>
            <Button
              variant="outline"
              disabled={!lista.data.next}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente
            </Button>
          </div>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
