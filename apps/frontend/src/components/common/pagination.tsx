import { Button } from "@/components/ui/button";
export function ListPagination({
  page,
  totalPages,
  onPage,
  busy = false,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
    >
      <Button variant="outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span aria-live="polite" className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <Button
        variant="outline"
        disabled={busy || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
