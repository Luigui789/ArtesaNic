import { Link, NavLink, useLocation } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LogIn, Menu, X } from "lucide-react";
import { CurrencySwitcher } from "@/components/common/currency-switcher";
import {
  AvisoPersistencia,
  RestablecerDemo,
  SelectorVista,
} from "@/components/layout/demo-controls";
import { useSession } from "@/features/auth/use-session";
import { useNotifications } from "@/features/notificaciones/use-notifications";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

function NavBadge({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <span
      aria-label={`${cantidad} mensajes nuevos`}
      className="ml-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground"
    >
      {cantidad > 9 ? "9+" : cantidad}
    </span>
  );
}

/** Navegación de cada vista. Solo enlaza pantallas existentes. */
const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  comprador: [
    { to: "/", label: "Inicio", end: true },
    { to: "/descubrir", label: "Descubrir" },
    { to: "/catalogo", label: "Catálogo" },
    { to: "/solicitudes", label: "Solicitudes" },
    { to: "/pedidos", label: "Pedidos (demo)" },
    { to: "/mensajes", label: "Mensajes" },
  ],
  artesano: [
    { to: "/panel", label: "Panel", end: true },
    { to: "/panel/solicitudes", label: "Solicitudes" },
    { to: "/panel/pedidos", label: "Pedidos (demo)" },
    { to: "/panel/productos", label: "Mis productos" },
    { to: "/panel/perfil", label: "Perfil del taller" },
    { to: "/mensajes", label: "Mensajes" },
  ],
};

function Header() {
  const [abierto, setAbierto] = useState(false);
  const { usuario } = useSession();
  const { total } = useNotifications();
  const { pathname } = useLocation();
  const enlaces = NAV[usuario?.rol ?? "comprador"];

  // El menú móvil se cierra al navegar y con la tecla Escape.
  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [abierto]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex min-w-0 items-center">
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-lg font-semibold">ArtesaNic</span>
            <span className="block truncate text-xs text-muted-foreground">
              Artesanías de Masaya
            </span>
          </span>
        </Link>

        <nav aria-label="Principal" className="ml-auto hidden items-center gap-1 lg:flex">
          {enlaces.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end ?? false}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
                  isActive && "bg-surface text-foreground",
                )
              }
            >
              {n.label}
              {n.to === "/mensajes" ? <NavBadge cantidad={total} /> : null}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          {/* RF-004: la pantalla de acceso es siempre alcanzable desde la cabecera. */}
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
          <SelectorVista className="hidden lg:inline-flex" idDescripcion="selector-vista-desc" />
          <CurrencySwitcher className="hidden xl:inline-flex" />
          <button
            type="button"
            className="touch-target grid place-items-center rounded-lg border bg-card lg:hidden"
            aria-expanded={abierto}
            aria-controls="menu-movil"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {abierto ? (
        <div id="menu-movil" className="border-t bg-background lg:hidden">
          <nav aria-label="Principal" className="mx-auto max-w-7xl px-4 py-2">
            <ul>
              {enlaces.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end ?? false}
                    onClick={() => setAbierto(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-surface",
                        isActive && "bg-surface",
                      )
                    }
                  >
                    {n.label}
                    {n.to === "/mensajes" ? <NavBadge cantidad={total} /> : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mx-auto max-w-7xl space-y-3 border-t px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vista de demostración
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Herramienta del prototipo; no es un inicio de sesión.
              </p>
            </div>
            <SelectorVista
              onCambio={() => setAbierto(false)}
              idDescripcion="selector-vista-movil-desc"
            />
            <div>
              <CurrencySwitcher />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h2 className="font-display text-lg font-semibold">ArtesaNic</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Conecta a compradores con los talleres artesanales del municipio de Masaya, Nicaragua.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide">Navegación</h3>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                Inicio
              </Link>
            </li>
            <li>
              <Link to="/descubrir" className="text-muted-foreground hover:text-foreground">
                Descubrir
              </Link>
            </li>
            <li>
              <Link to="/catalogo" className="text-muted-foreground hover:text-foreground">
                Marketplace
              </Link>
            </li>
            <li>
              <Link to="/#como-funciona" className="text-muted-foreground hover:text-foreground">
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link to="/ayuda" className="text-muted-foreground hover:text-foreground">
                Ayuda y normas
              </Link>
            </li>
            <li>
              <Link to="/auth" className="text-muted-foreground hover:text-foreground">
                Acceso
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide">Cómo funciona</h3>
          <p className="mt-3 text-sm text-muted-foreground">
            Envías una solicitud al taller, el artesano evalúa cada renglón y emite una propuesta.
            Al confirmarla, registras el pago, el taller lo verifica y coordinan la entrega.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 border-t px-4 py-3 text-center sm:flex-row sm:justify-center sm:gap-4">
        <p className="text-xs text-muted-foreground">
          Prototipo académico con datos simulados · Masaya, Nicaragua
        </p>
        <RestablecerDemo />
      </div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const pedidosLegacy = pathname.startsWith("/pedidos") || pathname.startsWith("/panel/pedidos");
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <AvisoPersistencia />
      {pedidosLegacy ? (
        <p className="border-b px-4 py-3 text-center text-sm">
          Demo comercial anterior: sus pedidos, pagos y entregas están separados de las solicitudes
          V1.{" "}
          <Link
            className="underline"
            to={pathname.startsWith("/panel/") ? "/panel/solicitudes" : "/solicitudes"}
          >
            Ver solicitudes V1
          </Link>
        </p>
      ) : null}
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
