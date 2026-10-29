import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-masaya.jpg";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="border-b bg-surface/40" aria-labelledby="home-titulo">
      <div className="mx-auto grid max-w-7xl items-center gap-5 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 md:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            De las manos de Masaya a las tuyas
          </p>
          <h1
            id="home-titulo"
            className="mt-3 text-balance font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl"
          >
            Descubre artesanías hechas en Masaya.
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Piezas con historia, creadas por talleres locales. Encuentra la tuya y solicítala
            directamente a quien la elabora.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1">
            <Button asChild size="lg" className="touch-target">
              <Link to="/catalogo">
                Explorar productos <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/#talleres-home"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
            >
              Conocer talleres
            </Link>
          </div>
        </div>
        <figure className="relative min-w-0 overflow-hidden rounded-2xl bg-surface">
          <img
            src={heroImg}
            alt="Artesano tejiendo una hamaca en un taller tradicional de Masaya"
            width={1600}
            height={1080}
            fetchPriority="high"
            className="h-28 w-full object-cover object-center sm:h-56 lg:h-72"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent px-4 pb-3 pt-8 text-sm text-white">
            <span className="block font-medium">
              Talleres locales · Trato directo · Piezas con identidad
            </span>
            <span className="hidden text-white/90 lg:block">
              Un oficio que se comparte, una tradición que continúa.
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
