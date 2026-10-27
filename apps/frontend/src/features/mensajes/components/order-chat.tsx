import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-session";
import {
  agregarPropio,
  enviarMensaje,
  INTERVALO_SONDEO_MS,
  listarMensajes,
  MAX_TEXTO,
  sondearNovedades,
  type ConversacionPedido,
  type MensajePedido,
} from "@/features/mensajes/api";
import { ESTADOS_TERMINALES, type EstadoPedidoOperativo } from "@/features/pedidos/confirmados";
import { ApiError, reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mensajeDominio } from "@/lib/errores-dominio";
import { formatDate, formatTime } from "@/lib/format";
import { claves } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export const AVISO_SOLO_LECTURA =
  "Este pedido finalizó. La conversación queda disponible solo para consulta.";

/**
 * RF-014 (AUD-16): conversación privada del pedido confirmado, la misma para comprador y
 * artesano. El servidor decide autor, permisos y si admite mensajes (`soloLectura`).
 */
export function OrderChat({ pedido, estado }: { pedido: number; estado: EstadoPedidoOperativo }) {
  const queryClient = useQueryClient();
  const { usuario } = useSession();
  const usuarioId = usuario?.id;
  const clave = claves.mensajes(usuarioId, pedido);
  const [texto, setTexto] = useState("");
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorSondeo, setErrorSondeo] = useState(false);
  const sondeando = useRef(false);

  // Primera lectura: historial completo. Después solo deltas: sin refetch automático.
  const conversacion = useQuery({
    queryKey: clave,
    queryFn: ({ signal }) => listarMensajes(pedido, undefined, signal),
    retry: reintentarSalvoErrorDelCliente,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // El servidor es la autoridad; un estado terminal ya conocido también cierra el compositor.
  const soloLectura = conversacion.data?.soloLectura === true || ESTADOS_TERMINALES.has(estado);
  const cargada = conversacion.isSuccess;

  const sondear = useCallback(async () => {
    if (sondeando.current) return;
    sondeando.current = true;
    try {
      await sondearNovedades(queryClient, claves.mensajes(usuarioId, pedido), pedido);
      setErrorSondeo(false);
    } catch {
      setErrorSondeo(true); // se reintenta en el siguiente ciclo
    } finally {
      sondeando.current = false;
    }
  }, [queryClient, usuarioId, pedido]);

  // RNF-010: cada 15 s, solo mientras la conversación admite mensajes.
  useEffect(() => {
    if (!cargada || soloLectura) return;
    const id = setInterval(() => void sondear(), INTERVALO_SONDEO_MS);
    return () => clearInterval(id);
  }, [cargada, soloLectura, sondear]);

  const enviar = useMutation({
    mutationFn: (contenido: string) => enviarMensaje(pedido, contenido),
    onSuccess: (mensaje) => {
      queryClient.setQueryData<ConversacionPedido>(clave, (previa) =>
        previa ? agregarPropio(previa, mensaje) : previa,
      );
      setTexto("");
      setErrorEnvio(null);
      // Delta inmediato: trae lo que la otra parte confirmó antes y avanza el cursor.
      void sondear();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.codigo === "conversacion_cerrada") {
        queryClient.setQueryData<ConversacionPedido>(clave, (previa) =>
          previa ? { ...previa, soloLectura: true } : previa,
        );
        setErrorEnvio(null);
        return;
      }
      setErrorEnvio(mensajeDominio(error));
    },
  });

  return (
    <VistaConversacion
      estado={conversacion.isPending ? "cargando" : conversacion.isError ? "error" : "lista"}
      mensajes={conversacion.data?.mensajes ?? []}
      usuarioId={usuarioId}
      soloLectura={soloLectura}
      errorCarga={conversacion.isError ? mensajeDominio(conversacion.error) : null}
      onReintentar={() => void conversacion.refetch()}
      errorSondeo={errorSondeo}
      texto={texto}
      onTexto={setTexto}
      enviando={enviar.isPending}
      errorEnvio={errorEnvio}
      onEnviar={() => {
        const limpio = texto.trim();
        if (limpio) enviar.mutate(limpio);
      }}
    />
  );
}

export interface VistaConversacionProps {
  estado: "cargando" | "error" | "lista";
  mensajes: MensajePedido[];
  usuarioId: number | undefined;
  soloLectura: boolean;
  errorCarga: string | null;
  onReintentar: () => void;
  errorSondeo: boolean;
  texto: string;
  onTexto: (texto: string) => void;
  enviando: boolean;
  errorEnvio: string | null;
  onEnviar: () => void;
}

/** Presentación pura del chat: se renderiza igual para comprador y artesano. */
export function VistaConversacion({
  estado,
  mensajes,
  usuarioId,
  soloLectura,
  errorCarga,
  onReintentar,
  errorSondeo,
  texto,
  onTexto,
  enviando,
  errorEnvio,
  onEnviar,
}: VistaConversacionProps) {
  const listaRef = useRef<HTMLDivElement>(null);
  const cantidad = mensajes.length;
  const limpio = texto.trim();

  // Solo se desplaza la lista de mensajes al llegar uno nuevo: la página no salta.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [cantidad]);

  return (
    <section aria-labelledby="mensajes-pedido" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="mensajes-pedido" className="text-base font-semibold">
          Mensajes del pedido
        </h2>
        {!soloLectura && estado === "lista" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {errorSondeo
              ? "Sin conexión con el servidor; reintentaremos en unos segundos."
              : "Se actualiza cada 15 segundos."}
          </p>
        ) : null}
      </div>

      <div
        ref={listaRef}
        role="log"
        aria-label="Conversación del pedido"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-96 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        {estado === "cargando" ? (
          <div className="space-y-3" aria-label="Cargando mensajes">
            <div className="h-14 animate-pulse rounded-lg bg-surface" />
            <div className="h-14 animate-pulse rounded-lg bg-surface" />
          </div>
        ) : estado === "error" ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>No pudimos cargar los mensajes. {errorCarga}</p>
            <Button type="button" variant="outline" className="touch-target" onClick={onReintentar}>
              Reintentar
            </Button>
          </div>
        ) : cantidad > 0 ? (
          mensajes.map((m) => {
            // Identidad estable de la cuenta: el nombre puede cambiar (AUD-15).
            const propio = usuarioId !== undefined && m.autor.id === usuarioId;
            return (
              <div
                key={m.id}
                data-mensaje={m.id}
                className={cn("flex", propio ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] min-w-0 rounded-lg border px-3 py-2 text-sm",
                    propio ? "border-primary/20 bg-primary/10" : "bg-surface",
                  )}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {propio ? "Tú" : m.autor.nombre}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(m.creadoEn)} · {formatTime(m.creadoEn)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {soloLectura
              ? "Este pedido no tuvo mensajes."
              : "Todavía no hay mensajes en este pedido. Escribe el primero para coordinar los detalles."}
          </p>
        )}
      </div>

      {soloLectura ? (
        <p
          role="status"
          className="flex items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground"
        >
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          {AVISO_SOLO_LECTURA}
        </p>
      ) : estado === "lista" ? (
        <form
          className="space-y-2 border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onEnviar();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="mensaje-pedido" className="sr-only">
                Escribe un mensaje
              </label>
              <Textarea
                id="mensaje-pedido"
                value={texto}
                onChange={(e) => onTexto(e.target.value)}
                placeholder="Escribe un mensaje para coordinar el pedido…"
                rows={2}
                maxLength={MAX_TEXTO}
                aria-describedby="mensaje-pedido-ayuda"
                aria-invalid={errorEnvio ? true : undefined}
              />
            </div>
            <Button type="submit" className="touch-target" disabled={enviando || !limpio}>
              <Send className="size-4" aria-hidden="true" />
              {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
          <p id="mensaje-pedido-ayuda" className="text-xs text-muted-foreground">
            Solo texto, hasta {MAX_TEXTO} caracteres ({texto.length}/{MAX_TEXTO}).
          </p>
          {errorEnvio ? (
            <p role="alert" className="text-sm text-destructive">
              No pudimos enviar el mensaje: {errorEnvio}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
