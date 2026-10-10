import { Ban, Check, Circle, XCircle } from "lucide-react";
import type { AuditEvent, OrderOption, OrderStatus } from "@/types";
import { orderFlow } from "@/lib/order-state";
import { auditStateLabel, AUDIT_TYPE_LABELS, ORDER_STATUS_LABELS } from "@/lib/labels";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** RF-010: línea de tiempo del pedido con pasos completados, actual y pendientes. */
export function OrderTimeline({ estado, opcion }: { estado: OrderStatus; opcion: OrderOption }) {
  const ORDER_FLOW = orderFlow(opcion);
  const terminalNegativo = estado === "rechazado" || estado === "cancelado";
  const actualIndex = terminalNegativo ? -1 : ORDER_FLOW.indexOf(estado);

  return (
    <div>
      <ol className="space-y-0">
        {ORDER_FLOW.map((paso, i) => {
          const completado = !terminalNegativo && i < actualIndex;
          const actual = !terminalNegativo && i === actualIndex;
          return (
            <li key={paso} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border-2",
                    completado && "border-success bg-success text-success-foreground",
                    actual && "border-primary bg-primary text-primary-foreground",
                    !completado && !actual && "border-border bg-card text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {completado ? (
                    <Check className="size-4" />
                  ) : (
                    <Circle className="size-2.5 fill-current" />
                  )}
                </span>
                {i < ORDER_FLOW.length - 1 ? (
                  <span
                    className={cn("h-8 w-0.5", completado ? "bg-success" : "bg-border")}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <div className="pb-2">
                <p
                  className={cn(
                    "text-sm font-medium",
                    actual && "text-primary",
                    !completado && !actual && "text-muted-foreground",
                  )}
                >
                  {ORDER_STATUS_LABELS[paso]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {completado ? "Completado" : actual ? "Paso actual" : "Pendiente"}
                  {/* RF-010: precondición visible, sin mezclar el estado del pago con el del pedido. */}
                  {paso === "en_produccion" && !completado && !actual && !terminalNegativo
                    ? " · inicia cuando el pago está confirmado"
                    : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {terminalNegativo ? (
        <p
          className={cn(
            "mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
            estado === "rechazado"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {estado === "rechazado" ? (
            <XCircle className="size-4" aria-hidden="true" />
          ) : (
            <Ban className="size-4" aria-hidden="true" />
          )}
          {estado === "rechazado"
            ? "Solicitud rechazada. Este es un estado final."
            : "Pedido cancelado. Este es un estado final."}
        </p>
      ) : null}
    </div>
  );
}

/** RNF-008: historial de trazabilidad de estados de pedido y de pago. */
export function AuditTimeline({ eventos }: { eventos: AuditEvent[] }) {
  const ordenados = [...eventos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <ol className="space-y-3">
      {ordenados.map((e) => (
        <li key={e.id} className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
              {AUDIT_TYPE_LABELS[e.tipo]}
            </span>
            {/* Entrega y unidades no cambian estado: se describen solo en `detalle`. */}
            {e.tipo === "pedido" || e.tipo === "pago" ? (
              <>
                <span className="text-muted-foreground">
                  {auditStateLabel(e.tipo, e.estadoAnterior)}
                </span>
                <span aria-hidden="true">→</span>
                <span className="font-medium">{auditStateLabel(e.tipo, e.estadoNuevo)}</span>
              </>
            ) : null}
          </div>
          {e.detalle ? <p className="mt-1 break-words text-sm">{e.detalle}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {e.usuario} · {formatDate(e.fecha)} · {formatTime(e.fecha)}
          </p>
        </li>
      ))}
    </ol>
  );
}
