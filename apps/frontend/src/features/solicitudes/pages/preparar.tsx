import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/site-layout";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/use-session";
import { getCatalogProduct, listCatalog } from "@/features/catalogo/api";
import { ProductImage } from "@/features/catalogo/components/product-card";
import type { CatalogProduct } from "@/features/catalogo/types";
import { MODALIDAD_LABELS } from "@/lib/labels";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";
import {
  ApiError,
  crearSolicitud,
  reintentarSalvoErrorDelCliente,
  solicitudesReales,
} from "../api";
import type { RenglonBorrador, SolicitudEntrada } from "../types";
import {
  fechaLocalISO,
  nuevoRenglon,
  puedeAgregarProducto,
  validarSolicitudBorrador,
} from "../validacion";

export default function PrepararSolicitud() {
  const { productId: parametro } = useParams();
  const id = parseRouteId(parametro);
  if (parametro !== undefined && id === undefined) return <NotFound />;
  return <Composicion key={id ?? "nueva"} productoId={id} />;
}

function Composicion({ productoId }: { productoId: number | undefined }) {
  const { usuario } = useSession();
  const navigate = useNavigate();
  const consultas = useQueryClient();
  const [borrador, setBorrador] = useState<RenglonBorrador[] | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [avisoTaller, setAvisoTaller] = useState("");
  const [paginacion, setPaginacion] = useState<{ tallerId: number | undefined; page: number }>({
    tallerId: undefined,
    page: 1,
  });
  const producto = useQuery({
    queryKey: ["solicitud-producto-inicial", solicitudesReales, productoId],
    queryFn: () => getCatalogProduct(productoId!),
    enabled: productoId !== undefined,
    retry: reintentarSalvoErrorDelCliente,
  });
  const renglones = borrador ?? (producto.data ? [nuevoRenglon(producto.data)] : []);
  const taller = renglones[0]?.producto.taller;
  const tallerId = taller?.id;
  const page = paginacion.tallerId === tallerId ? paginacion.page : 1;
  const setPage = (nueva: number) => setPaginacion({ tallerId, page: nueva });
  const catalogo = useQuery({
    queryKey: ["solicitud-productos", solicitudesReales, tallerId, page],
    queryFn: () => listCatalog({ artesanoId: tallerId, page, pageSize: 12 }),
    retry: reintentarSalvoErrorDelCliente,
  });
  const envio = useMutation({
    mutationFn: (entrada: SolicitudEntrada) => crearSolicitud(entrada, usuario),
    onSuccess: (solicitud) => {
      void consultas.invalidateQueries({ queryKey: ["solicitudes"] });
      void navigate(`/solicitudes/${solicitud.id}`);
    },
  });
  const cambiar = (indice: number, cambios: Partial<RenglonBorrador>) =>
    setBorrador(renglones.map((r, i) => (i === indice ? { ...r, ...cambios } : r)));
  const agregar = (p: CatalogProduct) => {
    if (!puedeAgregarProducto(renglones, p)) {
      setAvisoTaller(
        "Todos los productos deben pertenecer al mismo taller. Quita los renglones actuales para elegir otro taller.",
      );
      return;
    }
    setAvisoTaller("");
    if (!taller) setPaginacion({ tallerId: p.taller.id, page: 1 });
    setBorrador([...renglones, nuevoRenglon(p)]);
  };
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (envio.isPending) return;
    const validada = validarSolicitudBorrador(renglones);
    if (!validada.success) {
      setErrores(
        validada.error.issues.map((i) => {
          const posicion = i.path[1];
          return `${typeof posicion === "number" ? `Renglón ${posicion + 1}: ` : ""}${i.message}`;
        }),
      );
      return;
    }
    setErrores([]);
    envio.mutate(validada.data);
  };

  // No ofrecer el catálogo editable antes de cargar el producto de la ruta:
  // agregar otro en ese intervalo descartaría silenciosamente el renglón inicial.
  if (productoId !== undefined && !producto.data) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <h1 className="font-display text-3xl font-bold">Preparar solicitud</h1>
          {producto.isError ? (
            <ErrorState mensaje={producto.error.message} onRetry={() => void producto.refetch()} />
          ) : (
            <p role="status">Cargando producto…</p>
          )}
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 [&_button]:min-h-11 [&_input]:min-h-11">
        <Link to="/solicitudes" className="inline-flex min-h-11 items-center text-primary">
          Mis solicitudes
        </Link>
        <h1 className="font-display text-3xl font-bold">Preparar solicitud</h1>
        <p>Agrega uno o varios renglones de un mismo taller. Cada renglón conserva su modalidad.</p>
        <p className="rounded-lg border p-4 text-sm">
          {solicitudesReales
            ? "El inicio de sesión real todavía no está disponible. El selector Demo solo cambia la vista y no permite enviar solicitudes reales."
            : "Demostración local: esta solicitud se guarda en este navegador, separada de los pedidos de la demo anterior."}{" "}
          Enviar no confirma un pedido, fija precios ni reserva unidades.
        </p>
        <form onSubmit={enviar} noValidate className="space-y-6">
          {renglones.length === 0 ? <p>Selecciona un producto para comenzar.</p> : null}
          {renglones.map((r, i) => (
            <fieldset
              key={i}
              className="space-y-4 rounded-xl border p-4"
              disabled={envio.isPending}
            >
              <legend className="px-2 font-semibold">
                Renglón {i + 1}: {r.producto.nombre}
              </legend>
              <p className="text-sm text-muted-foreground">{r.producto.taller.nombre}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  Modalidad
                  <select
                    aria-label={`Modalidad del renglón ${i + 1}`}
                    className="block min-h-11 w-full rounded-md border bg-background px-3"
                    value={r.modalidad}
                    onChange={(e) =>
                      cambiar(i, {
                        modalidad: e.target.value as RenglonBorrador["modalidad"],
                        fechaSolicitada: "",
                        caracteristicas: "",
                        origenPersonalizacion: "",
                      })
                    }
                  >
                    {r.producto.modalidades.map((m) => (
                      <option key={m} value={m}>
                        {MODALIDAD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Cantidad
                  <Input
                    aria-label={`Cantidad del renglón ${i + 1}`}
                    type="number"
                    min={1}
                    max={2147483647}
                    step={1}
                    value={Number.isNaN(r.cantidad) ? "" : r.cantidad}
                    onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) })}
                  />
                </label>
              </div>
              {r.modalidad === "produccion" ? (
                <label className="block space-y-1 text-sm">
                  Fecha solicitada
                  <Input
                    aria-label={`Fecha solicitada del renglón ${i + 1}`}
                    type="date"
                    min={fechaLocalISO()}
                    value={r.fechaSolicitada}
                    onChange={(e) => cambiar(i, { fechaSolicitada: e.target.value })}
                  />
                </label>
              ) : null}
              {r.modalidad === "personalizacion" ? (
                <>
                  <label className="block space-y-1 text-sm">
                    Características solicitadas
                    <Textarea
                      aria-label={`Características del renglón ${i + 1}`}
                      value={r.caracteristicas}
                      onChange={(e) => cambiar(i, { caracteristicas: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    Origen de la personalización
                    <select
                      aria-label={`Origen del renglón ${i + 1}`}
                      className="block min-h-11 w-full rounded-md border bg-background px-3"
                      value={r.origenPersonalizacion}
                      onChange={(e) =>
                        cambiar(i, {
                          origenPersonalizacion: e.target
                            .value as RenglonBorrador["origenPersonalizacion"],
                        })
                      }
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="desde_cero">Fabricar desde cero</option>
                      <option value="unidad_estandar">Usar una unidad estándar como base</option>
                    </select>
                  </label>
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setBorrador(renglones.filter((_, indice) => indice !== i))}
              >
                Quitar renglón {i + 1}
              </Button>
            </fieldset>
          ))}
          <section aria-labelledby="agregar-productos" className="space-y-4">
            <h2 id="agregar-productos" className="text-xl font-semibold">
              {taller ? `Más productos de ${taller.nombre}` : "Elegí un producto para comenzar"}
            </h2>
            {renglones[0] ? (
              <p className="text-sm">
                Agregá otro producto de este taller o repetí uno para solicitarlo con otra
                modalidad.
              </p>
            ) : null}
            {avisoTaller ? <p role="alert">{avisoTaller}</p> : null}
            {catalogo.isPending ? (
              <p role="status">Cargando productos…</p>
            ) : catalogo.isError ? (
              <ErrorState
                mensaje={catalogo.error.message}
                onRetry={() => void catalogo.refetch()}
              />
            ) : catalogo.data.items.length === 0 ? (
              <p>No hay productos publicados para solicitar.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {catalogo.data.items.map((p) => {
                  const permitido = puedeAgregarProducto(renglones, p);
                  return (
                    <li key={p.id} className="overflow-hidden rounded-lg border">
                      <ProductImage src={p.imagen} alt={p.nombre} className="aspect-[4/3]" />
                      <div className="space-y-2 p-3">
                        <p className="break-words font-medium">{p.nombre}</p>
                        {!taller ? <p className="text-sm">{p.taller.nombre}</p> : null}
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={!permitido || envio.isPending}
                          onClick={() => agregar(p)}
                          aria-label={`Agregar ${p.nombre}`}
                        >
                          Agregar renglón
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {catalogo.data && catalogo.data.totalPages > 1 ? (
              <nav aria-label="Productos para agregar" className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1 || catalogo.isPlaceholderData}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <span>
                  {page} / {catalogo.data.totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= catalogo.data.totalPages || catalogo.isPlaceholderData}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </nav>
            ) : null}
          </section>
          {errores.length ? (
            <ul role="alert" className="space-y-1 text-destructive">
              {errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
          {envio.isError ? (
            <div role="alert" className="space-y-1 text-destructive">
              <p>{envio.error.message}</p>
              {envio.error instanceof ApiError
                ? Object.entries(envio.error.campos).map(([campo, mensajes]) => (
                    <p key={campo}>
                      {campo}: {mensajes.join(" ")}
                    </p>
                  ))
                : null}
            </div>
          ) : null}
          <Button
            className="touch-target"
            type="submit"
            disabled={
              envio.isPending ||
              renglones.length === 0 ||
              (productoId !== undefined && !producto.data)
            }
          >
            {envio.isPending ? "Enviando solicitud…" : "Enviar solicitud al taller"}
          </Button>
        </form>
      </div>
    </SiteLayout>
  );
}
