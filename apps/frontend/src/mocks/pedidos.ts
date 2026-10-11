/**
 * Servidor simulado: solicitudes, ciclo de vida, entrega y clasificación de
 * unidades de los pedidos (RF-005, RF-009, RF-010, RF-015, RF-016).
 */
import type { DeliveryCoordinationInput, OrderRequestInput } from "@/features/pedidos/types";
import { DELIVERY_MODE_LABELS } from "@/lib/labels";
import { canCancel, canTransition, requiresConfirmedPayment } from "@/lib/order-state";
import { availableUnits } from "@/lib/units";
import { orderTotal } from "@/lib/order-amounts";
import { DELIVERY_MODES } from "@/types";
import type { Order, OrderStatus, Role } from "@/types";
import { api, DEMO_USER_ID, nextId, nowIso, store } from "./core";
import { movement, validateQuantity } from "./inventario";

const nuevoPedidoId = () => nextId(store.orders);
const nuevoEventoId = () => nextId(store.orders.flatMap((o) => o.historial));

export function listOrders(params: {
  rol: Role;
  artesanoId?: number;
  estado?: OrderStatus | "todos" | undefined;
}): Promise<Order[]> {
  return api(() => {
    let items = store.orders;
    if (params.rol === "artesano" && params.artesanoId) {
      items = items.filter((o) => o.artesanoId === params.artesanoId);
    }
    if (params.estado && params.estado !== "todos") {
      items = items.filter((o) => o.estado === params.estado);
    }
    return [...items].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  });
}

export function getOrder(id: number): Promise<Order> {
  return api(() => {
    const o = store.orders.find((x) => x.id === id);
    if (!o) throw new Error("No encontramos este pedido.");
    return o;
  });
}

export function createOrderRequest(input: OrderRequestInput, usuario: string): Promise<Order> {
  return api(
    () => {
      const prod = store.products.find((p) => p.id === input.productoId);
      if (!prod) throw new Error("No encontramos este producto.");
      validateQuantity(prod, input.cantidad);
      if (!["estandar", "personalizada"].includes(input.opcion))
        throw new Error("Selecciona una opción de solicitud.");
      if (
        input.opcion === "personalizada" &&
        (!prod.admitePersonalizacion || input.personalizacion.trim().length < 10)
      )
        throw new Error("Revisa los detalles de personalización.");
      if (!DELIVERY_MODES.includes(input.entregaPreferida?.modalidad))
        throw new Error("Selecciona la modalidad de entrega preferida.");
      const requiereUbicacion = ["punto_de_encuentro", "entrega_directa"].includes(
        input.entregaPreferida.modalidad,
      );
      const ubicacion = input.entregaPreferida.ubicacion?.trim();
      if (requiereUbicacion && (!ubicacion || ubicacion.length > 200))
        throw new Error(
          "Indica la ubicación donde quieres recibir el pedido (hasta 200 caracteres).",
        );
      const n = store.orders.length + 1;
      const order: Order = {
        id: nuevoPedidoId(),
        codigo: `PM-${1000 + n}`,
        productoId: prod.id,
        artesanoId: prod.artesanoId,
        compradorId: DEMO_USER_ID,
        compradorNombre: usuario,
        cantidad: input.cantidad,
        opcion: input.opcion,
        personalizacion: input.opcion === "personalizada" ? input.personalizacion.trim() : "",
        entregaPreferida: {
          ...input.entregaPreferida,
          ubicacion: requiereUbicacion ? ubicacion : undefined,
        },
        pagos: [],
        observaciones: input.observaciones,
        estado: "pendiente",
        estadoPago: "pendiente",
        precioUnitario: prod.precio,
        costosAdicionales: 0,
        costoEntrega: 0,
        creadoEn: nowIso(),
        historial: [
          {
            id: nuevoEventoId(),
            tipo: "pedido",
            estadoAnterior: "—",
            estadoNuevo: "pendiente",
            usuario,
            fecha: nowIso(),
          },
        ],
      };
      store.orders.unshift(order);
      return order;
    },
    800,
    true,
  );
}

/** Uso interno del servidor simulado (pedidos y pagos); no forma parte de la API. */
export function mutateOrder(id: number, usuario: string, fn: (o: Order) => void): Promise<Order> {
  return api(
    () => {
      const o = store.orders.find((x) => x.id === id);
      if (!o) throw new Error("No encontramos este pedido.");
      fn(o);
      void usuario;
      return o;
    },
    600,
    true,
  );
}

/** Uso interno del servidor simulado (pedidos y pagos); no forma parte de la API. */
export function pushEvent(
  o: Order,
  tipo: Order["historial"][number]["tipo"],
  anterior: string,
  nuevo: string,
  usuario: string,
  detalle?: string,
) {
  o.historial.push({
    id: nuevoEventoId(),
    tipo,
    estadoAnterior: anterior,
    estadoNuevo: nuevo,
    usuario,
    fecha: nowIso(),
    detalle,
  });
}

export function changeOrderStatus(
  id: number,
  nuevo: OrderStatus,
  usuario: string,
  motivo?: string,
): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    if (nuevo === "cancelado" && !canCancel(o.estado))
      throw new Error(
        "Solo puedes cancelar mientras el pedido esté Aceptado. Una vez iniciada la producción o marcado como listo, ya no puedes cancelarlo.",
      );
    if (!canTransition(o.estado, nuevo, o.opcion)) {
      throw new Error(`No se puede pasar de "${o.estado}" a "${nuevo}".`);
    }
    if (requiresConfirmedPayment(o.estado, nuevo) && o.estadoPago !== "confirmado") {
      throw new Error("Confirma el pago antes de avanzar el pedido.");
    }
    const p = store.products.find((p) => p.id === o.productoId)!;
    const antes = p.existenciasFisicas;
    if (nuevo === "rechazado" && !motivo?.trim()) throw new Error("Indica el motivo del rechazo.");
    if (nuevo === "aceptado") {
      if (!o.entrega) throw new Error("Registra la cotización de entrega antes de aceptar.");
      if (o.entrega.modalidad !== o.entregaPreferida.modalidad)
        throw new Error(
          "La cotización debe conservar la modalidad del comprador. Guarda nuevamente el costo y las notas antes de aceptar.",
        );
      validateQuantity(p, o.cantidad);
      o.cotizacionCongelada = {
        precioUnitario: o.precioUnitario,
        cantidad: o.cantidad,
        costosAdicionales: o.costosAdicionales,
        costoEntrega: o.costoEntrega,
        modalidad: o.entrega.modalidad,
        total: orderTotal(o),
        congeladaEn: nowIso(),
      };
      o.reserva = { cantidad: o.cantidad, estado: "activa" };
      p.unidadesReservadas += o.cantidad;
      movement(p, "reserva", o.cantidad, antes, usuario, "Aceptación del pedido", o.codigo);
      pushEvent(
        o,
        "unidades",
        "—",
        "—",
        usuario,
        `Reserva de ${o.cantidad} unidades; total congelado C$ ${o.cotizacionCongelada.total}`,
      );
    }
    if (nuevo === "entregado" || nuevo === "cancelado") {
      if (o.reserva?.estado !== "activa") throw new Error("El pedido no tiene una reserva activa.");
      p.unidadesReservadas -= o.cantidad;
      if (nuevo === "entregado") {
        p.existenciasFisicas -= o.cantidad;
        o.reserva.estado = "consumida";
        movement(p, "consumo", o.cantidad, antes, usuario, "Entrega del pedido", o.codigo);
      } else {
        p.unidadesPorClasificar += o.cantidad;
        o.reserva.estado = "pendiente_clasificacion";
        movement(p, "pendiente_clasificacion", o.cantidad, antes, usuario, motivo, o.codigo);
      }
      pushEvent(
        o,
        "unidades",
        "—",
        "—",
        usuario,
        nuevo === "entregado"
          ? `Entrega de ${o.cantidad} unidades`
          : `${o.cantidad} unidades pendientes de clasificación`,
      );
    }
    const anterior = o.estado;
    o.estado = nuevo;
    if (nuevo === "rechazado") o.motivoRechazo = motivo;
    if (nuevo === "cancelado") o.motivoCancelacion = motivo;
    pushEvent(o, "pedido", anterior, nuevo, usuario);
  });
}

export function setDeliveryQuote(
  id: number,
  costoEntrega: number,
  notasCotizacion: string | undefined,
  usuario: string,
): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    if (o.estado !== "pendiente" || o.cotizacionCongelada)
      throw new Error("Solo puedes guardar la cotización mientras el pedido está Pendiente.");
    const modalidad = o.entregaPreferida.modalidad;
    if (!DELIVERY_MODES.includes(modalidad) || !Number.isFinite(costoEntrega) || costoEntrega < 0)
      throw new Error("Revisa la modalidad y el costo de entrega.");
    if (modalidad === "retiro_en_taller" && costoEntrega !== 0)
      throw new Error("Recoger en el taller cuesta C$ 0.");
    if (notasCotizacion && notasCotizacion.trim().length > 200)
      throw new Error("Las notas de cotización admiten hasta 200 caracteres.");
    o.entrega = { modalidad, notasCotizacion: notasCotizacion?.trim() || undefined };
    o.costoEntrega = costoEntrega;
    pushEvent(
      o,
      "entrega",
      "—",
      "—",
      usuario,
      `Cotización de entrega: ${DELIVERY_MODE_LABELS[modalidad]}; C$ ${costoEntrega}`,
    );
  });
}

export const setDelivery = setDeliveryQuote;

export function setDeliveryCoordination(
  id: number,
  input: DeliveryCoordinationInput,
  usuario: string,
): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    if (
      !["aceptado", "en_produccion", "listo_para_entrega"].includes(o.estado) ||
      !o.entrega ||
      !o.cotizacionCongelada
    )
      throw new Error("Solo se coordina la entrega de un pedido activo ya aceptado.");
    if (o.entrega.modalidad === "retiro_en_taller") {
      const fecha = input.fechaRecogida ?? "";
      const parsed = new Date(`${fecha}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== fecha
      )
        throw new Error("Selecciona una fecha válida para recoger el pedido en el taller.");
      o.entrega.fechaRecogida = fecha;
      pushEvent(o, "entrega", "—", "—", usuario, `Fecha de recogida en el taller: ${fecha}`);
    } else {
      const detalle = input.detalle?.trim();
      if (!detalle || detalle.length > 200)
        throw new Error(
          "Indica la fecha y las indicaciones de coordinación (hasta 200 caracteres).",
        );
      o.entrega.detalle = detalle;
      pushEvent(o, "entrega", "—", "—", usuario, detalle);
    }
  });
}

export function classifyCancelledUnits(
  id: number,
  disponibles: number,
  bajas: number,
  motivo: string,
  usuario: string,
): Promise<Order> {
  return mutateOrder(id, usuario, (o) => {
    if (o.estado !== "cancelado" || o.reserva?.estado !== "pendiente_clasificacion")
      throw new Error("Este pedido no tiene unidades pendientes de clasificación.");
    if (
      ![disponibles, bajas].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      disponibles + bajas !== o.reserva.cantidad ||
      !motivo.trim()
    )
      throw new Error(
        "La suma debe coincidir con las unidades reservadas. Indica el motivo de clasificación.",
      );
    const p = store.products.find((p) => p.id === o.productoId)!;
    const antes = p.existenciasFisicas;
    p.unidadesPorClasificar -= o.reserva.cantidad;
    p.existenciasFisicas -= bajas;
    Object.assign(o.reserva, {
      estado: "clasificada",
      disponiblesDevueltas: disponibles,
      bajas,
      motivoClasificacion: motivo.trim(),
    });
    if (disponibles) movement(p, "liberacion", disponibles, antes, usuario, motivo, o.codigo);
    if (bajas) movement(p, "baja", bajas, antes, usuario, motivo, o.codigo);
    p.unidadesDisponibles = availableUnits(p);
    pushEvent(
      o,
      "unidades",
      "—",
      "—",
      usuario,
      `Clasificadas: ${disponibles} disponibles y ${bajas} de baja. ${motivo.trim()}`,
    );
  });
}

// ---------- Panel del artesano ----------

export function artisanSummary(artesanoId: number) {
  return api(() => {
    const mine = store.orders.filter((o) => o.artesanoId === artesanoId);
    return {
      solicitudesPendientes: mine.filter((o) => o.estado === "pendiente").length,
      activos: mine.filter((o) =>
        ["aceptado", "en_produccion", "listo_para_entrega"].includes(o.estado),
      ).length,
      pagosPorConfirmar: mine.filter((o) => o.estadoPago === "registrado").length,
      porEstado: mine.reduce<Record<string, number>>((acc, o) => {
        acc[o.estado] = (acc[o.estado] ?? 0) + 1;
        return acc;
      }, {}),
      productos: store.products.filter((p) => p.artesanoId === artesanoId).length,
    };
  });
}
