import type { Paginated } from "@/features/catalogo/types";
export interface PaginaDTO<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export function paginaDe<D, T>(
  dto: PaginaDTO<D>,
  page: number,
  map: (value: D) => T,
): Paginated<T> {
  return {
    items: dto.results.map(map),
    total: dto.count,
    page,
    pageSize: 12,
    totalPages: Math.max(1, Math.ceil(dto.count / 12)),
  };
}
