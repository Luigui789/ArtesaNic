import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader } from "@/components/common/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { formatDateTime } from "@/lib/format";
import { claves } from "@/lib/query-keys";
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from "../http";
import { rutaNotificacion } from "../rutas";
import { agruparAvisos } from "../presentacion";
import { mensajeDominio } from "@/lib/errores-dominio";
import { cn } from "@/lib/utils";

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
  const leer = useMutation({
    mutationFn: marcarLeida,
    onSuccess: () => {
      actualizar();
      toast.success("Notificación marcada como leída");
    },
  });
  const todas = useMutation({
    mutationFn: marcarTodasLeidas,
    onSuccess: () => {
      actualizar();
      toast.success("Todas las notificaciones se marcaron como leídas");
    },
  });
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
          <LoadingState label="Cargando notificaciones…" />
        ) : lista.isError ? (
          <ErrorState
            mensaje="No se pudieron cargar las notificaciones."
            onRetry={() => void lista.refetch()}
          />
        ) : lista.data.results.length ? (
          <div className="min-w-0 space-y-6">
            <p className="text-sm text-muted-foreground">
              Avisos de esta página, agrupados por fecha.
            </p>
            {agruparAvisos(lista.data.results).map((grupo) => (
              <section key={grupo.titulo} aria-label={grupo.titulo} className="space-y-3">
                <h2 className="font-display text-xl font-semibold">{grupo.titulo}</h2>
                <ul className="space-y-3">
                  {grupo.items.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        "min-w-0 space-y-3 rounded-xl border bg-card p-4",
                        !n.leida && "border-l-4 border-l-primary bg-primary/5",
                      )}
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3
                          className={cn(
                            "min-w-0 break-words",
                            n.leida ? "font-medium" : "font-semibold",
                          )}
                        >
                          {n.titulo}
                        </h3>
                        <StatusBadge tone={n.leida ? "neutral" : "pending"}>
                          {n.leida ? "Leída" : "Sin leer"}
                        </StatusBadge>
                      </div>
                      <p className="break-words text-sm">{n.detalle}</p>
                      <p className="text-sm font-medium">
                        {n.pedidoId ? `Pedido #${n.pedidoId}` : `Solicitud #${n.solicitudId}`}
                      </p>
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
                            {n.pedidoId ? "Ver pedido" : "Ver solicitud"}
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
              </section>
            ))}
          </div>
        ) : (
          <EmptyState titulo="Estás al día" descripcion="No tienes notificaciones pendientes." />
        )}
        {(leer.isError || todas.isError) && (
          <p role="alert">
            No se pudo actualizar la lectura. {mensajeDominio(leer.error ?? todas.error)}
          </p>
        )}
        {lista.data && (
          <nav
            aria-label="Paginación de notificaciones"
            className="mt-4 flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              disabled={!lista.data.previous}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </Button>
            <span aria-live="polite">Página {pagina}</span>
            <Button
              variant="outline"
              disabled={!lista.data.next}
              onClick={() => setPagina(pagina + 1)}
            >
              Siguiente
            </Button>
          </nav>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
