import { Link } from "react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import catCuero from "@/assets/cat-cuero.jpg";
import catMadera from "@/assets/cat-madera.jpg";
import catTextiles from "@/assets/cat-textiles.jpg";
import { Button } from "@/components/ui/button";

const VISTAZO_RUBROS = [
  {
    imagen: catCuero,
    titulo: "Cuero y calzado",
    subtitulo: "Talabartería, bolsos y calzado artesanal",
  },
  {
    imagen: catTextiles,
    titulo: "Textiles y bordados",
    subtitulo: "Prendas tradicionales y tejido fino",
  },
  {
    imagen: catMadera,
    titulo: "Madera y talla",
    subtitulo: "Piezas utilitarias y decorativas talladas a mano",
  },
];

export function DiscoverPreview() {
  return (
    <section
      className="border-t bg-surface/60 py-16 sm:py-20"
      aria-labelledby="titulo-puente-descubrir"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-secondary">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Explora la plataforma
            </p>
            <h2
              id="titulo-puente-descubrir"
              className="mt-2 font-display text-3xl font-bold sm:text-4xl"
            >
              Siempre hay algo nuevo por descubrir
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Conoce nuevas piezas, explora diferentes oficios y descubre los talleres que forman
              parte de ArtesaNic en nuestra sección de novedades y exploración.
            </p>
            <div className="mt-7">
              <Button asChild size="lg" className="touch-target">
                <Link to="/descubrir">
                  Ver novedades
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-7">
            {VISTAZO_RUBROS.map((item) => (
              <div
                key={item.titulo}
                className="overflow-hidden rounded-xl border bg-card shadow-2xs"
              >
                <div className="aspect-[4/3] overflow-hidden bg-surface">
                  <img
                    src={item.imagen}
                    alt={item.titulo}
                    loading="lazy"
                    width={640}
                    height={480}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3.5">
                  <p className="font-display text-sm font-bold">{item.titulo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.subtitulo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
