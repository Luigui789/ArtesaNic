import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/status-badge";
import { useSession } from "@/features/auth/use-session";
import { consultarPago } from "@/features/pagos/api";
import { ESTADO_PAGO_LABELS, TONO_ESTADO_PAGO } from "@/features/pagos/labels";
import { claves } from "@/lib/query-keys";
import { reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mostrarImporte } from "@/lib/importes";
import { formatDate, formatDateTime } from "@/lib/format";
import { ESTADO_PEDIDO_LABELS, type PedidoConfirmado } from "../confirmados";
import { consultarCumplimiento } from "../cumplimiento";
import { consultarResolucion } from "../resolucion";

const SECCIONES = [
  ["resumen", "Resumen"],
  ["productos", "Productos"],
  ["pago", "Pago"],
  ["trabajo", "Preparación y entrega"],
  ["mensajes", "Mensajes"],
  ["resolucion", "Cambios y cierre"],
] as const;

/** Composición del detalle real del artesano; no decide permisos ni mutaciones. */
export function PedidoArtesano({
  pedido: p,
  resumen,
  productos,
  entrega,
  pago,
  cumplimiento,
  progreso,
  resolucion,
  mensajes,
}: {
  pedido: PedidoConfirmado;
  resumen: ReactNode;
  productos: ReactNode;
  entrega: ReactNode;
  pago?: ReactNode;
  cumplimiento?: ReactNode;
  progreso?: ReactNode;
  resolucion?: ReactNode;
  mensajes?: ReactNode;
}) {
  const [seccion, setSeccion] = useState("resumen");
  const { usuario } = useSession();
  // Exactamente las claves y adaptadores de los widgets: una consulta por recurso del detalle.
  const payment = useQuery({
    queryKey: claves.pago(usuario?.id, true, p.id),
    queryFn: ({ signal }) => consultarPago(true, p.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  const work = useQuery({
    queryKey: claves.cumplimiento(usuario?.id, true, p.id),
    queryFn: ({ signal }) => consultarCumplimiento(true, p.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  const resolution = useQuery({
    queryKey: claves.resolucion(usuario?.id, true, p.id),
    queryFn: ({ signal }) => consultarResolucion(true, p.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  const cerrado = [
    "entregado",
    "vencido_falta_pago",
    "cancelado_artesano",
    "cerrado_parcial",
  ].includes(p.estado);
  const avisos: string[] = [];
  if (p.estado === "vencido_falta_pago")
    avisos.push(
      "El pedido venció por falta de pago. Consultá su historial; no admite nuevas operaciones.",
    );
  if (payment.data?.revisionPendiente)
    avisos.push("Hay un comprobante que requiere tu revisión antes de continuar.");
  if (payment.data?.estado === "observado")
    avisos.push("El comprobante necesita corrección por parte del comprador.");
  if (payment.data?.estado === "no_recibido")
    avisos.push("El pago figura como no recibido. Consultá el intento y su plazo.");
  if (payment.data?.registrableHasta)
    avisos.push(
      `Plazo para registrar o corregir el pago: ${formatDateTime(payment.data.registrableHasta)}.`,
    );
  if (resolution.data?.cancelacion)
    avisos.push(`Cancelado por el taller: ${resolution.data.cancelacion.motivo}`);
  if (resolution.data?.cierresParciales.some((c) => c.estado === "pendiente"))
    avisos.push(
      "Hay un cierre parcial pendiente de respuesta. Revisá Cambios y cierre antes de continuar.",
    );
  if (resolution.data?.cierresParciales.some((c) => c.estado === "objetado"))
    avisos.push(
      "El historial contiene un cierre objetado por el comprador. Consultá Cambios y cierre.",
    );
  if (resolution.data?.reembolso?.estado === "pendiente")
    avisos.push("Hay un reembolso pendiente. Consultá Cambios y cierre.");
  if (work.data?.entregas.some((e) => e.recepcion?.resultado === "discrepancia"))
    avisos.push("Hay una discrepancia registrada en una entrega. Consultá Preparación y entrega.");
  const cargando = payment.isPending || work.isPending || resolution.isPending;
  const fallo = payment.isError || work.isError || resolution.isError;
  const accion =
    resolution.data?.reembolso?.estado === "pendiente" ||
    resolution.data?.cierresParciales.some((c) => c.estado === "pendiente")
      ? { tab: "resolucion", texto: "Revisar cambios y cierre" }
      : payment.data?.revisionPendiente
        ? { tab: "pago", texto: "Revisar comprobante" }
        : cerrado
          ? { tab: "resolucion", texto: "Consultar historial y cierre" }
          : payment.data?.estado === "confirmado"
            ? { tab: "trabajo", texto: "Ver preparación y entregas" }
            : { tab: "pago", texto: "Consultar pago" };
  return (
    <div className="min-w-0 space-y-5">
      <section
        aria-label="Resumen operativo del pedido"
        className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="break-words font-semibold">
              Comprador: {p.comprador?.nombre ?? "Comprador"}
            </p>
            <p className="text-sm text-muted-foreground">
              Confirmado el {formatDate(p.confirmadoEn)}
            </p>
            <StatusBadge tone={cerrado ? "neutral" : "pending"} prefix="Estado del pedido">
              {ESTADO_PEDIDO_LABELS[p.estado]}
            </StatusBadge>
            {payment.data ? (
              <StatusBadge tone={TONO_ESTADO_PAGO[payment.data.estado]} prefix="Estado del pago">
                {ESTADO_PAGO_LABELS[payment.data.estado]}
              </StatusBadge>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total acordado</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {mostrarImporte(p.total)}
            </p>
          </div>
        </div>
        {cargando ? (
          <p role="status" className="text-sm">
            Comprobando pago, entregas y avisos del pedido…
          </p>
        ) : null}
        {fallo ? (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3 text-sm">
            <p>
              No pudimos comprobar todos los avisos. Consultá las secciones antes de realizar una
              acción.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                void payment.refetch();
                void work.refetch();
                void resolution.refetch();
              }}
            >
              Reintentar avisos
            </Button>
          </div>
        ) : null}
        {avisos.length ? (
          <ul
            aria-label="Avisos del pedido"
            className="space-y-2 rounded-lg border border-warning bg-warning/10 p-4 text-sm"
          >
            {avisos.map((a) => (
              <li key={a} className="break-words">
                {a}
              </li>
            ))}
          </ul>
        ) : null}
        {!cargando && !fallo ? (
          <div className="space-y-2">
            <p className="text-sm">
              {cerrado
                ? "El pedido finalizó. Los acuerdos y registros se conservan."
                : payment.data?.estado === "confirmado"
                  ? "Cada producto avanza por separado. Revisá lo que falta preparar o entregar."
                  : "Consultá el comprobante y el plazo para saber qué falta antes de continuar."}
            </p>
            <Button onClick={() => setSeccion(accion.tab)}>{accion.texto}</Button>
          </div>
        ) : null}
      </section>
      <Tabs value={seccion} onValueChange={setSeccion}>
        <TabsList
          aria-label="Secciones del pedido"
          className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3"
        >
          {SECCIONES.map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="whitespace-normal data-[state=active]:font-semibold"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="my-3 text-sm text-muted-foreground">
          Elegí una sección. Los datos que escribas se conservan al cambiar de pestaña.
        </p>
        <TabsContent forceMount value="resumen" className="data-[state=inactive]:hidden">
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {progreso}
            {resumen}
          </div>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`/panel/solicitudes/${p.solicitud}`}>Ver solicitud y propuesta</Link>
          </Button>
        </TabsContent>
        <TabsContent
          forceMount
          value="productos"
          className="space-y-4 data-[state=inactive]:hidden"
        >
          {productos}
        </TabsContent>
        <TabsContent forceMount value="pago" className="data-[state=inactive]:hidden">
          {pago}
        </TabsContent>
        <TabsContent forceMount value="trabajo" className="space-y-4 data-[state=inactive]:hidden">
          {entrega}
          {cumplimiento}
        </TabsContent>
        <TabsContent forceMount value="mensajes" className="data-[state=inactive]:hidden">
          {mensajes}
        </TabsContent>
        <TabsContent forceMount value="resolucion" className="data-[state=inactive]:hidden">
          <p className="mb-4 text-sm text-muted-foreground">
            Consultá cancelaciones, cierres y reembolsos. Las acciones disponibles dependen del
            estado actual y mantienen sus confirmaciones.
          </p>
          {resolucion}
        </TabsContent>
      </Tabs>
    </div>
  );
}
