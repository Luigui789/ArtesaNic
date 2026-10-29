import { Link } from "react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Boxes, Store } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ESTADO_PEDIDO_LABELS } from "@/features/pedidos/confirmados";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { getMiTaller } from "../api";
import { claveMiTaller } from "../perfil-propio";
import PanelTaller from "./panel-taller";
import { listarSolicitudesRecibidas } from "@/features/solicitudes/http";
import { listarPedidosConfirmados } from "@/features/pedidos/confirmados";
import { claves } from "@/lib/query-keys";
import { reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mensajeDominio } from "@/lib/errores-dominio";
import { mostrarImporte } from "@/lib/importes";
export default function PanelResumen() {
  const { usuario } = useSession();
  const taller = useQuery({
    queryKey: claveMiTaller(usuario?.id),
    queryFn: ({ signal }) => getMiTaller(signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  const habilitado = taller.data?.estado === "aprobado";
  const solicitudes = useQuery({
    queryKey: ["solicitudes-resumen", usuario?.id],
    queryFn: () => listarSolicitudesRecibidas(),
    enabled: habilitado,
    retry: reintentarSalvoErrorDelCliente,
  });
  const pedidos = useQuery({
    queryKey: [...claves.pedidos(usuario?.id), "resumen"],
    queryFn: ({ signal }) => listarPedidosConfirmados(true, 1, signal),
    enabled: habilitado,
    retry: reintentarSalvoErrorDelCliente,
  });
  if (taller.data && !habilitado) return <PanelTaller />;
  const pendientes =
    solicitudes.data?.items
      .filter((s) => s.estado === "pendiente_revision" || s.estado === "lista_propuesta")
      .slice(0, 3) ?? [];
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title="Inicio de mi taller"
          description={`${taller.data?.nombre ?? "Tu taller"}. Hola${usuario ? `, ${usuario.nombre}` : ""}. Revisa las solicitudes recientes y continúa con tus pedidos.`}
          action={
            <Button asChild>
              <Link
                to={pendientes[0] ? `/panel/solicitudes/${pendientes[0].id}` : "/panel/solicitudes"}
              >
                Revisar solicitudes
              </Link>
            </Button>
          }
        />
        {taller.isPending ? (
          <LoadingState />
        ) : taller.isError ? (
          <ErrorState
            mensaje={mensajeDominio(taller.error)}
            onRetry={() => void taller.refetch()}
          />
        ) : (
          <>
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <SolicitudesPendientes solicitudes={solicitudes} pendientes={pendientes} />
              <PedidosConfirmadosRecientes pedidos={pedidos} />
            </div>
            <Section
              title="Productos e inventario"
              description="Agrega o edita piezas y revisa las unidades que puedes ofrecer."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                {[
                  { to: "/panel/productos", label: "Gestionar productos", icon: Store },
                  { to: "/panel/inventario", label: "Consultar inventario", icon: Boxes },
                ].map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 font-medium transition-colors hover:border-primary/40 hover:bg-muted"
                  >
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </Section>
          </>
        )}
      </PageContainer>
    </SiteLayout>
  );
}

function SolicitudesPendientes({
  solicitudes,
  pendientes,
}: {
  solicitudes: UseQueryResult<Awaited<ReturnType<typeof listarSolicitudesRecibidas>>>;
  pendientes: Awaited<ReturnType<typeof listarSolicitudesRecibidas>>["items"];
}) {
  return (
    <Section
      title="Requieren tu atención"
      description="Pendientes de revisión o propuesta en la primera página recibida. Abre el listado completo para revisar las demás."
      action={
        <Button asChild variant="ghost">
          <Link to="/panel/solicitudes">Ver todas las solicitudes</Link>
        </Button>
      }
    >
      {solicitudes.isPending ? (
        <LoadingState />
      ) : solicitudes.isError ? (
        <ErrorState
          mensaje={mensajeDominio(solicitudes.error)}
          onRetry={() => void solicitudes.refetch()}
        />
      ) : pendientes.length ? (
        <ul className="divide-y">
          {pendientes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  Solicitud #{s.id} · {s.comprador.nombre}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.estado === "lista_propuesta"
                    ? "Preparar propuesta final"
                    : "Revisar productos solicitados"}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to={`/panel/solicitudes/${s.id}`}>Revisar solicitud</Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          titulo="Sin tareas en las solicitudes recientes"
          descripcion="Consulta el listado completo para revisar el historial de tu taller."
        />
      )}
    </Section>
  );
}

function PedidosConfirmadosRecientes({
  pedidos,
}: {
  pedidos: UseQueryResult<Awaited<ReturnType<typeof listarPedidosConfirmados>>>;
}) {
  return (
    <Section
      title="Pedidos confirmados recientes"
      action={
        <Button asChild variant="ghost">
          <Link to="/panel/pedidos">Ver todos los pedidos</Link>
        </Button>
      }
    >
      {pedidos.isPending ? (
        <LoadingState />
      ) : pedidos.isError ? (
        <ErrorState
          mensaje={mensajeDominio(pedidos.error)}
          onRetry={() => void pedidos.refetch()}
        />
      ) : pedidos.data.items.length ? (
        <ul className="divide-y">
          {pedidos.data.items.slice(0, 3).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <Link
                  className="inline-flex min-h-11 items-center font-medium text-primary"
                  to={`/panel/pedidos/${p.id}`}
                >
                  Pedido #{p.id}
                </Link>
                <p className="text-sm text-muted-foreground">{p.comprador?.nombre}</p>
                <StatusBadge tone="neutral">{ESTADO_PEDIDO_LABELS[p.estado]}</StatusBadge>
              </div>
              <p className="font-medium tabular-nums">{mostrarImporte(p.total)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          titulo="Aún no hay pedidos confirmados"
          descripcion="Aparecerán cuando un comprador acepte una propuesta."
        />
      )}
    </Section>
  );
}
