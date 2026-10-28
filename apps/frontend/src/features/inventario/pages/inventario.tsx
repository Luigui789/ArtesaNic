import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListPagination } from "@/components/common/pagination";
import { FormField, FormMessage } from "@/components/common/form-field";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-session";
import { getOwnProduct } from "@/features/catalogo/http";
import { ApiError, reintentarSalvoErrorDelCliente } from "@/lib/http";
import { mensajeDominio } from "@/lib/errores-dominio";
import { claves } from "@/lib/query-keys";
import { crearIntentoSeguro } from "@/lib/intento-seguro";
import { parseRouteId } from "@/lib/route-id";
import { formatDate } from "@/lib/format";
import {
  listarInventario,
  consultarInventario,
  listarMovimientos,
  modificarInventario,
  type Inventario,
  type EntradaInventario,
} from "../api";
import { esquemaMovimiento, type MovimientoFormulario } from "../validacion";

export function CantidadesInventario({ inventario: i }: { inventario: Inventario }) {
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 sm:gap-4">
      <div>
        <dt className="text-xs text-muted-foreground">Existencia física</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums">{i.existenciaFisica}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Reservadas</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums">{i.reservada}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Disponibles</dt>
        <dd className="mt-1 text-xl font-semibold tabular-nums text-secondary">{i.disponible}</dd>
      </div>
    </dl>
  );
}
export function ListadoInventario() {
  const { usuario } = useSession();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...claves.inventario(usuario?.id), "lista", page],
    queryFn: ({ signal }) => listarInventario(page, signal),
    placeholderData: keepPreviousData,
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title="Inventario"
          description="Consulta las unidades físicas, reservadas y disponibles de tu taller."
          action={
            <Button asChild>
              <Link to="/panel/productos">Elegir producto para registrar existencias</Link>
            </Button>
          }
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data.items.length ? (
          <EmptyState
            titulo="Todavía no hay existencias registradas"
            descripcion="Elige uno de tus productos y establece su existencia inicial. Puedes empezar desde cero."
            accion={
              <Button asChild variant="outline">
                <Link to="/panel/productos">Ver mis productos</Link>
              </Button>
            }
          />
        ) : (
          <>
            <ul className="grid gap-4 xl:grid-cols-2">
              {query.data.items.map((i) => (
                <li key={i.id} className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{i.producto.categoria.nombre}</p>
                    <h2 className="mt-1 font-display text-xl font-semibold">{i.producto.nombre}</h2>
                  </div>
                  <CantidadesInventario inventario={i} />
                  <Button asChild variant="outline">
                    <Link to={`/panel/inventario/${i.producto.id}`}>Ver y ajustar inventario</Link>
                  </Button>
                </li>
              ))}
            </ul>
            <ListPagination
              page={page}
              totalPages={query.data.totalPages}
              onPage={setPage}
              busy={query.isPlaceholderData}
            />
          </>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
export function DetalleInventario() {
  const { productoId } = useParams();
  const id = parseRouteId(productoId);
  const { usuario } = useSession();
  const producto = useQuery({
    queryKey: ["producto-propio", usuario?.id, id],
    queryFn: ({ signal }) => getOwnProduct(id!, signal),
    enabled: !!id,
    retry: reintentarSalvoErrorDelCliente,
  });
  const inventario = useQuery({
    queryKey: [...claves.inventario(usuario?.id), id],
    queryFn: ({ signal }) => consultarInventario(id!, signal),
    enabled: !!id && !!producto.data,
    retry: reintentarSalvoErrorDelCliente,
  });
  const sinInicializar =
    inventario.error instanceof ApiError && inventario.error.status === 404 && !!producto.data;
  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title="Inventario del producto"
          description={producto.data?.nombre ?? "Consultá las unidades y sus movimientos."}
          back={{ to: "/panel/inventario", label: "Volver al inventario" }}
        />
        {!id ? (
          <ErrorState mensaje="El producto no existe." />
        ) : producto.isPending ? (
          <LoadingState />
        ) : producto.isError ? (
          <ErrorState
            mensaje={mensajeDominio(producto.error)}
            onRetry={() => void producto.refetch()}
          />
        ) : inventario.isPending ? (
          <LoadingState />
        ) : inventario.isError && !sinInicializar ? (
          <ErrorState
            mensaje={mensajeDominio(inventario.error)}
            onRetry={() => void inventario.refetch()}
          />
        ) : (
          <>
            <StatusBadge tone={sinInicializar ? "pending" : "success"}>
              {sinInicializar ? "Sin existencia inicial" : "Inventario registrado"}
            </StatusBadge>
            {inventario.data ? <CantidadesInventario inventario={inventario.data} /> : null}
            <p className="text-sm text-muted-foreground">
              Físicas: todas las unidades que tenés. Reservadas: comprometidas en pedidos.
              Disponibles: las que todavía podés ofrecer. Las reservas de pedidos confirmados se
              reflejan aquí; solo podés ajustar unidades disponibles.
            </p>
            <details open={sinInicializar} className="rounded-xl border bg-card p-4">
              <summary className="list-item min-h-11 cursor-pointer py-3 font-semibold text-primary">
                {sinInicializar ? "Registrar unidades iniciales" : "Actualizar existencias"}
              </summary>
              <Section
                title={sinInicializar ? "Establecer existencia inicial" : "Actualizar existencias"}
                description="Cada operación queda en el historial. Los movimientos anteriores se conservan sin editar ni borrar."
              >
                <FormularioInventario
                  key={`${id}-${sinInicializar}`}
                  producto={id}
                  inicial={!inventario.data}
                />
              </Section>
            </details>
            {inventario.data ? (
              <details className="rounded-xl border bg-card p-4">
                <summary className="list-item min-h-11 cursor-pointer py-3 font-semibold">
                  Consultar historial de movimientos
                </summary>
                <HistorialMovimientos producto={id} />
              </details>
            ) : null}
          </>
        )}
      </PageContainer>
    </SiteLayout>
  );
}
export function FormularioInventario({
  producto,
  inicial,
}: {
  producto: number;
  inicial: boolean;
}) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const intento = useRef(crearIntentoSeguro());
  const guardando = useRef(false);
  const form = useForm<MovimientoFormulario>({
    resolver: zodResolver(esquemaMovimiento),
    defaultValues: {
      accion: inicial ? "inicial" : "entradas",
      cantidad: inicial ? 0 : 1,
      direccion: "sumar",
      motivo: "",
    },
  });
  const accion = form.watch("accion");
  const guardar = useMutation({
    retry: false,
    mutationFn: async (input: EntradaInventario) => {
      const cuerpo = { producto, ...input };
      const key = intento.current.clave(cuerpo);
      try {
        return await modificarInventario(producto, input, key);
      } catch (error) {
        intento.current.fallar(error, cuerpo);
        throw error;
      }
    },
    onSuccess: (data) => {
      intento.current.completar();
      client.setQueryData([...claves.inventario(usuario?.id), producto], data);
      void client.invalidateQueries({ queryKey: claves.inventario(usuario?.id) });
      void client.invalidateQueries({ queryKey: claves.movimientos(usuario?.id, producto) });
      toast.success("Existencias actualizadas. Revisá las cantidades y el historial.");
      form.reset({ accion: "entradas", cantidad: 1, direccion: "sumar", motivo: "" });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400)
        for (const [key, messages] of Object.entries(error.campos)) {
          const campo = key === "delta" ? "cantidad" : key;
          if (campo === "cantidad" || campo === "motivo")
            form.setError(campo, { message: messages.join(" ") });
        }
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: claves.inventario(usuario?.id) });
    },
  });
  const enviar = form.handleSubmit(async (data) => {
    if (guardando.current) return;
    guardando.current = true;
    const input: EntradaInventario =
      data.accion === "inicial"
        ? { accion: "inicial", cantidad: data.cantidad }
        : data.accion === "entradas"
          ? { accion: "entradas", cantidad: data.cantidad, motivo: data.motivo }
          : {
              accion: "ajustes",
              delta: data.direccion === "restar" ? -data.cantidad : data.cantidad,
              motivo: data.motivo,
            };
    try {
      await guardar.mutateAsync(input);
    } catch {
      /* error visible, conserva datos */
    } finally {
      guardando.current = false;
    }
  });
  const locked = guardar.isPending || intento.current.incierto;
  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      aria-label="Actualizar inventario"
      className="max-w-xl space-y-4"
    >
      <FormMessage>{guardar.isError ? mensajeDominio(guardar.error) : null}</FormMessage>
      {intento.current.incierto ? (
        <p role="status" className="rounded-lg border bg-muted p-3 text-sm">
          Conservamos este intento. Reintenta con los mismos datos para confirmar el resultado.
        </p>
      ) : null}
      <fieldset disabled={locked} className="space-y-4">
        {!inicial ? (
          <FormField id="inv-accion" label="Operación">
            <select
              id="inv-accion"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              {...form.register("accion")}
            >
              <option value="entradas">Agregar unidades recién elaboradas</option>
              <option value="ajustes">Corregir la cantidad registrada</option>
            </select>
          </FormField>
        ) : null}
        {accion === "ajustes" ? (
          <FormField id="inv-direccion" label="¿Cómo cambia la cantidad?">
            <select
              id="inv-direccion"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3"
              {...form.register("direccion")}
            >
              <option value="sumar">Aumentar unidades</option>
              <option value="restar">Reducir unidades</option>
            </select>
          </FormField>
        ) : null}
        <FormField
          id="inv-cantidad"
          label={inicial ? "Unidades que tienes actualmente *" : "Cantidad de unidades *"}
          error={form.formState.errors.cantidad?.message}
        >
          <Input
            id="inv-cantidad"
            type="number"
            inputMode="numeric"
            min={inicial ? 0 : 1}
            step="1"
            {...form.register("cantidad")}
            aria-invalid={!!form.formState.errors.cantidad}
            aria-describedby="inv-cantidad-error"
          />
        </FormField>
        {accion !== "inicial" ? (
          <FormField
            id="inv-motivo"
            label={
              accion === "ajustes" ? "¿Por qué corregís la cantidad? *" : "Observación (opcional)"
            }
            help={
              accion === "ajustes"
                ? "El motivo permite entender el cambio cuando consultés el historial."
                : "Por ejemplo, piezas recién terminadas."
            }
            error={form.formState.errors.motivo?.message}
          >
            <Textarea
              id="inv-motivo"
              maxLength={500}
              {...form.register("motivo")}
              aria-invalid={!!form.formState.errors.motivo}
              aria-describedby="inv-motivo-error"
            />
          </FormField>
        ) : null}
      </fieldset>
      <Button type="submit" disabled={guardar.isPending}>
        {guardar.isPending
          ? "Guardando…"
          : intento.current.incierto
            ? "Reintentar el mismo registro"
            : inicial
              ? "Establecer existencia inicial"
              : "Guardar movimiento"}
      </Button>
    </form>
  );
}
const NOMBRE: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  ajuste_positivo: "Ajuste: suma",
  ajuste_negativo: "Ajuste: resta",
  reserva: "Reserva de pedido",
  liberacion: "Liberación",
  consumo: "Consumo de unidad reservada",
  reincorporacion: "Reincorporación",
  baja: "Baja",
};
function HistorialMovimientos({ producto }: { producto: number }) {
  const { usuario } = useSession();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...claves.movimientos(usuario?.id, producto), page],
    queryFn: ({ signal }) => listarMovimientos(producto, page, signal),
    placeholderData: keepPreviousData,
    retry: reintentarSalvoErrorDelCliente,
  });
  return (
    <Section
      title="Historial de movimientos"
      description="Registro de solo lectura, del más reciente al más antiguo."
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <EmptyState
          titulo="Sin movimientos"
          descripcion="Los registros de existencias y reservas aparecerán aquí."
        />
      ) : (
        <>
          <ol className="divide-y">
            {query.data.items.map((m) => (
              <li key={m.id} className="space-y-2 py-4 first:pt-0">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{NOMBRE[m.tipo] ?? "Movimiento de inventario"}</h3>
                  <time className="text-xs text-muted-foreground" dateTime={m.creadoEn}>
                    {formatDate(m.creadoEn)}
                  </time>
                </div>
                <p className="text-sm">
                  Cantidad registrada: <strong>{m.cantidad}</strong> · Físicas:{" "}
                  {m.existenciaDespues} · Reservadas: {m.reservadaDespues}
                </p>
                {m.motivo ? (
                  <p className="break-words text-sm text-muted-foreground">{m.motivo}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {m.actor?.nombre ?? "Registro del sistema"}
                  {m.pedido ? (
                    <>
                      {" "}
                      ·{" "}
                      <Link className="underline" to={`/panel/pedidos/${m.pedido}`}>
                        Pedido #{m.pedido}
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
          <ListPagination
            page={page}
            totalPages={query.data.totalPages}
            onPage={setPage}
            busy={query.isPlaceholderData}
          />
        </>
      )}
    </Section>
  );
}
