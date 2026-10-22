import { Link, Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { SiteLayout } from "@/components/layout/site-layout";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { INICIO_POR_ROL } from "@/features/auth/destino";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/types";

/**
 * Guard de UX para rutas privadas en modo real. No es un control de seguridad: cada
 * endpoint vuelve a comprobar sesión, rol y taller aprobado, y la página muestra el
 * `401`/`403` que responda. En la demo no se aplica, para conservar su navegación.
 */
export function RequiereSesion({ rol, children }: { rol?: Role; children: ReactNode }) {
  const { modo, estado, usuario, error, reintentar } = useSession();
  const { pathname, search } = useLocation();
  if (modo === "mock") return children;

  if (estado === "cargando")
    return (
      <SiteLayout>
        <p role="status" className="mx-auto max-w-md px-4 py-16 text-center text-sm">
          Comprobando tu sesión…
        </p>
      </SiteLayout>
    );

  if (estado === "error")
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-12">
          <ErrorState
            mensaje={`No pudimos comprobar tu sesión. ${error ?? ""}`.trim()}
            onRetry={() => void reintentar()}
          />
        </div>
      </SiteLayout>
    );

  if (!usuario)
    return <Navigate to={`/auth?siguiente=${encodeURIComponent(pathname + search)}`} replace />;

  if (rol && usuario.rol !== rol)
    return (
      <SiteLayout>
        <div className="mx-auto max-w-xl px-4 py-12 text-center">
          <h1 className="font-display text-2xl font-bold">
            Esta sección es para cuentas de {ROLE_LABELS[rol].toLowerCase()}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta es de {ROLE_LABELS[usuario.rol].toLowerCase()}. Cada cuenta tiene un único
            rol.
          </p>
          <Button asChild className="mt-6 touch-target">
            <Link to={INICIO_POR_ROL[usuario.rol]}>Ir a mi inicio</Link>
          </Button>
        </div>
      </SiteLayout>
    );

  return children;
}

/**
 * Pantallas que siguen sobre el servidor simulado y la identidad de la demo (pedidos,
 * pagos, mensajes, panel y perfil de la demo). En modo real no se muestran: usar la
 * identidad de la demo con una cuenta real mezclaría personas y datos.
 */
export function SoloDemo({ children }: { children: ReactNode }) {
  const { modo } = useSession();
  if (modo === "mock") return children;
  return (
    <SiteLayout>
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="font-display text-2xl font-bold">Sección todavía no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta sección pertenece a la demostración y aún no está conectada con tu cuenta.
        </p>
        <Button asChild className="mt-6 touch-target">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </SiteLayout>
  );
}
