import { PageContainer } from "@/components/common/page";
import { useRef, useState } from "react";
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
import { formatCalendarDate } from "@/lib/format";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";
import {
  ApiError,
  crearIntentoDeEnvio,
  crearSolicitud,
  reintentarSalvoErrorDelCliente,
  solicitudesReales,
} from "../api";
import { MODALIDADES_ENTREGA } from "../types";
import type { EntregaPreferidaBorrador, RenglonBorrador, SolicitudEntrada } from "../types";
import {
  MAX_DESCRIPCION_ENTREGA,
  fechaLocalISO,
  nuevoRenglon,
  puedeAgregarProducto,
  validarSolicitudBorrador,
} from "../validacion";

const ENTREGA_LABELS: Record<EntregaPreferidaBorrador["modalidad"], string> = {
  "": "Sin preferencia",
  retiro_taller: "Retiro en taller",
  punto_encuentro: "Punto de encuentro",
  entrega_artesano: "Entrega por el artesano",
  otra: "Otra",
};

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
  const [paso, setPaso] = useState<"edicion" | "resumen">("edicion");
  // RF-016: preferencia opcional; el artesano define el plan y costo en su propuesta.
  const [entrega, setEntrega] = useState<EntregaPreferidaBorrador>({
    modalidad: "",
    descripcion: "",
  });
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
  // Un intento por composición: sobrevive a los rerenders y conserva la clave al reintentar.
  const intento = useRef(crearIntentoDeEnvio());
  const envio = useMutation({
    mutationFn: ({ entrada, clave }: { entrada: SolicitudEntrada; clave: string }) =>
      crearSolicitud(entrada, usuario, clave),
    onSuccess: (solicitud) => {
      intento.current.completar();
      void consultas.invalidateQueries({ queryKey: ["solicitudes"] });
      void navigate(`/solicitudes/${solicitud.id}`);
    },
  });
  const cambiar = (indice: number, cambios: Partial<RenglonBorrador>) =>
    setBorrador(renglones.map((r, i) => (i === indice ? { ...r, ...cambios } : r)));
  const agregar = (p: CatalogProduct) => {
    if (!puedeAgregarProducto(renglones, p)) {
      setAvisoTaller(
        "Todos los productos deben pertenecer al mismo taller. Para solicitar de otro taller, inicia desde uno de sus productos.",
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
    const validada = validarSolicitudBorrador(renglones, entrega);
    if (!validada.success) {
      setErrores(
        validada.error.issues.map((i) => {
          const posicion = i.path[1];
          return `${typeof posicion === "number" ? `Producto ${posicion + 1}: ` : ""}${i.message}`;
        }),
      );
      return;
    }
    setErrores([]);
    if (paso === "edicion") {
      setPaso("resumen");
      return;
    }
    envio.mutate({ entrada: validada.data, clave: intento.current.clave(validada.data) });
  };

  // No ofrecer el catálogo editable antes de cargar el producto de la ruta:
  // agregar otro en ese intervalo descartaría silenciosamente el renglón inicial.
  if (productoId !== undefined && !producto.data) {
    return (
      <SiteLayout>
        <PageContainer className="max-w-5xl">
          <h1 className="font-display text-3xl font-bold">Preparar solicitud</h1>
          {producto.isError ? (
            <ErrorState mensaje={producto.error.message} onRetry={() => void producto.refetch()} />
          ) : (
            <p role="status">Cargando producto…</p>
          )}
        </PageContainer>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <PageContainer className="max-w-5xl">
        <Link to="/solicitudes" className="inline-flex min-h-11 items-center text-primary">
          Mis solicitudes
        </Link>
        <h1 className="font-display text-3xl font-bold">
          {paso === "edicion" ? "Preparar solicitud" : "Resumen de la solicitud"}
        </h1>
        <p>
          {paso === "edicion"
            ? "Agrega uno o varios productos de un mismo taller. Cada producto conserva su modalidad."
            : `Revisa los productos y detalles para ${taller?.nombre ?? "el taller"}. Podés volver a editar antes de enviarla.`}
        </p>
        <p className="rounded-lg border p-4 text-sm">
          {solicitudesReales
            ? "El inicio de sesión real todavía no está disponible. El selector Demo solo cambia la vista y no permite enviar solicitudes reales."
            : "Demostración local: esta solicitud se guarda en este navegador, separada de los pedidos de la demo anterior."}{" "}
          Enviar no confirma un pedido, fija precios ni reserva unidades.
        </p>
        <form onSubmit={enviar} noValidate className="space-y-6">
          {paso === "edicion" ? (
            <>
              {renglones.length === 0 ? <p>Selecciona un producto para comenzar.</p> : null}
              {renglones.map((r, i) => (
                <fieldset
                  key={i}
                  className="space-y-4 rounded-xl border p-4"
                  disabled={envio.isPending}
                >
                  <legend className="px-2 font-semibold">Producto {i + 1}</legend>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-start">
                    <ProductImage
                      src={r.producto.imagen}
                      alt={r.producto.nombre}
                      className="aspect-[4/3] rounded-md"
                    />
                    <div>
                      <h2 className="font-semibold">{r.producto.nombre}</h2>
                      <p className="text-sm text-muted-foreground">{r.producto.taller.nombre}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      Modalidad
                      <select
                        aria-label={`Modalidad del producto ${i + 1}`}
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
                        aria-label={`Cantidad del producto ${i + 1}`}
                        type="number"
                        min={1}
                        max={
                          r.modalidad === "stock" &&
                          typeof r.producto.disponibleStock === "number" &&
                          r.producto.disponibleStock > 0
                            ? r.producto.disponibleStock
                            : 2147483647
                        }
                        step={1}
                        value={Number.isNaN(r.cantidad) ? "" : r.cantidad}
                        onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  {r.modalidad === "stock" && typeof r.producto.disponibleStock === "number" ? (
                    <div
                      role="status"
                      className="rounded-lg border bg-surface/50 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">
                        {r.producto.disponibleStock === 0
                          ? "Sin unidades disponibles actualmente"
                          : `Disponibles actualmente: ${r.producto.disponibleStock} ${
                              r.producto.disponibleStock === 1 ? "unidad" : "unidades"
                            }`}
                      </p>
                      {r.cantidad > r.producto.disponibleStock ? (
                        <p role="alert" className="mt-1 text-xs text-destructive">
                          {r.producto.disponibleStock === 0
                            ? "No hay unidades disponibles en stock para solicitar en este momento."
                            : `La cantidad solicitada supera las unidades disponibles actualmente (${r.producto.disponibleStock}).`}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {r.modalidad === "produccion" ? (
                    <label className="block space-y-1 text-sm">
                      Fecha solicitada
                      <Input
                        aria-label={`Fecha solicitada del producto ${i + 1}`}
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
                          aria-label={`Características del producto ${i + 1}`}
                          value={r.caracteristicas}
                          onChange={(e) => cambiar(i, { caracteristicas: e.target.value })}
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        Origen de la personalización
                        <select
                          aria-label={`Origen del producto ${i + 1}`}
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
                          <option value="unidad_estandar">
                            Usar una unidad estándar como base
                          </option>
                        </select>
                      </label>
                    </>
                  ) : null}
                  {renglones.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBorrador(renglones.filter((_, indice) => indice !== i))}
                    >
                      Quitar producto {i + 1}
                    </Button>
                  ) : null}
                </fieldset>
              ))}
              <fieldset className="space-y-4 rounded-xl border p-4" disabled={envio.isPending}>
                <legend className="px-2 font-semibold">Entrega preferida (opcional)</legend>
                <p className="text-sm text-muted-foreground">
                  El taller definirá el plan y el costo de entrega en su propuesta.
                </p>
                <label className="block space-y-1 text-sm">
                  Modalidad preferida
                  <select
                    aria-label="Modalidad de entrega preferida"
                    className="block min-h-11 w-full rounded-md border bg-background px-3"
                    value={entrega.modalidad}
                    onChange={(e) =>
                      setEntrega({
                        modalidad: e.target.value as EntregaPreferidaBorrador["modalidad"],
                        descripcion: e.target.value ? entrega.descripcion : "",
                      })
                    }
                  >
                    {(["", ...MODALIDADES_ENTREGA] as const).map((m) => (
                      <option key={m} value={m}>
                        {ENTREGA_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
                {entrega.modalidad ? (
                  <label className="block space-y-1 text-sm">
                    {entrega.modalidad === "otra" ? "Describe la entrega" : "Detalle (opcional)"}
                    <Textarea
                      aria-label="Descripción de la entrega preferida"
                      maxLength={MAX_DESCRIPCION_ENTREGA}
                      value={entrega.descripcion}
                      onChange={(e) => setEntrega({ ...entrega, descripcion: e.target.value })}
                    />
                  </label>
                ) : null}
              </fieldset>
              {errores.length ? (
                <ul role="alert" className="space-y-1 text-destructive">
                  {errores.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
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
                Revisar solicitud
              </Button>
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
                              Agregar producto
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
            </>
          ) : (
            <section aria-label="Productos incluidos en la solicitud" className="space-y-4">
              {renglones.map((r, i) => (
                <article
                  key={i}
                  className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[minmax(0,12rem)_1fr]"
                >
                  <ProductImage
                    src={r.producto.imagen}
                    alt={r.producto.nombre}
                    className="aspect-[4/3] rounded-md"
                  />
                  <div className="space-y-2">
                    <h2 className="font-semibold">
                      Producto {i + 1}: {r.producto.nombre}
                    </h2>
                    <p className="text-sm text-muted-foreground">{r.producto.taller.nombre}</p>
                    <p>
                      {MODALIDAD_LABELS[r.modalidad]} · Cantidad: {r.cantidad}
                    </p>
                    {r.modalidad === "stock" && typeof r.producto.disponibleStock === "number" ? (
                      <p className="text-sm text-muted-foreground">
                        Disponibles actualmente: {r.producto.disponibleStock}{" "}
                        {r.producto.disponibleStock === 1 ? "unidad" : "unidades"}
                      </p>
                    ) : null}
                    {r.modalidad === "produccion" ? (
                      <p>
                        Fecha solicitada:{" "}
                        {r.fechaSolicitada ? formatCalendarDate(r.fechaSolicitada) : "Sin definir"}
                      </p>
                    ) : null}
                    {r.modalidad === "personalizacion" ? (
                      <>
                        <p>Características: {r.caracteristicas || "Sin definir"}</p>
                        <p>
                          Origen:{" "}
                          {r.origenPersonalizacion === "desde_cero"
                            ? "Fabricar desde cero"
                            : r.origenPersonalizacion === "unidad_estandar"
                              ? "Usar una unidad estándar como base"
                              : "Sin definir"}
                        </p>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
              <p>
                Entrega preferida: {ENTREGA_LABELS[entrega.modalidad]}
                {entrega.descripcion.trim() ? ` — ${entrega.descripcion.trim()}` : ""}
              </p>
              <p className="rounded-lg border p-4 text-sm">
                Este envío inicia una solicitud de revisión. Todavía no confirma un pedido ni
                reserva unidades.
              </p>
            </section>
          )}
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
          {paso === "resumen" ? (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={envio.isPending}
                onClick={() => setPaso("edicion")}
              >
                Editar solicitud
              </Button>
              <Button className="touch-target" type="submit" disabled={envio.isPending}>
                {envio.isPending ? "Enviando solicitud…" : "Enviar solicitud al taller"}
              </Button>
            </div>
          ) : null}
        </form>
      </PageContainer>
    </SiteLayout>
  );
}
