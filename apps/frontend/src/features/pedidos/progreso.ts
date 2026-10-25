/**
 * Hitos visuales del progreso del pedido (AUD-12). Se derivan solo de datos reales del
 * servidor —estado del pedido, estado del pago y cumplimiento por renglón— y no son estados
 * del backend: «pago confirmado» o «entregas en curso» nunca se persisten. No reutiliza la
 * máquina de estados ni los tipos del prototipo simulado.
 */
import type { EstadoPago } from "@/features/pagos/types";
import type { EstadoPedidoOperativo } from "./confirmados";
import type { Cumplimiento } from "./cumplimiento";

export type EstadoPaso = "completado" | "actual" | "pendiente" | "final_negativo";
export type ClavePaso =
  "confirmado" | "pago" | "cumplimiento" | "entregas" | "entregado" | "vencido";

export interface PasoProgreso {
  clave: ClavePaso;
  label: string;
  detalle: string;
  estado: EstadoPaso;
}

/** Texto que comunica el estado sin depender del color ni del icono. */
export const TEXTO_ESTADO_PASO: Record<EstadoPaso, string> = {
  completado: "Completado",
  actual: "Paso actual",
  pendiente: "Pendiente",
  final_negativo: "Estado final",
};

const PAGO_NO_CONFIRMADO: Record<Exclude<EstadoPago, "confirmado">, [string, string]> = {
  pendiente: ["Pago pendiente", "Esperando que el pago quede confirmado."],
  registrado: ["Pago registrado", "Comprobante pendiente de revisión."],
  observado: ["Pago observado", "El comprador debe corregir el comprobante."],
  no_recibido: [
    "Pago no recibido",
    "El comprador puede registrar un nuevo intento dentro del plazo.",
  ],
};

const CONFIRMADO: PasoProgreso = {
  clave: "confirmado",
  label: "Pedido confirmado",
  detalle: "Contrato y condiciones congeladas.",
  estado: "completado",
};

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function pasosProgreso({
  estadoPedido,
  estadoPago,
  cumplimiento,
}: {
  estadoPedido: EstadoPedidoOperativo;
  /** `undefined` mientras el pago no se conoce. */
  estadoPago: EstadoPago | undefined;
  /** `undefined` mientras el cumplimiento no se conoce. */
  cumplimiento: Cumplimiento | undefined;
}): PasoProgreso[] {
  // Variante terminal: después del vencimiento no hay pasos futuros de cumplimiento.
  if (estadoPedido === "vencido_falta_pago")
    return [
      CONFIRMADO,
      {
        clave: "vencido",
        label: "Vencido por falta de pago",
        detalle: "El plazo terminó y las reservas no manipuladas fueron liberadas.",
        estado: "final_negativo",
      },
    ];

  const entregas = cumplimiento?.entregas.length ?? 0;
  const registradas = entregas
    ? plural(entregas, "entrega registrada", "entregas registradas")
    : "";

  // Entregado depende solo del estado del pedido, nunca de la respuesta del comprador.
  if (estadoPedido === "entregado")
    return [
      CONFIRMADO,
      {
        clave: "pago",
        label: "Pago confirmado",
        detalle: "Fondos verificados por el taller.",
        estado: "completado",
      },
      {
        clave: "cumplimiento",
        label: "En cumplimiento",
        detalle: "Todos los productos fueron trabajados.",
        estado: "completado",
      },
      {
        clave: "entregas",
        label: "Entregas completadas",
        detalle: registradas ? `${registradas}.` : "Se entregaron todas las cantidades.",
        estado: "completado",
      },
      {
        clave: "entregado",
        label: "Pedido entregado",
        detalle: "Se entregaron todas las cantidades acordadas.",
        estado: "completado",
      },
    ];

  // Iniciar exige Pago confirmado: un pedido en cumplimiento ya lo tiene aunque la lectura
  // del pago aún no haya llegado.
  const pagoConfirmado = estadoPago === "confirmado" || estadoPedido === "en_cumplimiento";
  const pasos: PasoProgreso[] = [CONFIRMADO];

  if (!pagoConfirmado) {
    const [label, detalle] = estadoPago
      ? PAGO_NO_CONFIRMADO[estadoPago as Exclude<EstadoPago, "confirmado">]
      : ["Pago", "Consultando el estado del pago."];
    pasos.push(
      { clave: "pago", label, detalle, estado: "actual" },
      {
        clave: "cumplimiento",
        label: "En cumplimiento",
        detalle: "El trabajo comenzará después del pago confirmado.",
        estado: "pendiente",
      },
      {
        clave: "entregas",
        label: "Entregas",
        detalle: "Todavía no hay entregas registradas.",
        estado: "pendiente",
      },
      { clave: "entregado", label: "Pedido entregado", detalle: "Pendiente.", estado: "pendiente" },
    );
    return pasos;
  }

  const lineas = cumplimiento?.lineas ?? [];
  const iniciadas = lineas.filter((l) => l.iniciadoEn !== null).length;
  const avance = !cumplimiento
    ? "Consultando el avance de los productos."
    : iniciadas === 0
      ? "Listo para comenzar."
      : `${iniciadas} de ${plural(lineas.length, "producto iniciado", "productos iniciados")}.`;

  pasos.push({
    clave: "pago",
    label: "Pago confirmado",
    detalle: "Fondos verificados por el taller.",
    estado: "completado",
  });
  if (entregas) {
    pasos.push(
      { clave: "cumplimiento", label: "En cumplimiento", detalle: avance, estado: "completado" },
      {
        clave: "entregas",
        label: "Entregas en curso",
        detalle: `Se han registrado entregas parciales. ${registradas}.`,
        estado: "actual",
      },
    );
  } else {
    pasos.push(
      { clave: "cumplimiento", label: "En cumplimiento", detalle: avance, estado: "actual" },
      {
        clave: "entregas",
        label: "Entregas",
        detalle: "Todavía no hay entregas registradas.",
        estado: "pendiente",
      },
    );
  }
  pasos.push({
    clave: "entregado",
    label: "Pedido entregado",
    detalle: "Pendiente.",
    estado: "pendiente",
  });
  return pasos;
}
