import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-masaya.jpg";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="border-b bg-surface/40">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:py-14 lg:grid-cols-2 lg:gap-14 lg:py-16">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            De las manos de Masaya a las tuyas
          </p>
          <h1 className="mt-5 text-balance font-display text-4xl font-semibold leading-[1.12] sm:text-5xl lg:text-6xl">
            Hecho en Masaya.
            <br />
            Descúbrelo aquí.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Piezas con historia, creadas por talleres locales. Encuentra la tuya y solicita
            directamente a quien la elabora.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg" className="touch-target">
              <Link to="/catalogo">
                Explorar catálogo <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/#como-funciona"
              className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
            >
              Cómo funciona
            </Link>
          </div>
          <p className="mt-7 text-sm text-muted-foreground">
            Talleres locales · Trato directo · Piezas con identidad
          </p>
        </div>
        <figure className="min-w-0">
          <img
            src={heroImg}
            alt="Artesano tejiendo una hamaca en un taller tradicional de Masaya"
            width={1600}
            height={1080}
            fetchPriority="high"
            className="aspect-[4/3] w-full rounded-2xl object-cover lg:aspect-[5/4]"
          />
          <figcaption className="mt-3 text-sm text-muted-foreground">
            Un oficio que se comparte, una tradición que continúa.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
