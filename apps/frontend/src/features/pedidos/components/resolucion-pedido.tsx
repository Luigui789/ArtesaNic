/**
 * Resolución del pedido (AUD-13, docs/api/resolucion-pedidos.md y docs/api/reembolsos.md):
 * cancelación del taller, propuesta y respuesta de cierre parcial, reembolso con su
 * devolución externa y, solo para el artesano, la clasificación de unidades manipuladas.
 *
 * Cantidades, importes y acciones disponibles proceden del servidor (`acciones`,
 * `estimacionCierre`); la interfaz no recalcula montos ni hace actualizaciones optimistas.
 */
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Section } from "@/components/common/page";
import { ErrorState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { FormField, FormMessage } from "@/components/common/form-field";
import { ConfirmAction } from "@/components/common/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-session";
import { mensajeDominio } from "@/lib/errores-dominio";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { ApiError, reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mostrarImporte } from "@/lib/importes";
import { claves } from "@/lib/query-keys";
import type { LineaPedidoConfirmado, PedidoConfirmado } from "../confirmados";
import { crearIntentoDeCumplimiento, hoyEnManagua } from "../cumplimiento";
import {
  ESTADO_CIERRE_LABELS,
  ESTADO_REEMBOLSO_LABELS,
  MAX_MOTIVO_CANCELACION,
  MAX_MOTIVO_CIERRE,
  MAX_MOTIVO_CLASIFICACION,
  MAX_MOTIVO_OBJECION,
  MAX_REFERENCIA_DEVOLUCION,
  ORIGEN_LABELS,
  RESULTADO_CLASIFICACION_LABELS,
  TIPO_REEMBOLSO_LABELS,
  cancelarPedido,
  clasificarInventario,
  consultarClasificaciones,
  consultarResolucion,
  cuerpoClasificaciones,
  cuerpoDevolucion,
  cuerpoRespuesta,
  productosConReserva,
  proponerCierre,
  refrescarInventario,
  refrescarTrasResolucion,
  registrarDevolucion,
  responderCierre,
  type CierreParcial,
  type ClasificacionEntrada,
  type DevolucionEntrada,
  type LineaCierre,
  type ObligacionClasificacion,
  type Reembolso,
  type Resolucion,
  type RespuestaCierreEntrada,
  type ResultadoClasificacion,
} from "../resolucion";

type Snapshot = Map<number, LineaPedidoConfirmado>;

export function ResolucionPedido({
  pedido,
  recibido = false,
}: {
  pedido: PedidoConfirmado;
  recibido?: boolean;
}) {
  const { usuario } = useSession();
  const query = useQuery({
    queryKey: claves.resolucion(usuario?.id, recibido, pedido.id),
    queryFn: ({ signal }) => consultarResolucion(recibido, pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  if (query.isPending) return null;
  if (query.isError)
    return (
      <Section title="Cancelación, cierre y reembolso">
        <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
      </Section>
    );
  // Las obligaciones de clasificación solo nacen al cancelar o cerrar parcialmente.
  const finalizado =
    query.data.estado === "cancelado_artesano" || query.data.estado === "cerrado_parcial";
  return (
    <>
      <VistaResolucion pedido={pedido} resolucion={query.data} recibido={recibido} />
      {recibido && finalizado ? <ClasificacionInventarioPedido pedido={pedido} /> : null}
    </>
  );
}

export function VistaResolucion({
  pedido,
  resolucion: r,
  recibido,
}: {
  pedido: PedidoConfirmado;
  resolucion: Resolucion;
  recibido: boolean;
}) {
  const snapshot: Snapshot = new Map(pedido.lineas.map((l) => [l.id, l]));
  const pendiente = r.cierresParciales.find((c) => c.estado === "pendiente");
  const historial = r.cierresParciales.filter((c) => c.estado !== "pendiente");
  const bloques: ReactNode[] = [];
  if (r.cancelacion)
    bloques.push(
      <section
        key="cancelacion"
        className="min-w-0 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
      >
        <h3 className="font-semibold">Cancelado por el taller</h3>
        <p className="whitespace-pre-wrap break-words text-sm">
          <span className="text-muted-foreground">Motivo: </span>
          {r.cancelacion.motivo}
        </p>
        <p className="text-xs text-muted-foreground">
          Registrada el {formatDateTime(r.cancelacion.registradoEn)}
        </p>
      </section>,
    );
  if (r.reembolso)
    bloques.push(
      <TarjetaReembolso
        key="reembolso"
        pedido={pedido.id}
        reembolso={r.reembolso}
        recibido={recibido}
        cierres={r.cierresParciales}
      />,
    );
  if (pendiente)
    bloques.push(
      recibido ? (
        <section key="pendiente" className="min-w-0 space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold">Propuesta de cierre parcial #{pendiente.numero}</h3>
            <StatusBadge tone="pending" prefix="Estado del cierre">
              {ESTADO_CIERRE_LABELS.pendiente}
            </StatusBadge>
          </div>
          <MotivoTexto titulo="Tu motivo" texto={pendiente.motivo} />
          <DesgloseCierre lineas={pendiente.lineas} snapshot={snapshot} />
          <TotalReembolso etiqueta="Reembolso resultante" monto={pendiente.montoReembolso} />
        </section>
      ) : (
        <RespuestaCierre key="pendiente" pedido={pedido} cierre={pendiente} snapshot={snapshot} />
      ),
    );
  if (recibido && r.acciones.cancelar.disponible)
    bloques.push(<FormularioCancelacion key="cancelar" pedido={pedido} />);
  else if (recibido && r.acciones.cancelar.codigo === "pago_pendiente_de_resolucion")
    bloques.push(
      <Nota key="cancelar-bloqueado">
        Hay un pago registrado u observado sin resolver. Revísalo antes de cancelar el pedido.
      </Nota>,
    );
  if (recibido && r.acciones.proponerCierre.disponible && r.estimacionCierre)
    bloques.push(
      <FormularioCierre
        key="cierre"
        pedido={pedido}
        estimacion={r.estimacionCierre}
        snapshot={snapshot}
      />,
    );
  if (historial.length)
    bloques.push(<HistorialCierres key="historial" cierres={historial} snapshot={snapshot} />);
  if (!bloques.length) return null;
  return (
    <Section
      title="Cancelación, cierre y reembolso"
      description="La plataforma registra las obligaciones y la evidencia; no mueve dinero. Los importes los calcula el servidor desde el acuerdo congelado."
    >
      <div className="min-w-0 space-y-5">{bloques}</div>
    </Section>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">{children}</p>
  );
}

function MotivoTexto({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-muted-foreground">{titulo}</p>
      <p className="whitespace-pre-wrap break-words">{texto}</p>
    </div>
  );
}

function TotalReembolso({ etiqueta, monto }: { etiqueta: string; monto: string }) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3">
      <span className="text-sm text-muted-foreground">{etiqueta}</span>
      <span className="text-lg font-semibold tabular-nums text-primary">
        {mostrarImporte(monto)}
      </span>
    </p>
  );
}

function nombreDe(snapshot: Snapshot, linea: number) {
  return snapshot.get(linea)?.producto.nombre ?? `Producto ${linea}`;
}

/** Cantidades e importe por renglón, tal como los calculó y congeló el servidor. */
export function DesgloseCierre({
  lineas,
  snapshot,
}: {
  lineas: LineaCierre[];
  snapshot: Snapshot;
}) {
  return (
    <ol className="space-y-3" aria-label="Desglose del cierre por producto">
      {lineas.map((l) => (
        <li key={l.linea} className="min-w-0 space-y-2 rounded-lg border p-3">
          <h4 className="break-words text-sm font-semibold">{nombreDe(snapshot, l.linea)}</h4>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Acordado</dt>
              <dd className="tabular-nums">{l.cantidadAcordada}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Entregado</dt>
              <dd className="tabular-nums">{l.cantidadEntregada}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">No entregado</dt>
              <dd className="tabular-nums">{l.cantidadNoEntregada}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Reembolso</dt>
              <dd className="break-words tabular-nums">{mostrarImporte(l.importeReembolso)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function useRefresco(pedido: PedidoConfirmado, recibido: boolean) {
  const { usuario } = useSession();
  const client = useQueryClient();
  return (datos: Resolucion | null, inventario = false) =>
    refrescarTrasResolucion(
      client,
      usuario?.id,
      recibido,
      pedido.id,
      datos,
      inventario ? productosConReserva(pedido.lineas) : [],
    );
}

/** Ejecuta la mutación una sola vez a la vez y deja los errores visibles en la mutación. */
function useEjecutor<T>(mutateAsync: (entrada: T) => Promise<unknown>) {
  const enCurso = useRef(false);
  return async (entrada: T) => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      await mutateAsync(entrada);
    } catch {
      /* visible */
    } finally {
      enCurso.current = false;
    }
  };
}

function campoMotivo(motivo: string, maximo: number, vacio: string): string | null {
  const texto = motivo.trim();
  if (!texto) return vacio;
  if (texto.length > maximo) return `Hasta ${maximo} caracteres.`;
  return null;
}

// --- Cancelación (artesano, antes de cualquier entrega) ---

function FormularioCancelacion({ pedido }: { pedido: PedidoConfirmado }) {
  const id = useId();
  const refrescar = useRefresco(pedido, true);
  const intento = useRef(crearIntentoDeCumplimiento());
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: (texto: string) =>
      intento.current.ejecutar({ pedido: pedido.id, accion: "cancelar", motivo: texto }, (k) =>
        cancelarPedido(pedido.id, texto, k),
      ),
    onSuccess: (datos) => {
      refrescar(datos, true);
      toast.success("Pedido cancelado");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) refrescar(null, true);
    },
  });
  const ejecutar = useEjecutor(mutation.mutateAsync);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const problema = campoMotivo(
      motivo,
      MAX_MOTIVO_CANCELACION,
      "Explica por qué no puedes cumplir.",
    );
    setError(problema);
    if (!problema) void ejecutar(motivo.trim());
  };
  return (
    <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`} className="font-semibold">
        Cancelar pedido
      </h3>
      <p className="text-sm text-muted-foreground">
        Solo es posible antes de cualquier entrega y por una imposibilidad justificada. Las unidades
        reservadas sin manipular vuelven a estar disponibles y, si el pago está confirmado, se
        registra un reembolso total.
      </p>
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      {!abierto ? (
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          aria-expanded={false}
          onClick={() => setAbierto(true)}
        >
          Cancelar pedido
        </Button>
      ) : (
        <form id={`${id}-form`} noValidate onSubmit={enviar} className="space-y-3">
          <FormField
            id={`${id}-motivo`}
            label="Motivo de la cancelación"
            help={`Obligatorio. Hasta ${MAX_MOTIVO_CANCELACION} caracteres. El comprador lo verá.`}
            error={error ?? undefined}
          >
            <Textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={MAX_MOTIVO_CANCELACION}
              aria-invalid={!!error}
              aria-describedby={[`${id}-motivo-help`, error ? `${id}-motivo-error` : null]
                .filter(Boolean)
                .join(" ")}
              disabled={mutation.isPending || intento.current.incierto}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Cancelando…"
                : intento.current.incierto
                  ? "Reintentar la cancelación"
                  : "Confirmar cancelación"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || intento.current.incierto}
              onClick={() => setAbierto(false)}
            >
              Volver
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

// --- Cierre parcial (artesano propone; comprador responde) ---

function FormularioCierre({
  pedido,
  estimacion,
  snapshot,
}: {
  pedido: PedidoConfirmado;
  estimacion: NonNullable<Resolucion["estimacionCierre"]>;
  snapshot: Snapshot;
}) {
  const id = useId();
  const refrescar = useRefresco(pedido, true);
  const intento = useRef(crearIntentoDeCumplimiento());
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: (texto: string) =>
      intento.current.ejecutar({ pedido: pedido.id, accion: "cierre", motivo: texto }, (k) =>
        proponerCierre(pedido.id, texto, k),
      ),
    onSuccess: (datos) => {
      refrescar(datos);
      toast.success("Cierre parcial propuesto");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) refrescar(null);
    },
  });
  const ejecutar = useEjecutor(mutation.mutateAsync);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const problema = campoMotivo(
      motivo,
      MAX_MOTIVO_CIERRE,
      "Explica por qué no podrás completar el pedido.",
    );
    setError(problema);
    if (!problema) void ejecutar(motivo.trim());
  };
  return (
    <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`} className="font-semibold">
        Proponer cierre parcial
      </h3>
      <p className="text-sm text-muted-foreground">
        Si no podrás completar las cantidades restantes, propón cerrar el pedido con lo ya
        entregado. El comprador podrá aceptar u objetar. Mientras responde no podrás registrar
        entregas.
      </p>
      <DesgloseCierre lineas={estimacion.lineas} snapshot={snapshot} />
      <TotalReembolso etiqueta="Reembolso estimado" monto={estimacion.montoReembolso} />
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      {!abierto ? (
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          aria-expanded={false}
          onClick={() => setAbierto(true)}
        >
          Proponer cierre parcial
        </Button>
      ) : (
        <form id={`${id}-form`} noValidate onSubmit={enviar} className="space-y-3">
          <FormField
            id={`${id}-motivo`}
            label="Motivo del cierre"
            help={`Obligatorio. Hasta ${MAX_MOTIVO_CIERRE} caracteres. El comprador lo verá.`}
            error={error ?? undefined}
          >
            <Textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={MAX_MOTIVO_CIERRE}
              aria-invalid={!!error}
              aria-describedby={[`${id}-motivo-help`, error ? `${id}-motivo-error` : null]
                .filter(Boolean)
                .join(" ")}
              disabled={mutation.isPending || intento.current.incierto}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Enviando…"
                : intento.current.incierto
                  ? "Reintentar la propuesta"
                  : "Enviar propuesta de cierre"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || intento.current.incierto}
              onClick={() => setAbierto(false)}
            >
              Volver
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function RespuestaCierre({
  pedido,
  cierre,
  snapshot,
}: {
  pedido: PedidoConfirmado;
  cierre: CierreParcial;
  snapshot: Snapshot;
}) {
  const id = useId();
  const refrescar = useRefresco(pedido, false);
  const intento = useRef(crearIntentoDeCumplimiento());
  const [objetando, setObjetando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: RespuestaCierreEntrada) =>
      intento.current.ejecutar(
        { pedido: pedido.id, cierre: cierre.id, ...cuerpoRespuesta(entrada) },
        (k) => responderCierre(pedido.id, cierre.id, entrada, k),
      ),
    onSuccess: (datos, entrada) => {
      refrescar(datos, entrada.decision === "aceptado");
      toast.success(entrada.decision === "aceptado" ? "Cierre aceptado" : "Objeción registrada");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) refrescar(null);
    },
  });
  const ejecutar = useEjecutor(mutation.mutateAsync);
  const bloqueado = mutation.isPending || intento.current.incierto;
  return (
    <section
      className="min-w-0 space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4"
      aria-labelledby={`${id}-titulo`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${id}-titulo`} className="font-semibold">
          Propuesta de cierre parcial
        </h3>
        <StatusBadge tone="pending" prefix="Estado del cierre">
          Pendiente de tu respuesta
        </StatusBadge>
      </div>
      <MotivoTexto titulo="Motivo del taller" texto={cierre.motivo} />
      <DesgloseCierre lineas={cierre.lineas} snapshot={snapshot} />
      <TotalReembolso etiqueta="Reembolso resultante" monto={cierre.montoReembolso} />
      <p className="text-sm text-muted-foreground">
        Si aceptas, el pedido se cierra con lo entregado y el taller deberá devolverte el reembolso.
        Si objetas, el pedido sigue en cumplimiento.
      </p>
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          trigger={<Button disabled={bloqueado || objetando}>Aceptar cierre</Button>}
          title="¿Aceptar el cierre parcial?"
          description={`El pedido quedará cerrado parcialmente y se registrará un reembolso de ${mostrarImporte(cierre.montoReembolso)}. No podrás cambiarlo después.`}
          confirm="Aceptar cierre"
          busy={mutation.isPending}
          onConfirm={() => ejecutar({ decision: "aceptado" })}
        />
        <Button
          variant="outline"
          disabled={bloqueado}
          aria-expanded={objetando}
          aria-controls={`${id}-objecion`}
          onClick={() => setObjetando((v) => !v)}
        >
          Objetar
        </Button>
      </div>
      {objetando ? (
        <form
          id={`${id}-objecion`}
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const problema = campoMotivo(
              motivo,
              MAX_MOTIVO_OBJECION,
              "Explica por qué objetas el cierre.",
            );
            setError(problema);
            if (!problema) void ejecutar({ decision: "objetado", motivo: motivo.trim() });
          }}
        >
          <FormField
            id={`${id}-motivo`}
            label="¿Por qué objetas el cierre?"
            help={`Obligatorio. Hasta ${MAX_MOTIVO_OBJECION} caracteres. Objetar no cambia el pedido ni el inventario.`}
            error={error ?? undefined}
          >
            <Textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={MAX_MOTIVO_OBJECION}
              aria-invalid={!!error}
              aria-describedby={[`${id}-motivo-help`, error ? `${id}-motivo-error` : null]
                .filter(Boolean)
                .join(" ")}
              disabled={bloqueado}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </FormField>
          <Button type="submit" variant="destructive" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Enviando…"
              : intento.current.incierto
                ? "Reintentar la misma objeción"
                : "Enviar objeción"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function HistorialCierres({ cierres, snapshot }: { cierres: CierreParcial[]; snapshot: Snapshot }) {
  const titulo = useId();
  return (
    <section aria-labelledby={titulo} className="min-w-0 space-y-3">
      <h3 id={titulo} className="font-semibold">
        Propuestas de cierre anteriores
      </h3>
      <ol className="space-y-3">
        {cierres.map((c) => (
          <li key={c.id} className="min-w-0 space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="font-semibold">Cierre parcial #{c.numero}</h4>
              <StatusBadge
                tone={c.estado === "aceptado" ? "success" : "danger"}
                prefix="Estado del cierre"
              >
                {ESTADO_CIERRE_LABELS[c.estado]}
              </StatusBadge>
            </div>
            <MotivoTexto titulo="Motivo del taller" texto={c.motivo} />
            {c.decision?.motivo ? (
              <MotivoTexto titulo="Motivo de la objeción" texto={c.decision.motivo} />
            ) : null}
            <DesgloseCierre lineas={c.lineas} snapshot={snapshot} />
            <TotalReembolso etiqueta="Reembolso calculado" monto={c.montoReembolso} />
            <p className="text-xs text-muted-foreground">
              Propuesto el {formatDateTime(c.propuestoEn)}
              {c.decision ? ` · Respondido el ${formatDateTime(c.decision.registradoEn)}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// --- Reembolso y devolución externa ---

function TarjetaReembolso({
  pedido,
  reembolso: r,
  recibido,
  cierres,
}: {
  pedido: number;
  reembolso: Reembolso;
  recibido: boolean;
  cierres: CierreParcial[];
}) {
  const origen =
    r.origen === "cierre_parcial"
      ? `${ORIGEN_LABELS.cierre_parcial} #${cierres.find((c) => c.id === r.cierre)?.numero ?? ""}`.trim()
      : ORIGEN_LABELS.cancelacion;
  return (
    <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-label="Reembolso">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{TIPO_REEMBOLSO_LABELS[r.tipo]}</h3>
        <StatusBadge
          tone={r.estado === "realizado" ? "success" : "pending"}
          prefix="Estado del reembolso"
        >
          {ESTADO_REEMBOLSO_LABELS[r.estado]}
        </StatusBadge>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {r.estado === "realizado"
          ? "El taller registró la devolución realizada fuera de ArtesaNic. La plataforma no mueve el dinero."
          : recibido
            ? "Te corresponde devolver este importe fuera de ArtesaNic y después registrar la devolución."
            : "El taller debe devolverte este importe fuera de ArtesaNic. La devolución todavía no está registrada."}
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Monto</dt>
          <dd className="break-words text-lg font-semibold tabular-nums text-primary">
            {mostrarImporte(r.monto)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Origen</dt>
          <dd>{origen}</dd>
        </div>
        {r.devolucion ? (
          <>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Fecha de la devolución</dt>
              <dd>{formatCalendarDate(r.devolucion.fecha)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Referencia</dt>
              <dd className="break-words">{r.devolucion.referencia}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {r.estado === "pendiente" ? (
        recibido ? (
          <FormularioDevolucion pedido={pedido} />
        ) : (
          <p className="text-sm text-muted-foreground">
            El taller debe devolverte este importe fuera de la plataforma y registrar la devolución.
          </p>
        )
      ) : null}
    </section>
  );
}

function FormularioDevolucion({ pedido }: { pedido: number }) {
  const id = useId();
  const { usuario } = useSession();
  const client = useQueryClient();
  const intento = useRef(crearIntentoDeCumplimiento());
  const hoy = hoyEnManagua();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [referencia, setReferencia] = useState("");
  const [errores, setErrores] = useState<{ fecha?: string; referencia?: string }>({});
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: DevolucionEntrada) =>
      intento.current.ejecutar(
        { pedido, accion: "devolucion", ...cuerpoDevolucion(entrada) },
        (k) => registrarDevolucion(pedido, entrada, k),
      ),
    onSuccess: (datos) => {
      refrescarTrasResolucion(client, usuario?.id, true, pedido, datos);
      toast.success("Devolución registrada");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400)
        setErrores(Object.fromEntries(Object.entries(e.campos).map(([k, v]) => [k, v.join(" ")])));
      if (e instanceof ApiError && e.status === 409)
        refrescarTrasResolucion(client, usuario?.id, true, pedido, null);
    },
  });
  const ejecutar = useEjecutor(mutation.mutateAsync);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const problemas: { fecha?: string; referencia?: string } = {};
    if (!fecha) problemas.fecha = "Indica la fecha de la devolución.";
    else if (fecha > hoy) problemas.fecha = "La fecha no puede ser posterior a hoy.";
    const ref = referencia.trim();
    if (!ref) problemas.referencia = "Indica la referencia de la devolución.";
    else if (ref.length > MAX_REFERENCIA_DEVOLUCION)
      problemas.referencia = `Hasta ${MAX_REFERENCIA_DEVOLUCION} caracteres.`;
    setErrores(problemas);
    if (!Object.keys(problemas).length) void ejecutar({ fecha, referencia: ref });
  };
  const errorGeneral =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 400)
      ? mensajeDominio(mutation.error)
      : null;
  if (!abierto)
    return (
      <Button className="w-full sm:w-auto" onClick={() => setAbierto(true)}>
        Registrar devolución realizada
      </Button>
    );
  return (
    <form noValidate onSubmit={enviar} className="min-w-0 space-y-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        Indica cuándo y con qué referencia devolviste el importe. El monto es el de la obligación y
        no se puede modificar.
      </p>
      <FormMessage>{errorGeneral}</FormMessage>
      <fieldset
        disabled={mutation.isPending || intento.current.incierto}
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        <FormField id={`${id}-fecha`} label="Fecha de la devolución" error={errores.fecha}>
          <Input
            id={`${id}-fecha`}
            type="date"
            value={fecha}
            max={hoy}
            aria-invalid={!!errores.fecha}
            aria-describedby={errores.fecha ? `${id}-fecha-error` : undefined}
            onChange={(e) => setFecha(e.target.value)}
          />
        </FormField>
        <FormField
          id={`${id}-referencia`}
          label="Referencia"
          help={`Por ejemplo, el número de transferencia. Hasta ${MAX_REFERENCIA_DEVOLUCION} caracteres.`}
          error={errores.referencia}
        >
          <Input
            id={`${id}-referencia`}
            value={referencia}
            maxLength={MAX_REFERENCIA_DEVOLUCION}
            aria-invalid={!!errores.referencia}
            aria-describedby={[
              `${id}-referencia-help`,
              errores.referencia ? `${id}-referencia-error` : null,
            ]
              .filter(Boolean)
              .join(" ")}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </FormField>
      </fieldset>
      <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending
          ? "Registrando…"
          : intento.current.incierto
            ? "Reintentar la misma devolución"
            : "Registrar devolución"}
      </Button>
    </form>
  );
}

// --- Clasificación de unidades manipuladas (solo artesano) ---

export function ClasificacionInventarioPedido({ pedido }: { pedido: PedidoConfirmado }) {
  const { usuario } = useSession();
  const query = useQuery({
    queryKey: claves.clasificacionesPedido(usuario?.id, true, pedido.id),
    queryFn: ({ signal }) => consultarClasificaciones(pedido.id, signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  if (query.isPending) return null;
  if (query.isError)
    return (
      <Section title="Unidades por clasificar">
        <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
      </Section>
    );
  return <VistaClasificaciones pedido={pedido.id} obligaciones={query.data.obligaciones} />;
}

export function VistaClasificaciones({
  pedido,
  obligaciones,
}: {
  pedido: number;
  obligaciones: ObligacionClasificacion[];
}) {
  if (!obligaciones.length) return null;
  return (
    <Section
      title="Unidades por clasificar"
      description="Unidades estándar que se consumieron del inventario y no se entregaron. Reutilizable las devuelve a tu existencia; Baja registra su disposición final sin descontarlas otra vez."
    >
      <ol className="min-w-0 space-y-4">
        {obligaciones.map((o) => (
          <ObligacionCard key={o.id} pedido={pedido} obligacion={o} />
        ))}
      </ol>
    </Section>
  );
}

function ObligacionCard({
  pedido,
  obligacion: o,
}: {
  pedido: number;
  obligacion: ObligacionClasificacion;
}) {
  const id = useId();
  const { usuario } = useSession();
  const client = useQueryClient();
  const intento = useRef(crearIntentoDeCumplimiento());
  const [cantidad, setCantidad] = useState(String(o.cantidadPendiente));
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<{ cantidad?: string; motivo?: string }>({});
  const mutation = useMutation({
    retry: false,
    mutationFn: (entrada: ClasificacionEntrada) =>
      intento.current.ejecutar({ pedido, ...cuerpoClasificaciones([entrada]) }, (k) =>
        clasificarInventario(pedido, [entrada], k),
      ),
    onSuccess: (datos, entrada) => {
      client.setQueryData(claves.clasificacionesPedido(usuario?.id, true, pedido), datos);
      refrescarInventario(client, usuario?.id, pedido, [o.producto.id]);
      const actual = datos.obligaciones.find((x) => x.id === o.id);
      setCantidad(String(actual?.cantidadPendiente ?? 0));
      setMotivo("");
      setErrores({});
      toast.success(
        `${entrada.cantidad} ${entrada.cantidad === 1 ? "unidad clasificada" : "unidades clasificadas"} como ${RESULTADO_CLASIFICACION_LABELS[entrada.resultado].toLowerCase()}`,
      );
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({
          queryKey: claves.clasificacionesPedido(usuario?.id, true, pedido),
        });
    },
  });
  const ejecutar = useEjecutor(mutation.mutateAsync);
  const clasificar = (resultado: ResultadoClasificacion) => {
    const problemas: { cantidad?: string; motivo?: string } = {};
    const n = Number(cantidad.trim());
    if (!Number.isInteger(n) || n < 1) problemas.cantidad = "Indica un número entero mayor que 0.";
    else if (n > o.cantidadPendiente) problemas.cantidad = `Como máximo ${o.cantidadPendiente}.`;
    const problemaMotivo = campoMotivo(motivo, MAX_MOTIVO_CLASIFICACION, "Indica el motivo.");
    if (problemaMotivo) problemas.motivo = problemaMotivo;
    setErrores(problemas);
    if (!Object.keys(problemas).length)
      void ejecutar({ obligacion: o.id, cantidad: n, resultado, motivo: motivo.trim() });
  };
  const bloqueado = mutation.isPending || intento.current.incierto;
  return (
    <li className="min-w-0 space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">Producto: {o.producto.nombre}</h3>
          <p className="text-sm text-muted-foreground">{ORIGEN_LABELS[o.origen]}</p>
        </div>
        <StatusBadge
          tone={o.cantidadPendiente ? "pending" : "success"}
          prefix="Estado de la clasificación"
        >
          {o.cantidadPendiente ? `Pendientes: ${o.cantidadPendiente}` : "Clasificación completa"}
        </StatusBadge>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums">{o.cantidad}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Clasificadas</dt>
          <dd className="tabular-nums">{o.cantidadClasificada}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Pendientes</dt>
          <dd className="tabular-nums">{o.cantidadPendiente}</dd>
        </div>
      </dl>
      {o.cantidadPendiente ? (
        <form noValidate onSubmit={(e) => e.preventDefault()} className="min-w-0 space-y-3">
          <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
          <fieldset disabled={bloqueado} className="grid min-w-0 gap-4 sm:grid-cols-[10rem_1fr]">
            <FormField
              id={`${id}-cantidad`}
              label="Cantidad"
              help={`Pendientes: ${o.cantidadPendiente}`}
              error={errores.cantidad}
            >
              <Input
                id={`${id}-cantidad`}
                type="number"
                inputMode="numeric"
                min={1}
                max={o.cantidadPendiente}
                step={1}
                value={cantidad}
                aria-invalid={!!errores.cantidad}
                aria-describedby={[
                  `${id}-cantidad-help`,
                  errores.cantidad ? `${id}-cantidad-error` : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </FormField>
            <FormField
              id={`${id}-motivo`}
              label="Motivo"
              help={`Obligatorio en ambos casos. Hasta ${MAX_MOTIVO_CLASIFICACION} caracteres.`}
              error={errores.motivo}
            >
              <Textarea
                id={`${id}-motivo`}
                value={motivo}
                maxLength={MAX_MOTIVO_CLASIFICACION}
                aria-invalid={!!errores.motivo}
                aria-describedby={[
                  `${id}-motivo-help`,
                  errores.motivo ? `${id}-motivo-error` : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </FormField>
          </fieldset>
          {intento.current.incierto ? (
            <p role="status" className="rounded-lg border bg-muted p-3 text-sm">
              No pudimos confirmar el resultado. Reintenta con los mismos datos.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => clasificar("reutilizable")}
            >
              Reutilizable
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => clasificar("baja")}
            >
              Baja
            </Button>
          </div>
        </form>
      ) : null}
      {o.clasificaciones.length ? (
        <ul className="space-y-2 border-t pt-3 text-sm" aria-label="Historial de clasificación">
          {o.clasificaciones.map((c) => (
            <li key={c.id} className="min-w-0 space-y-1">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{RESULTADO_CLASIFICACION_LABELS[c.resultado]}</span>
                <span className="tabular-nums">
                  {c.cantidad} {c.cantidad === 1 ? "unidad" : "unidades"}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{c.motivo}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(c.registradoEn)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
