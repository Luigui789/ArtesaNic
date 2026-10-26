import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useNotifications } from "@/features/notificaciones/use-notifications";
import { Bell, Menu, Store, ShoppingBag, UserRound } from "lucide-react";
import { useSession } from "@/features/auth/use-session";
import { MenuSesion } from "./menu-sesion";
import { PUBLIC_NAV, navigationFor } from "./navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
export function AppHeader() {
  const { usuario, modo } = useSession();
  const { total } = useNotifications();
  const [open, setOpen] = useState(false);
  const destino = usuario?.rol === "artesano" ? "/panel" : "/solicitudes";
  const cuenta = usuario?.rol === "artesano" ? "Mi taller" : "Mis solicitudes";
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <a
        href="#contenido"
        className="sr-only rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Saltar al contenido
      </a>
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex min-h-11 min-w-0 items-center gap-2.5"
          aria-label="ArtesaNic · Inicio"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-xl font-semibold text-primary"
          >
            A
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl font-semibold">ArtesaNic</span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Artesanía de Masaya
            </span>
          </span>
        </Link>
        <nav aria-label="Navegación pública" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
                  isActive && "bg-muted text-primary",
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {usuario ? (
            <Button asChild variant="ghost" className="hidden lg:inline-flex">
              <Link to={destino}>
                {usuario.rol === "artesano" ? (
                  <Store className="size-4" aria-hidden="true" />
                ) : (
                  <ShoppingBag className="size-4" aria-hidden="true" />
                )}
                {cuenta}
              </Link>
            </Button>
          ) : null}
          {modo === "mock" ? (
            <Button asChild variant="ghost" size="icon">
              <Link to="/notificaciones" aria-label={`Notificaciones: ${total} sin leer`}>
                <Bell className="size-5" aria-hidden="true" />
                {total > 0 ? (
                  <span className="text-xs font-semibold">{total > 9 ? "9+" : total}</span>
                ) : null}
              </Link>
            </Button>
          ) : null}
          <MenuSesion compacto />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Abrir menú" className="lg:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>ArtesaNic</SheetTitle>
                <SheetDescription>Explora artesanías y gestiona tu cuenta.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Menú principal" className="space-y-5 px-4 pb-6">
                <div className="space-y-1">
                  {PUBLIC_NAV.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-muted",
                          isActive && "bg-muted text-primary",
                        )
                      }
                    >
                      {n.label}
                    </NavLink>
                  ))}
                </div>
                {usuario ? (
                  <div className="space-y-1 border-t pt-4">
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Mi cuenta
                    </p>
                    <NavLink
                      to="/cuenta"
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex min-h-12 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted",
                          isActive && "bg-muted font-semibold text-primary",
                        )
                      }
                    >
                      <UserRound className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">Datos personales · {usuario.nombre}</span>
                    </NavLink>
                  </div>
                ) : null}
                {usuario ? (
                  <div className="space-y-1 border-t pt-4">
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {usuario.rol === "artesano" ? "Mi taller" : "Mis compras"}
                    </p>
                    {navigationFor(usuario.rol, modo === "real").map((n) => (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        end={n.end ?? false}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-12 items-center rounded-lg px-3 text-sm hover:bg-muted",
                            isActive && "bg-muted font-semibold text-primary",
                          )
                        }
                      >
                        {n.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
