import { Link } from "react-router";
import { ArrowRight, Compass, Store } from "lucide-react";
import heroImg from "@/assets/hero-masaya.jpg";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden border-b bg-surface">
      <img
        src={heroImg}
        alt="Artesano tejiendo una hamaca en un taller tradicional de Masaya"
        width={1600}
        height={1080}
        className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-background/90 md:bg-transparent md:bg-linear-to-r md:from-background md:via-background/92 md:to-background/25"
      />
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24 lg:py-28">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card/85 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary backdrop-blur-xs">
            Artesanía de Masaya · Nicaragua
          </p>
          <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            La tradición de Masaya, conectada con nuevas oportunidades
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground/85 sm:text-lg">
            ArtesaNic conecta a compradores con talleres artesanales de Masaya para descubrir
            productos, solicitar piezas y organizar pedidos directamente con quienes los elaboran.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="touch-target text-base">
              <Link to="/catalogo">
                Explorar marketplace
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="touch-target bg-card/85 text-base backdrop-blur-xs"
            >
              <Link to="/descubrir">
                <Compass className="size-5" aria-hidden="true" />
                Descubrir ArtesaNic
              </Link>
            </Button>
          </div>
          <div className="mt-6">
            <a
              href="#para-artesanos"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-secondary underline-offset-4 hover:underline"
            >
              <Store className="size-4" aria-hidden="true" />
              Soy artesano · Conocer cómo participar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
