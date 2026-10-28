import { queryOptions } from "@tanstack/react-query";
import { listPerfilesTalleres } from "./api";

/** El contrato público devuelve una colección sin paginación. */
export const talleresPublicosQuery = queryOptions({
  queryKey: ["talleres-publicos"],
  queryFn: ({ signal }) => listPerfilesTalleres(signal),
  staleTime: 60_000,
});
