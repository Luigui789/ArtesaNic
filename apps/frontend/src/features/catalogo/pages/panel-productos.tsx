import { UnitAvailability } from "@/features/catalogo/components/unit-availability";
import { UNIT_TYPE_LABELS } from "@/lib/labels";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { z } from "zod";
import { SiteLayout } from "@/components/layout/site-layout";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ImageUploader } from "@/features/catalogo/components/image-uploader";
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
  createProduct,
  listCategories,
  listMyProducts,
  updateProduct,
} from "@/features/catalogo/api";
import { DEMO_ARTISAN_ID } from "@/features/auth/api";
import { useCurrency } from "@/hooks/use-currency";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";
import type { Product, UnitType } from "@/types";

const esquema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(80, "Máximo 80 caracteres."),
  precio: z
    .number({ message: "Ingresa un precio válido." })
    .positive("El precio debe ser mayor que cero.")
    .max(500000, "Precio demasiado alto."),
  // El rubro deja de tener valor por defecto, así que pasa a validarse.
  categoria: z.string().min(1, "Selecciona un rubro."),
  descripcion: z
    .string()
    .trim()
    .min(20, "Describe el producto con al menos 20 caracteres.")
    .max(600, "Máximo 600 caracteres."),
});

export default function MisProductos() {
  useDocumentHead({
    title: "Mis productos | Panel del artesano",
    meta: [
      {
        name: "description",
        content:
          "Publica y edita los productos artesanales de tu taller: nombre, precio, rubro, descripción y fotografía.",
      },
      { property: "og:title", content: "Mis productos | Panel del artesano" },
      { property: "og:description", content: "Gestión del catálogo de tu taller artesanal." },
      { property: "og:url", content: "/panel/productos" },
      { name: "robots", content: "noindex" },
    ],
    canonical: "/panel/productos",
  });

  const { usuario } = useSession();
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const artesanoId = usuario?.artesanoId ?? DEMO_ARTISAN_ID;

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<Product | null>(null);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  // Código de categoría; vacío significa "sin elegir", no un valor por defecto.
  const [categoria, setCategoria] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoUnidades, setTipoUnidades] = useState<UnitType | "">("");
  const [existencias, setExistencias] = useState("");
  const [personalizable, setPersonalizable] = useState(false);
  const [motivoAjuste, setMotivoAjuste] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imagen, setImagen] = useState<string | undefined>(undefined);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const categorias = useQuery({ queryKey: ["categorias"], queryFn: listCategories });
  const productos = useQuery({
    queryKey: ["mis-productos", artesanoId],
    queryFn: () => listMyProducts(artesanoId),
  });

  const abrir = (p?: Product) => {
    setEditando(p ?? null);
    setTipoUnidades(p?.tipoUnidades ?? "");
    setExistencias(p ? String(p.existenciasFisicas) : "");
    setPersonalizable(p?.admitePersonalizacion ?? false);
    setMotivoAjuste("");
    setNombre(p?.nombre ?? "");
    setPrecio(p ? String(p.precio) : "");
    setCategoria(p?.categoria.codigo ?? "");
    setDescripcion(p?.descripcion ?? "");
    setImagen(p?.imagenes[0]);
    setErrores({});
    setAbierto(true);
  };

  const guardar = useMutation({
    mutationFn: (input: {
      nombre: string;
      precio: number;
      categoria: string;
      descripcion: string;
    }) => {
      const payload = {
        ...input,
        imagen,
        tipoUnidades: tipoUnidades as UnitType,
        existenciasFisicas: Number(existencias),
        admitePersonalizacion: personalizable,
        motivoAjuste,
      };
      return editando ? updateProduct(editando.id, payload) : createProduct(artesanoId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast.success(editando ? "Producto actualizado" : "Producto publicado");
      setAbierto(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = esquema.safeParse({ nombre, precio: Number(precio), categoria, descripcion });
    if (!r.success) {
      const map: Record<string, string> = {};
      for (const issue of r.error.issues) map[String(issue.path[0])] = issue.message;
      setErrores(map);
      return;
    }
    if (!tipoUnidades) {
      setErrores({ tipoUnidades: "Selecciona el tipo de unidades." });
      return;
    }
    setErrores({});
    guardar.mutate(r.data);
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
              Publica cada pieza con fotografía, nombre, precio, rubro y una descripción clara.
            </p>
          </div>
          <Button className="touch-target shrink-0" onClick={() => abrir()}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo producto
          </Button>
        </header>

        <div className="mt-8">
          {productos.isError ? (
            <ErrorState onRetry={() => void productos.refetch()} />
          ) : productos.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : productos.data.length === 0 ? (
            <EmptyState
              titulo="Aún no tienes productos publicados"
              descripcion="Publica tu primera pieza para empezar a recibir solicitudes."
              accion={
                <Button className="touch-target" onClick={() => abrir()}>
                  Publicar producto
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {productos.data.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-xl border bg-card">
                  <img
                    src={p.imagenes[0]}
                    alt={p.nombre}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="p-4">
                    <p className="text-xs text-muted-foreground">{p.categoria.nombre}</p>
                    <h2 className="mt-1 line-clamp-2 font-medium">{p.nombre}</h2>
                    <p className="mt-1 font-semibold text-primary">{format(p.precio)}</p>
                    <UnitAvailability product={p} />
                    <p className="text-xs text-muted-foreground">
                      Físicas: {p.existenciasFisicas} · Reservadas: {p.unidadesReservadas} · Por
                      clasificar: {p.unidadesPorClasificar}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3 w-full touch-target"
                      onClick={() => abrir(p)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Editar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            <DialogDescription>
              Los datos son simulados y se conservan al recargar en este navegador.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={enviar} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="p-nombre">Nombre del producto *</Label>
              <Input
                id="p-nombre"
                className="min-h-11"
                maxLength={80}
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
                <Label htmlFor="p-precio">Precio base en córdobas *</Label>
                <Input
                  id="p-precio"
                  type="number"
                  inputMode="numeric"
                  min={1}
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
                maxLength={600}
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

            <div className="space-y-3">
              <Label htmlFor="p-units">Tipo de unidades *</Label>
              <select
                id="p-units"
                value={tipoUnidades}
                className="min-h-11 w-full rounded-md border bg-background px-3"
                onChange={(e) => {
                  const type = e.target.value as UnitType;
                  setTipoUnidades(type);
                  if (type === "pieza_unica")
                    setExistencias(
                      editando?.tipoUnidades === "pieza_unica"
                        ? String(editando.existenciasFisicas)
                        : "1",
                    );
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
                max={tipoUnidades === "pieza_unica" ? 1 : undefined}
                step={1}
                value={existencias}
                disabled={tipoUnidades === "pieza_unica" && !editando}
                onChange={(e) => setExistencias(e.target.value)}
              />
              {editando ? (
                <>
                  <p className="text-sm">
                    Reservadas: {editando.unidadesReservadas} · Por clasificar:{" "}
                    {editando.unidadesPorClasificar}. No pueden quedar menos unidades que las
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
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={personalizable}
                  onChange={(e) => setPersonalizable(e.target.checked)}
                />
                Admite personalización de las unidades disponibles
              </label>
            </div>
            <ImageUploader
              key={editando?.id ?? "nuevo"}
              value={imagen}
              onChange={setImagen}
              onBusyChange={setImageBusy}
            />

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
                    : "Publicar producto"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
