import { Link } from "react-router";
import { useSession } from "@/features/auth/use-session";
import { CurrencySwitcher } from "@/components/common/currency-switcher";
import { RestablecerDemo, SelectorVista } from "@/components/layout/demo-controls";

const GRUPOS = [
  {
    titulo: "Explorar",
    enlaces: [
      { to: "/catalogo", label: "Catálogo" },
      { to: "/descubrir", label: "Artesanías y talleres" },
      { to: "/#para-artesanos", label: "Para artesanos" },
    ],
  },
  {
    titulo: "Te acompañamos",
    enlaces: [
      { to: "/ayuda", label: "Ayuda y normas" },
      { to: "/ayuda#pagos", label: "Pagos y entregas" },
      { to: "/ayuda#privacidad", label: "Privacidad" },
    ],
  },
];

export function PublicFooter() {
  const { modo } = useSession();
  return (
    <footer className="border-t bg-surface text-surface-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-[2fr_1fr_1fr] sm:gap-12">
        <div>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-display text-xl font-semibold"
          >
            ArtesaNic
          </Link>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            El oficio de Masaya, más cerca de ti. Un espacio para descubrir y conectar con talleres
            locales.
          </p>
        </div>
        {GRUPOS.map((grupo) => (
          <nav key={grupo.titulo} aria-label={grupo.titulo}>
            <h2 className="text-sm font-semibold">{grupo.titulo}</h2>
            <ul className="mt-3 space-y-1">
              {grupo.enlaces.map((enlace) => (
                <li key={enlace.to}>
                  <Link
                    to={enlace.to}
                    className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {enlace.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            {modo === "mock"
              ? "Prototipo académico con datos simulados · Masaya, Nicaragua"
              : "Prototipo académico · Masaya, Nicaragua"}
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
