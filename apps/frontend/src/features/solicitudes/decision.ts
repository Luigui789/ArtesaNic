import { solicitar } from "@/lib/http";
import { aPedido, type PedidoDTO, type PedidoConfirmado } from "@/features/pedidos/confirmados";
export interface DecisionResultado {
  id: number;
  solicitud: number;
  propuesta: number;
  decision: "aceptada" | "rechazada";
  decididaEn: string;
  pedido: PedidoConfirmado | null;
}
export async function decidirPropuesta(
  solicitud: number,
  decision: "aceptar" | "rechazar",
  clave: string,
): Promise<DecisionResultado> {
  const dto = await solicitar<{
    id: number;
    solicitud: number;
    propuesta: number;
    decision: "aceptada" | "rechazada";
    decidida_en: string;
    pedido: PedidoDTO | null;
  }>(`/solicitudes/mias/${solicitud}/propuesta/decision/`, {
    metodo: "POST",
    autenticada: true,
    cuerpo: { decision },
    cabeceras: { "Idempotency-Key": clave },
  });
  return {
    id: dto.id,
    solicitud: dto.solicitud,
    propuesta: dto.propuesta,
    decision: dto.decision,
    decididaEn: dto.decidida_en,
    pedido: dto.pedido ? aPedido(dto.pedido) : null,
  };
}
