import { Handshake, Layers, Sparkles, Users } from "lucide-react";
import tallerImg from "@/assets/taller.jpg";
import catHamacasImg from "@/assets/cat-hamacas.jpg";

const PILARES = [
  {
    icon: Sparkles,
    pregunta: "¿Qué es?",
    respuesta:
      "Una plataforma digital creada para acercar a compradores con los talleres artesanales del municipio de Masaya.",
  },
  {
    icon: Layers,
    pregunta: "¿Para qué sirve?",
    respuesta:
      "Para descubrir piezas tradicionales, enviar solicitudes a medida o de catálogo y organizar cada etapa del pedido.",
  },
  {
    icon: Users,
    pregunta: "¿Quién participa?",
    respuesta:
      "Personas interesadas en adquirir artesanía auténtica y talleres artesanales aprobados que elaboran cada pieza.",
  },
  {
    icon: Handshake,
    pregunta: "¿Qué puedes hacer?",
    respuesta:
      "Explorar rubros, conocer talleres, solicitar productos, registrar pagos, coordinar entregas o gestionar tu propio taller.",
  },
];

export function PlatformPurpose() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20" aria-labelledby="titulo-proposito">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
            Propósito de la plataforma
          </p>
          <h2
            id="titulo-proposito"
            className="mt-2 text-balance font-display text-3xl font-bold leading-snug sm:text-4xl"
          >
            Un espacio digital para la artesanía de Masaya
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            ArtesaNic reúne talleres, productos y compradores en un mismo espacio digital, ayudando
            a los artesanos a ampliar su visibilidad y a los compradores a descubrir y solicitar
            piezas directamente a quienes las elaboran.
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {PILARES.map((item) => (
              <div
                key={item.pregunta}
                className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <dt className="text-sm font-semibold text-foreground">{item.pregunta}</dt>
                </div>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.respuesta}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:col-span-6">
          <div className="col-span-7 overflow-hidden rounded-2xl border bg-surface">
            <img
              src={tallerImg}
              alt="Interior de un taller artesanal de Masaya con piezas en proceso de elaboración"
              loading="lazy"
              width={960}
              height={720}
              className="aspect-[4/5] h-full w-full object-cover"
            />
          </div>
          <div className="col-span-5 flex flex-col gap-4">
            <div className="overflow-hidden rounded-2xl border bg-surface">
              <img
                src={catHamacasImg}
                alt="Tejido tradicional de hamacas elaboradas en Masaya"
                loading="lazy"
                width={640}
                height={480}
                className="aspect-square h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col justify-center rounded-2xl border border-secondary/30 bg-secondary/10 p-4 sm:p-5">
              <p className="font-display text-lg font-bold text-foreground">Trato con el taller</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Cada pieza tiene detrás el nombre, el oficio y la dedicación de un taller artesanal
                de Masaya.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
