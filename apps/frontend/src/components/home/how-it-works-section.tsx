import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

const PASOS = [
  {
    titulo: "Encuentra tu pieza",
    texto: "Explora artesanías y conoce el taller que está detrás de cada una.",
  },
  {
    titulo: "Acuerda con el taller",
    texto:
      "Envía tu solicitud. El artesano revisa los detalles y te presenta una propuesta para confirmar.",
  },
  {
    titulo: "Dale forma a tu pedido",
    texto:
      "Tras confirmar, registra tu pago. El taller lo verifica antes de elaborar y coordinar la entrega.",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-24 border-y bg-surface/50 py-14 sm:py-16"
      aria-labelledby="titulo-como-funciona"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="titulo-como-funciona" className="font-display text-3xl font-semibold sm:text-4xl">
            Del taller a tus manos
          </h2>
          <Link
            to="/ayuda#como-comprar"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Guía de compra <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <ol className="mt-9 grid gap-8 md:grid-cols-3 md:gap-12">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="border-t border-border pt-5">
              <span className="text-sm font-semibold text-primary">0{i + 1}</span>
              <h3 className="mt-3 font-display text-xl font-semibold">{paso.titulo}</h3>
              <p className="mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
                {paso.texto}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-muted-foreground">
          El pago se realiza fuera de ArtesaNic, por el medio acordado con el taller.{" "}
          <Link to="/ayuda#pagos" className="font-medium text-primary underline underline-offset-4">
            Consultar pagos y entregas
          </Link>
        </p>
      </div>
    </section>
  );
}
