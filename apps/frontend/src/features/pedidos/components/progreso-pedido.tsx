/**
 * Tarjeta «Progreso del pedido» (AUD-12): resumen visual en línea de tiempo vertical,
 * complementario a «Seguimiento y entregas». Inspirada en el `OrderTimeline` del prototipo,
 * pero con pasos derivados de `progreso.ts` a partir de datos reales.
 *
 * No hace peticiones propias: usa las mismas `queryKey` que la sección de pago y el
 * seguimiento, de modo que TanStack Query comparte la caché y la petición en vuelo.
 */
import { CalendarX2, Check, Circle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Section } from "@/components/common/page";
import { useSession } from "@/features/auth/use-session";
import { consultarPago } from "@/features/pagos/api";
import { reintentarSalvoErrorDelCliente } from "@/lib/http";
import { claves } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import type { PedidoConfirmado } from "../confirmados";
import { consultarCumplimiento } from "../cumplimiento";
import { TEXTO_ESTADO_PASO, pasosProgreso, type PasoProgreso } from "../progreso";

export function ProgresoPedido({
  pedido,
  recibido = false,
}: {
  pedido: PedidoConfirmado;
  recibido?: boolean;
}) {
  const { usuario } = useSession();
  const pago = useQuery({
    queryKey: claves.pago(usuario?.id, recibido, pedido.id),
    queryFn: ({ signal }) => consultarPago(recibido, pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  const cumplimiento = useQuery({
    queryKey: claves.cumplimiento(usuario?.id, recibido, pedido.id),
    queryFn: ({ signal }) => consultarCumplimiento(recibido, pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <LineaTiempoPedido
      pasos={pasosProgreso({
        // El cumplimiento se reemplaza con la respuesta de cada mutación: es la lectura
        // más reciente del mismo estado del pedido.
        estadoPedido: cumplimiento.data?.estado ?? pedido.estado,
        estadoPago: pago.data?.estado,
        cumplimiento: cumplimiento.data,
      })}
    />
  );
}

export function LineaTiempoPedido({ pasos }: { pasos: PasoProgreso[] }) {
  return (
    <Section title="Progreso del pedido">
      <ol className="min-w-0" aria-label="Etapas del pedido">
        {pasos.map((paso, i) => (
          <PasoLinea key={paso.clave} paso={paso} ultimo={i === pasos.length - 1} />
        ))}
      </ol>
    </Section>
  );
}

function PasoLinea({ paso, ultimo }: { paso: PasoProgreso; ultimo: boolean }) {
  const { estado } = paso;
  const completado = estado === "completado";
  const actual = estado === "actual";
  const negativo = estado === "final_negativo";
  return (
    <li className="flex min-w-0 gap-3" aria-current={actual ? "step" : undefined}>
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border-2",
            completado && "border-success bg-success text-success-foreground",
            actual && "border-primary bg-primary text-primary-foreground",
            negativo && "border-destructive bg-destructive text-destructive-foreground",
            estado === "pendiente" && "border-border bg-card text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {completado ? (
            <Check className="size-4" />
          ) : negativo ? (
            <CalendarX2 className="size-4" />
          ) : (
            <Circle className={cn("size-2.5", actual && "fill-current")} />
          )}
        </span>
        {ultimo ? null : (
          <span
            className={cn("min-h-6 w-0.5 flex-1", completado ? "bg-success" : "bg-border")}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={cn("min-w-0 flex-1", ultimo ? "pb-0" : "pb-4")}>
        <p
          className={cn(
            "break-words text-sm font-medium",
            actual && "text-primary",
            negativo && "text-destructive",
            estado === "pendiente" && "text-muted-foreground",
          )}
        >
          {paso.label}
        </p>
        <p className="text-xs font-medium text-muted-foreground">{TEXTO_ESTADO_PASO[estado]}</p>
        <p className="break-words text-xs text-muted-foreground">{paso.detalle}</p>
      </div>
    </li>
  );
}
