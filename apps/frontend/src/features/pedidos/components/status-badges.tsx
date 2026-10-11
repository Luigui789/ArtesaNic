import {
  Ban,
  CheckCircle2,
  Clock,
  Hammer,
  PackageCheck,
  Receipt,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import type { OrderStatus, PaymentStatus } from "@/types";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ORDER_STYLE: Record<OrderStatus, { icon: typeof Clock; className: string }> = {
  pendiente: { icon: Clock, className: "bg-surface text-surface-foreground border-border" },
  aceptado: { icon: ThumbsUp, className: "bg-secondary/10 text-secondary border-secondary/30" },
  en_produccion: {
    icon: Hammer,
    className: "bg-accent/25 text-accent-foreground border-accent/50",
  },
  listo_para_entrega: {
    icon: PackageCheck,
    className: "bg-primary/10 text-primary border-primary/30",
  },
  entregado: { icon: CheckCircle2, className: "bg-success/10 text-success border-success/30" },
  rechazado: {
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  cancelado: { icon: Ban, className: "bg-muted text-muted-foreground border-border" },
};

const PAYMENT_STYLE: Record<PaymentStatus, { icon: typeof Clock; className: string }> = {
  observado: { icon: Receipt, className: "bg-accent/25 text-accent-foreground border-accent/50" },
  no_recibido: {
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  pendiente: { icon: Clock, className: "bg-surface text-surface-foreground border-border" },
  registrado: {
    icon: Receipt,
    className: "bg-accent/25 text-accent-foreground border-accent/50",
  },
  confirmado: { icon: CheckCircle2, className: "bg-success/10 text-success border-success/30" },
};

function BaseBadge({
  label,
  prefijo,
  icon: Icon,
  className,
}: {
  label: string;
  prefijo: string;
  icon: typeof Clock;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="sr-only">{prefijo}: </span>
        {label}
      </span>
    </span>
  );
}

/** RF-010: estado del pedido, siempre con icono + texto (nunca solo color). */
export function OrderStatusBadge({ estado }: { estado: OrderStatus }) {
  const s = ORDER_STYLE[estado];
  return (
    <BaseBadge
      label={ORDER_STATUS_LABELS[estado]}
      prefijo="Estado del pedido"
      icon={s.icon}
      className={s.className}
    />
  );
}

/** RF-011: estado del pago, independiente del estado del pedido. */
export function PaymentStatusBadge({ estado }: { estado: PaymentStatus }) {
  const s = PAYMENT_STYLE[estado];
  return (
    <BaseBadge
      label={PAYMENT_STATUS_LABELS[estado]}
      prefijo="Estado del pago"
      icon={s.icon}
      className={s.className}
    />
  );
}

export function StatusPair({
  estado,
  estadoPago,
}: {
  estado: OrderStatus;
  estadoPago: PaymentStatus;
}) {
  // Cada etiqueta viaja junto a su insignia para que, al envolver la línea, no se separen.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="inline-flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Pedido</span>
        <OrderStatusBadge estado={estado} />
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Pago</span>
        <PaymentStatusBadge estado={estadoPago} />
      </span>
    </div>
  );
}
