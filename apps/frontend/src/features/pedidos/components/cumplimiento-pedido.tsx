/**
 * Cumplimiento por renglón, entregas y recepción del pedido (AUD-12, docs/api/cumplimiento.md).
 * El servidor decide estados, cantidades e inventario: la interfaz muestra su respuesta, sin
 * actualizaciones optimistas, y solo ofrece las acciones que corresponden a la parte, al
 * estado del pago y al avance de cada renglón.
 */
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { consultarPago } from "@/features/pagos/api";
import { consultarResolucion } from "../resolucion";
import { mensajeDominio } from "@/lib/errores-dominio";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { ApiError, reintentarSalvoErrorDelCliente } from "@/lib/http";
import { MODALIDAD_LABELS } from "@/lib/labels";
import { claves } from "@/lib/query-keys";
import type { LineaPedidoConfirmado, PedidoConfirmado } from "../confirmados";
import {
  ACCION_INICIO,
  ESTADO_LINEA_LABELS,
  MAX_MOTIVO_DISCREPANCIA,
  RESULTADO_RECEPCION_LABELS,
  consultarCumplimiento,
  crearIntentoDeCumplimiento,
  cuerpoEntrega,
  cuerpoRecepcion,
  hoyEnManagua,
  iniciarLinea,
  productosConsumidos,
  refrescarTrasCumplimiento,
  registrarEntrega,
  registrarRecepcion,
  type Cumplimiento,
  type EntregaEntrada,
  type Entrega,
  type EstadoLineaCumplimiento,
  type LineaCumplimiento,
  type RecepcionEntrada,
} from "../cumplimiento";

const TONO_LINEA: Record<EstadoLineaCumplimiento, "neutral" | "pending" | "success"> = {
  pendiente: "neutral",
  en_cumplimiento: "pending",
  entregado: "success",
};

export function CumplimientoPedido({
  pedido,
  recibido = false,
}: {
  pedido: PedidoConfirmado;
  recibido?: boolean;
}) {
  const { usuario } = useSession();
  const query = useQuery({
    queryKey: claves.cumplimiento(usuario?.id, recibido, pedido.id),
    queryFn: ({ signal }) => consultarCumplimiento(recibido, pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  // Misma clave que la sección de pago: comparte la caché, no repite la petición.
  const pago = useQuery({
    queryKey: claves.pago(usuario?.id, recibido, pedido.id),
    queryFn: ({ signal }) => consultarPago(recibido, pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
    enabled: recibido,
  });
  // Misma clave que la sección de resolución (AUD-13): un cierre pendiente bloquea acciones.
  const resolucion = useQuery({
    queryKey: claves.resolucion(usuario?.id, recibido, pedido.id),
    queryFn: ({ signal }) => consultarResolucion(recibido, pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
    enabled: recibido,
  });
  return (
    <Section
      title="Seguimiento y entregas"
      description="Cada producto avanza por separado según su modalidad. El pedido queda entregado cuando se completan todas las cantidades acordadas."
    >
      {query.isPending ? (
        <LoadingState label="Cargando el seguimiento…" />
      ) : query.isError ? (
        <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <VistaCumplimiento
          pedido={pedido}
          cumplimiento={query.data}
          recibido={recibido}
          pagoConfirmado={pago.data ? pago.data.estado === "confirmado" : undefined}
          // Mientras la resolución no se conoce, el artesano no ve acciones (como con el pago).
          cierrePendiente={
            resolucion.data
              ? resolucion.data.cierresParciales.some((c) => c.estado === "pendiente")
              : recibido
          }
        />
      )}
    </Section>
  );
}

export function VistaCumplimiento({
  pedido,
  cumplimiento: c,
  recibido,
  pagoConfirmado,
  cierrePendiente = false,
}: {
  pedido: PedidoConfirmado;
  cumplimiento: Cumplimiento;
  recibido: boolean;
  /** Solo lo usa el artesano: sin pago confirmado no se ofrece iniciar ni entregar;
   * `undefined` mientras el pago no se conoce (sin acciones ni aviso). */
  pagoConfirmado?: boolean | undefined;
  /** Solo artesano (AUD-13): con un cierre parcial pendiente no se ofrece iniciar ni
   * entregar (la página pasa `true` mientras la resolución no se conoce). */
  cierrePendiente?: boolean;
}) {
  const snapshot = new Map(pedido.lineas.map((l) => [l.id, l]));
  const operable = c.estado === "confirmado" || c.estado === "en_cumplimiento";
  const acciones = recibido && operable && pagoConfirmado === true && !cierrePendiente;
  const entregables = c.lineas.filter((l) => l.iniciadoEn !== null && l.cantidadPendiente > 0);
  return (
    <div className="min-w-0 space-y-5">
      {c.estado === "vencido_falta_pago" ? (
        <Nota>El pedido venció por falta de pago: no admite trabajo ni entregas.</Nota>
      ) : c.estado === "entregado" ? (
        <Nota>Se entregaron todas las cantidades acordadas.</Nota>
      ) : c.estado === "cancelado_artesano" ? (
        <Nota>El taller canceló el pedido: el seguimiento queda como historial.</Nota>
      ) : c.estado === "cerrado_parcial" ? (
        <Nota>
          El pedido se cerró parcialmente: no admite más trabajo ni entregas. El historial se
          conserva.
        </Nota>
      ) : recibido && cierrePendiente ? (
        <Nota>
          Hay una propuesta de cierre parcial esperando la respuesta del comprador: no puedes
          iniciar ni registrar entregas mientras tanto.
        </Nota>
      ) : recibido && pagoConfirmado === false ? (
        <Nota>Podrás iniciar el trabajo y registrar entregas cuando confirmes el pago.</Nota>
      ) : null}
      <ol className="space-y-3" aria-label="Avance por producto">
        {c.lineas.map((l) => (
          <LineaAvance
            key={l.linea}
            linea={l}
            snapshot={snapshot.get(l.linea)}
            accion={
              acciones && l.estado === "pendiente" ? (
                <BotonIniciar pedido={pedido} linea={l} snapshot={snapshot.get(l.linea)} />
              ) : null
            }
          />
        ))}
      </ol>
      {acciones && entregables.length ? (
        <FormularioEntrega pedido={pedido} lineas={entregables} snapshot={snapshot} />
      ) : null}
      <HistorialEntregas
        pedido={pedido.id}
        entregas={c.entregas}
        snapshot={snapshot}
        recibido={recibido}
      />
    </div>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">{children}</p>
  );
}

function nombreDe(snapshot: LineaPedidoConfirmado | undefined, linea: number) {
  return snapshot?.producto.nombre ?? `Producto ${linea}`;
}

function LineaAvance({
  linea: l,
  snapshot: s,
  accion,
}: {
  linea: LineaCumplimiento;
  snapshot: LineaPedidoConfirmado | undefined;
  accion: ReactNode;
}) {
  return (
    <li className="min-w-0 space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{nombreDe(s, l.linea)}</h3>
          <p className="text-sm text-muted-foreground">{MODALIDAD_LABELS[l.modalidad]}</p>
        </div>
        <StatusBadge tone={TONO_LINEA[l.estado]} prefix="Estado del producto">
          {ESTADO_LINEA_LABELS[l.estado]}
        </StatusBadge>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Acordado</dt>
          <dd className="tabular-nums">{l.cantidad}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Entregado</dt>
          <dd className="tabular-nums">{l.cantidadEntregada}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Pendiente</dt>
          <dd className="tabular-nums">{l.cantidadPendiente}</dd>
        </div>
      </dl>
      {s?.fechaComprometida ? (
        <p className="text-sm">Fecha comprometida: {formatCalendarDate(s.fechaComprometida)}</p>
      ) : null}
      {s?.caracteristicas ? (
        <p className="whitespace-pre-wrap break-words text-sm">
          <span className="text-muted-foreground">Características: </span>
          {s.caracteristicas}
        </p>
      ) : null}
      {s?.origenPersonalizacion ? (
        <p className="text-sm text-muted-foreground">
          {s.origenPersonalizacion === "unidad_estandar"
            ? "Sobre una unidad estándar"
            : "Fabricación desde cero"}
        </p>
      ) : null}
      {l.iniciadoEn ? (
        <p className="text-xs text-muted-foreground">Iniciado el {formatDateTime(l.iniciadoEn)}</p>
      ) : null}
      {accion}
    </li>
  );
}

function BotonIniciar({
  pedido,
  linea,
  snapshot,
}: {
  pedido: PedidoConfirmado;
  linea: LineaCumplimiento;
  snapshot: LineaPedidoConfirmado | undefined;
}) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const intento = useRef(crearIntentoDeCumplimiento());
  const consume = snapshot?.origenPersonalizacion === "unidad_estandar";
  const mutation = useMutation({
    retry: false,
    mutationFn: () =>
      intento.current.ejecutar({ pedido: pedido.id, linea: linea.linea, accion: "iniciar" }, (k) =>
        iniciarLinea(pedido.id, linea.linea, k),
      ),
    onSuccess: (datos) => {
      refrescarTrasCumplimiento(
        client,
        usuario?.id,
        true,
        pedido.id,
        datos,
        productosConsumidos("iniciar", [snapshot]),
      );
      toast.success("Trabajo iniciado");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        refrescarTrasCumplimiento(client, usuario?.id, true, pedido.id, null);
    },
  });
  const texto = ACCION_INICIO[linea.modalidad];
  return (
    <div className="space-y-2">
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      <ConfirmAction
        trigger={
          <Button disabled={mutation.isPending} className="w-full sm:w-auto">
            {intento.current.incierto ? `Reintentar: ${texto.toLowerCase()}` : texto}
          </Button>
        }
        title={`¿${texto}?`}
        description={
          consume
            ? "La unidad estándar reservada se descontará del inventario en este momento. No se puede deshacer."
            : "Quedará registrado que comenzaste el trabajo de este producto. No se puede deshacer."
        }
        confirm={texto}
        busy={mutation.isPending}
        onConfirm={() => mutation.mutateAsync().catch(() => undefined)}
      />
    </div>
  );
}

type Cantidades = Record<number, string>;
type ErroresEntrega = { fecha?: string; lineas?: string } & Record<string, string | undefined>;

function FormularioEntrega({
  pedido,
  lineas,
  snapshot,
}: {
  pedido: PedidoConfirmado;
  lineas: LineaCumplimiento[];
  snapshot: Map<number, LineaPedidoConfirmado>;
}) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const id = useId();
  const intento = useRef(crearIntentoDeCumplimiento());
  const enCurso = useRef(false);
  const hoy = hoyEnManagua();
  const [fecha, setFecha] = useState(hoy);
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const [errores, setErrores] = useState<ErroresEntrega>({});
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: EntregaEntrada) =>
      intento.current.ejecutar({ pedido: pedido.id, ...cuerpoEntrega(entrada) }, (k) =>
        registrarEntrega(pedido.id, entrada, k),
      ),
    onSuccess: (datos, entrada) => {
      refrescarTrasCumplimiento(
        client,
        usuario?.id,
        true,
        pedido.id,
        datos,
        productosConsumidos(
          "entregar",
          entrada.lineas.map((l) => snapshot.get(l.linea)),
        ),
      );
      setCantidades({});
      setErrores({});
      toast.success(datos.estado === "entregado" ? "Pedido entregado" : "Entrega registrada");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400)
        setErrores(Object.fromEntries(Object.entries(e.campos).map(([k, v]) => [k, v.join(" ")])));
      if (e instanceof ApiError && e.status === 409)
        refrescarTrasCumplimiento(client, usuario?.id, true, pedido.id, null);
    },
  });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enCurso.current) return;
    const problemas: ErroresEntrega = {};
    const elegidas: EntregaEntrada["lineas"] = [];
    for (const l of lineas) {
      const texto = (cantidades[l.linea] ?? "").trim();
      if (!texto) continue;
      const cantidad = Number(texto);
      if (!Number.isInteger(cantidad) || cantidad < 0)
        problemas[`linea-${l.linea}`] = "Indica un número entero de unidades.";
      else if (cantidad > l.cantidadPendiente)
        problemas[`linea-${l.linea}`] = `Como máximo ${l.cantidadPendiente}.`;
      else if (cantidad > 0) elegidas.push({ linea: l.linea, cantidad });
    }
    if (!fecha) problemas.fecha = "Indica la fecha de la entrega.";
    else if (fecha > hoy) problemas.fecha = "La fecha no puede ser posterior a hoy.";
    if (!Object.keys(problemas).length && !elegidas.length)
      problemas.lineas = "Indica al menos una cantidad mayor que 0.";
    setErrores(problemas);
    if (Object.keys(problemas).length) return;
    enCurso.current = true;
    try {
      await mutation.mutateAsync({ fecha, lineas: elegidas });
    } catch {
      /* visible */
    } finally {
      enCurso.current = false;
    }
  };
  const bloqueado = mutation.isPending || intento.current.incierto;
  const errorGeneral =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 400)
      ? mensajeDominio(mutation.error)
      : null;
  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      aria-labelledby={`${id}-titulo`}
      className="min-w-0 space-y-4 rounded-lg border p-4"
    >
      <div>
        <h3 id={`${id}-titulo`} className="font-semibold">
          Registrar una entrega
        </h3>
        <p className="text-sm text-muted-foreground">
          Indica la fecha y las unidades entregadas de cada producto. Deja en blanco los que no
          formen parte de esta entrega.
        </p>
      </div>
      <FormMessage>{errorGeneral}</FormMessage>
      {intento.current.incierto ? (
        <p role="status" className="rounded-lg border bg-muted p-3 text-sm">
          Conservamos esta entrega. Reintenta con los mismos datos para confirmar el resultado.
        </p>
      ) : null}
      <fieldset disabled={bloqueado} className="min-w-0 space-y-4">
        <FormField id={`${id}-fecha`} label="Fecha de entrega" error={errores.fecha}>
          <Input
            id={`${id}-fecha`}
            type="date"
            value={fecha}
            max={hoy}
            className="sm:max-w-xs"
            aria-invalid={!!errores.fecha}
            aria-describedby={errores.fecha ? `${id}-fecha-error` : undefined}
            onChange={(e) => setFecha(e.target.value)}
          />
        </FormField>
        <ul className="grid min-w-0 gap-4 sm:grid-cols-2">
          {lineas.map((l) => {
            const campo = `${id}-linea-${l.linea}`;
            const error = errores[`linea-${l.linea}`];
            return (
              <li key={l.linea} className="min-w-0">
                <FormField
                  id={campo}
                  label={nombreDe(snapshot.get(l.linea), l.linea)}
                  help={`Pendiente: ${l.cantidadPendiente}`}
                  error={error}
                >
                  <Input
                    id={campo}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={l.cantidadPendiente}
                    step={1}
                    value={cantidades[l.linea] ?? ""}
                    aria-invalid={!!error}
                    aria-describedby={[`${campo}-help`, error ? `${campo}-error` : null]
                      .filter(Boolean)
                      .join(" ")}
                    onChange={(e) =>
                      setCantidades((previas) => ({ ...previas, [l.linea]: e.target.value }))
                    }
                  />
                </FormField>
              </li>
            );
          })}
        </ul>
        {errores.lineas ? (
          <p role="alert" className="text-sm text-destructive">
            {errores.lineas}
          </p>
        ) : null}
      </fieldset>
      <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending
          ? "Registrando…"
          : intento.current.incierto
            ? "Reintentar la misma entrega"
            : "Registrar entrega"}
      </Button>
    </form>
  );
}

function HistorialEntregas({
  pedido,
  entregas,
  snapshot,
  recibido,
}: {
  pedido: number;
  entregas: Entrega[];
  snapshot: Map<number, LineaPedidoConfirmado>;
  recibido: boolean;
}) {
  const titulo = useId();
  return (
    <section aria-labelledby={titulo} className="min-w-0 space-y-3">
      <h3 id={titulo} className="font-semibold">
        Historial de entregas
      </h3>
      {!entregas.length ? (
        <p className="text-sm text-muted-foreground">Todavía no hay entregas registradas.</p>
      ) : (
        <ol className="space-y-4">
          {entregas.map((e) => (
            <li key={e.id} className="min-w-0 space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-semibold">Entrega #{e.numero}</h4>
                <p className="text-sm text-muted-foreground">
                  Fecha: {formatCalendarDate(e.fecha)}
                </p>
              </div>
              <ul className="space-y-1 text-sm">
                {e.lineas.map((l) => (
                  <li key={l.linea} className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {nombreDe(snapshot.get(l.linea), l.linea)}
                    </span>
                    <span className="tabular-nums">
                      {l.cantidad} {l.cantidad === 1 ? "unidad" : "unidades"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Registrada el {formatDateTime(e.registradoEn)}
              </p>
              <div className="space-y-2 border-t pt-3 text-sm">
                {e.recepcion ? (
                  <>
                    <StatusBadge
                      tone={e.recepcion.resultado === "confirmada" ? "success" : "danger"}
                      prefix="Respuesta del comprador"
                    >
                      {RESULTADO_RECEPCION_LABELS[e.recepcion.resultado]}
                    </StatusBadge>
                    {e.recepcion.motivo ? (
                      <p className="whitespace-pre-wrap break-words">
                        <span className="text-muted-foreground">Motivo: </span>
                        {e.recepcion.motivo}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Registrada el {formatDateTime(e.recepcion.registradoEn)}
                    </p>
                  </>
                ) : recibido ? (
                  <p className="text-muted-foreground">El comprador todavía no respondió.</p>
                ) : (
                  <RespuestaRecepcion pedido={pedido} entrega={e} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RespuestaRecepcion({ pedido, entrega }: { pedido: number; entrega: Entrega }) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const id = useId();
  const intento = useRef(crearIntentoDeCumplimiento());
  const enCurso = useRef(false);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: RecepcionEntrada) =>
      intento.current.ejecutar({ pedido, entrega: entrega.id, ...cuerpoRecepcion(entrada) }, (k) =>
        registrarRecepcion(pedido, entrega.id, entrada, k),
      ),
    onSuccess: (datos) => {
      refrescarTrasCumplimiento(client, usuario?.id, false, pedido, datos);
      toast.success("Respuesta registrada");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        refrescarTrasCumplimiento(client, usuario?.id, false, pedido, null);
    },
  });
  const ejecutar = async (entrada: RecepcionEntrada) => {
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
    <div className="space-y-3">
      <p className="text-muted-foreground">
        ¿Recibiste esta entrega? Tu respuesta queda como constancia y no modifica el pedido.
      </p>
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          trigger={<Button disabled={mutation.isPending || abierto}>Confirmar recepción</Button>}
          title="¿Confirmar que recibiste esta entrega?"
          description="Quedará registrada tu confirmación. No podrás cambiarla después."
          confirm="Confirmar recepción"
          busy={mutation.isPending}
          onConfirm={() => ejecutar({ resultado: "confirmada" })}
        />
        <Button
          variant="outline"
          disabled={mutation.isPending || intento.current.incierto}
          aria-expanded={abierto}
          aria-controls={`${id}-discrepancia`}
          onClick={() => setAbierto((v) => !v)}
        >
          Registrar discrepancia
        </Button>
      </div>
      {abierto ? (
        <form
          id={`${id}-discrepancia`}
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto) {
              setError("Describe la discrepancia.");
              return;
            }
            setError(null);
            void ejecutar({ resultado: "discrepancia", motivo: texto });
          }}
        >
          <FormField
            id={`${id}-motivo`}
            label="¿Qué no coincide con lo acordado?"
            help={`Hasta ${MAX_MOTIVO_DISCREPANCIA} caracteres. Registrar una discrepancia no revierte la entrega ni el inventario.`}
            error={error ?? undefined}
          >
            <Textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={MAX_MOTIVO_DISCREPANCIA}
              aria-invalid={!!error}
              aria-describedby={[`${id}-motivo-help`, error ? `${id}-motivo-error` : null]
                .filter(Boolean)
                .join(" ")}
              disabled={mutation.isPending || intento.current.incierto}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </FormField>
          <Button type="submit" variant="destructive" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Enviando…"
              : intento.current.incierto
                ? "Reintentar la misma discrepancia"
                : "Enviar discrepancia"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
