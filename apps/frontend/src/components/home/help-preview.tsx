import { Link } from "react-router";
import { ArrowRight, BookOpenCheck, HelpCircle, Scale, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

const TEMAS_AYUDA = [
  {
    icon: BookOpenCheck,
    titulo: "Cómo comprar y cómo vender",
    texto: "Pasos detallados para enviar solicitudes, revisar renglones y gestionar propuestas.",
    to: "/ayuda#como-comprar",
  },
  {
    icon: Scale,
    titulo: "Pagos, cancelaciones y reembolsos",
    texto: "Registro de comprobantes, plazos de subsanación y condiciones para cancelar.",
    to: "/ayuda#pagos",
  },
  {
    icon: Truck,
    titulo: "Entregas y coordinación",
    texto: "Retiro en taller, puntos de encuentro y entregas coordinadas directamente.",
    to: "/ayuda#entregas",
  },
  {
    icon: ShieldCheck,
    titulo: "Normas y privacidad",
    texto: "Reglas de publicación de productos, aprobación de talleres y resguardo de datos.",
    to: "/ayuda#normas",
  },
];

export function HelpPreview() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20" aria-labelledby="titulo-ayuda-home">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Información operativa
          </p>
          <h2 id="titulo-ayuda-home" className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Normas claras y centro de ayuda
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Consulta las reglas operativas de ArtesaNic sobre solicitudes, pagos, entregas,
            cancelaciones y publicación de productos.
          </p>
        </div>
        <Button asChild variant="outline" className="touch-target shrink-0">
          <Link to="/ayuda">
            <HelpCircle className="size-4" aria-hidden="true" />
            Ir al centro de ayuda
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TEMAS_AYUDA.map((tema) => (
          <Link
            key={tema.titulo}
            to={tema.to}
            className="group flex flex-col justify-between rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div>
              <tema.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 font-display text-base font-bold group-hover:text-primary">
                {tema.titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tema.texto}</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              Leer más
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
