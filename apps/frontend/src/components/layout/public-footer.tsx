import { Link } from "react-router";
import { CurrencySwitcher } from "@/components/common/currency-switcher";
import { RestablecerDemo, SelectorVista } from "@/components/layout/demo-controls";

export function PublicFooter() {
  return (
    <footer className="mt-16 border-t bg-surface text-surface-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link to="/" className="inline-block font-display text-xl font-bold">
            ArtesaNic
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Plataforma digital que conecta a compradores con talleres artesanales del municipio de
            Masaya, Nicaragua, para descubrir piezas con identidad y organizar solicitudes y pedidos
            directamente con quienes las elaboran.
          </p>
        </div>

        <div>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-foreground">
            Explorar
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link
                to="/descubrir"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Descubrir
              </Link>
            </li>
            <li>
              <Link
                to="/catalogo"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Marketplace
              </Link>
            </li>
            <li>
              <Link
                to="/descubrir#talleres"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Talleres
              </Link>
            </li>
            <li>
              <Link
                to="/#como-funciona"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Cómo funciona
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-foreground">
            Para artesanos
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link
                to="/#para-artesanos"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link
                to="/auth"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Acceso
              </Link>
            </li>
            <li>
              <Link
                to="/ayuda#como-vender"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Ayuda
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-foreground">
            Información
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-1">
            <li>
              <Link
                to="/ayuda#pagos"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Pagos
              </Link>
            </li>
            <li>
              <Link
                to="/ayuda#entregas"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Entregas
              </Link>
            </li>
            <li>
              <Link
                to="/ayuda#cancelaciones"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelaciones
              </Link>
            </li>
            <li>
              <Link
                to="/ayuda#reembolsos"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Reembolsos
              </Link>
            </li>
            <li>
              <Link
                to="/ayuda#normas"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Normas
              </Link>
            </li>
            <li>
              <Link
                to="/ayuda#privacidad"
                className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacidad
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t bg-background/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-center lg:flex-row lg:text-left">
          <p className="text-xs text-muted-foreground">
            Prototipo académico con datos simulados · Masaya, Nicaragua
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <SelectorVista idDescripcion="selector-vista-public-footer" />
            <CurrencySwitcher />
            <RestablecerDemo />
          </div>
        </div>
      </div>
    </footer>
  );
}
