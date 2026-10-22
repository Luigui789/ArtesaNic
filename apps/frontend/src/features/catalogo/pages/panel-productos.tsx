import { UNIT_TYPE_LABELS, MODALIDAD_LABELS } from "@/lib/labels";
import { Link } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { FotografiaPrincipal } from "@/features/catalogo/components/fotografia-principal";
import { ApiError } from "@/lib/http";
import { ImageUploader } from "@/features/catalogo/components/image-uploader";
import { ModalidadesTexto, ProductImage } from "@/features/catalogo/components/product-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  catalogoReal,
  createOwnProduct,
  getProduct,
  listCategories,
  listOwnProducts,
  publishOwnProduct,
  reintentarSalvoErrorDelCliente,
  unpublishOwnProduct,
  updateOwnProduct,
} from "@/features/catalogo/api";
import type { OwnProduct, ProductInput } from "@/features/catalogo/api";
import { LIMITES_PRODUCTO, esquemaProducto } from "@/features/catalogo/validacion";
import { useCurrency } from "@/hooks/use-currency";
import { useDocumentHead } from "@/hooks/use-document-head";
import { MODALIDADES } from "@/types";
import type { Modalidad, UnitType } from "@/types";

const PAGE_SIZE = 12;

const MODALIDAD_AYUDA: Record<Modalidad, string> = {
  stock: "Vendes unidades que ya tienes hechas.",
  produccion: "Fabricas la cantidad que pide el comprador para una fecha.",
  personalizacion: "Adaptas la pieza a lo que pide el comprador, desde cero o sobre una unidad.",
};

export default function MisProductos() {
  useDocumentHead({
    title: "Mis productos | Panel del artesano",
    meta: [
      {
        name: "description",
        content:
          "Registra, edita, publica y despublica los productos de tu taller: nombre, precio, rubro, descripción y modalidades de venta.",
      },
      { property: "og:title", content: "Mis productos | Panel del artesano" },
      { property: "og:description", content: "Gestión del catálogo de tu taller artesanal." },
      { property: "og:url", content: "/panel/productos" },
      { name: "robots", content: "noindex" },
    ],
    canonical: "/panel/productos",
  });

  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<OwnProduct | null>(null);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  // Código de categoría; vacío significa "sin elegir", no un valor por defecto.
  const [categoria, setCategoria] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [modalidades, setModalidades] = useState<Modalidad[]>([]);
  // Inventario simulado: solo con el servidor simulado y si se vende desde stock.
  const [tipoUnidades, setTipoUnidades] = useState<UnitType | "">("");
  const [existencias, setExistencias] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [fotografia, setFotografia] = useState<File>();
  const [imageBusy, setImageBusy] = useState(false);
  const [imagen, setImagen] = useState<string | undefined>(undefined);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const conStock = modalidades.includes("stock");
  const pideInventario = !catalogoReal && conStock;

  const categorias = useQuery({ queryKey: ["categorias"], queryFn: listCategories });
  const productos = useQuery({
    queryKey: ["mis-productos", page],
    queryFn: () => listOwnProducts(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
    // 401/403: sin sesión real o taller no aprobado; reintentar no cambia la respuesta.
    retry: reintentarSalvoErrorDelCliente,
  });
  // Unidades del inventario simulado del producto que se edita.
  const inventario = useQuery({
    queryKey: ["producto-inventario", editando?.id],
    queryFn: () => getProduct(editando!.id),
    enabled: abierto && !catalogoReal && editando !== null,
  });

  const abrir = (p?: OwnProduct) => {
    setEditando(p ?? null);
    setNombre(p?.nombre ?? "");
    setPrecio(p ? String(p.precio) : "");
    setCategoria(p?.categoria.codigo ?? "");
    setDescripcion(p?.descripcion ?? "");
    setModalidades(p?.modalidades ?? []);
    setTipoUnidades("");
    setExistencias("");
    setMotivoAjuste("");
    setImagen(p?.imagen);
    setFotografia(undefined);
    setErrores({});
    setAbierto(true);
  };

  // Al cargar el inventario simulado del producto, se proponen sus valores actuales.
  const unidades = inventario.data;
  const tipoActual = tipoUnidades || unidades?.tipoUnidades || "";
  const existenciasActuales = existencias || (unidades ? String(unidades.existenciasFisicas) : "");

  const alternarModalidad = (m: Modalidad, activa: boolean) =>
    setModalidades((actuales) =>
      activa
        ? MODALIDADES.filter((x) => x === m || actuales.includes(x))
        : actuales.filter((x) => x !== m),
    );

  const invalidar = () => void queryClient.invalidateQueries();

  const guardar = useMutation({
    mutationFn: (input: ProductInput) =>
      editando ? updateOwnProduct(editando.id, input) : createOwnProduct(input),
    onSuccess: (producto) => {
      invalidar();
      toast.success(
        editando
          ? "Producto actualizado"
          : producto.publicado
            ? "Producto registrado"
            : "Producto registrado sin publicar. Publícalo cuando esté listo.",
      );
      setAbierto(false);
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) {
        setErrores(
          Object.fromEntries(
            Object.entries(e.campos).map(([campo, mensajes]) => [campo, mensajes.join(" ")]),
          ),
        );
      }
      toast.error(e.message);
    },
  });

  const publicacion = useMutation({
    mutationFn: (p: OwnProduct) =>
      p.publicado ? unpublishOwnProduct(p.id) : publishOwnProduct(p.id),
    onSuccess: (producto) => {
      // Actualiza la página visible sin esperar a la recarga.
      queryClient.setQueryData(
        ["mis-productos", page],
        (actual: Awaited<ReturnType<typeof listOwnProducts>> | undefined) =>
          actual && {
            ...actual,
            items: actual.items.map((x) => (x.id === producto.id ? producto : x)),
          },
      );
      invalidar();
      toast.success(producto.publicado ? "Producto publicado" : "Producto despublicado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = esquemaProducto.safeParse({
      nombre,
      precio: Number(precio),
      categoria,
      descripcion,
      modalidades,
    });
    const map: Record<string, string> = {};
    if (!r.success) {
      for (const issue of r.error.issues) map[String(issue.path[0])] ??= issue.message;
    }
    if (pideInventario && !tipoActual) map["tipoUnidades"] = "Selecciona el tipo de unidades.";
    if (Object.keys(map).length > 0 || !r.success) {
      setErrores(map);
      return;
    }
    setErrores({});
    guardar.mutate({
      ...r.data,
      imagen: catalogoReal ? undefined : imagen,
      fotografiaPrincipal: catalogoReal ? fotografia : undefined,
      inventarioDemo: pideInventario
        ? {
            tipoUnidades: tipoActual as UnitType,
            existenciasFisicas: Number(existenciasActuales),
            motivoAjuste,
          }
        : undefined,
    });
  };

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/panel"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <header className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-3xl font-bold">Mis productos</h1>
            <p className="text-sm text-muted-foreground">
              Registra cada pieza con nombre, precio, rubro, descripción y modalidades de venta, y
              publícala cuando esté lista.
            </p>
          </div>
          <Button className="touch-target shrink-0" onClick={() => abrir()}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo producto
          </Button>
        </header>

        <div className="mt-8">
          {productos.isError ? (
            <ErrorState
              mensaje={productos.error.message}
              onRetry={() => void productos.refetch()}
            />
          ) : productos.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : productos.data.items.length === 0 ? (
            <EmptyState
              titulo="Aún no tienes productos registrados"
              descripcion="Registra tu primera pieza y publícala para empezar a recibir solicitudes."
              accion={
                <Button className="touch-target" onClick={() => abrir()}>
                  Registrar producto
                </Button>
              }
            />
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {productos.data.items.map((p) => (
                  <li key={p.id} className="overflow-hidden rounded-xl border bg-card">
                    <ProductImage src={p.imagen} alt={p.nombre} className="aspect-[4/3]" />
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{p.categoria.nombre}</p>
                        <Badge variant={p.publicado ? "default" : "outline"}>
                          {p.publicado ? "Publicado" : "No publicado"}
                        </Badge>
                      </div>
                      <h2 className="mt-1 line-clamp-2 font-medium">{p.nombre}</h2>
                      <p className="mt-1 font-semibold text-primary">{format(p.precio)}</p>
                      <ModalidadesTexto modalidades={p.modalidades} className="mt-1 text-xs" />
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button variant="outline" className="touch-target" onClick={() => abrir(p)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Editar
                        </Button>
                        <Button
                          variant={p.publicado ? "outline" : "default"}
                          className="touch-target"
                          disabled={publicacion.isPending && publicacion.variables?.id === p.id}
                          onClick={() => publicacion.mutate(p)}
                        >
                          {p.publicado ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                          ) : (
                            <Eye className="size-4" aria-hidden="true" />
                          )}
                          {p.publicado ? "Despublicar" : "Publicar"}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {productos.data.totalPages > 1 ? (
                <nav
                  className="mt-8 flex items-center justify-between gap-3"
                  aria-label="Paginación de mis productos"
                >
                  <Button
                    variant="outline"
                    className="touch-target"
                    disabled={page <= 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {productos.data.page} de {productos.data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    className="touch-target"
                    disabled={page >= productos.data.totalPages}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Siguiente
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            <DialogDescription>
              {catalogoReal
                ? "Se guarda en el servidor. Los pedidos ya confirmados conservan sus propios datos."
                : "Los datos son simulados y se conservan al recargar en este navegador."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={enviar} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="p-nombre">Nombre del producto *</Label>
              <Input
                id="p-nombre"
                className="min-h-11"
                maxLength={LIMITES_PRODUCTO.nombre}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                aria-invalid={!!errores["nombre"]}
              />
              {errores["nombre"] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errores["nombre"]}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-precio">Precio en córdobas *</Label>
                <Input
                  id="p-precio"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  max={LIMITES_PRODUCTO.precioMaximo}
                  step={0.01}
                  className="min-h-11"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  aria-invalid={!!errores["precio"]}
                />
                {errores["precio"] ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errores["precio"]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-categoria">Rubro *</Label>
                <Select value={categoria} onValueChange={setCategoria} disabled={!categorias.data}>
                  <SelectTrigger
                    id="p-categoria"
                    className="min-h-11"
                    aria-invalid={!!errores["categoria"]}
                  >
                    <SelectValue placeholder="Seleccione una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.data?.map((c) => (
                      <SelectItem key={c.id} value={c.codigo}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errores["categoria"] ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errores["categoria"]}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-descripcion">Descripción *</Label>
              <Textarea
                id="p-descripcion"
                rows={5}
                maxLength={LIMITES_PRODUCTO.descripcion}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                aria-invalid={!!errores["descripcion"]}
              />
              {errores["descripcion"] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errores["descripcion"]}
                </p>
              ) : null}
            </div>

            <fieldset className="space-y-2" aria-describedby="p-modalidades-ayuda">
              <legend className="text-sm font-medium">Modalidades de venta *</legend>
              <p id="p-modalidades-ayuda" className="text-xs text-muted-foreground">
                Marca todas las que ofreces; puedes combinarlas.
              </p>
              {MODALIDADES.map((m) => (
                <label key={m} className="flex min-h-11 items-start gap-3 py-1 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={modalidades.includes(m)}
                    onChange={(e) => alternarModalidad(m, e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">{MODALIDAD_LABELS[m]}</span>
                    <span className="block text-muted-foreground">{MODALIDAD_AYUDA[m]}</span>
                  </span>
                </label>
              ))}
              {errores["modalidades"] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errores["modalidades"]}
                </p>
              ) : null}
            </fieldset>

            {pideInventario ? (
              <fieldset className="space-y-3 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">
                  Existencias (inventario simulado)
                </legend>
                <Label htmlFor="p-units">Tipo de unidades *</Label>
                <select
                  id="p-units"
                  value={tipoActual}
                  className="min-h-11 w-full rounded-md border bg-background px-3"
                  onChange={(e) => {
                    const type = e.target.value as UnitType;
                    setTipoUnidades(type);
                    if (type === "pieza_unica" && !editando) setExistencias("1");
                  }}
                >
                  <option value="">Selecciona el tipo</option>
                  {Object.entries(UNIT_TYPE_LABELS).map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
                {errores["tipoUnidades"] ? (
                  <p role="alert" className="text-sm text-destructive">
                    {errores["tipoUnidades"]}
                  </p>
                ) : null}
                <Label htmlFor="p-stock">Existencias físicas *</Label>
                <Input
                  id="p-stock"
                  type="number"
                  min={editando ? 0 : 1}
                  max={tipoActual === "pieza_unica" ? 1 : undefined}
                  step={1}
                  value={existenciasActuales}
                  disabled={tipoActual === "pieza_unica" && !editando}
                  onChange={(e) => setExistencias(e.target.value)}
                />
                {editando && unidades ? (
                  <>
                    <p className="text-sm">
                      Reservadas: {unidades.unidadesReservadas} · Por clasificar:{" "}
                      {unidades.unidadesPorClasificar}. No pueden quedar menos unidades que las
                      comprometidas.
                    </p>
                    <Label htmlFor="p-stock-reason">Motivo del ajuste de unidades</Label>
                    <Textarea
                      id="p-stock-reason"
                      maxLength={300}
                      value={motivoAjuste}
                      onChange={(e) => setMotivoAjuste(e.target.value)}
                    />
                  </>
                ) : null}
              </fieldset>
            ) : null}

            {catalogoReal ? (
              <FotografiaPrincipal
                key={`${editando?.id ?? "nuevo"}-${abierto}`}
                actual={imagen}
                archivo={fotografia}
                onChange={(file) => {
                  setFotografia(file);
                  setErrores((prev) => ({ ...prev, fotografia_principal: "" }));
                }}
                error={errores["fotografia_principal"]}
              />
            ) : (
              <ImageUploader
                key={editando?.id ?? "nuevo"}
                value={imagen}
                onChange={setImagen}
                onBusyChange={setImageBusy}
              />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="touch-target"
                onClick={() => setAbierto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="touch-target"
                disabled={guardar.isPending || imageBusy}
              >
                {guardar.isPending
                  ? "Guardando…"
                  : editando
                    ? "Guardar cambios"
                    : "Registrar producto"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
