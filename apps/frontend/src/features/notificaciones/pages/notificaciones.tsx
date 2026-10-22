import { Link } from "react-router";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "../use-notifications";
import { useSession } from "@/features/auth/use-session";
import { formatDateTime } from "@/lib/format";
export default function Notificaciones() {
  const { recientes, total, marcarLeido, marcarTodoLeido } = useNotifications();
  const { usuario } = useSession();
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title="Notificaciones"
          description="Avisos de las conversaciones de tus pedidos de demostración."
          action={
            total > 0 ? (
              <Button variant="outline" onClick={marcarTodoLeido}>
                Marcar todas como leídas
              </Button>
            ) : null
          }
        />
        {recientes.length ? (
          <ul className="space-y-3">
            {recientes.map((n, i) => (
              <li
                key={`${n.pedidoId}-${n.fecha}-${i}`}
                className="space-y-3 rounded-xl border bg-card p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold">Mensaje en {n.codigo}</h2>
                  <StatusBadge tone={n.leida ? "neutral" : "pending"}>
                    {n.leida ? "Leída" : "Sin leer"}
                  </StatusBadge>
                </div>
                <p className="break-words text-sm">
                  {n.autorNombre}: {n.texto}
                </p>
                <time dateTime={n.fecha} className="text-xs text-muted-foreground">
                  {formatDateTime(n.fecha)}
                </time>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link
                      to={`${usuario?.rol === "artesano" ? "/panel/pedidos" : "/pedidos"}/${n.pedidoId}`}
                      onClick={() => marcarLeido(n.pedidoId)}
                    >
                      Abrir pedido
                    </Link>
                  </Button>
                  {!n.leida ? (
                    <Button variant="ghost" onClick={() => marcarLeido(n.pedidoId)}>
                      Marcar como leída
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            titulo="Estás al día"
            descripcion="Los nuevos mensajes de tus pedidos aparecerán aquí."
          />
        )}
      </PageContainer>
    </SiteLayout>
  );
}
