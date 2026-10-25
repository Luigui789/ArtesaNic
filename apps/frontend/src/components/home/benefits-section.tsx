import { Award, ClipboardCheck, Store, TrendingUp } from "lucide-react";

const BENEFICIOS = [
  {
    icon: Award,
    titulo: "Artesanía auténtica",
    texto:
      "Descubre productos elaborados por talleres artesanales de Masaya con técnicas y oficios tradicionales.",
  },
  {
    icon: Store,
    titulo: "Contacto con talleres",
    texto:
      "Conoce quién elabora cada producto, la trayectoria del taller y las modalidades en que trabaja.",
  },
  {
    icon: ClipboardCheck,
    titulo: "Pedidos organizados",
    texto:
      "La plataforma permite realizar solicitudes claras, revisar condiciones y seguir el proceso del pedido.",
  },
  {
    icon: TrendingUp,
    titulo: "Más oportunidades para artesanos",
    texto:
      "Los talleres pueden crear una presencia digital propia y ampliar su visibilidad ante nuevos compradores.",
  },
];

export function BenefitsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20" aria-labelledby="titulo-beneficios">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
          Por qué utilizar ArtesaNic
        </p>
        <h2 id="titulo-beneficios" className="mt-2 font-display text-3xl font-bold sm:text-4xl">
          Beneficios para la comunidad artesanal y los compradores
        </h2>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFICIOS.map((b) => (
          <article
            key={b.titulo}
            className="flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary/40"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <b.icon className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold">{b.titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.texto}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
