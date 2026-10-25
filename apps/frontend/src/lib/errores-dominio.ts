import { ApiError } from "@/lib/http";
const MENSAJES: Record<string, string> = {
  stock_insuficiente:
    "Ya no hay suficientes unidades disponibles para completar este pedido. Actualiza la información o consulta con el taller.",
  inventario_ya_inicializado:
    "Este producto ya tiene existencias registradas. Actualiza la información para verlas.",
  inventario_no_inicializado: "Primero establece la existencia inicial de este producto.",
  ajuste_bajo_comprometido:
    "No puedes restar unidades que ya están reservadas. Revisa la cantidad disponible.",
  clave_idempotencia_reutilizada:
    "Este intento ya se utilizó con otros datos. Actualiza la información antes de iniciar otra operación.",
  propuesta_ya_decidida:
    "Esta propuesta ya tiene una decisión. Actualiza para consultar el resultado.",
  propuesta_ya_emitida: "El taller ya emitió la propuesta. Actualiza para consultarla.",
  propuesta_no_emitida: "El taller todavía no ha emitido una propuesta final.",
  renglon_ya_resuelto: "Este producto ya fue revisado. Actualiza para ver el resultado.",
  solicitud_con_renglones_pendientes: "Revisa todos los productos antes de emitir la propuesta.",
  solicitud_rechazada: "Esta solicitud fue rechazada y ya no admite cambios.",
  solicitud_sin_renglones_aceptados: "No hay productos aceptados para preparar una propuesta.",
  producto_sin_fotografia: "Agrega una fotografía principal antes de publicar el producto.",
  pago_ya_confirmado: "El pago de este pedido ya fue confirmado. Actualiza para ver el resultado.",
  pago_en_revision:
    "Ya hay un pago registrado esperando la revisión del taller. Actualiza para ver su estado.",
  correccion_pendiente: "El pago fue observado: corrige el intento observado.",
  correccion_no_permitida: "Solo puedes corregir el intento observado más reciente.",
  intento_ya_resuelto: "Este intento de pago ya fue revisado. Actualiza para ver el resultado.",
  plazo_pago_vencido: "Venció el plazo de 48 horas para registrar el pago.",
  correccion_fuera_plazo: "Venció el plazo de 48 horas para corregir el pago observado.",
  nuevo_intento_fuera_plazo: "Venció el plazo de 48 horas para registrar un nuevo intento de pago.",
  pedido_vencido: "El pedido venció por falta de pago y ya no admite cambios.",
  pedido_entregado: "El pedido ya fue entregado por completo. Actualiza para ver el resultado.",
  pago_no_confirmado:
    "El trabajo y las entregas solo pueden registrarse cuando el pago está confirmado.",
  linea_ya_iniciada: "Este producto ya fue iniciado. Actualiza para ver su avance.",
  linea_no_iniciada: "Inicia el trabajo de cada producto antes de registrar su entrega.",
  cantidad_entrega_excede_pendiente:
    "La cantidad supera lo que falta por entregar. Actualiza para ver las cantidades pendientes.",
  recepcion_ya_registrada: "Ya registraste tu respuesta sobre esta entrega.",
  pedido_finalizado: "El pedido ya finalizó y no admite esta acción. Actualiza para ver su estado.",
  cancelacion_requiere_sin_entregas:
    "El pedido ya tiene entregas: en lugar de cancelarlo, propón un cierre parcial.",
  pago_pendiente_de_resolucion:
    "Hay un pago registrado u observado sin resolver. Resuélvelo antes de cancelar el pedido.",
  cierre_requiere_entrega_parcial:
    "El cierre parcial requiere al menos una unidad entregada y otra pendiente.",
  cierre_parcial_pendiente:
    "Hay una propuesta de cierre parcial esperando la respuesta del comprador.",
  cierre_ya_resuelto:
    "Esta propuesta de cierre ya fue respondida. Actualiza para ver el resultado.",
  reembolso_ya_realizado: "La devolución de este reembolso ya fue registrada.",
  clasificacion_excede_pendiente:
    "La cantidad supera las unidades pendientes de clasificar. Actualiza para ver lo pendiente.",
  resultado_pendiente:
    "No pudimos confirmar el resultado anterior. Reintenta con los mismos datos antes de iniciar otra operación.",
};
export function mensajeDominio(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.codigo && MENSAJES[error.codigo]) return MENSAJES[error.codigo]!;
    if (error.status >= 500)
      return "El servicio no pudo completar la operación. Conservamos tus datos para que puedas reintentar.";
    if (error.status === 401) return "Tu sesión terminó. Inicia sesión nuevamente para continuar.";
    if (error.status === 403)
      return "Tu cuenta no tiene permiso para esta acción. Si eres artesano, revisa la aprobación de tu taller.";
    return mensajeSeguro(error.message);
  }
  return "No pudimos completar la operación. Revisa tu conexión e inténtalo de nuevo.";
}
export function mensajeSeguro(mensaje: string): string {
  return /traceback|stack trace|SQLSTATE|django\.|multipart\/form-data|boundary=|<!doctype|^\s*[[{]/i.test(
    mensaje,
  )
    ? "No pudimos completar la operación. Inténtalo de nuevo; si continúa, contacta al responsable de la plataforma."
    : mensaje;
}
