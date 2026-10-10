import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-session";
import { IMAGE_ACCEPT, IMAGE_RULES_TEXT } from "@/lib/image-files";
import { formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/labels";
import {
  correctPayment,
  getPaymentReceipt,
  registerPayment,
  reviewPayment,
  type PaymentInput,
} from "@/features/pagos/api";
import { processImage } from "@/features/catalogo/api";
import type { Order, PaymentAttempt, PaymentReceipt } from "@/types";

function ReceiptImage({
  order,
  attempt,
  receipt,
}: {
  order: Order;
  attempt: PaymentAttempt;
  receipt: PaymentReceipt;
}) {
  const { usuario } = useSession();
  const image = useQuery({
    queryKey: [
      "comprobante",
      order.id,
      attempt.id,
      receipt.id,
      usuario?.rol,
      usuario?.id,
      usuario?.artesanoId,
    ],
    queryFn: () => getPaymentReceipt(order.id, attempt.id, receipt.id, usuario),
    enabled: !!usuario,
    gcTime: 0,
  });
  return (
    <div className="space-y-1">
      <p className="break-all text-xs text-muted-foreground">
        {receipt.nombreArchivo} · {formatDateTime(receipt.subidoEn)} · {receipt.subidoPor}
      </p>
      {image.data ? (
        <a
          href={image.data}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir comprobante completo"
        >
          <img
            src={image.data}
            alt={`Comprobante del intento ${attempt.numero}`}
            className="max-h-64 w-full rounded border object-contain"
          />
        </a>
      ) : image.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {image.error.message}
        </p>
      ) : (
        <p className="text-sm">Cargando comprobante…</p>
      )}
    </div>
  );
}

/** Imágenes privadas por pedido e historial de intentos y resoluciones del mock. */
export function PaymentPanel({ order: o, onChanged }: { order: Order; onChanged: () => void }) {
  const { usuario } = useSession();
  const artisan = usuario?.rol === "artesano" && usuario.artesanoId === o.artesanoId;
  const buyer = usuario?.rol === "comprador" && usuario.id === o.compradorId;
  const [method, setMethod] = useState<PaymentInput["metodo"]>("transferencia");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<PaymentInput["comprobante"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempt = o.pagos.at(-1);
  const deadline = attempt?.estado === "observado" ? attempt.eventos.at(-1)?.plazoHasta : undefined;
  const expired = !!deadline && Date.now() > Date.parse(deadline);
  const canRegister =
    buyer && o.estado === "aceptado" && ["pendiente", "no_recibido"].includes(o.estadoPago);
  const canCorrect = buyer && o.estado === "aceptado" && o.estadoPago === "observado" && !expired;
  const mutation = useMutation({
    mutationFn: (action: "register" | "correct" | "confirmado" | "observado" | "no_recibido") => {
      const actor = usuario?.nombre ?? "Usuario";
      if (action === "correct") return correctPayment(o.id, file!, actor);
      if (action === "register")
        return registerPayment(
          o.id,
          { metodo: method, referencia: reference, nota: note, comprobante: file },
          actor,
        );
      return reviewPayment(o.id, action, actor, reason.trim());
    },
    onSuccess: () => {
      setFile(undefined);
      setReason("");
      onChanged();
      toast.success("Pago actualizado; historial conservado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm text-muted-foreground">
        La plataforma no procesa pagos. Adjuntar un comprobante no confirma fondos; el taller
        confirma su recepción.
      </p>
      {o.pagos.map((p) => (
        <article key={p.id} className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">
            Intento {p.numero} · {PAYMENT_STATUS_LABELS[p.estado]}
          </p>
          <p className="break-words text-sm">
            {PAYMENT_METHOD_LABELS[p.metodo]}
            {p.referencia ? ` · ${p.referencia}` : ""}
            {p.nota ? ` · ${p.nota}` : ""}
          </p>
          {p.comprobantes.map((c) => (
            <ReceiptImage key={c.id} order={o} attempt={p} receipt={c} />
          ))}
          <ol className="space-y-2 text-xs text-muted-foreground">
            {p.eventos.map((ev, index) => (
              <li key={index}>
                {PAYMENT_STATUS_LABELS[ev.estadoNuevo]} · {ev.usuario} · {formatDateTime(ev.fecha)}
                {ev.motivo ? <p className="break-words">{ev.motivo}</p> : null}
                {ev.plazoHasta ? (
                  <p>Corrección hasta {formatDateTime(ev.plazoHasta)} (48 horas)</p>
                ) : null}
              </li>
            ))}
          </ol>
        </article>
      ))}
      {expired ? (
        <p role="status" className="text-sm">
          El plazo de corrección venció. El taller debe resolver el intento; el vencimiento no
          cambia su estado automáticamente.
        </p>
      ) : null}
      {canRegister || canCorrect ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(canCorrect ? "correct" : "register");
          }}
        >
          {canRegister ? (
            <>
              <Label htmlFor="payment-method">Método de pago</Label>
              <select
                id="payment-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentInput["metodo"])}
                className="min-h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="transferencia">Transferencia</option>
                <option value="otro">Otro método</option>
              </select>
              <Label htmlFor="payment-reference">Referencia (opcional)</Label>
              <Input
                id="payment-reference"
                maxLength={40}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <Label htmlFor="payment-note">Nota para el taller (opcional)</Label>
              <Textarea
                id="payment-note"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </>
          ) : (
            <p className="text-sm font-medium">
              Adjunta la corrección del comprobante. El anterior se conserva.
            </p>
          )}
          <Label htmlFor="payment-file">
            Imagen del comprobante{canCorrect ? " *" : " (opcional)"}
          </Label>
          <Input
            id="payment-file"
            type="file"
            accept={IMAGE_ACCEPT}
            disabled={loading || mutation.isPending}
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              e.target.value = "";
              if (!selected) return;
              setLoading(true);
              setError("");
              try {
                const src = await processImage(selected);
                setFile({
                  nombreArchivo: selected.name,
                  tipo: selected.type,
                  tamano: selected.size,
                  src,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo cargar la imagen");
              } finally {
                setLoading(false);
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            {IMAGE_RULES_TEXT} Puedes reemplazarlo antes de enviar.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {file ? (
            <>
              <img
                src={file.src}
                alt="Previsualización del comprobante"
                className="max-h-64 w-full rounded border object-contain"
              />
              <Button type="button" variant="outline" onClick={() => setFile(undefined)}>
                Quitar imagen seleccionada
              </Button>
            </>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || loading || !!error || (canCorrect && !file)}
          >
            {loading ? "Leyendo imagen…" : canCorrect ? "Enviar corrección" : "Registrar pago"}
          </Button>
        </form>
      ) : null}
      {artisan && o.estado === "aceptado" && ["registrado", "observado"].includes(o.estadoPago) ? (
        <div className="space-y-3">
          <Label htmlFor="payment-reason">Motivo de observación o pago no recibido *</Label>
          <Textarea
            id="payment-reason"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("confirmado")}
          >
            Confirmar pago recibido
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={mutation.isPending || !reason.trim() || o.estadoPago === "observado"}
            onClick={() => mutation.mutate("observado")}
          >
            Observar comprobante
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => mutation.mutate("no_recibido")}
          >
            Pago no recibido
          </Button>
        </div>
      ) : null}
      {o.estado === "pendiente" ? (
        <p className="text-sm">
          {artisan
            ? "El comprador podrá registrar el pago cuando aceptes la solicitud."
            : "Podrás registrar el pago cuando el taller acepte la solicitud."}
        </p>
      ) : null}
    </div>
  );
}
