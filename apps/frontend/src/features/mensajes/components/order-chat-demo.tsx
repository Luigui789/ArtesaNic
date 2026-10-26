import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, MessageSquareOff, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// Demo: servidor simulado directo, sin pasar por la API real de mensajes (AUD-16).
import { listMessages, pollNewMessages, sendMessage } from "@/mocks/mensajes";
import { chatMode } from "@/lib/order-state";
import { formatDate, formatTime, relativeSeconds } from "@/lib/format";
import { useSession } from "@/features/auth/use-session";
import type { OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

const POLL_MS = 15000; // RNF-010

/**
 * LEGACY/DEMO: chat del pedido simulado (estados de `order-state.ts`, cursor por fecha). El chat
 * real de AUD-16 es `OrderChat` (`order-chat.tsx`); esta versión solo sirve a las pantallas demo.
 */
export function OrderChatDemo({ pedidoId, estado }: { pedidoId: number; estado: OrderStatus }) {
  const modo = chatMode(estado);
  const queryClient = useQueryClient();
  const { usuario } = useSession();
  const [texto, setTexto] = useState("");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(() => Date.now());
  const [, forceTick] = useState(0);
  const lastFecha = useRef<string>(new Date(0).toISOString());
  const listaRef = useRef<HTMLDivElement>(null);

  const mensajes = useQuery({
    queryKey: ["mensajes", pedidoId],
    queryFn: () => listMessages(pedidoId),
    enabled: modo !== "none",
  });

  useEffect(() => {
    const last = mensajes.data?.at(-1);
    if (last) lastFecha.current = last.fecha;
    // Solo se desplaza la lista de mensajes: mover la página haría saltar la vista al chat.
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [mensajes.data]);

  // Polling simulado: solo trae mensajes nuevos.
  useEffect(() => {
    if (modo !== "active") return;
    const id = setInterval(() => {
      void pollNewMessages(pedidoId, lastFecha.current).then((nuevos) => {
        setUltimaActualizacion(Date.now());
        if (nuevos.length > 0) {
          void queryClient.invalidateQueries({ queryKey: ["mensajes", pedidoId] });
        }
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [modo, pedidoId, queryClient]);

  // Refresca el texto "Actualizado hace N segundos".
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const enviar = useMutation({
    mutationFn: (t: string) =>
      sendMessage(pedidoId, usuario?.rol ?? "comprador", usuario?.nombre ?? "Usuario", t),
    onSuccess: () => {
      setTexto("");
      void queryClient.invalidateQueries({ queryKey: ["mensajes", pedidoId] });
    },
    onError: () => toast.error("No pudimos enviar el mensaje. Intenta nuevamente."),
  });

  if (modo === "none") {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <MessageSquareOff className="size-5 shrink-0" aria-hidden="true" />
        Esta solicitud fue rechazada, por lo que no tiene mensajería.
      </div>
    );
  }

  if (modo === "disabled") {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <Lock className="size-5 shrink-0" aria-hidden="true" />
        La mensajería se habilita cuando el artesano acepta la solicitud.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Mensajes del pedido</h3>
        {/* Sin región viva: el texto cambia cada segundo y saturaría el lector de pantalla. */}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Actualizado {relativeSeconds(ultimaActualizacion)}
        </p>
      </div>

      <div
        ref={listaRef}
        role="log"
        aria-label="Conversación del pedido"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-96 space-y-3 overflow-y-auto p-4"
      >
        {mensajes.isPending ? (
          <div className="space-y-3">
            <div className="h-14 animate-pulse rounded-lg bg-surface" />
            <div className="h-14 animate-pulse rounded-lg bg-surface" />
          </div>
        ) : mensajes.isError ? (
          <div role="alert" className="text-sm text-destructive">
            No pudimos cargar los mensajes.{" "}
            <button className="underline" onClick={() => void mensajes.refetch()}>
              Reintentar
            </button>
          </div>
        ) : mensajes.data && mensajes.data.length > 0 ? (
          mensajes.data.map((m) => {
            const propio = m.autor === (usuario?.rol ?? "comprador");
            return (
              <div key={m.id} className={cn("flex", propio ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                    propio ? "bg-primary/10 border-primary/20" : "bg-surface",
                  )}
                >
                  <p className="text-xs font-medium text-muted-foreground">{m.autorNombre}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.texto}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(m.fecha)} · {formatTime(m.fecha)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay mensajes en este pedido. Escribe el primero para coordinar los detalles.
          </p>
        )}
      </div>

      {modo === "readonly" ? (
        <p className="flex items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          Este pedido está cerrado. La conversación queda solo para consulta.
        </p>
      ) : (
        <form
          className="flex flex-col gap-2 border-t p-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim().length === 0) return;
            enviar.mutate(texto.trim());
          }}
        >
          <div className="flex-1">
            <label htmlFor="mensaje" className="sr-only">
              Escribe un mensaje
            </label>
            <Textarea
              id="mensaje"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe un mensaje para coordinar el pedido…"
              rows={2}
              maxLength={500}
            />
          </div>
          <Button
            type="submit"
            className="touch-target"
            disabled={enviar.isPending || texto.trim().length === 0}
          >
            <Send className="size-4" aria-hidden="true" />
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </form>
      )}
    </div>
  );
}
