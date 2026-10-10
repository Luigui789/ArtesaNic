import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/hooks/use-currency";
import { DELIVERY_MODE_LABELS } from "@/lib/labels";
import { orderBreakdown } from "@/lib/order-amounts";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  classifyCancelledUnits,
  setDeliveryCoordination,
  setDeliveryQuote,
} from "@/features/pedidos/api";
import { getArtisan } from "@/features/talleres/api";
import type { Order } from "@/types";

export function OrderAmounts({ order }: { order: Order }) {
  const { format } = useCurrency();
  const b = orderBreakdown(order);
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="font-medium">
        {b.congelado
          ? `Total congelado el ${formatDateTime(b.congeladaEn!)}`
          : "Cotización propuesta"}
      </p>
      <dl className="space-y-2">
        <div className="flex justify-between gap-2">
          <dt>Producto ×{b.cantidad}</dt>
          <dd>{format(b.precioUnitario * b.cantidad)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Costos adicionales</dt>
          <dd>{format(b.costosAdicionales)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Entrega</dt>
          <dd>{b.modalidad ? format(b.costoEntrega) : "Por cotizar"}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t pt-2 font-semibold">
          <dt>{b.modalidad ? "Total" : "Subtotal"}</dt>
          <dd className="text-primary">{format(b.total)}</dd>
        </div>
      </dl>
      {b.modalidad ? (
        <p>{DELIVERY_MODE_LABELS[b.modalidad]}</p>
      ) : (
        <p className="text-muted-foreground">
          El taller debe cotizar el costo de entrega antes de aceptar.
        </p>
      )}
    </div>
  );
}

export function DeliveryPanel({
  order: o,
  autor,
  onChanged,
  editable = false,
}: {
  order: Order;
  autor: string;
  onChanged: () => void;
  editable?: boolean;
}) {
  const pending = o.estado === "pendiente";
  const mode = pending
    ? o.entregaPreferida.modalidad
    : (o.entrega?.modalidad ?? o.entregaPreferida.modalidad);
  const pickup = mode === "retiro_en_taller";
  const active = ["aceptado", "en_produccion", "listo_para_entrega"].includes(o.estado);
  const [cost, setCost] = useState(String(o.costoEntrega));
  const [notes, setNotes] = useState(
    o.entrega?.notasCotizacion ?? (pending ? (o.entrega?.detalle ?? "") : ""),
  );
  const [detail, setDetail] = useState(o.entrega?.detalle ?? "");
  const [date, setDate] = useState(o.entrega?.fechaRecogida ?? "");
  const workshop = useQuery({
    queryKey: ["artesano", o.artesanoId],
    queryFn: () => getArtisan(o.artesanoId),
    enabled: pickup,
  });
  const mutation = useMutation({
    mutationFn: () =>
      pending
        ? setDeliveryQuote(o.id, pickup ? 0 : Number(cost), notes.trim() || undefined, autor)
        : setDeliveryCoordination(
            o.id,
            pickup ? { fechaRecogida: date } : { detalle: detail },
            autor,
          ),
    onSuccess: () => {
      onChanged();
      toast.success(pending ? "Cotización guardada" : "Coordinación guardada; total conservado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-3 space-y-3 text-sm">
      <p>
        Modalidad elegida por el comprador:{" "}
        <strong>{DELIVERY_MODE_LABELS[o.entregaPreferida.modalidad]}</strong>
        {o.entregaPreferida.detalle ? " · " + o.entregaPreferida.detalle : ""}
      </p>
      {o.entregaPreferida.ubicacion ? (
        <p className="whitespace-pre-line break-words">
          <strong>Ubicación indicada por el comprador:</strong> {o.entregaPreferida.ubicacion}
        </p>
      ) : null}
      {o.entrega ? (
        <>
          <p>Cotización de entrega registrada.</p>
          {o.entrega.notasCotizacion ? (
            <p className="whitespace-pre-line break-words">
              <strong>Notas de cotización:</strong> {o.entrega.notasCotizacion}
            </p>
          ) : null}
          {!pending && !pickup && o.entrega.detalle ? (
            <p className="whitespace-pre-line break-words">
              <strong>Coordinación:</strong> {o.entrega.detalle}
            </p>
          ) : null}
        </>
      ) : (
        <p>El taller todavía no cotiza la entrega.</p>
      )}
      {pickup ? (
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <p className="font-medium">Dirección para recoger en el taller</p>
          {workshop.data ? (
            <p className="whitespace-pre-line break-words">
              {workshop.data.ubicacion || "El taller aún no registra su dirección en el perfil."}
            </p>
          ) : workshop.isError ? (
            <>
              <p>No se pudo cargar la dirección del taller.</p>
              <Button type="button" variant="outline" onClick={() => void workshop.refetch()}>
                Reintentar
              </Button>
            </>
          ) : (
            <p role="status">Cargando dirección del taller…</p>
          )}
          {!pending ? (
            <p>
              <strong>Fecha de recogida:</strong>{" "}
              {o.entrega?.fechaRecogida
                ? formatDate(o.entrega.fechaRecogida + "T00:00:00")
                : "Por coordinar"}
            </p>
          ) : null}
        </div>
      ) : null}
      {o.cotizacionCongelada ? (
        <p className="text-muted-foreground">
          Modalidad e importes congelados.{" "}
          {pickup
            ? "Se coordina la fecha de recogida; la dirección viene del perfil del taller."
            : "La ubicación del comprador se conserva para coordinar la entrega."}
        </p>
      ) : null}
      {editable && (pending || active) ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          {pending ? (
            <>
              <Label htmlFor="delivery-cost">Costo de entrega (C$) *</Label>
              <Input
                id="delivery-cost"
                required
                type="number"
                min={0}
                step="0.01"
                value={pickup ? "0" : cost}
                disabled={pickup}
                onChange={(e) => setCost(e.target.value)}
              />
              <Label htmlFor="delivery-quote-notes">Notas de cotización (opcional)</Label>
              <Textarea
                id="delivery-quote-notes"
                maxLength={200}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          ) : pickup ? (
            <>
              <Label htmlFor="pickup-date">Fecha de recogida en el taller *</Label>
              <Input
                id="pickup-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-describedby="pickup-date-help"
              />
              <p id="pickup-date-help" className="text-xs text-muted-foreground">
                Selecciona la fecha acordada con el comprador. La dirección se toma del perfil del
                taller.
              </p>
            </>
          ) : (
            <>
              <Label htmlFor="delivery-detail">
                Fecha acordada e indicaciones de coordinación *
              </Label>
              <Textarea
                id="delivery-detail"
                required
                maxLength={200}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
              {o.entregaPreferida.ubicacion ? (
                <p className="text-xs text-muted-foreground">
                  La ubicación del comprador se conserva. Usa estas notas para coordinar la fecha y
                  las indicaciones de entrega.
                </p>
              ) : null}
            </>
          )}
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={mutation.isPending || (!pending && pickup && !date)}
          >
            {pending
              ? "Guardar cotización"
              : pickup
                ? "Guardar fecha de recogida"
                : "Guardar coordinación"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function CancelledUnits({
  order: o,
  autor,
  onChanged,
}: {
  order: Order;
  autor: string;
  onChanged: () => void;
}) {
  const [available, setAvailable] = useState("");
  const [removed, setRemoved] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      classifyCancelledUnits(o.id, Number(available), Number(removed), reason, autor),
    onSuccess: () => {
      onChanged();
      toast.success("Unidades clasificadas");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (o.reserva?.estado !== "pendiente_clasificacion") return null;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Clasificar unidades del pedido cancelado</h2>
      <p className="text-sm">
        {o.reserva.cantidad} unidades siguen fuera del catálogo hasta su clasificación.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Label htmlFor="units-return">Vuelven a estar disponibles *</Label>
        <Input
          id="units-return"
          required
          type="number"
          min={0}
          step={1}
          value={available}
          onChange={(e) => setAvailable(e.target.value)}
        />
        <Label htmlFor="units-remove">Se dan de baja *</Label>
        <Input
          id="units-remove"
          required
          type="number"
          min={0}
          step={1}
          value={removed}
          onChange={(e) => setRemoved(e.target.value)}
        />
        <Label htmlFor="units-reason">Motivo *</Label>
        <Textarea
          id="units-reason"
          required
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={
            mutation.isPending ||
            !reason.trim() ||
            available === "" ||
            removed === "" ||
            Number(available) + Number(removed) !== o.reserva.cantidad
          }
        >
          Guardar clasificación
        </Button>
      </form>
    </section>
  );
}
