/** Formulario legacy de la demo anterior; la ruta activa usa features/solicitudes. */
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createOrderRequest } from "@/features/pedidos/api";
import { getProduct } from "@/features/catalogo/api";
import { useCurrency } from "@/hooks/use-currency";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";
import { NotFound } from "@/app/not-found";
import { DELIVERY_MODES, type DeliveryMode, type OrderOption } from "@/types";
import { DELIVERY_MODE_LABELS } from "@/lib/labels";
import { maxRequestable } from "@/lib/units";
import { UnitAvailability } from "@/features/catalogo/components/unit-availability";

const esquema = z.object({
  cantidad: z
    .number({ message: "Indica una cantidad válida." })
    .int("La cantidad debe ser un número entero.")
    .min(1, "Debes solicitar al menos 1 unidad."),
  personalizacion: z.string().trim().max(500, "Máximo 500 caracteres."),
  observaciones: z.string().trim().max(300, "Máximo 300 caracteres."),
});

export default function SolicitarPedido() {
  const { productId: productIdParam } = useParams<{ productId: string }>();
  const productId = parseRouteId(productIdParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { format } = useCurrency();
  const { usuario } = useSession();

  useDocumentHead({
    title: "Solicitar pedido personalizado | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Envía tu solicitud de pedido al taller: cantidad, personalización y observaciones.",
      },
      { property: "og:title", content: "Solicitar pedido personalizado" },
      {
        property: "og:description",
        content: "El artesano evalúa tu solicitud antes de aceptarla.",
      },
      { property: "og:url", content: `/solicitar/${productId}` },
    ],
    canonical: `/solicitar/${productId}`,
  });

  const [cantidad, setCantidad] = useState(1);
  const [opcion, setOpcion] = useState<OrderOption | "">("");
  const [modalidad, setModalidad] = useState<DeliveryMode | "">("");
  const [ubicacionEntrega, setUbicacionEntrega] = useState("");
  const [detalleEntrega, setDetalleEntrega] = useState("");
  const requiereUbicacion = modalidad === "punto_de_encuentro" || modalidad === "entrega_directa";
  const [personalizacion, setPersonalizacion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const producto = useQuery({
    queryKey: ["producto", productId],
    queryFn: () => getProduct(productId!),
    enabled: productId !== undefined,
  });

  const crear = useMutation({
    mutationFn: () =>
      createOrderRequest(
        {
          productoId: productId!,
          cantidad: producto.data?.tipoUnidades === "pieza_unica" ? 1 : cantidad,
          personalizacion,
          observaciones,
          opcion: producto.data?.admitePersonalizacion ? (opcion as OrderOption) : "estandar",
          entregaPreferida: {
            modalidad: modalidad as DeliveryMode,
            ubicacion: requiereUbicacion ? ubicacionEntrega.trim() : undefined,
            detalle: detalleEntrega.trim() || undefined,
          },
        },
        usuario?.nombre ?? "Comprador",
      ),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Solicitud ${order.codigo} enviada al taller`, {
        description: "El artesano la revisará y te responderá desde el pedido.",
      });
      void navigate(`/pedidos/${order.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (productId === undefined) return <NotFound />;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = esquema.safeParse({ cantidad, personalizacion, observaciones });
    if (!r.success) {
      const map: Record<string, string> = {};
      for (const issue of r.error.issues) map[String(issue.path[0])] = issue.message;
      setErrores(map);
      return;
    }
    const p = producto.data;
    if (!p) return;
    const validation: Record<string, string> = {};
    if (cantidad > maxRequestable(p))
      validation["cantidad"] = `Puedes solicitar hasta ${maxRequestable(p)} unidades disponibles.`;
    if (p.admitePersonalizacion && !opcion)
      validation["opcion"] = "Selecciona si deseas modificaciones.";
    if (opcion === "personalizada" && personalizacion.trim().length < 10)
      validation["personalizacion"] = "Describe la personalización con al menos 10 caracteres.";
    if (!modalidad) validation["entrega"] = "Selecciona la modalidad preferida.";
    if (requiereUbicacion && !ubicacionEntrega.trim())
      validation["ubicacionEntrega"] = "Indica la ubicación donde quieres recibir el pedido.";
    if (requiereUbicacion && ubicacionEntrega.trim().length > 200)
      validation["ubicacionEntrega"] = "La ubicación admite hasta 200 caracteres.";
    if (Object.keys(validation).length) {
      setErrores(validation);
      return;
    }
    setErrores({});
    crear.mutate();
  };

  if (producto.isError) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-3xl px-4 py-16">
          <ErrorState onRetry={() => void producto.refetch()} />
        </div>
      </SiteLayout>
    );
  }

  const p = producto.data;
  const total = (p?.precio ?? 0) * cantidad;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          to={`/producto/${productId}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al producto
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold">Solicitar pedido</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta es una solicitud, no una compra. El taller la evalúa y luego coordinan pago y
          entrega.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={enviar} noValidate className="space-y-6">
            {p ? <UnitAvailability product={p} /> : null}
            {p?.tipoUnidades === "pieza_unica" ? (
              <p className="text-sm">
                Cantidad: 1 unidad. La personalización también respeta este límite.
              </p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad *</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Disminuir cantidad"
                    disabled={cantidad <= 1}
                    onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <Input
                    id="cantidad"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={p ? maxRequestable(p) : 0}
                    className="min-h-11 w-24 text-center"
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                    aria-invalid={!!errores["cantidad"]}
                    aria-describedby={errores["cantidad"] ? "error-cantidad" : undefined}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Aumentar cantidad"
                    disabled={!p || cantidad >= maxRequestable(p)}
                    onClick={() => setCantidad((c) => Math.min(p ? maxRequestable(p) : 0, c + 1))}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                {errores["cantidad"] ? (
                  <p id="error-cantidad" role="alert" className="text-sm text-destructive">
                    {errores["cantidad"]}
                  </p>
                ) : null}
              </div>
            )}

            {p?.admitePersonalizacion ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Opción de solicitud *</legend>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="opcion"
                    value="estandar"
                    checked={opcion === "estandar"}
                    onChange={() => setOpcion("estandar")}
                  />
                  Sin modificaciones
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="opcion"
                    value="personalizada"
                    checked={opcion === "personalizada"}
                    onChange={() => setOpcion("personalizada")}
                  />
                  Con personalización
                </label>
                {errores["opcion"] ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errores["opcion"]}
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            {p?.admitePersonalizacion && opcion === "personalizada" ? (
              <div className="space-y-2">
                <Label htmlFor="personalizacion">Detalles de personalización *</Label>
                <Textarea
                  id="personalizacion"
                  rows={5}
                  maxLength={500}
                  placeholder="Ej. Color café oscuro, iniciales grabadas M.J., medida 42…"
                  value={personalizacion}
                  onChange={(e) => setPersonalizacion(e.target.value)}
                  aria-invalid={!!errores["personalizacion"]}
                  aria-describedby={
                    errores["personalizacion"] ? "error-personalizacion" : "ayuda-pers"
                  }
                />
                <p id="ayuda-pers" className="text-xs text-muted-foreground">
                  {personalizacion.length}/500 caracteres. Mientras más detalle, mejor la evaluación
                  del artesano.
                </p>
                {errores["personalizacion"] ? (
                  <p id="error-personalizacion" role="alert" className="text-sm text-destructive">
                    {errores["personalizacion"]}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="preferred-delivery">Modalidad de entrega preferida *</Label>
              <select
                id="preferred-delivery"
                value={modalidad}
                className="min-h-11 w-full rounded-md border bg-background px-3"
                onChange={(e) => setModalidad(e.target.value as DeliveryMode)}
              >
                <option value="">Selecciona una modalidad</option>
                {DELIVERY_MODES.map((m) => (
                  <option key={m} value={m}>
                    {DELIVERY_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              {errores["entrega"] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errores["entrega"]}
                </p>
              ) : null}
              {requiereUbicacion ? (
                <div className="space-y-2">
                  <Label htmlFor="preferred-location">
                    {modalidad === "punto_de_encuentro"
                      ? "Ubicación del punto de encuentro *"
                      : "Dirección donde quieres recibir el pedido *"}
                  </Label>
                  <Textarea
                    id="preferred-location"
                    required
                    maxLength={200}
                    rows={3}
                    placeholder={
                      modalidad === "punto_de_encuentro"
                        ? "Ej. Entrada principal del parque central de Masaya."
                        : "Ej. Barrio, calle, número de casa y punto de referencia."
                    }
                    value={ubicacionEntrega}
                    onChange={(e) => setUbicacionEntrega(e.target.value)}
                    aria-invalid={!!errores["ubicacionEntrega"]}
                    aria-describedby={
                      errores["ubicacionEntrega"]
                        ? "error-delivery-location"
                        : "delivery-location-help"
                    }
                  />
                  <p id="delivery-location-help" className="text-xs text-muted-foreground">
                    Tú indicas el lugar. El taller verá esta ubicación para cotizar y coordinar la
                    entrega contigo.
                  </p>
                  {errores["ubicacionEntrega"] ? (
                    <p
                      id="error-delivery-location"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errores["ubicacionEntrega"]}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Label htmlFor="preferred-detail">Detalle de entrega (opcional)</Label>
              <Textarea
                id="preferred-detail"
                maxLength={200}
                value={detalleEntrega}
                onChange={(e) => setDetalleEntrega(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                El artesano cotiza el costo antes de aceptar y conserva la modalidad que elegiste.
                Recoger en el taller cuesta C$ 0.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observaciones">Observaciones para el artesano</Label>
              <Textarea
                id="observaciones"
                rows={3}
                maxLength={300}
                placeholder="Ej. Lo necesito antes del 20 de este mes."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                aria-invalid={!!errores["observaciones"]}
              />
              {errores["observaciones"] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errores["observaciones"]}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="submit"
                size="lg"
                className="touch-target"
                disabled={crear.isPending || !p || p.unidadesDisponibles < 1}
              >
                {crear.isPending ? "Enviando solicitud…" : "Enviar solicitud"}
              </Button>
              <Button asChild type="button" variant="outline" size="lg" className="touch-target">
                <Link to={`/producto/${productId}`}>Cancelar</Link>
              </Button>
            </div>
            {p && p.unidadesDisponibles < 1 ? (
              <p role="status" className="text-sm">
                Sin unidades disponibles; no se puede solicitar ni personalizar esta publicación.
              </p>
            ) : null}
          </form>

          <aside className="h-fit rounded-xl border bg-card p-5 lg:sticky lg:top-24">
            <h2 className="text-base font-semibold">Resumen</h2>
            {p ? (
              <>
                <div className="mt-3 flex gap-3">
                  <img
                    src={p.imagenes[0]}
                    alt=""
                    className="size-16 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{p.nombre}</p>
                    <p className="text-sm text-muted-foreground">{p.categoria.nombre}</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Precio unitario</dt>
                    <dd>{format(p.precio)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cantidad</dt>
                    <dd>{cantidad}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <dt>Estimado</dt>
                    <dd className="text-primary">{format(total)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  El monto final puede variar según personalización y entrega. El artesano lo
                  confirma al aceptar.
                </p>
              </>
            ) : (
              <div className="mt-3 h-32 animate-pulse rounded-lg bg-surface" />
            )}
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}
