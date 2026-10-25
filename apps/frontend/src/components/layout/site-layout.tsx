import type { ReactNode } from "react";
import { NavLink, useLocation, Link } from "react-router";
import { AppHeader } from "./app-header";
import { PublicFooter } from "./public-footer";
import { AvisoPersistencia } from "./demo-controls";
import { navigationFor } from "./navigation";
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
          <aside className="min-w-0 border-b bg-card/50 lg:border-b-0 lg:border-r">
            <nav
              aria-label={
                usuario.rol === "artesano" ? "Navegación del taller" : "Navegación de mis compras"
              }
              className="flex gap-1 overflow-x-auto p-3 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible"
            >
              <p className="hidden px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">
                {usuario.rol === "artesano" ? "Mi taller" : "Mis compras"}
              </p>
              {enlaces.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end ?? false}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                      isActive && "bg-primary/10 font-semibold text-primary",
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        ) : null}
        <main id="contenido" tabIndex={-1} className="min-w-0 focus:outline-none">
          {legacy ? (
            <p className="border-b bg-muted px-4 py-3 text-sm">
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
