import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import catCuero from "@/assets/cat-cuero.jpg";
import catMadera from "@/assets/cat-madera.jpg";
import catTextiles from "@/assets/cat-textiles.jpg";

const RUBROS = [
  { imagen: catCuero, titulo: "Cuero y calzado", codigo: "cuero_y_calzado" },
  { imagen: catTextiles, titulo: "Textiles y bordados", codigo: "textiles" },
  { imagen: catMadera, titulo: "Madera y talla", codigo: "madera" },
];

export function DiscoverPreview() {
  return (
    <section className="py-14 sm:py-20" aria-labelledby="titulo-puente-descubrir">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Encuentra algo tuyo
            </p>
            <h2
              id="titulo-puente-descubrir"
              className="mt-3 font-display text-3xl font-semibold sm:text-4xl"
            >
              Oficios que dan forma a Masaya
            </h2>
          </div>
          <Link
            to="/descubrir"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Ver más artesanías <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {RUBROS.map((rubro) => (
            <Link
              key={rubro.codigo}
              to={`/catalogo?categoria=${rubro.codigo}`}
              className="group min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
            >
              <div className="overflow-hidden rounded-xl bg-surface">
                <img
                  src={rubro.imagen}
                  alt=""
                  loading="lazy"
                  width={640}
                  height={480}
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105 motion-reduce:transition-none"
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">{rubro.titulo}</h3>
                <ArrowUpRight className="size-5 text-primary" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
