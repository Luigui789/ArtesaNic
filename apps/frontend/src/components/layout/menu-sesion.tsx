import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { cn } from "@/lib/utils";

/** Sesión real: acceso para visitantes; nombre y cierre de sesión para cuentas. */
export function MenuSesion({ compacto = false }: { compacto?: boolean }) {
  const { modo, estado, usuario, cerrarSesion } = useSession();
  const navigate = useNavigate();
  const [cerrando, setCerrando] = useState(false);

  if (modo === "real" && estado === "autenticada" && usuario)
    return (
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden max-w-40 truncate text-sm text-muted-foreground",
            compacto ? "lg:inline" : "sm:inline",
          )}
        >
          {usuario.nombre}
        </span>
        <Button
          variant="outline"
          className="touch-target"
          aria-label="Cerrar sesión"
          disabled={cerrando}
          onClick={async () => {
            setCerrando(true);
            try {
              await cerrarSesion();
              toast.success("Sesión cerrada");
              void navigate("/", { replace: true });
            } catch {
              toast.error("No pudimos cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.");
            } finally {
              setCerrando(false);
            }
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span className={compacto ? "hidden sm:inline" : undefined}>Cerrar sesión</span>
        </Button>
      </div>
    );

  if (modo === "real" && estado === "cargando") return null;

  return (
    <NavLink
      to="/auth"
      className={({ isActive }) =>
        cn(
          "flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
          isActive && "bg-surface text-foreground",
        )
      }
    >
      <LogIn className="size-4" aria-hidden="true" />
      Acceso
    </NavLink>
  );
}
