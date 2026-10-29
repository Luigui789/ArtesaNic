import { queryOptions } from "@tanstack/react-query";
import { getPerfilTaller, listPerfilesTalleres } from "./api";
import { reintentarSalvoErrorDelCliente } from "@/features/catalogo/api";

/** El contrato público devuelve una colección sin paginación. */
export const talleresPublicosQuery = queryOptions({
  queryKey: ["talleres-publicos"],
  queryFn: ({ signal }) => listPerfilesTalleres(signal),
  staleTime: 60_000,
});

/** Producto y taller comparten el perfil público y su caché. */
export const perfilTallerQuery = (id: number | undefined) =>
  queryOptions({
    queryKey: ["perfil-taller", id],
    queryFn: () => getPerfilTaller(id!),
    enabled: id !== undefined,
    retry: reintentarSalvoErrorDelCliente,
    staleTime: 60_000,
  });
