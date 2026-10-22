import { Link } from "react-router";
import {
  ClipboardList,
  Compass,
  HandCoins,
  MapPin,
  PackageCheck,
  ReceiptText,
  ThumbsUp,
} from "lucide-react";

const PASOS_COMPRA = [
  {
    numero: "1",
    icon: Compass,
    titulo: "Descubre",
    texto: "Explora productos y talleres artesanales de Masaya por rubro, oficio o taller.",
  },
  {
    numero: "2",
    icon: ClipboardList,
    titulo: "Solicita",
    texto: "Selecciona la pieza, cantidad y personalización cuando corresponda.",
  },
  {
    numero: "3",
    icon: ThumbsUp,
    titulo: "El taller responde",
    texto: "El artesano revisa la solicitud, cotiza condiciones y decide si puede aceptarla.",
  },
  {
    numero: "4",
    icon: HandCoins,
    titulo: "Registra el pago",
    texto:
      "Si se acepta, el comprador realiza el pago mediante el medio acordado y registra la información.",
  },
  {
    numero: "5",
    icon: PackageCheck,
    titulo: "Sigue tu pedido",
    texto: "El artesano confirma el pago, prepara el pedido y coordina la entrega.",
  },
];

const FLUJO_PAGO = [
  "Solicitud",
  "Aceptación del artesano",
  "Total acordado",
  "Pago realizado fuera de ArtesaNic",
  "Registro del pago / comprobante",
  "Verificación del artesano",
  "Pago confirmado",
];

const MODALIDADES_ENTREGA = [
  "Retiro en taller",
  "Punto de encuentro",
  "Entrega coordinada con el taller",
  "Otra modalidad acordada",
];

export function HowItWorksSection() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-20 border-y bg-surface py-16 sm:py-20"
      aria-labelledby="titulo-como-funciona"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Proceso paso a paso
          </p>
          <h2
            id="titulo-como-funciona"
            className="mt-2 font-display text-3xl font-bold sm:text-4xl"
          >
            Cómo funciona una compra en ArtesaNic
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            En ArtesaNic cada pedido comienza con una solicitud directa al taller, sin carritos
            automáticos ni cobros sorpresivos.
          </p>
        </div>

        {/* 5 pasos horizontales en desktop, verticales en móvil */}
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PASOS_COMPRA.map((paso) => (
            <li
              key={paso.numero}
              className="relative flex flex-col rounded-xl border bg-card p-5 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {paso.numero}
                </span>
                <paso.icon className="size-5 text-secondary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{paso.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{paso.texto}</p>
            </li>
          ))}
        </ol>

        {/* Bloques explicativos críticos: Pagos y Entregas */}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* Pago con seguimiento */}
          <div className="rounded-2xl border bg-card p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/30 text-accent-foreground">
                <ReceiptText className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display text-xl font-bold">Pago con seguimiento</h3>
                <p className="text-xs text-muted-foreground">
                  Sin pasarela de cobro automática · Registro transparente entre partes
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-foreground/90">
              Realiza el pago mediante el medio acordado con el taller, registra la información
              correspondiente y consulta su estado desde ArtesaNic. El taller no inicia la
              elaboración hasta verificar y confirmar la recepción del pago.
            </p>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Secuencia del pago
              </p>
              <ol
                aria-label="Secuencia del pago en ArtesaNic"
                className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs"
              >
                {FLUJO_PAGO.map((etapa, idx) => (
                  <li key={etapa} className="inline-flex items-center gap-1.5">
                    <span className="rounded-md border bg-surface/80 px-2.5 py-1 font-medium text-foreground">
                      {etapa}
                    </span>
                    {idx < FLUJO_PAGO.length - 1 ? (
                      <span aria-hidden="true" className="font-bold text-muted-foreground">
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Entregas coordinadas */}
          <div className="rounded-2xl border bg-card p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
                <MapPin className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display text-xl font-bold">Entregas coordinadas</h3>
                <p className="text-xs text-muted-foreground">
                  Acuerdo directo según el tipo de pieza y ubicación
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-foreground/90">
              La modalidad de entrega se coordina con el taller según las condiciones del pedido. Al
              enviar tu solicitud puedes indicar tu preferencia para que el artesano la contemple en
              su propuesta.
            </p>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Modalidades disponibles
              </p>
              <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MODALIDADES_ENTREGA.map((mod) => (
                  <li
                    key={mod}
                    className="flex items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-secondary" />
                    {mod}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 text-right">
          <Link
            to="/ayuda#pagos"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Consultar detalles sobre pagos y entregas en Ayuda →
          </Link>
        </div>
      </div>
    </section>
  );
}
