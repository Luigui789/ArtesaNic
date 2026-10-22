import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import tallerImg from "@/assets/taller.jpg";
import { Button } from "@/components/ui/button";

export function ArtisanSection() {
  return (
    <section
      id="para-artesanos"
      className="scroll-mt-24 py-14 sm:py-20"
      aria-labelledby="titulo-para-artesanos"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 md:grid-cols-2 lg:gap-16">
        <img
          src={tallerImg}
          alt="Artesano trabajando en su taller en Masaya"
          loading="lazy"
          width={960}
          height={640}
          className="aspect-[3/2] w-full rounded-2xl object-cover"
        />
        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
            Para artesanos de Masaya
          </p>
          <h2
            id="titulo-para-artesanos"
            className="mt-4 text-balance font-display text-3xl font-semibold sm:text-4xl"
          >
            Tu oficio merece llegar más lejos.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Presenta tu taller, comparte tus piezas y recibe solicitudes directamente. Tú pones el
            oficio; ArtesaNic te ayuda a mostrarlo.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Crea tu cuenta de artesano. Tu taller será revisado antes de habilitar sus funciones.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg" className="touch-target">
              <Link to="/auth?modo=registro">
                Registrar mi taller <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/ayuda#como-vender"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Conocer los requisitos
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
