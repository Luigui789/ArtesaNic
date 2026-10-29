import { useForm, useController } from "react-hook-form";
import { ListPagination } from "@/components/common/pagination";
import { ConfirmAction } from "@/components/common/confirm-action";
import { PageContainer, PageHeader } from "@/components/common/page";
import { mensajeDominio } from "@/lib/errores-dominio";
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
import {
  AvisoModeracion,
  EstadoProductoPropio,
  MENSAJE_SIN_REPUBLICAR,
} from "@/features/catalogo/components/estado-producto-propio";
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

function ErrorProducto({ mensaje }: { mensaje: string | undefined }) {
  return mensaje ? (
    <p role="alert" className="text-sm text-destructive">
      {mensaje}
    </p>
  ) : null;
}

function TextoGuardarProducto({ guardando, editando }: { guardando: boolean; editando: boolean }) {
  return guardando ? "Guardando…" : editando ? "Guardar cambios" : "Registrar producto";
}

function CabeceraFormularioProducto({ editando }: { editando: boolean }) {
  return (
    <DialogHeader>
      <DialogTitle>{editando ? "Editar producto" : "Nuevo producto"}</DialogTitle>
      <DialogDescription>
        {catalogoReal
          ? "Completá los datos, elegí cómo ofrecer la pieza y agregá su fotografía. Los pedidos confirmados conservan lo acordado."
          : "Los datos son simulados y se conservan al recargar en este navegador."}
      </DialogDescription>
    </DialogHeader>
  );
}

function valoresInventarioSimulado(
  tipoUnidades: UnitType | "",
  existencias: string,
  unidades: Awaited<ReturnType<typeof getProduct>> | undefined,
): { tipoActual: UnitType | ""; existenciasActuales: string } {
  return {
    tipoActual: tipoUnidades || unidades?.tipoUnidades || "",
    existenciasActuales: existencias || (unidades ? String(unidades.existenciasFisicas) : ""),
  };
}

function InventarioSimuladoProducto({
  tipoActual,
  editando,
  existenciasActuales,
  unidades,
  motivoAjuste,
  errores,
  onTipoUnidades,
  onExistencias,
  onMotivoAjuste,
}: {
  tipoActual: UnitType | "";
  editando: boolean;
  existenciasActuales: string;
  unidades: Awaited<ReturnType<typeof getProduct>> | undefined;
  motivoAjuste: string;
  errores: Record<string, string>;
  onTipoUnidades: (tipo: UnitType) => void;
  onExistencias: (cantidad: string) => void;
  onMotivoAjuste: (motivo: string) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">Existencias (inventario simulado)</legend>
      <Label htmlFor="p-units">Tipo de unidades *</Label>
      <select
        id="p-units"
        value={tipoActual}
        className="min-h-11 w-full rounded-md border bg-background px-3"
        onChange={(e) => {
          const type = e.target.value as UnitType;
          onTipoUnidades(type);
          if (type === "pieza_unica" && !editando) onExistencias("1");
        }}
      >
        <option value="">Selecciona el tipo</option>
        {Object.entries(UNIT_TYPE_LABELS).map(([type, label]) => (
          <option key={type} value={type}>
            {label}
          </option>
        ))}
      </select>
      <ErrorProducto mensaje={errores["tipoUnidades"]} />
      <Label htmlFor="p-stock">Existencias físicas *</Label>
      <Input
        id="p-stock"
        type="number"
        min={editando ? 0 : 1}
        max={tipoActual === "pieza_unica" ? 1 : undefined}
        step={1}
        value={existenciasActuales}
        disabled={tipoActual === "pieza_unica" && !editando}
        onChange={(e) => onExistencias(e.target.value)}
      />
      {editando && unidades ? (
        <>
          <p className="text-sm">
            Reservadas: {unidades.unidadesReservadas} · Por clasificar:{" "}
            {unidades.unidadesPorClasificar}. No pueden quedar menos unidades que las comprometidas.
          </p>
          <Label htmlFor="p-stock-reason">Motivo del ajuste de unidades</Label>
          <Textarea
            id="p-stock-reason"
            maxLength={300}
            value={motivoAjuste}
            onChange={(e) => onMotivoAjuste(e.target.value)}
          />
        </>
      ) : null}
    </fieldset>
  );
}

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
  const [busqueda, setBusqueda] = useState("");
  const [estadoVisible, setEstadoVisible] = useState("todos");

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<OwnProduct | null>(null);
  const formulario = useForm({
    defaultValues: {
      nombre: "",
      precio: "",
      categoria: "",
      descripcion: "",
      modalidades: [] as Modalidad[],
    },
  });
  const { field: nombreCampo } = useController({ control: formulario.control, name: "nombre" });
  const { field: precioCampo } = useController({ control: formulario.control, name: "precio" });
  const { field: categoriaCampo } = useController({
    control: formulario.control,
    name: "categoria",
  });
  const { field: descripcionCampo } = useController({
    control: formulario.control,
    name: "descripcion",
  });
  const { field: modalidadesCampo } = useController({
    control: formulario.control,
    name: "modalidades",
  });
  const [nombre, setNombre] = [nombreCampo.value, nombreCampo.onChange] as const;
  const [precio, setPrecio] = [precioCampo.value, precioCampo.onChange] as const;
  const [categoria, setCategoria] = [categoriaCampo.value, categoriaCampo.onChange] as const;
  const [descripcion, setDescripcion] = [
    descripcionCampo.value,
    descripcionCampo.onChange,
  ] as const;
  const modalidades = modalidadesCampo.value;
  const setModalidades = modalidadesCampo.onChange;
  // Código de categoría; vacío significa "sin elegir", no un valor por defecto.
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

  const visibles = (productos.data?.items ?? []).filter(
    (p) =>
      p.nombre.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()) &&
      (estadoVisible === "todos" || (estadoVisible === "publicados" ? p.publicado : !p.publicado)),
  );
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
  const { tipoActual, existenciasActuales } = valoresInventarioSimulado(
    tipoUnidades,
    existencias,
    unidades,
  );

  const alternarModalidad = (m: Modalidad, activa: boolean) => {
    const actuales = formulario.getValues("modalidades");
    setModalidades(
      activa
        ? MODALIDADES.filter((x) => x === m || actuales.includes(x))
        : actuales.filter((x) => x !== m),
    );
  };

  const invalidar = () => void queryClient.invalidateQueries();
  const enfocarError = (campo?: string) => {
    if (!campo) return;
    const ids: Record<string, string> = {
      nombre: "p-nombre",
      precio: "p-precio",
      categoria: "p-categoria",
      descripcion: "p-descripcion",
      modalidades: "p-modalidad-stock",
      fotografia_principal: "p-fotografia",
      tipoUnidades: "p-units",
      existenciasFisicas: "p-stock",
      motivoAjuste: "p-stock-reason",
    };
    requestAnimationFrame(() => document.getElementById(ids[campo] ?? "")?.focus());
  };

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
        const campos = Object.fromEntries(
          Object.entries(e.campos).map(([campo, mensajes]) => [campo, mensajes.join(" ")]),
        );
        setErrores(campos);
        enfocarError(Object.keys(campos)[0]);
      }
      toast.error(mensajeDominio(e));
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
    onError: (e: Error) => toast.error(mensajeDominio(e)),
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
      enfocarError(Object.keys(map)[0]);
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

  let listado;
  if (productos.isError)
    listado = (
      <ErrorState
        mensaje={mensajeDominio(productos.error)}
        onRetry={() => void productos.refetch()}
      />
    );
  else if (productos.isPending)
    listado = (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    );
  else if (productos.data.items.length === 0)
    listado = (
      <EmptyState
        titulo="Aún no tienes productos registrados"
        descripcion="Registra tu primera pieza y publícala para empezar a recibir solicitudes."
        accion={
          <Button className="touch-target" onClick={() => abrir()}>
            Registrar producto
          </Button>
        }
      />
    );
  else
    listado = (
      <>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Estos filtros revisan únicamente los productos de esta página. Cambiá de página para
            consultar otros.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="productos-busqueda">Buscar en esta página</Label>
              <Input
                id="productos-busqueda"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre del producto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productos-estado">Publicación en esta página</Label>
              <select
                id="productos-estado"
                className="min-h-11 w-full rounded-md border border-input bg-background px-3"
                value={estadoVisible}
                onChange={(e) => setEstadoVisible(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="publicados">Publicados</option>
                <option value="sin-publicar">Sin publicar</option>
              </select>
            </div>
          </div>
          <p role="status" className="text-sm">
            {visibles.length} de {productos.data.items.length} productos cargados
          </p>
        </div>
        {!visibles.length ? (
          <EmptyState
            titulo="Sin coincidencias en esta página"
            descripcion="Probá otro nombre o estado. Las demás páginas no se filtraron."
            accion={
              <Button
                variant="outline"
                onClick={() => {
                  setBusqueda("");
                  setEstadoVisible("todos");
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        ) : null}
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border bg-card">
              <ProductImage src={p.imagen} alt={p.nombre} className="aspect-[4/3]" />
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{p.categoria.nombre}</p>
                  <EstadoProductoPropio producto={p} />
                </div>
                <h2 className="mt-1 line-clamp-2 break-words font-medium">{p.nombre}</h2>
                <p className="mt-1 font-semibold text-primary">{format(p.precio)}</p>
                {typeof p.disponibleStock === "number" ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Disponibles para ofrecer: {p.disponibleStock}
                  </p>
                ) : null}
                <ModalidadesTexto modalidades={p.modalidades} className="mt-1 text-xs" />
                <AvisoModeracion producto={p} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" className="touch-target" onClick={() => abrir(p)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar producto
                  </Button>
                  {!p.publicado && !p.moderacion ? (
                    <Button disabled={publicacion.isPending} onClick={() => publicacion.mutate(p)}>
                      <Eye className="size-4" aria-hidden="true" />
                      Publicar
                    </Button>
                  ) : null}
                </div>
                <details className="mt-3 border-t pt-2">
                  <summary className="list-item min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">
                    Más opciones
                  </summary>
                  <div className="space-y-3 py-2">
                    {p.publicado ? (
                      <ConfirmAction
                        trigger={
                          <Button variant="outline" disabled={publicacion.isPending}>
                            <EyeOff className="size-4" aria-hidden="true" />
                            Despublicar
                          </Button>
                        }
                        title="¿Despublicar este producto?"
                        description="Dejará de aparecer en el catálogo. Su foto y las referencias de pedidos se conservan."
                        confirm="Despublicar producto"
                        destructive
                        busy={publicacion.isPending}
                        onConfirm={async () => {
                          try {
                            await publicacion.mutateAsync(p);
                          } catch {
                            /* error informado por la mutación */
                          }
                        }}
                      />
                    ) : p.moderacion ? (
                      // Backend es la autoridad (409 producto_moderado); aquí se explica.
                      <p className="self-center text-xs text-muted-foreground">
                        {MENSAJE_SIN_REPUBLICAR}
                      </p>
                    ) : null}
                    {catalogoReal ? (
                      <Button asChild variant="ghost" className="mt-2 w-full">
                        <Link to={`/panel/inventario/${p.id}`}>Gestionar existencias</Link>
                      </Button>
                    ) : null}
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>

        <ListPagination
          page={page}
          totalPages={productos.data.totalPages}
          onPage={(next) => {
            setPage(next);
            setBusqueda("");
            setEstadoVisible("todos");
          }}
          busy={productos.isPlaceholderData}
        />
      </>
    );
  return (
    <SiteLayout>
      <PageContainer>
        <Link
          to="/panel"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <PageHeader
          title="Mis productos"
          description="Registra tus piezas, su fotografía y modalidades. Publícalas cuando estén listas."
          action={
            <Button onClick={() => abrir()}>
              <Plus className="size-4" aria-hidden="true" />
              Nuevo producto
            </Button>
          }
        />

        <div className="mt-8">{listado}</div>
      </PageContainer>

      <Dialog
        open={abierto}
        onOpenChange={(open) => {
          if (!guardar.isPending) setAbierto(open);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <CabeceraFormularioProducto editando={!!editando} />

          <form onSubmit={enviar} noValidate className="min-w-0 space-y-5">
            <fieldset className="min-w-0 space-y-5">
              <legend className="mb-3 font-semibold">Datos de la pieza</legend>
              <div className="space-y-2">
                <Label htmlFor="p-nombre">Nombre del producto *</Label>
                <Input
                  id="p-nombre"
                  ref={nombreCampo.ref}
                  onBlur={nombreCampo.onBlur}
                  className="min-h-11"
                  maxLength={LIMITES_PRODUCTO.nombre}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  aria-invalid={!!errores["nombre"]}
                />
                <ErrorProducto mensaje={errores["nombre"]} />
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-precio">Precio en córdobas *</Label>
                  <Input
                    id="p-precio"
                    ref={precioCampo.ref}
                    onBlur={precioCampo.onBlur}
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
                  <ErrorProducto mensaje={errores["precio"]} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-categoria">Rubro *</Label>
                  <Select
                    value={categoria}
                    onValueChange={setCategoria}
                    disabled={!categorias.data}
                  >
                    <SelectTrigger
                      id="p-categoria"
                      ref={categoriaCampo.ref}
                      onBlur={categoriaCampo.onBlur}
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
                  <ErrorProducto mensaje={errores["categoria"]} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="p-descripcion">Descripción *</Label>
                <Textarea
                  id="p-descripcion"
                  ref={descripcionCampo.ref}
                  onBlur={descripcionCampo.onBlur}
                  rows={5}
                  maxLength={LIMITES_PRODUCTO.descripcion}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  aria-invalid={!!errores["descripcion"]}
                />
                <ErrorProducto mensaje={errores["descripcion"]} />
              </div>
            </fieldset>
            <fieldset className="min-w-0 space-y-2" aria-describedby="p-modalidades-ayuda">
              <legend className="text-sm font-medium">Modalidades de venta *</legend>
              <p id="p-modalidades-ayuda" className="text-xs text-muted-foreground">
                Marca todas las que ofreces; puedes combinarlas.
              </p>
              {MODALIDADES.map((m) => (
                <label key={m} className="flex min-h-11 items-start gap-3 py-1 text-sm">
                  <input
                    id={`p-modalidad-${m}`}
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
              <ErrorProducto mensaje={errores["modalidades"]} />
            </fieldset>

            {pideInventario ? (
              <InventarioSimuladoProducto
                tipoActual={tipoActual}
                editando={!!editando}
                existenciasActuales={existenciasActuales}
                unidades={unidades}
                motivoAjuste={motivoAjuste}
                errores={errores}
                onTipoUnidades={setTipoUnidades}
                onExistencias={setExistencias}
                onMotivoAjuste={setMotivoAjuste}
              />
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

            <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background py-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="touch-target"
                disabled={guardar.isPending}
                onClick={() => setAbierto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="touch-target"
                disabled={guardar.isPending || imageBusy}
              >
                <TextoGuardarProducto guardando={guardar.isPending} editando={!!editando} />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
