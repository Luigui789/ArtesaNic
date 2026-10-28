import { Check } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";
import { navigationFor } from "./navigation";

/** Los mismos destinos y estados activos para sidebar y Sheet. */
export function PrivateNavigation({
  rol,
  real,
  onNavigate,
}: {
  rol: Role;
  real: boolean;
  onNavigate?: () => void;
}) {
  const items = navigationFor(rol, real);
  return (
    <nav aria-label={rol === "artesano" ? "Navegación del taller" : "Navegación de mis compras"}>
      {[false, true].map((secondary) => (
        <div key={String(secondary)} className={cn("space-y-1", secondary && "mt-4 border-t pt-4")}>
          <p className="px-3 pb-2 text-sm font-semibold text-muted-foreground">
            {secondary ? "Otras consultas" : rol === "artesano" ? "Tu taller" : "Mis compras"}
          </p>
          {items
            .filter((item) => !!item.secondary === secondary)
            .map(({ to, label, end, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end ?? false}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-12 min-w-0 items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-2 text-base hover:bg-muted focus-visible:outline-offset-2",
                    isActive && "border-primary bg-primary/10 font-semibold text-primary",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {Icon ? <Icon className="size-5 shrink-0" aria-hidden="true" /> : null}
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    {isActive ? (
                      <>
                        <Check className="size-4 shrink-0" aria-hidden="true" />
                        <span className="sr-only">Sección actual</span>
                      </>
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
  );
}
