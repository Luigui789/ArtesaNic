import { Link } from "react-router";
import {
  ArrowRight,
  Ban,
  BookOpen,
  HandCoins,
  HelpCircle,
  Lock,
  RotateCcw,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { PublicLayout } from "@/components/layout/public-layout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useDocumentHead } from "@/hooks/use-document-head";

const SECCIONES_NAVEGACION = [
  { id: "como-comprar", label: "Cómo comprar", icon: ShoppingBag },
  { id: "como-vender", label: "Cómo vender", icon: Store },
  { id: "pagos", label: "Pagos", icon: HandCoins },
  { id: "entregas", label: "Entregas y envíos", icon: Truck },
  { id: "cancelaciones", label: "Cancelaciones", icon: Ban },
  { id: "reembolsos", label: "Reembolsos", icon: RotateCcw },
  { id: "normas", label: "Normas de publicación", icon: BookOpen },
  { id: "privacidad", label: "Seguridad y privacidad", icon: Lock },
  { id: "preguntas-frecuentes", label: "Preguntas frecuentes", icon: HelpCircle },
] as const;

const PREGUNTAS_FRECUENTES = [
  {
    id: "faq-1",
    pregunta: "¿ArtesaNic cobra o procesa pagos con tarjeta dentro de la plataforma?",
    respuesta:
      "No. En esta versión ArtesaNic no cuenta con pasarela de pagos ni procesa tarjetas bancarias. El comprador realiza el pago fuera de la plataforma mediante el medio acordado con el taller (como transferencia u otro método acordado) y luego registra la referencia o comprobante en su pedido para que el artesano lo verifique.",
  },
  {
    id: "faq-2",
    pregunta: "¿Por qué envío una solicitud en lugar de comprar directamente en un carrito?",
    respuesta:
      "Muchos productos artesanales se elaboran bajo pedido, requieren confirmar disponibilidad en el taller o admiten detalles de personalización. La solicitud permite que el artesano revise cada renglón, confirme si puede elaborarlo y acuerde las condiciones antes de que realices cualquier pago.",
  },
  {
    id: "faq-3",
    pregunta: "¿Puedo incluir varios productos en una misma solicitud?",
    respuesta:
      "Sí, siempre que los productos pertenezcan al mismo taller artesanal. Si deseas piezas de talleres distintos, debes enviar una solicitud independiente a cada taller.",
  },
  {
    id: "faq-4",
    pregunta: "¿Qué ocurre si el taller observa mi comprobante de pago?",
    respuesta:
      "Si el artesano detecta algún dato incompleto o ilegible en el comprobante registrado, puede marcar el pago como observado indicando el motivo. Desde ese momento dispones de una ventana operativa de 48 horas para subir una corrección o aclaración.",
  },
  {
    id: "faq-5",
    pregunta: "¿Cómo se calcula el costo de entrega?",
    respuesta:
      "Depende de la modalidad acordada. Si eliges recoger el pedido en el taller, el costo de entrega es C$ 0. En otras modalidades (punto de encuentro, entrega por el artesano u otra acordada), el taller indica la cotización o condiciones de entrega antes de cerrar el acuerdo del pedido.",
  },
  {
    id: "faq-6",
    pregunta: "¿Qué necesita un taller para empezar a publicar productos?",
    respuesta:
      "El artesano debe crear su cuenta, completar los datos de perfil de su taller y contar con la aprobación administrativa de la plataforma. Una vez aprobado el taller, puede registrar productos y decidir cuáles publicar en el catálogo.",
  },
];

export default function Ayuda() {
  useDocumentHead({
    title: "Ayuda y normas operativas | ArtesaNic",
    meta: [
      {
        name: "description",
        content:
          "Guía operativa sobre cómo comprar, cómo vender, pagos, entregas, cancelaciones, reembolsos y normas en ArtesaNic.",
      },
      { property: "og:title", content: "Ayuda y normas operativas | ArtesaNic" },
      {
        property: "og:description",
        content:
          "Consulta cómo funcionan las solicitudes, pagos, entregas y talleres en ArtesaNic.",
      },
      { property: "og:url", content: "/ayuda" },
    ],
    canonical: "/ayuda",
  });

  return (
    <PublicLayout>
      {/* Cabecera */}
      <section className="border-b bg-surface py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Centro de información operativa
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl lg:text-5xl">
            Ayuda, normas y funcionamiento de ArtesaNic
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Aquí encontrarás la información operativa disponible sobre cómo funcionan las
            solicitudes, los pagos registrados, la coordinación de entregas y la participación de
            los talleres artesanales en la plataforma.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Índice lateral en desktop / bloque de acceso rápido en móvil */}
          <aside aria-label="Índice de temas de ayuda">
            <div className="rounded-2xl border bg-card p-4 lg:sticky lg:top-24">
              <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Temas de consulta
              </p>
              <nav className="mt-3">
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
                  {SECCIONES_NAVEGACION.map((sec) => (
                    <li key={sec.id}>
                      <a
                        href={`#${sec.id}`}
                        className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <sec.icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{sec.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>

          {/* Contenido principal */}
          <div className="space-y-10">
            {/* 1. Cómo comprar */}
            <section
              id="como-comprar"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-como-comprar"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ShoppingBag className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-como-comprar" className="font-display text-2xl font-bold">
                  Cómo comprar
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                En ArtesaNic las compras se gestionan mediante solicitudes dirigidas al taller que
                elabora la pieza:
              </p>
              <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-foreground/90">
                <li>
                  <strong>Explora las piezas:</strong> recorre las novedades en{" "}
                  <Link to="/descubrir" className="font-medium text-primary underline">
                    Descubrir
                  </Link>{" "}
                  o utiliza los filtros del{" "}
                  <Link to="/catalogo" className="font-medium text-primary underline">
                    Marketplace
                  </Link>{" "}
                  por categoría, precio o taller.
                </li>
                <li>
                  <strong>Revisa la modalidad del producto:</strong> cada pieza indica si se ofrece
                  desde stock, por producción por cantidad o con opción de personalización.
                </li>
                <li>
                  <strong>Prepara tu solicitud:</strong> elige las unidades, indica las
                  especificaciones o personalización cuando aplique y señala tu modalidad de entrega
                  preferida. Puedes agregar varias piezas del mismo taller en una sola solicitud.
                </li>
                <li>
                  <strong>Espera la revisión del taller:</strong> el artesano evalúa cada renglón y
                  emite la propuesta o respuesta correspondiente.
                </li>
                <li>
                  <strong>Registra tu pago y coordina la entrega:</strong> una vez aceptado el
                  pedido y congelada la cotización, realizas el pago por el medio acordado,
                  registras el comprobante y das seguimiento hasta la entrega.
                </li>
              </ol>
            </section>

            {/* 2. Cómo vender */}
            <section
              id="como-vender"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-como-vender"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
                  <Store className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-como-vender" className="font-display text-2xl font-bold">
                  Cómo vender (para talleres artesanales)
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Los talleres artesanales de Masaya cuentan con un panel operativo para administrar
                su presencia digital y sus pedidos:
              </p>
              <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-foreground/90">
                <li>
                  <strong>Perfil y aprobación:</strong> registra tu cuenta con rol de artesano y
                  completa los datos de tu taller (nombre, historia, rubro, ubicación y horario).
                  Las funciones operativas requieren que el taller esté aprobado en la plataforma.
                </li>
                <li>
                  <strong>Gestión de productos:</strong> registra tus piezas definiendo precio en
                  córdobas, categoría y modalidades de venta combinables (venta desde stock,
                  producción por cantidad o personalización).
                </li>
                <li>
                  <strong>Evaluación de solicitudes:</strong> revisa las solicitudes recibidas por
                  renglón, acepta o rechaza indicando el motivo y emite la propuesta con la
                  cotización del servidor.
                </li>
                <li>
                  <strong>Control de producción y pagos:</strong> verifica los pagos registrados por
                  el comprador antes de iniciar la elaboración o marcar la pieza como lista para
                  entrega.
                </li>
              </ul>
            </section>

            {/* 3. Pagos */}
            <section
              id="pagos"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-pagos"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/30 text-accent-foreground">
                  <HandCoins className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-pagos" className="font-display text-2xl font-bold">
                  Pagos y registro de comprobantes
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                ArtesaNic no procesa pagos automáticos ni retiene fondos. El pago se realiza fuera
                de la plataforma y se registra dentro del pedido para mantener trazabilidad:
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-surface/60 p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    1. Pago fuera de la plataforma
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Cuando el taller acepta el pedido, el total queda congelado. El comprador
                    realiza el pago por transferencia u otro método acordado directamente con el
                    taller.
                  </p>
                </div>
                <div className="rounded-xl border bg-surface/60 p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    2. Registro y verificación
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    El comprador registra el pago adjuntando su comprobante (imagen PNG, JPEG o WebP
                    de hasta 5 MB). El artesano lo revisa y lo marca como confirmado, observado o no
                    recibido.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                <strong>Nota sobre pagos observados:</strong> si el taller observa un comprobante
                indicando el motivo, el comprador cuenta con un plazo de 48 horas para adjuntar la
                corrección antes de que venza la ventana de subsanación.
              </p>
            </section>

            {/* 4. Entregas y envíos */}
            <section
              id="entregas"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-entregas"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
                  <Truck className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-entregas" className="font-display text-2xl font-bold">
                  Entregas y envíos
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                La plataforma no utiliza empresas de mensajería automatizadas ni rastreo satelital.
                La modalidad de entrega se coordina directamente entre comprador y taller según las
                condiciones del pedido:
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                <li className="rounded-xl border bg-surface/50 p-4 text-sm">
                  <strong className="block text-foreground">Recoger en el taller</strong>
                  <span className="mt-1 block text-muted-foreground">
                    El comprador retira la pieza en la ubicación del taller en Masaya sin costo
                    adicional de entrega (C$ 0).
                  </span>
                </li>
                <li className="rounded-xl border bg-surface/50 p-4 text-sm">
                  <strong className="block text-foreground">Punto de encuentro</strong>
                  <span className="mt-1 block text-muted-foreground">
                    Las partes acuerdan un lugar de referencia y horario para realizar la entrega.
                  </span>
                </li>
                <li className="rounded-xl border bg-surface/50 p-4 text-sm">
                  <strong className="block text-foreground">Entrega por el artesano</strong>
                  <span className="mt-1 block text-muted-foreground">
                    El taller coordina el traslado hacia la ubicación indicada por el comprador.
                  </span>
                </li>
                <li className="rounded-xl border bg-surface/50 p-4 text-sm">
                  <strong className="block text-foreground">Otra modalidad acordada</strong>
                  <span className="mt-1 block text-muted-foreground">
                    Cualquier otro medio convenido entre ambas partes y detallado en la coordinación
                    del pedido.
                  </span>
                </li>
              </ul>
            </section>

            {/* 5. Cancelaciones */}
            <section
              id="cancelaciones"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-cancelaciones"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
                  <Ban className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-cancelaciones" className="font-display text-2xl font-bold">
                  Cancelaciones
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Las reglas operativas de cancelación buscan proteger tanto al comprador como el
                trabajo material del artesano:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
                <li>
                  Un pedido puede cancelarse mientras se encuentre en etapa previa al inicio de la
                  producción o entrega, registrando el motivo correspondiente.
                </li>
                <li>
                  Cuando un pedido personalizado o por producción ya pasó al estado{" "}
                  <strong>En producción</strong>, o cuando el pedido ya está{" "}
                  <strong>Listo para entrega</strong> o <strong>Entregado</strong>, no se admite su
                  cancelación directa desde el flujo normal.
                </li>
                <li>
                  Si un pedido aceptado con unidades reservadas se cancela, el taller clasifica las
                  unidades físicas para reincorporarlas al inventario disponible o darlas de baja
                  con motivo justificado.
                </li>
              </ul>
            </section>

            {/* 6. Reembolsos */}
            <section
              id="reembolsos"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-reembolsos"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <RotateCcw className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-reembolsos" className="font-display text-2xl font-bold">
                  Reembolsos
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Dado que los pagos se efectúan directamente entre comprador y taller fuera de la
                plataforma, cualquier devolución de dinero también se realiza fuera de ArtesaNic y
                se documenta en el pedido:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
                <li>
                  Cuando se cancela un pedido que ya contaba con un pago confirmado, se habilita el
                  seguimiento operativo del reembolso dentro del detalle del pedido.
                </li>
                <li>
                  El taller y el comprador coordinan la devolución y registran su estado en la
                  plataforma para dejar constancia en el historial del pedido.
                </li>
              </ul>
            </section>

            {/* 7. Normas de publicación */}
            <section
              id="normas"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-normas"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
                  <BookOpen className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-normas" className="font-display text-2xl font-bold">
                  Normas de publicación
                </h2>
              </div>
              <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-foreground/90">
                <li>
                  <strong>Talleres verificados:</strong> solo los talleres con estado aprobado
                  pueden publicar productos visibles en el catálogo público.
                </li>
                <li>
                  <strong>Información clara:</strong> cada producto debe especificar su nombre,
                  descripción, categoría artesanal, precio en córdobas (C$) y al menos una modalidad
                  de venta (stock, producción por cantidad o personalización).
                </li>
                <li>
                  <strong>Publicación y retiro:</strong> los productos nuevos se crean inicialmente
                  sin publicar hasta que el taller decide publicarlos. Un taller puede despublicar
                  una pieza en cualquier momento para retirarla del catálogo sin perder el historial
                  de solicitudes en curso.
                </li>
              </ul>
            </section>

            {/* 8. Seguridad y privacidad */}
            <section
              id="privacidad"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-privacidad"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Lock className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-privacidad" className="font-display text-2xl font-bold">
                  Seguridad y privacidad
                </h2>
              </div>
              <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-foreground/90">
                <li>
                  <strong>Visibilidad restringida a las partes:</strong> las solicitudes, pedidos,
                  mensajes y comprobantes de pago solo son accesibles para el comprador y el taller
                  involucrados en la operación.
                </li>
                <li>
                  <strong>Inventario interno protegido:</strong> las existencias físicas exactas y
                  los movimientos de inventario pertenecen al panel del artesano y no se exponen en
                  el listado público del catálogo.
                </li>
                <li>
                  <strong>Alcance del prototipo:</strong> este entorno corresponde a un prototipo
                  académico; evita ingresar datos bancarios reales o información personal sensible
                  durante las pruebas de demostración.
                </li>
              </ul>
            </section>

            {/* 9. Preguntas frecuentes */}
            <section
              id="preguntas-frecuentes"
              className="scroll-mt-24 rounded-2xl border bg-card p-6 sm:p-8"
              aria-labelledby="h-faq"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/30 text-accent-foreground">
                  <HelpCircle className="size-5" aria-hidden="true" />
                </span>
                <h2 id="h-faq" className="font-display text-2xl font-bold">
                  Preguntas frecuentes
                </h2>
              </div>

              <Accordion type="single" collapsible className="mt-4 w-full">
                {PREGUNTAS_FRECUENTES.map((item) => (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger className="text-base font-semibold text-foreground">
                      {item.pregunta}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {item.respuesta}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>

            {/* CTA final de ayuda */}
            <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border bg-surface p-6 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-xl font-bold">
                  ¿Listo para explorar la artesanía de Masaya?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Descubre las piezas recién publicadas o busca directamente en el marketplace.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="touch-target">
                  <Link to="/catalogo">
                    Ir al marketplace
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="touch-target bg-card">
                  <Link to="/descubrir">Explorar novedades</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
