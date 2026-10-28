import type { ReactNode } from "react";
import { matchPath, useLocation, Link } from "react-router";
import { AppHeader } from "./app-header";
import { PublicFooter } from "./public-footer";
import { AvisoPersistencia } from "./demo-controls";
import { navigationFor } from "./navigation";
import { PrivateNavigation } from "./private-navigation";
import { useSession } from "@/features/auth/use-session";
import { cn } from "@/lib/utils";

export function SiteLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { modo, usuario } = useSession();
  const privado =
    usuario &&
    ((usuario.rol === "artesano" && pathname.startsWith("/panel")) ||
      (usuario.rol === "comprador" && /^\/(solicitudes|solicitar|pedidos)(\/|$)/.test(pathname)) ||
      pathname === "/mensajes" ||
      pathname === "/notificaciones");
  const enlaces = usuario ? navigationFor(usuario.rol, modo === "real") : [];
  const seccion = enlaces.find((n) => matchPath({ path: n.to, end: n.end ?? false }, pathname));
  const legacy = modo === "mock" && /^\/(panel\/)?pedidos/.test(pathname);
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <AvisoPersistencia />
      <div
        className={cn(
          "w-full flex-1",
          privado && "mx-auto grid max-w-7xl lg:grid-cols-[13rem_minmax(0,1fr)]",
        )}
      >
        {privado ? (
          <aside className="hidden min-w-0 border-r bg-card/50 lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-5rem)] overflow-y-auto p-3">
              <PrivateNavigation rol={usuario.rol} real={modo === "real"} />
            </div>
          </aside>
        ) : null}
        <main id="contenido" tabIndex={-1} className="min-w-0 focus:outline-none">
          {privado && seccion ? (
            <p className="border-b bg-card/50 px-4 py-3 text-sm sm:px-6 lg:hidden">
              <span className="text-muted-foreground">
                {usuario.rol === "artesano" ? "Tu taller" : "Mis compras"} ·{" "}
              </span>
              <span className="font-semibold">{seccion.label}</span>
            </p>
          ) : null}
          {legacy ? (
            <p className="border-b bg-muted px-4 py-3 text-sm sm:px-6">
              Pedidos de la demostración, separados de tus solicitudes actuales.{" "}
              <Link
                className="underline"
                to={pathname.startsWith("/panel") ? "/panel/solicitudes" : "/solicitudes"}
              >
                Ver solicitudes
              </Link>
            </p>
          ) : null}
          {children}
        </main>
      </div>
      <PublicFooter />
    </div>
  );
}
