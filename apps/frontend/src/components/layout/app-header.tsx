import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { useTotalNotificaciones } from "@/features/notificaciones/use-resumen";
import { Bell, Menu, Store, ShoppingBag, UserRound } from "lucide-react";
import type { SesionUsuario } from "@/features/auth/use-session";
import { useSession } from "@/features/auth/use-session";
import { CerrarSesion, MenuSesion } from "./menu-sesion";
import { PUBLIC_NAV } from "./navigation";
import { PrivateNavigation } from "./private-navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
export function AppHeader() {
  const { usuario, modo } = useSession();
  const total = useTotalNotificaciones();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const cerrarEnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", cerrarEnDesktop);
    return () => desktop.removeEventListener("change", cerrarEnDesktop);
  }, []);
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
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex min-h-11 min-w-0 items-center gap-2.5"
          aria-label="ArtesaNic · Inicio"
        >
          <span
            aria-hidden="true"
            className="hidden size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-xl font-semibold text-primary sm:grid"
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
                  isActive && "bg-muted font-semibold text-primary underline underline-offset-4",
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
          {usuario ? (
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link to="/notificaciones" aria-label={`Notificaciones: ${total} sin leer`}>
                <Bell className="size-5" aria-hidden="true" />
                {total > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 top-0 min-w-4 rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                  >
                    {total > 9 ? "9+" : total}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : null}
          <MenuSesion compacto />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" aria-label="Abrir menú" className="min-w-11 px-2 lg:hidden">
                <Menu className="size-5" aria-hidden="true" />
                Menú
              </Button>
            </SheetTrigger>
            <MenuMovil usuario={usuario} modo={modo} onNavigate={() => setOpen(false)} />
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MenuMovil({
  usuario,
  modo,
  onNavigate,
}: {
  usuario: SesionUsuario | null;
  modo: "real" | "mock";
  onNavigate: () => void;
}) {
  return (
    <SheetContent className="w-[calc(100%-1rem)] max-w-sm overflow-y-auto p-0 sm:max-w-sm [&>button]:hidden">
      <SheetHeader className="sticky top-0 z-10 border-b bg-background p-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle>Menú</SheetTitle>
          <SheetClose asChild>
            <Button variant="outline">Cerrar</Button>
          </SheetClose>
        </div>
        <SheetDescription>Elige a dónde querés ir.</SheetDescription>
      </SheetHeader>
      <div className="mt-5 space-y-5 px-4 pb-6">
        {usuario ? (
          <PrivateNavigation
            rol={usuario.rol}
            real={modo === "real"}
            onNavigate={() => onNavigate()}
          />
        ) : null}
        <nav aria-label="Explorar ArtesaNic" className="space-y-1 border-t pt-4">
          <p className="px-3 pb-2 text-sm font-semibold text-muted-foreground">Explorar</p>
          {PUBLIC_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => onNavigate()}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-muted",
                  isActive && "bg-muted font-semibold text-primary underline underline-offset-4",
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
          {!usuario ? (
            <NavLink
              to="/auth"
              onClick={() => onNavigate()}
              className="flex min-h-12 items-center rounded-lg px-3 font-medium hover:bg-muted"
            >
              Ingresar a mi cuenta
            </NavLink>
          ) : null}
        </nav>
        {usuario ? (
          <div className="space-y-1 border-t pt-4">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mi cuenta
            </p>
            <NavLink
              to="/cuenta"
              onClick={() => onNavigate()}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-2 text-base hover:bg-muted",
                  isActive && "border-primary bg-primary/10 font-semibold text-primary",
                )
              }
            >
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">Datos personales · {usuario.nombre}</span>
            </NavLink>
            {modo === "real" ? (
              <div className="px-3 pt-3">
                <CerrarSesion />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SheetContent>
  );
}
