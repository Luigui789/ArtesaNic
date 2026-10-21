import { getPersistenceStatus, resetDemo } from "@/mocks";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LogIn, Menu, RotateCcw, X } from "lucide-react";
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
import { CurrencySwitcher } from "@/components/common/currency-switcher";
import { useSession } from "@/features/auth/use-session";
import { useNotifications } from "@/features/notificaciones/use-notifications";
import { ROLE_LABELS } from "@/lib/labels";
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

const INICIO_DE_VISTA: Record<Role, string> = { comprador: "/", artesano: "/panel" };

/**
 * Exclusivo del prototipo: alterna entre las dos sesiones simuladas (D-6). En el
 * sistema real el rol lo asigna el servidor (RF-004) y este control no existe.
 * No sustituye a la pantalla de acceso, que sigue enlazada en la cabecera.
 */
function SelectorVista({
  onCambio,
  className,
  idDescripcion,
}: {
  onCambio?: () => void;
  className?: string;
  idDescripcion: string;
}) {
  const { usuario, cambiarRol } = useSession();
  const navigate = useNavigate();
  const rol = usuario?.rol ?? "comprador";

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
              cambiarRol(r);
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

/**
 * Restaura el escenario inicial. Los datos simulados viven en la memoria de la
 * página: al recargar, el mock los reconstruye desde el seed determinista. Se
 * vuelve además a la vista de comprador, que es donde empieza la demostración.
 */
function RestablecerDemo() {
  const { cambiarRol } = useSession();
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
                cambiarRol("comprador");
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
              <Link to="/catalogo" className="text-muted-foreground hover:text-foreground">
                Catálogo
              </Link>
            </li>
            <li>
              <Link to="/#como-funciona" className="text-muted-foreground hover:text-foreground">
                Cómo funciona
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
            Envías una solicitud al taller y el artesano la acepta o la rechaza. Si la acepta,
            registras el pago, el taller lo confirma y coordinan la entrega desde el pedido.
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

/**
 * Avisa cuando la demo no puede guardar sin sobrescribir datos que no logró leer.
 * Nada se borra hasta que la persona elige «Restablecer datos de demostración».
 */
function AvisoPersistencia() {
  const { data } = useQuery({
    queryKey: ["persistencia-demo"],
    queryFn: getPersistenceStatus,
    staleTime: Infinity,
  });
  if (!data || data.modo === "guardando") return null;
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
