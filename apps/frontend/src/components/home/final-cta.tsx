import { Link } from "react-router";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:pt-20" aria-labelledby="titulo-cta-final">
      <div className="rounded-3xl border border-primary/25 bg-linear-to-br from-primary/12 via-surface to-secondary/12 px-6 py-12 text-center sm:px-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Masaya · Cuna del folklore y la artesanía
        </p>
        <h2
          id="titulo-cta-final"
          className="mx-auto mt-3 max-w-2xl text-balance font-display text-3xl font-bold sm:text-4xl"
        >
          Descubre el talento artesanal de Masaya
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
          Explora piezas únicas y conoce los talleres que mantienen viva nuestra tradición.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full touch-target text-base sm:w-auto">
            <Link to="/catalogo">
              Explorar marketplace
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full touch-target bg-card text-base sm:w-auto"
          >
            <Link to="/descubrir">
              <Compass className="size-5" aria-hidden="true" />
              Ver novedades
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
