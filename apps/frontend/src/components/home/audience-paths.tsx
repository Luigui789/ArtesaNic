import { Link } from "react-router";
import { ArrowRight, CheckCircle2, Hammer, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AudiencePaths() {
  return (
    <section className="bg-surface/70 py-16 sm:py-20" aria-labelledby="titulo-caminos">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Dos caminos en un mismo ecosistema
          </p>
          <h2 id="titulo-caminos" className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Pensado para quien busca artesanía y para quien la crea
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Elige cómo quieres participar en ArtesaNic según tus necesidades.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* Card Comprador */}
          <article className="flex flex-col justify-between rounded-2xl border-2 border-primary/25 bg-card p-6 sm:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                <ShoppingBag className="size-3.5" aria-hidden="true" />
                Quiero comprar
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
                Descubre piezas hechas con identidad
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Explora artesanías, conoce sus talleres, realiza solicitudes y sigue tus pedidos.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-foreground/90">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>
                    Recorre piezas de cuero, hamacas, madera, textiles, dulces tradicionales y más.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>
                    Solicita productos disponibles en stock, por cantidad o con detalles de
                    personalización.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>
                    Consulta el estado de tu solicitud, registra tu pago y coordina la entrega con
                    el taller.
                  </span>
                </li>
              </ul>
            </div>
            <div className="mt-8 pt-2">
              <Button asChild size="lg" className="w-full touch-target sm:w-auto">
                <Link to="/catalogo">
                  Explorar productos
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </article>

          {/* Card Artesano */}
          <article className="flex flex-col justify-between rounded-2xl border-2 border-secondary/30 bg-card p-6 sm:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                <Hammer className="size-3.5" aria-hidden="true" />
                Soy artesano
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
                Lleva tu taller a nuevos clientes
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Publica tus productos, recibe solicitudes y organiza tus pedidos desde un mismo
                espacio.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-foreground/90">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-secondary"
                    aria-hidden="true"
                  />
                  <span>
                    Presenta el perfil público de tu taller, tu historia, ubicación y horarios de
                    atención.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-secondary"
                    aria-hidden="true"
                  />
                  <span>
                    Administra tu catálogo indicando qué piezas vendes desde stock, por producción o
                    personalizadas.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-secondary"
                    aria-hidden="true"
                  />
                  <span>
                    Evalúa cada solicitud antes de comprometer tu trabajo, verifica pagos y coordina
                    entregas.
                  </span>
                </li>
              </ul>
            </div>
            <div className="mt-8 pt-2">
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="w-full touch-target sm:w-auto"
              >
                <a href="#para-artesanos">
                  Conocer ArtesaNic para talleres
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
