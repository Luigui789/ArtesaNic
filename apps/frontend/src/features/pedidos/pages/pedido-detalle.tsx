import { PageContainer } from "@/components/common/page";
import { PaymentPanel } from "@/features/pagos/components/payment-receipt";
import {
  DeliveryPanel,
  OrderAmounts,
  CancelledUnits,
} from "@/features/pedidos/components/delivery-panel";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { ErrorState } from "@/components/common/states";
import { StatusPair } from "@/features/pedidos/components/status-badges";
import { AuditTimeline, OrderTimeline } from "@/features/pedidos/components/timelines";
import { OrderChat } from "@/features/mensajes/components/order-chat";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { changeOrderStatus, getOrder } from "@/features/pedidos/api";
import { getProduct } from "@/features/catalogo/api";
import { canCancel } from "@/lib/order-state";
import { formatDateTime } from "@/lib/format";
import { orderTotal } from "@/lib/order-amounts";
import { useCurrency } from "@/hooks/use-currency";
import { useSession } from "@/features/auth/use-session";
import { useNotifications } from "@/features/notificaciones/use-notifications";
import { useDocumentHead } from "@/hooks/use-document-head";
import { DELIVERY_MODE_LABELS } from "@/lib/labels";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";

export default function DetallePedido() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = parseRouteId(idParam);
  const queryClient = useQueryClient();
  const { format } = useCurrency();
  const { usuario } = useSession();

  useDocumentHead({
    title: "Detalle del pedido | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Seguimiento del pedido: estado de producción, pago, entrega, mensajería con el taller e historial.",
      },
      { property: "og:title", content: "Detalle del pedido | Artesanías de Masaya" },
      { property: "og:description", content: "Estado, pago y entrega de tu pedido artesanal." },
      { property: "og:url", content: `/pedidos/${id}` },
      { name: "robots", content: "noindex" },
    ],
    canonical: `/pedidos/${id}`,
  });

  const [motivo, setMotivo] = useState("");

  const pedido = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => getOrder(id!),
    enabled: id !== undefined,
  });
  const { marcarLeido } = useNotifications();
  useEffect(() => {
    if (id !== undefined) marcarLeido(id);
  }, [id, marcarLeido]);
  const producto = useQuery({
    queryKey: ["producto", pedido.data?.productoId],
    queryFn: () => getProduct(pedido.data!.productoId),
    enabled: !!pedido.data,
  });

  const refrescar = () => {
    void queryClient.invalidateQueries();
  };

  const cancelar = useMutation({
    mutationFn: () =>
      changeOrderStatus(id!, "cancelado", usuario?.nombre ?? "Comprador", motivo.trim()),
    onSuccess: () => {
      refrescar();
      toast.success("Pedido cancelado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (id === undefined) return <NotFound />;

  if (pedido.isError) {
    return (
      <SiteLayout>
        <PageContainer>
          <ErrorState
            mensaje="No pudimos cargar este pedido."
            onRetry={() => void pedido.refetch()}
          />
        </PageContainer>
      </SiteLayout>
    );
  }

  if (pedido.isPending) {
    return (
      <SiteLayout>
        <PageContainer className="max-w-5xl">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </PageContainer>
      </SiteLayout>
    );
  }

  const o = pedido.data;
  const total = o.cotizacionCongelada?.total ?? orderTotal(o);
  // RF-011 v3.0: el pago se registra una vez que el artesano acepta la solicitud,
  // y debe confirmarse antes de que el pedido pueda entrar en producción.

  return (
    <SiteLayout>
      <PageContainer className="max-w-5xl">
        <Link
          to="/pedidos"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a mis pedidos
        </Link>

        <header className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold">Pedido {o.codigo}</h1>
            <p className="text-sm text-muted-foreground">Creado el {formatDateTime(o.creadoEn)}</p>
          </div>
          <StatusPair estado={o.estado} estadoPago={o.estadoPago} />
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            <section className="rounded-xl border bg-card p-5" aria-labelledby="avance">
              <h2 id="avance" className="text-base font-semibold">
                Avance del pedido
              </h2>
              <div className="mt-4">
                <OrderTimeline estado={o.estado} opcion={o.opcion} />
              </div>
              {o.motivoRechazo ? (
                <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Motivo del rechazo: {o.motivoRechazo}
                </p>
              ) : null}
              {o.motivoCancelacion ? (
                <p className="mt-4 rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
                  Motivo de cancelación: {o.motivoCancelacion}
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border bg-card p-5" aria-labelledby="solicitud">
              <h2 id="solicitud" className="text-base font-semibold">
                Detalle de la solicitud
              </h2>
              <div className="mt-3 flex gap-3">
                {producto.data ? (
                  <img
                    src={producto.data.imagenes[0]}
                    alt=""
                    className="size-16 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="font-medium">{producto.data?.nombre ?? "Producto artesanal"}</p>
                  <p className="text-sm text-muted-foreground">Cantidad: {o.cantidad}</p>
                </div>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="font-medium">Personalización</dt>
                  <dd className="text-muted-foreground">
                    {o.personalizacion || "Sin modificaciones"}
                  </dd>
                </div>
                {o.observaciones ? (
                  <div>
                    <dt className="font-medium">Observaciones</dt>
                    <dd className="text-muted-foreground">{o.observaciones}</dd>
                  </div>
                ) : null}
                {o.entrega ? (
                  <div>
                    <dt className="font-medium">Entrega</dt>
                    <dd className="text-muted-foreground">
                      {DELIVERY_MODE_LABELS[o.entrega.modalidad]}
                      {o.entrega.detalle ? ` — ${o.entrega.detalle}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section aria-labelledby="mensajes">
              <h2 id="mensajes" className="sr-only">
                Mensajería con el taller
              </h2>
              <OrderChat pedidoId={o.id} estado={o.estado} />
            </section>

            <section className="rounded-xl border bg-card p-5" aria-labelledby="historial">
              <h2 id="historial" className="text-base font-semibold">
                Historial y trazabilidad
              </h2>
              <div className="mt-4">
                <AuditTimeline eventos={o.historial} />
              </div>
            </section>
          </div>

          {/* En móvil, montos, pago y cancelación van primero: son las acciones del comprador. */}
          <aside className="order-first space-y-6 lg:order-none">
            <section className="rounded-xl border bg-card p-5" aria-labelledby="montos">
              <h2 id="montos" className="text-base font-semibold">
                Montos
              </h2>
              <OrderAmounts order={o} />
              <DeliveryPanel
                order={o}
                autor={usuario?.nombre ?? "Comprador"}
                onChanged={refrescar}
              />
            </section>

            <section className="rounded-xl border bg-card p-5" aria-labelledby="pago">
              <h2 id="pago" className="text-base font-semibold">
                Pago
              </h2>
              <PaymentPanel order={o} onChanged={refrescar} />
            </section>

            {canCancel(o.estado) ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full touch-target">
                    Cancelar pedido
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar este pedido?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Puedes cancelar mientras el pedido esté Aceptado. Cuando el taller inicie la
                      producción o lo marque como listo para entrega, ya no podrás cancelarlo. El
                      taller verá la cancelación y el motivo. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="motivo-cancelacion">Motivo (opcional)</Label>
                    <Textarea
                      id="motivo-cancelacion"
                      rows={3}
                      maxLength={200}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Volver</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cancelar.mutate()}>
                      Sí, cancelar pedido
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : o.estado === "en_produccion" ? (
              <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
                El taller ya inició la producción. Este pedido ya no puede ser cancelado por el
                comprador.
              </p>
            ) : null}
          </aside>
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
