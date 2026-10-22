import { BadgeCheck, Eye, FileCheck2, MessageSquare } from "lucide-react";

const PILARES_CONFIANZA = [
  {
    icon: BadgeCheck,
    titulo: "Talleres aprobados",
    texto:
      "Los talleres publicados pasan por el proceso de aprobación definido por la plataforma antes de habilitar sus funciones operativas.",
  },
  {
    icon: Eye,
    titulo: "Estados visibles",
    texto:
      "El comprador puede conocer en todo momento el avance de su solicitud, revisión, propuesta y pedido.",
  },
  {
    icon: MessageSquare,
    titulo: "Comunicación directa",
    texto:
      "Comprador y artesano pueden coordinar detalles relacionados con el pedido desde el espacio de mensajería asociado.",
  },
  {
    icon: FileCheck2,
    titulo: "Registro de pagos",
    texto:
      "La plataforma conserva el historial del pago registrado, sus comprobantes y el resultado de su revisión por el taller.",
  },
];

export function TrustSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20" aria-labelledby="titulo-confianza">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
          Confianza y transparencia
        </p>
        <h2 id="titulo-confianza" className="mt-2 font-display text-3xl font-bold sm:text-4xl">
          Un proceso más claro de principio a fin
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Cada solicitud mantiene un registro ordenado para que comprador y artesano sepan qué se
          acordó en cada etapa.
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PILARES_CONFIANZA.map((item) => (
          <article key={item.titulo} className="rounded-xl border bg-card p-6">
            <div className="grid size-10 place-items-center rounded-lg bg-secondary/15 text-secondary">
              <item.icon className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold">{item.titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.texto}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
