import { getPersistenceStatus, resetDemo } from "@/mocks";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/features/auth/use-session";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const INICIO_DE_VISTA: Record<Role, string> = { comprador: "/", artesano: "/panel" };

/**
 * Exclusivo del prototipo: alterna entre las dos sesiones simuladas (D-6). En el
 * sistema real el rol lo asigna el servidor (RF-004) y este control no existe.
 * No sustituye a la pantalla de acceso, que sigue enlazada en la cabecera.
 */
export function SelectorVista({
  onCambio,
  className,
  idDescripcion,
}: {
  onCambio?: () => void;
  className?: string;
  idDescripcion: string;
}) {
  const { usuario, cambiarVistaDemo } = useSession();
  const navigate = useNavigate();
  const rol = usuario?.rol ?? "comprador";
  if (!cambiarVistaDemo) return null;

  return (
    <div
      role="group"
      aria-label="Vista de demostración"
      aria-describedby={idDescripcion}
      title="Herramienta del prototipo: cambia la vista simulada. No es un inicio de sesión."
      className={cn("inline-flex items-center gap-1 rounded-lg border bg-card p-1", className)}
    >
      <span id={idDescripcion} className="sr-only">
        Herramienta del prototipo para alternar entre las vistas de comprador y artesano. No es un
        inicio de sesión ni verifica identidad.
      </span>
      <span
        aria-hidden="true"
        className="hidden px-2 text-xs font-medium text-muted-foreground xl:inline"
      >
        Demo
      </span>
      {(["comprador", "artesano"] as const).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={rol === r}
          onClick={() => {
            if (r !== rol) {
              cambiarVistaDemo(r);
              void navigate(INICIO_DE_VISTA[r]);
            }
            onCambio?.();
          }}
          className={cn(
            "min-h-11 rounded-md px-3 text-sm font-medium transition-colors",
            rol === r
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-surface hover:text-foreground",
          )}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * Restaura el escenario inicial. Los datos simulados viven en la memoria de la
 * página: al recargar, el mock los reconstruye desde el seed determinista. Se
 * vuelve además a la vista de comprador, que es donde empieza la demostración.
 */
export function RestablecerDemo() {
  const { cambiarVistaDemo } = useSession();
  if (!cambiarVistaDemo) return null;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="touch-target text-muted-foreground">
          <RotateCcw aria-hidden="true" />
          Restablecer datos de demostración
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Restablecer los datos de demostración?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran los productos, imágenes, pedidos, reservas, pagos y mensajes simulados
            guardados, y se vuelve al escenario inicial en la vista de comprador.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                await resetDemo();
                cambiarVistaDemo("comprador");
                window.location.assign("/");
              } catch {
                toast.error("No se pudieron borrar los datos guardados. Intenta de nuevo.");
              }
            }}
          >
            Restablecer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Avisa cuando la demo no puede guardar sin sobrescribir datos que no logró leer.
 * Nada se borra hasta que la persona elige «Restablecer datos de demostración».
 */
export function AvisoPersistencia() {
  const { modo } = useSession();
  const { data } = useQuery({
    queryKey: ["persistencia-demo"],
    queryFn: getPersistenceStatus,
    staleTime: Infinity,
    enabled: modo === "mock",
  });
  if (modo !== "mock" || !data || data.modo === "guardando") return null;
  return (
    <div role="alert" className="border-b border-destructive/30 bg-destructive/10">
      <p className="mx-auto max-w-7xl px-4 py-3 text-sm text-destructive">
        {data.motivo === "otra_version"
          ? "Los datos guardados pertenecen a una versión anterior de la demostración y no se cargaron. "
          : "No pudimos leer los datos guardados de la demostración. "}
        Se muestra el escenario inicial y los cambios de esta sesión no se guardarán, para no
        sobrescribir lo guardado. Usa «Restablecer datos de demostración», al pie de la página, para
        descartarlos y volver a guardar.
      </p>
    </div>
  );
}
