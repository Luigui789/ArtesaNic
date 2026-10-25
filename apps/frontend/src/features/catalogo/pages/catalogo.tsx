import { ListPagination } from "@/components/common/pagination";
import { PageContainer } from "@/components/common/page";
import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Filter, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { SiteLayout } from "@/components/layout/site-layout";
import { ProductCard, ProductCardSkeleton } from "@/features/catalogo/components/product-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { listCatalog, listCategories, listTalleresCatalogo } from "@/features/catalogo/api";
import { useDocumentHead } from "@/hooks/use-document-head";
import { parseRouteId } from "@/lib/route-id";

/** Valor técnico del `<Select>` de Radix, que exige texto. No es del dominio. */
const SIN_CATEGORIA = "todas";

interface CatalogSearch {
  q?: string | undefined;
  /** Código de categoría. `undefined` significa "sin filtro". */
  categoria?: string | undefined;
  precioMin?: number | undefined;
  precioMax?: number | undefined;
  artesanoId?: number | undefined;
  orden?: "recientes" | "precio-asc" | "precio-desc" | "nombre" | undefined;
  page?: number | undefined;
}

function parseCatalogSearch(params: URLSearchParams): CatalogSearch {
  const orden = params.get("orden") ?? "recientes";
  return {
    q: params.get("q") ?? undefined,
    // No se valida contra la lista: el servicio es la autoridad sobre qué
    // categoría existe, y así el enlace profundo no depende de otra consulta.
    categoria: params.get("categoria") ?? undefined,
    precioMin: params.get("precioMin") ? Number(params.get("precioMin")) : undefined,
    precioMax: params.get("precioMax") ? Number(params.get("precioMax")) : undefined,
    // Un identificador de taller inválido no es un 404: equivale a "todos".
    artesanoId: parseRouteId(params.get("artesanoId")),
    orden: ["recientes", "precio-asc", "precio-desc", "nombre"].includes(orden)
      ? (orden as CatalogSearch["orden"])
      : "recientes",
    page: params.get("page") ? Number(params.get("page")) : 1,
  };
}

function buildSearchParams(search: CatalogSearch): URLSearchParams {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.categoria) params.set("categoria", search.categoria);
  if (search.precioMin != null) params.set("precioMin", String(search.precioMin));
  if (search.precioMax != null) params.set("precioMax", String(search.precioMax));
  if (search.artesanoId != null) params.set("artesanoId", String(search.artesanoId));
  if (search.orden && search.orden !== "recientes") params.set("orden", search.orden);
  if (search.page && search.page !== 1) params.set("page", String(search.page));
  return params;
}

export default function Catalogo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = parseCatalogSearch(searchParams);
  const [texto, setTexto] = useState(search.q ?? "");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  useEffect(() => setTexto(search.q ?? ""), [search.q]);

  useDocumentHead({
    title: "Catálogo de productos artesanales | Masaya",
    meta: [
      {
        name: "description",
        content:
          "Explora productos artesanales de Masaya por rubro, precio y taller, y solicítalos directamente al taller.",
      },
      { property: "og:title", content: "Catálogo de productos artesanales | Masaya" },
      { property: "og:description", content: "Cuero, hamacas, madera, textiles, dulces y más." },
      { property: "og:url", content: "/catalogo" },
    ],
    canonical: "/catalogo",
  });

  const categorias = useQuery({ queryKey: ["categorias"], queryFn: listCategories });
  const talleres = useQuery({ queryKey: ["talleres-catalogo"], queryFn: listTalleresCatalogo });
  const productos = useQuery({
    queryKey: ["catalogo", search],
    queryFn: () =>
      listCatalog({
        q: search.q,
        categoria: search.categoria,
        precioMin: search.precioMin,
        precioMax: search.precioMax,
        artesanoId: search.artesanoId,
        orden: search.orden,
        page: search.page ?? 1,
        pageSize: 12,
      }),
    placeholderData: keepPreviousData,
  });

  const set = (patch: Partial<CatalogSearch>) =>
    setSearchParams(buildSearchParams({ ...search, page: 1, ...patch }));

  // Vacía también el texto de búsqueda; los campos de precio se reinician por su `key`.
  const limpiar = () => {
    setTexto("");
    setSearchParams(buildSearchParams({}));
  };

  const filtros = (prefix: string) => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-filtro-categoria`}>Categoría</Label>
        <Select
          value={search.categoria ?? SIN_CATEGORIA}
          onValueChange={(v) => set({ categoria: v === SIN_CATEGORIA ? undefined : v })}
          disabled={!categorias.data}
        >
          <SelectTrigger id={`${prefix}-filtro-categoria`} className="min-h-11">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_CATEGORIA}>Todas las categorías</SelectItem>
            {categorias.data?.map((c) => (
              <SelectItem key={c.id} value={c.codigo}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Precio en córdobas</legend>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label htmlFor={`${prefix}-precio-min`} className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              key={`min-${search.precioMin ?? ""}`}
              id={`${prefix}-precio-min`}
              type="number"
              inputMode="numeric"
              min={0}
              className="min-h-11"
              defaultValue={search.precioMin ?? ""}
              onBlur={(e) =>
                set({ precioMin: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div className="flex-1">
            <Label htmlFor={`${prefix}-precio-max`} className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              key={`max-${search.precioMax ?? ""}`}
              id={`${prefix}-precio-max`}
              type="number"
              inputMode="numeric"
              min={0}
              className="min-h-11"
              defaultValue={search.precioMax ?? ""}
              onBlur={(e) =>
                set({ precioMax: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={`${prefix}-filtro-artesano`}>Taller artesanal</Label>
        {/* El control solo admite valores de texto: se convierte en la frontera. */}
        <Select
          value={search.artesanoId != null ? String(search.artesanoId) : "todos"}
          onValueChange={(v) => set({ artesanoId: v === "todos" ? undefined : parseRouteId(v) })}
        >
          <SelectTrigger id={`${prefix}-filtro-artesano`} className="min-h-11">
            <SelectValue placeholder="Todos los talleres" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="todos">Todos los talleres</SelectItem>
            {talleres.data?.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" className="w-full touch-target" onClick={limpiar}>
        Limpiar filtros
      </Button>
    </div>
  );

  return (
    <SiteLayout>
      <PageContainer>
        <PageHeader
          title="Catálogo"
          description="Encuentra tu próxima pieza. Artesanías hechas por talleres de Masaya."
        />
        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: texto.trim() || undefined });
          }}
          role="search"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Label htmlFor="buscador" className="sr-only">
              Buscar productos
            </Label>
            <Input
              id="buscador"
              className="min-h-11 pl-9"
              placeholder="Buscar productos artesanales…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <Button type="submit" className="touch-target">
            Buscar
          </Button>

          <Sheet open={filtrosAbiertos} onOpenChange={setFiltrosAbiertos}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="touch-target lg:hidden">
                <Filter className="size-4" aria-hidden="true" />
                Filtros
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
                <SheetDescription>
                  Busca por categoría, precio y taller. Los resultados se actualizan al elegir.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">{filtros("movil")}</div>
            </SheetContent>
          </Sheet>
        </form>

        <div className="mt-6 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filtros del catálogo">
            <div className="sticky top-24 rounded-xl border bg-card p-5">
              {filtros("escritorio")}
            </div>
          </aside>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" role="status">
                {productos.data ? `${productos.data.total} productos encontrados` : "Cargando…"}
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor="orden" className="text-sm">
                  Ordenar
                </Label>
                <Select
                  value={search.orden ?? "recientes"}
                  onValueChange={(v) => set({ orden: v as CatalogSearch["orden"] })}
                >
                  <SelectTrigger id="orden" className="min-h-11 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recientes">Más recientes</SelectItem>
                    <SelectItem value="precio-asc">Precio: menor a mayor</SelectItem>
                    <SelectItem value="precio-desc">Precio: mayor a menor</SelectItem>
                    <SelectItem value="nombre">Nombre (A–Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {productos.isError ? (
              <div className="mt-6">
                <ErrorState onRetry={() => void productos.refetch()} />
              </div>
            ) : productos.isPending ? (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : productos.data.items.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  titulo="No encontramos productos"
                  descripcion="Prueba con otra palabra, cambia de categoría o limpia los filtros."
                  accion={
                    <Button variant="outline" className="touch-target" onClick={limpiar}>
                      Limpiar filtros
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {productos.data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>

                <ListPagination
                  page={search.page ?? 1}
                  totalPages={productos.data.totalPages}
                  busy={productos.isPlaceholderData}
                  onPage={(page) => setSearchParams(buildSearchParams({ ...search, page }))}
                />
              </>
            )}
          </div>
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
