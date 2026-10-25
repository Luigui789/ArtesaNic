import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { mensajeSeguro } from "@/lib/errores-dominio";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function EmptyState({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold">{titulo}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{descripcion}</p>
      {accion ? <div className="mt-5">{accion}</div> : null}
    </div>
  );
}

export function ErrorState({
  mensaje = "No pudimos cargar la información.",
  onRetry,
}: {
  mensaje?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold">Ocurrió un problema</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{mensajeSeguro(mensaje)}</p>
      {onRetry ? (
        <Button onClick={onRetry} className="mt-5 touch-target" variant="outline">
          <RefreshCw className="size-4" aria-hidden="true" />
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Cargando información…" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((n) => (
        <Skeleton key={n} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
