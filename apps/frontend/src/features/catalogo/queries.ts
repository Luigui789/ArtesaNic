import { queryOptions } from "@tanstack/react-query";
import { listCatalog, listCategories } from "./api";

/** Home y /descubrir comparten contrato, tamaño de página y caché. */
export const categoriasQuery = queryOptions({
  queryKey: ["categorias"],
  queryFn: listCategories,
  staleTime: 60_000,
});
export const productosRecientesQuery = queryOptions({
  queryKey: ["catalogo", "portada"],
  queryFn: () => listCatalog({ orden: "recientes", pageSize: 8 }),
  staleTime: 60_000,
});
