import { PaymentPanel } from "@/features/pagos/components/payment-receipt";
import {
  DeliveryPanel,
  OrderAmounts,
  CancelledUnits,
} from "@/features/pedidos/components/delivery-panel";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { changeOrderStatus, getOrder } from "@/features/pedidos/api";
import { getProduct } from "@/features/catalogo/api";
import { isTerminal, nextOrderStates, requiresConfirmedPayment } from "@/lib/order-state";
import { formatDateTime } from "@/lib/format";
import { orderTotal } from "@/lib/order-amounts";
import { useCurrency } from "@/hooks/use-currency";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";
import { ORDER_STATUS_LABELS } from "@/lib/labels";
import type { OrderStatus } from "@/types";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";

/** Texto de cada acción del artesano, según el estado de destino (RF-005, RF-010). */
const ACCION: Partial<Record<OrderStatus, string>> = {
  aceptado: "Aceptar solicitud",
  en_produccion: "Iniciar producción",
  listo_para_entrega: "Marcar como listo para entrega",
  entregado: "Marcar como entregado",
};

export default function GestionPedido() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = parseRouteId(idParam);
  const queryClient = useQueryClient();
  const { format } = useCurrency();
  const { usuario } = useSession();
  const autor = usuario?.nombre ?? "Artesano";

  useDocumentHead({
    title: "Gestión del pedido | Panel del artesano",
    meta: [
      {
        name: "description",
        content:
          "Acepta o rechaza la solicitud, actualiza producción, define la entrega y confirma el pago del pedido.",
      },
      { property: "og:title", content: "Gestión del pedido | Panel del artesano" },
      { property: "og:description", content: "Control del flujo del pedido bajo demanda." },
      { property: "og:url", content: `/panel/pedidos/${id}` },
      { name: "robots", content: "noindex" },
    ],
    canonical: `/panel/pedidos/${id}`,
  });

  const [motivo, setMotivo] = useState("");
  const [rechazoAbierto, setRechazoAbierto] = useState(false);
  const [aceptacionAbierta, setAceptacionAbierta] = useState(false);

  const pedido = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => getOrder(id!),
    enabled: id !== undefined,
  });
  const producto = useQuery({
    queryKey: ["producto", pedido.data?.productoId],
    queryFn: () => getProduct(pedido.data!.productoId),
    enabled: !!pedido.data,
  });

  const refrescar = () => {
    void queryClient.invalidateQueries();
  };

  const cambiar = useMutation({
    mutationFn: (v: { estado: OrderStatus; motivo?: string }) =>
      changeOrderStatus(id!, v.estado, autor, v.motivo),
    onSuccess: (o) => {
      refrescar();
      setRechazoAbierto(false);
      setAceptacionAbierta(false);
      toast.success(`Pedido actualizado a "${ORDER_STATUS_LABELS[o.estado]}"`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (id === undefined) return <NotFound />;

  if (pedido.isError) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <ErrorState
            mensaje="No pudimos cargar este pedido."
            onRetry={() => void pedido.refetch()}
          />
        </div>
      </SiteLayout>
    );
  }

  if (pedido.isPending) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </SiteLayout>
    );
  }

  const o = pedido.data;
  const siguientes = nextOrderStates(o.estado, o.opcion).filter((s) => s !== "cancelado");
  const total = o.cotizacionCongelada?.total ?? orderTotal(o);
  const cerrado = isTerminal(o.estado);
  // D-2: la interfaz refleja la precondición que el servicio impone.
  const esperaPago = (s: OrderStatus) =>
    requiresConfirmedPayment(o.estado, s) && o.estadoPago !== "confirmado";

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          to="/panel/pedidos"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a pedidos
        </Link>

        <header className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold">Pedido {o.codigo}</h1>
            <p className="text-sm text-muted-foreground">
              {o.compradorNombre} · {formatDateTime(o.creadoEn)}
            </p>
          </div>
          <StatusPair estado={o.estado} estadoPago={o.estadoPago} />
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            <section className="rounded-xl border bg-card p-5" aria-labelledby="solicitud">
              <h2 id="solicitud" className="text-base font-semibold">
                Solicitud del comprador
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
                  <p className="text-sm text-muted-foreground">
                    Cantidad: {o.cantidad} · {format(o.precioUnitario * o.cantidad)}
                  </p>
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
              </dl>
            </section>

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

            <section aria-labelledby="mensajes">
              <h2 id="mensajes" className="sr-only">
                Mensajería con el comprador
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

          {/* En móvil, las acciones del artesano van primero. */}
          <aside className="order-first space-y-6 lg:order-none">
            <section className="rounded-xl border bg-card p-5" aria-labelledby="acciones">
              <h2 id="acciones" className="text-base font-semibold">
                Acciones
              </h2>
              {siguientes.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Este pedido ya llegó a un estado final.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {siguientes
                    .filter((s) => s !== "rechazado")
                    .map((s) => (
                      <div key={s} className="space-y-2">
                        <Button
                          className="w-full touch-target"
                          disabled={
                            cambiar.isPending ||
                            esperaPago(s) ||
                            (s === "aceptado" &&
                              (!o.entrega ||
                                !producto.data ||
                                producto.data.unidadesDisponibles < o.cantidad))
                          }
                          aria-describedby={esperaPago(s) ? `espera-${s}` : undefined}
                          onClick={() => {
                            if (s === "aceptado") setAceptacionAbierta(true);
                            else cambiar.mutate({ estado: s });
                          }}
                        >
                          {ACCION[s] ?? ORDER_STATUS_LABELS[s]}
                        </Button>
                        {s === "aceptado" ? (
                          <p className="text-sm text-muted-foreground">
                            {!o.entrega
                              ? "Guarda la cotización de entrega antes de aceptar."
                              : producto.data && producto.data.unidadesDisponibles < o.cantidad
                                ? "Ya no hay unidades suficientes para aceptar."
                                : `Se reservarán ${o.cantidad} unidades y se congelará el total de ${format(total)}.`}
                          </p>
                        ) : null}
                        {esperaPago(s) ? (
                          <p id={`espera-${s}`} className="text-sm text-muted-foreground">
                            {o.estadoPago === "registrado"
                              ? "Confirma primero el pago del comprador; después podrás avanzar el pedido."
                              : "El comprador todavía no registra el pago. El pedido avanza cuando el pago está confirmado."}
                          </p>
                        ) : null}
                      </div>
                    ))}

                  {siguientes.includes("rechazado") ? (
                    <Dialog open={rechazoAbierto} onOpenChange={setRechazoAbierto}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full touch-target">
                          Rechazar solicitud
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Rechazar solicitud</DialogTitle>
                          <DialogDescription>
                            Explica el motivo para que el comprador entienda la decisión.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor="motivo-rechazo">Motivo *</Label>
                          <Textarea
                            id="motivo-rechazo"
                            rows={4}
                            maxLength={200}
                            aria-describedby="ayuda-rechazo"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                          />
                          <p id="ayuda-rechazo" className="text-xs text-muted-foreground">
                            Escribe al menos 5 caracteres. El rechazo es definitivo.
                          </p>
                        </div>
                        <Button
                          className="touch-target"
                          disabled={motivo.trim().length < 5 || cambiar.isPending}
                          onClick={() =>
                            cambiar.mutate({ estado: "rechazado", motivo: motivo.trim() })
                          }
                        >
                          Confirmar rechazo
                        </Button>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              )}
            </section>

            {/* El pago va antes que la entrega: confirmarlo es la acción que desbloquea la producción. */}
            <section className="rounded-xl border bg-card p-5" aria-labelledby="pago">
              <h2 id="pago" className="text-base font-semibold">
                Pago
              </h2>
              <OrderAmounts order={o} />
              <PaymentPanel order={o} onChanged={refrescar} />
            </section>

            <section className="rounded-xl border bg-card p-5" aria-labelledby="entrega">
              <h2 id="entrega" className="text-base font-semibold">
                Entrega
              </h2>
              <DeliveryPanel
                key={`${o.id}-${o.entrega?.modalidad}-${o.entrega?.detalle}-${o.entrega?.notasCotizacion}-${o.entrega?.fechaRecogida}-${o.costoEntrega}-${o.estado}`}
                order={o}
                autor={autor}
                onChanged={refrescar}
                editable
              />
            </section>
            <CancelledUnits order={o} autor={autor} onChanged={refrescar} />
          </aside>
        </div>
        <AlertDialog open={aceptacionAbierta} onOpenChange={setAceptacionAbierta}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Aceptar la solicitud {o.codigo}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se reservarán {o.cantidad} unidades. La disponibilidad se comprobará nuevamente y la
                modalidad y los importes quedarán congelados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <OrderAmounts order={o} />
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction
                disabled={cambiar.isPending}
                onClick={() => cambiar.mutate({ estado: "aceptado" })}
              >
                Aceptar y reservar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SiteLayout>
  );
}
