import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Compass, LogIn, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PUBLIC_NAV = [
  { to: "/", label: "Inicio", isHash: false },
  { to: "/descubrir", label: "Descubrir", isHash: false },
  { to: "/catalogo", label: "Marketplace", isHash: false },
  { to: "/#como-funciona", label: "Cómo funciona", isHash: true },
  { to: "/#para-artesanos", label: "Para artesanos", isHash: true },
  { to: "/ayuda", label: "Ayuda", isHash: false },
] as const;

export function PublicHeader() {
  const [abierto, setAbierto] = useState(false);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    setAbierto(false);
  }, [pathname, hash]);

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
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-lg font-bold text-primary">
            A
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-lg font-bold tracking-tight">ArtesaNic</span>
            <span className="block truncate text-xs text-muted-foreground">
              Artesanía de Masaya
            </span>
          </span>
        </Link>

        <nav aria-label="Navegación pública" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((item) => {
            if (item.isHash) {
              const targetHash = item.to.slice(1);
              const active = pathname === "/" && hash === targetHash;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                    active && "bg-surface text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
                    isActive && !(item.to === "/" && hash) && "bg-surface text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground sm:inline-flex"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Acceso
          </Link>
          <Button asChild className="hidden touch-target sm:inline-flex">
            <Link to="/catalogo">
              <Compass className="size-4" aria-hidden="true" />
              Explorar catálogo
            </Link>
          </Button>
          <button
            type="button"
            className="touch-target grid place-items-center rounded-lg border bg-card lg:hidden"
            aria-expanded={abierto}
            aria-controls="menu-publico-movil"
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
        <div id="menu-publico-movil" className="border-t bg-background lg:hidden">
          <nav aria-label="Navegación pública móvil" className="mx-auto max-w-7xl px-4 py-3">
            <ul className="space-y-1">
              {PUBLIC_NAV.map((item) => {
                const isCurrent = item.isHash
                  ? pathname === "/" && hash === item.to.slice(1)
                  : pathname === item.to && !(item.to === "/" && hash);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setAbierto(false)}
                      className={cn(
                        "flex min-h-12 items-center rounded-lg px-4 text-base font-medium transition-colors hover:bg-surface",
                        isCurrent ? "bg-surface text-foreground" : "text-foreground/85",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-col gap-2.5 border-t pt-4">
              <Button asChild size="lg" className="w-full touch-target text-base">
                <Link to="/catalogo" onClick={() => setAbierto(false)}>
                  <Compass className="size-4" aria-hidden="true" />
                  Explorar catálogo
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full touch-target text-base">
                <Link to="/auth" onClick={() => setAbierto(false)}>
                  <LogIn className="size-4" aria-hidden="true" />
                  Acceso
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
