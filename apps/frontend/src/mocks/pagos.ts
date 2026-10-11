/** Servidor simulado: intentos de pago, comprobantes y su revisión (RF-011). */
import type { PaymentInput } from "@/features/pagos/types";
import { imageFileError } from "@/lib/image-files";
import { PAYMENT_METHODS } from "@/types";
import type { Order, PaymentAttemptStatus, User } from "@/types";
import { api, nextId, nowIso, store } from "./core";
import { mutateOrder, pushEvent } from "./pedidos";

export function registerPayment(id: number, input: PaymentInput, usuario: string): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    if (o.estado !== "aceptado" || !["pendiente", "no_recibido"].includes(o.estadoPago))
      throw new Error(
        "Solo puedes registrar un nuevo intento en Aceptado, sin pago vigente o tras Pago no recibido.",
      );
    if (!PAYMENT_METHODS.includes(input.metodo))
      throw new Error("Selecciona un método de pago válido.");
    validateReceipt(input.comprobante);
    const anterior = o.estadoPago;
    const intento: Order["pagos"][number] = {
      id: nextId(store.orders.flatMap((x) => x.pagos)),
      numero: o.pagos.length + 1,
      metodo: input.metodo,
      referencia: input.referencia,
      nota: input.nota,
      estado: "registrado",
      registradoEn: nowIso(),
      comprobantes: [],
      eventos: [],
    };
    o.pagos.push(intento);
    const comprobanteId = attachReceipt(o, input.comprobante, usuario);
    intento.eventos.push({
      estadoAnterior: null,
      estadoNuevo: "registrado",
      usuario,
      fecha: nowIso(),
      comprobanteId,
    });
    o.estadoPago = "registrado";
    pushEvent(o, "pago", anterior, o.estadoPago, usuario);
  });
}

function validateReceipt(file: PaymentInput["comprobante"]) {
  if (!file) return;
  const error = imageFileError({ type: file.tipo, size: file.tamano });
  if (error) throw new Error(error);
  if (!file.src.startsWith(`data:${file.tipo};base64,`) || !file.src.split(",")[1])
    throw new Error("El comprobante debe contener una imagen válida.");
}

function attachReceipt(o: Order, file: PaymentInput["comprobante"], usuario: string) {
  if (!file) return undefined;
  const id = nextId(store.receiptFiles);
  o.pagos.at(-1)!.comprobantes.push({
    id,
    nombreArchivo: file.nombreArchivo,
    tipo: file.tipo,
    tamano: file.tamano,
    subidoEn: nowIso(),
    subidoPor: usuario,
  });
  store.receiptFiles.push({ id, pedidoId: o.id, src: file.src });
  return id;
}

export function correctPayment(
  id: number,
  comprobante: NonNullable<PaymentInput["comprobante"]>,
  usuario: string,
): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    const intento = o.pagos.at(-1);
    if (o.estado !== "aceptado" || intento?.estado !== "observado")
      throw new Error("Solo se puede corregir un pago observado en un pedido Aceptado.");
    const plazo = intento.eventos.at(-1)?.plazoHasta;
    if (!plazo || Date.now() > Date.parse(plazo))
      throw new Error(
        "Venció el plazo de 48 horas. El taller debe revisar y resolver el intento; el vencimiento no cambia el estado automáticamente.",
      );
    validateReceipt(comprobante);
    const comprobanteId = attachReceipt(o, comprobante, usuario);
    intento.eventos.push({
      estadoAnterior: "observado",
      estadoNuevo: "registrado",
      usuario,
      fecha: nowIso(),
      comprobanteId,
      motivo: "Corrección del comprobante",
    });
    intento.estado = o.estadoPago = "registrado";
    pushEvent(
      o,
      "pago",
      "observado",
      "registrado",
      usuario,
      "Comprobante corregido; se conserva el anterior",
    );
  });
}

export function reviewPayment(
  id: number,
  estado: Exclude<PaymentAttemptStatus, "registrado">,
  usuario: string,
  motivo?: string,
): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    const intento = o.pagos.at(-1);
    if (
      o.estado !== "aceptado" ||
      !intento ||
      !["registrado", "observado"].includes(intento.estado)
    )
      throw new Error("Solo puedes revisar un pago registrado u observado de un pedido Aceptado.");
    if (!["confirmado", "observado", "no_recibido"].includes(estado))
      throw new Error("Resolución de pago inválida.");
    if (estado !== "confirmado" && !motivo?.trim())
      throw new Error("Indica el motivo de la resolución.");
    if (intento.estado === "observado" && estado === "observado")
      throw new Error("Espera la corrección o resuelve el pago observado; no se renueva el plazo.");
    const anterior = o.estadoPago;
    intento.eventos.push({
      estadoAnterior: intento.estado,
      estadoNuevo: estado,
      usuario,
      fecha: nowIso(),
      motivo,
      plazoHasta:
        estado === "observado" ? new Date(Date.now() + 48 * 3600000).toISOString() : undefined,
    });
    intento.estado = o.estadoPago = estado;
    pushEvent(o, "pago", anterior, estado, usuario, motivo);
  });
}

export function confirmPayment(id: number, usuario: string): Promise<Order> {
  return reviewPayment(id, "confirmado", usuario);
}

/** Simulación de autorización: no reemplaza una sesión validada por el backend. */
export function getPaymentReceipt(
  pedidoId: number,
  intentoId: number,
  comprobanteId: number,
  sesion: Pick<User, "id" | "rol" | "artesanoId"> | null,
): Promise<string> {
  return api(() => {
    const o = store.orders.find((o) => o.id === pedidoId);
    if (
      !o ||
      !sesion ||
      !(
        (sesion.rol === "comprador" && sesion.id === o.compradorId) ||
        (sesion.rol === "artesano" && sesion.artesanoId === o.artesanoId)
      )
    )
      throw new Error("Solo las partes del pedido pueden ver el comprobante.");
    if (!o.pagos.find((p) => p.id === intentoId)?.comprobantes.some((c) => c.id === comprobanteId))
      throw new Error("No encontramos este comprobante.");
    const file = store.receiptFiles.find((f) => f.pedidoId === pedidoId && f.id === comprobanteId);
    if (!file) throw new Error("No encontramos la imagen del comprobante.");
    return file.src;
  }, 100);
}
