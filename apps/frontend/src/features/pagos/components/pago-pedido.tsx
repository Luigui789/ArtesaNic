/**
 * Pago externo del pedido confirmado (AUD-10, docs/api/pagos.md). El servidor decide
 * estado, total, plazos y permisos: la interfaz muestra su respuesta, sin actualizaciones
 * optimistas, y solo ofrece las acciones que corresponden a la parte y al estado.
 */
import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Section } from "@/components/common/page";
import { ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { FormField, FormMessage } from "@/components/common/form-field";
import { ConfirmAction } from "@/components/common/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-session";
import { mensajeDominio } from "@/lib/errores-dominio";
import { formatDateTime } from "@/lib/format";
import { ApiError, reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mostrarImporte } from "@/lib/importes";
import { claves } from "@/lib/query-keys";
import {
  consultarPago,
  corregirIntento,
  crearIntentoDePago,
  huellaIntento,
  huellaResolucion,
  registrarIntento,
  resolverIntento,
} from "../api";
import {
  ACCEPT_COMPROBANTE,
  MAX_MOTIVO_PAGO,
  MAX_REFERENCIA,
  REGLAS_COMPROBANTE,
  errorComprobante,
} from "../comprobante";
import {
  ESTADO_PAGO_LABELS,
  METODOS_PAGO,
  METODO_PAGO_LABELS,
  TONO_ESTADO_PAGO,
  origenIntento,
} from "../labels";
import type {
  IntentoPago,
  IntentoPagoEntrada,
  MetodoPago,
  PagoPedido,
  ResolucionPagoEntrada,
} from "../types";
import { ComprobanteGuardado, VistaPreviaArchivo, useUrlTemporal } from "./comprobante-archivo";

export function PagoPedido({
  pedido,
  recibido = false,
  pedidoVencido = false,
}: {
  pedido: number;
  recibido?: boolean;
  /** Estado operativo del pedido (AUD-11): bloquea toda acción, conserva el historial. */
  pedidoVencido?: boolean;
}) {
  const { usuario } = useSession();
  const query = useQuery({
    queryKey: claves.pago(usuario?.id, recibido, pedido),
    queryFn: ({ signal }) => consultarPago(recibido, pedido, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <Section
      title="Pago"
      description="ArtesaNic no procesa fondos: el pago se hace fuera de la plataforma por el total del pedido y el taller verifica que lo recibió."
    >
      {query.isPending ? (
        <LoadingState label="Cargando el pago…" />
      ) : query.isError ? (
        <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <VistaPago pago={query.data} recibido={recibido} pedidoVencido={pedidoVencido} />
      )}
    </Section>
  );
}

export function VistaPago({
  pago,
  recibido,
  pedidoVencido = false,
}: {
  pago: PagoPedido;
  recibido: boolean;
  pedidoVencido?: boolean;
}) {
  const vigente = pago.intentos.at(-1);
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <StatusBadge tone={TONO_ESTADO_PAGO[pago.estado]} prefix="Estado del pago">
          {ESTADO_PAGO_LABELS[pago.estado]}
        </StatusBadge>
        <div className="text-left sm:text-right">
          <p className="text-xs text-muted-foreground">
            {recibido ? "Total del pedido" : "Total a pagar"}
          </p>
          <p className="text-lg font-semibold tabular-nums text-primary">
            {mostrarImporte(pago.total)}
          </p>
        </div>
      </div>
      {pedidoVencido ? (
        <Nota>El pedido venció por falta de pago. El historial del pago se conserva.</Nota>
      ) : recibido ? (
        <EstadoParaArtesano pago={pago} vigente={vigente} />
      ) : (
        <EstadoParaComprador pago={pago} vigente={vigente} />
      )}
      {pago.intentos.length ? <HistorialPago pago={pago} /> : null}
    </div>
  );
}

function Motivo({ titulo, texto }: { titulo: string; texto: string }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <h3 id={id} className="text-sm font-semibold">
        {titulo}
      </h3>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{texto}</p>
    </section>
  );
}

function Plazo({
  etiqueta,
  fecha,
  vencido,
}: {
  etiqueta: string;
  fecha: string;
  vencido: boolean;
}) {
  return (
    <p className="text-sm">
      {vencido ? "El plazo venció el " : `${etiqueta}: `}
      <strong className="whitespace-nowrap">{formatDateTime(fecha)}</strong>
    </p>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">{children}</p>
  );
}

function EstadoParaComprador({
  pago,
  vigente,
}: {
  pago: PagoPedido;
  vigente: IntentoPago | undefined;
}) {
  const [abierto, setAbierto] = useState(false);
  const limite = pago.registrableHasta;
  switch (pago.estado) {
    case "pendiente":
      return (
        <div className="space-y-4">
          {limite ? (
            <Plazo
              etiqueta="Registra tu pago antes de"
              fecha={limite}
              vencido={pago.plazoVencido}
            />
          ) : null}
          {pago.plazoVencido ? (
            <Nota>Ya no es posible registrar el pago de este pedido.</Nota>
          ) : (
            <FormularioIntentoPago pedido={pago.pedido} total={pago.total} accion="registrar" />
          )}
        </div>
      );
    case "registrado":
      return (
        <Nota>
          Tu pago está en revisión. El taller lo confirmará cuando verifique que recibió los fondos.
        </Nota>
      );
    case "confirmado":
      return (
        <Nota>
          El taller confirmó la recepción de los fondos
          {pago.confirmadoEn ? ` el ${formatDateTime(pago.confirmadoEn)}` : ""}.
        </Nota>
      );
    case "observado":
    case "no_recibido": {
      const observado = pago.estado === "observado";
      const accion = observado ? "corregir" : "nuevo";
      const boton = observado ? "Corregir pago" : "Registrar nuevo intento";
      return (
        <div className="space-y-4">
          <Motivo
            titulo={observado ? "Motivo de la observación" : "Motivo"}
            texto={vigente?.resolucion?.motivo ?? ""}
          />
          {limite ? (
            <Plazo
              etiqueta={
                observado ? "Puedes corregir hasta" : "Puedes registrar un nuevo intento hasta"
              }
              fecha={limite}
              vencido={pago.plazoVencido}
            />
          ) : null}
          {pago.plazoVencido ? null : abierto && vigente ? (
            <FormularioIntentoPago
              pedido={pago.pedido}
              total={pago.total}
              accion={accion}
              intentoPrevio={vigente.id}
              inicial={observado ? vigente : undefined}
              onCancelar={() => setAbierto(false)}
            />
          ) : (
            <Button aria-expanded={false} onClick={() => setAbierto(true)}>
              {boton}
            </Button>
          )}
        </div>
      );
    }
  }
}

function EstadoParaArtesano({
  pago,
  vigente,
}: {
  pago: PagoPedido;
  vigente: IntentoPago | undefined;
}) {
  const limite = pago.registrableHasta;
  switch (pago.estado) {
    case "pendiente":
      return (
        <div className="space-y-2">
          <Nota>El comprador todavía no registra el pago.</Nota>
          {limite ? (
            <Plazo etiqueta="Plazo del comprador" fecha={limite} vencido={pago.plazoVencido} />
          ) : null}
        </div>
      );
    case "registrado":
      return vigente ? <RevisionPago pedido={pago.pedido} intento={vigente} /> : null;
    case "confirmado":
      return (
        <Nota>
          Confirmaste la recepción de los fondos
          {pago.confirmadoEn ? ` el ${formatDateTime(pago.confirmadoEn)}` : ""}.
        </Nota>
      );
    case "observado":
    case "no_recibido":
      return (
        <div className="space-y-3">
          <Motivo
            titulo={pago.estado === "observado" ? "Motivo de la observación" : "Motivo"}
            texto={vigente?.resolucion?.motivo ?? ""}
          />
          {limite ? (
            <Plazo
              etiqueta={
                pago.estado === "observado"
                  ? "El comprador puede corregir hasta"
                  : "El comprador puede registrar un nuevo intento hasta"
              }
              fecha={limite}
              vencido={pago.plazoVencido}
            />
          ) : null}
        </div>
      );
  }
}

type Accion = "registrar" | "corregir" | "nuevo";
const TEXTO_ACCION: Record<Accion, { boton: string; exito: string }> = {
  registrar: { boton: "Registrar pago", exito: "Pago registrado. El taller lo revisará." },
  corregir: { boton: "Enviar corrección", exito: "Corrección enviada al taller." },
  nuevo: { boton: "Registrar nuevo intento", exito: "Nuevo intento registrado." },
};
type Errores = Partial<Record<"metodo" | "referencia" | "comprobante", string | undefined>>;

export function FormularioIntentoPago({
  pedido,
  total,
  accion,
  intentoPrevio,
  inicial,
  onCancelar,
}: {
  pedido: number;
  total: string;
  accion: Accion;
  intentoPrevio?: number | undefined;
  inicial?: Pick<IntentoPago, "metodo" | "referencia"> | undefined;
  onCancelar?: (() => void) | undefined;
}) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const id = useId();
  const intento = useRef(crearIntentoDePago());
  const enCurso = useRef(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [metodo, setMetodo] = useState<MetodoPago>(inicial?.metodo ?? "transferencia");
  const [referencia, setReferencia] = useState(inicial?.referencia ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const vistaPrevia = useUrlTemporal(archivo);
  const clave = claves.pago(usuario?.id, false, pedido);
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: IntentoPagoEntrada) =>
      intento.current.ejecutar(huellaIntento(pedido, accion, entrada), (k) =>
        accion === "corregir" && intentoPrevio
          ? corregirIntento(pedido, intentoPrevio, entrada, k)
          : registrarIntento(pedido, entrada, k),
      ),
    onSuccess: (pago) => {
      client.setQueryData(clave, pago);
      setArchivo(null);
      if (archivoRef.current) archivoRef.current.value = "";
      toast.success(TEXTO_ACCION[accion].exito);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) {
        setErrores({
          metodo: e.campos["metodo"]?.join(" "),
          referencia: e.campos["referencia"]?.join(" "),
          comprobante: e.campos["comprobante"]?.join(" "),
        });
      }
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: clave });
    },
  });
  const validar = (): IntentoPagoEntrada | null => {
    const nuevos: Errores = {};
    const ref = referencia.trim();
    if (!ref) nuevos.referencia = "Indica la referencia del pago.";
    else if (ref.length > MAX_REFERENCIA)
      nuevos.referencia = `La referencia admite hasta ${MAX_REFERENCIA} caracteres.`;
    if (!archivo) nuevos.comprobante = "Adjunta el comprobante del pago.";
    else nuevos.comprobante = errorComprobante(archivo) ?? undefined;
    setErrores(nuevos);
    if (nuevos.referencia || nuevos.comprobante || !archivo) return null;
    return { metodo, referencia: ref, comprobante: archivo };
  };
  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (enCurso.current || mutation.isPending) return;
    const entrada = validar();
    if (!entrada) return;
    enCurso.current = true;
    try {
      await mutation.mutateAsync(entrada);
    } catch {
      /* visible en el formulario */
    } finally {
      enCurso.current = false;
    }
  };
  const describir = (campo: string, ayuda = false) =>
    [
      ayuda ? `${id}-${campo}-help` : null,
      errores[campo as keyof Errores] ? `${id}-${campo}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const errorGeneral =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 400)
      ? mensajeDominio(mutation.error)
      : null;
  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="text-sm text-muted-foreground">Total a pagar</p>
        <p className="text-xl font-semibold tabular-nums">{mostrarImporte(total)}</p>
        <p className="text-xs text-muted-foreground">
          Siempre el total del pedido. No hay pagos parciales.
        </p>
      </div>
      <FormMessage>{errorGeneral}</FormMessage>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <FormField id={`${id}-metodo`} label="Método de pago" error={errores.metodo}>
          <select
            id={`${id}-metodo`}
            className="block min-h-11 w-full rounded-md border bg-background px-3"
            value={metodo}
            aria-invalid={!!errores.metodo}
            aria-describedby={describir("metodo")}
            onChange={(e) => setMetodo(e.target.value as MetodoPago)}
          >
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {METODO_PAGO_LABELS[m]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id={`${id}-referencia`}
          label="Referencia"
          help="Número de transferencia, depósito u otro dato que identifique el pago."
          error={errores.referencia}
        >
          <Input
            id={`${id}-referencia`}
            value={referencia}
            maxLength={MAX_REFERENCIA}
            autoComplete="off"
            aria-invalid={!!errores.referencia}
            aria-describedby={describir("referencia", true)}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </FormField>
        <FormField
          id={`${id}-comprobante`}
          label="Comprobante"
          help={REGLAS_COMPROBANTE}
          error={errores.comprobante}
        >
          <Input
            ref={archivoRef}
            id={`${id}-comprobante`}
            type="file"
            accept={ACCEPT_COMPROBANTE}
            aria-invalid={!!errores.comprobante}
            aria-describedby={describir("comprobante", true)}
            onChange={(e) => {
              const elegido = e.target.files?.[0] ?? null;
              const problema = elegido ? errorComprobante(elegido) : null;
              setErrores((previos) => ({ ...previos, comprobante: problema ?? undefined }));
              if (problema) e.target.value = "";
              setArchivo(problema ? null : elegido);
            }}
          />
        </FormField>
        {archivo ? (
          <VistaPreviaArchivo
            nombre={archivo.name}
            tipo={archivo.type || "application/octet-stream"}
            tamano={archivo.size}
            src={vistaPrevia}
            alt="Vista previa del comprobante seleccionado"
          />
        ) : null}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Enviando…" : TEXTO_ACCION[accion].boton}
        </Button>
        {onCancelar ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || intento.current.incierto}
            onClick={onCancelar}
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function RevisionPago({
  pedido,
  intento: vigente,
}: {
  pedido: number;
  intento: IntentoPago;
}) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const id = useId();
  const intento = useRef(crearIntentoDePago());
  const enCurso = useRef(false);
  const [motivo, setMotivo] = useState("");
  const clave = claves.pago(usuario?.id, true, pedido);
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: ResolucionPagoEntrada) =>
      intento.current.ejecutar(huellaResolucion(pedido, vigente.id, entrada), (k) =>
        resolverIntento(pedido, vigente.id, entrada, k),
      ),
    onSuccess: (pago) => {
      client.setQueryData(clave, pago);
      setMotivo("");
      toast.success(ESTADO_PAGO_LABELS[pago.estado]);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: clave });
    },
  });
  const ejecutar = async (entrada: ResolucionPagoEntrada) => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      await mutation.mutateAsync(entrada);
    } catch {
      /* visible */
    } finally {
      enCurso.current = false;
    }
  };
  const texto = motivo.trim();
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Revisar el intento {vigente.numero}</h3>
        <p className="text-sm text-muted-foreground">
          Abre el comprobante del historial y verifica el dinero en tu cuenta o medio de cobro antes
          de decidir. La resolución de este intento es definitiva.
        </p>
      </div>
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      <ConfirmAction
        trigger={<Button disabled={mutation.isPending}>Confirmar pago recibido</Button>}
        title="¿Confirmar que recibiste los fondos?"
        description="Confirma solo si verificaste el dinero en tu cuenta. El pago quedará confirmado y no podrá cambiarse."
        confirm="Confirmar pago recibido"
        busy={mutation.isPending}
        onConfirm={() => ejecutar({ estado: "confirmado" })}
      />
      <FormField
        id={`${id}-motivo`}
        label="Motivo (obligatorio para observar o marcar como no recibido)"
        help={`Observar: el comprobante o los datos tienen un problema y el comprador puede corregirlos. No recibido: el dinero no aparece acreditado. Hasta ${MAX_MOTIVO_PAGO} caracteres.`}
      >
        <Textarea
          id={`${id}-motivo`}
          value={motivo}
          maxLength={MAX_MOTIVO_PAGO}
          aria-describedby={`${id}-motivo-help`}
          disabled={mutation.isPending || intento.current.incierto}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          trigger={
            <Button variant="outline" disabled={mutation.isPending || !texto}>
              Observar comprobante
            </Button>
          }
          title="¿Observar este comprobante?"
          description="El comprador verá el motivo y tendrá 48 horas para corregir el comprobante o los datos."
          confirm="Observar comprobante"
          busy={mutation.isPending}
          onConfirm={() => ejecutar({ estado: "observado", motivo: texto })}
        />
        <ConfirmAction
          trigger={
            <Button variant="outline" disabled={mutation.isPending || !texto}>
              Pago no recibido
            </Button>
          }
          title="¿Marcar el pago como no recibido?"
          description="Usa esta opción si verificaste que los fondos no fueron acreditados. El comprador tendrá 48 horas para registrar un nuevo pago."
          confirm="Marcar como no recibido"
          destructive
          busy={mutation.isPending}
          onConfirm={() => ejecutar({ estado: "no_recibido", motivo: texto })}
        />
      </div>
    </div>
  );
}

export function HistorialPago({ pago }: { pago: PagoPedido }) {
  const titulo = useId();
  const numeroPorId = new Map(pago.intentos.map((i) => [i.id, i.numero]));
  const vigente = pago.intentos.at(-1)?.id;
  return (
    <section aria-labelledby={titulo} className="space-y-3">
      <h3 id={titulo} className="font-semibold">
        Historial de intentos
      </h3>
      <ol className="space-y-4">
        {pago.intentos.map((i) => (
          <li key={i.id} className="min-w-0 space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">Intento {i.numero}</h4>
              {i.id === vigente ? (
                <span className="rounded-full border px-2 py-0.5 text-xs">Intento actual</span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {origenIntento(
                i.origen,
                i.intentoPrevio ? (numeroPorId.get(i.intentoPrevio) ?? null) : null,
              )}{" "}
              · Registrado el {formatDateTime(i.registradoEn)}
            </p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Método</dt>
                <dd>{METODO_PAGO_LABELS[i.metodo]}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Referencia</dt>
                <dd className="break-all">{i.referencia}</dd>
              </div>
            </dl>
            <ComprobanteGuardado comprobante={i.comprobante} numero={i.numero} />
            <div className="space-y-1 border-t pt-3 text-sm">
              {i.resolucion ? (
                <>
                  <p className="font-semibold">
                    Revisión: {ESTADO_PAGO_LABELS[i.resolucion.estado]}
                  </p>
                  {i.resolucion.motivo ? (
                    <p className="whitespace-pre-wrap break-words">
                      <span className="text-muted-foreground">Motivo: </span>
                      {i.resolucion.motivo}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Revisado el {formatDateTime(i.resolucion.revisadoEn)}
                    {i.resolucion.plazoHasta
                      ? ` · Plazo hasta el ${formatDateTime(i.resolucion.plazoHasta)}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Pendiente de revisión del taller.</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
