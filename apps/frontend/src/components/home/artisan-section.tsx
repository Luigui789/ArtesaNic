import { Link } from "react-router";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Boxes,
  ClipboardSignature,
  MessageSquare,
  Receipt,
  Sparkles,
  Store,
} from "lucide-react";
import tallerImg from "@/assets/taller.jpg";
import { Button } from "@/components/ui/button";

const HERRAMIENTAS_TALLER = [
  { icon: Store, label: "Perfil público del taller" },
  { icon: BookOpen, label: "Historia, rubro y horarios" },
  { icon: Boxes, label: "Catálogo de productos propios" },
  { icon: Sparkles, label: "Piezas en stock, por lote o personalizadas" },
  { icon: ClipboardSignature, label: "Recepción y revisión de solicitudes" },
  { icon: Receipt, label: "Seguimiento y verificación de pagos" },
  { icon: MessageSquare, label: "Mensajería por pedido" },
  { icon: Bell, label: "Notificaciones de actividad" },
];

const FLUJO_ARTESANO = [
  { paso: "1", titulo: "Registra tu taller", detalle: "Crea tu cuenta como artesano en Acceso." },
  {
    paso: "2",
    titulo: "Completa tu perfil",
    detalle: "Presenta tu historia, rubro, ubicación y contacto.",
  },
  {
    paso: "3",
    titulo: "Espera aprobación",
    detalle: "La administración revisa y habilita tu taller.",
  },
  {
    paso: "4",
    titulo: "Publica productos",
    detalle: "Agrega tus piezas e indica sus modalidades de venta.",
  },
  {
    paso: "5",
    titulo: "Recibe solicitudes",
    detalle: "Evalúa cada renglón y emite tu propuesta.",
  },
  {
    paso: "6",
    titulo: "Gestiona pedidos",
    detalle: "Confirma pagos, elabora las piezas y coordina entregas.",
  },
];

export function ArtisanSection() {
  return (
    <section
      id="para-artesanos"
      className="scroll-mt-20 border-y bg-secondary/10 py-16 sm:py-20"
      aria-labelledby="titulo-para-artesanos"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <p className="inline-flex items-center gap-2 rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-secondary">
              Para talleres artesanales de Masaya
            </p>
            <h2
              id="titulo-para-artesanos"
              className="mt-4 text-balance font-display text-3xl font-bold leading-snug sm:text-4xl"
            >
              Haz visible tu trabajo más allá de tu taller
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              ArtesaNic ofrece a los talleres artesanales un espacio para presentar su historia y
              sus productos, recibir solicitudes y organizar sus pedidos digitalmente.
            </p>

            <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {HERRAMIENTAS_TALLER.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground"
                >
                  <item.icon className="size-4 shrink-0 text-secondary" aria-hidden="true" />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="touch-target text-base">
                <Link to="/auth">
                  Acceder / comenzar
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="touch-target bg-card">
                <Link to="/ayuda#como-vender">Ver guía para talleres</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              <img
                src={tallerImg}
                alt="Artesano trabajando en su taller en Masaya"
                loading="lazy"
                width={960}
                height={640}
                className="aspect-[16/10] w-full object-cover"
              />
              <div className="p-6">
                <h3 className="font-display text-xl font-bold">Ruta del taller en ArtesaNic</h3>
                <ol className="mt-4 space-y-3">
                  {FLUJO_ARTESANO.map((etapa) => (
                    <li key={etapa.paso} className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                        {etapa.paso}
                      </span>
                      <div className="text-sm">
                        <span className="font-semibold text-foreground">{etapa.titulo}: </span>
                        <span className="text-muted-foreground">{etapa.detalle}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
