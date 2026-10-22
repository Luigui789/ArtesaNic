/** Claves privadas incluyen identidad; el cierre/cambio de sesión también limpia QueryClient. */
export const claves = {
  pedidos: (usuario?: number) => ["pedidos-reales", usuario] as const,
  pedido: (usuario: number | undefined, recibido: boolean, id: number) =>
    ["pedido-real", usuario, recibido, id] as const,
  inventario: (usuario?: number) => ["inventario-real", usuario] as const,
  movimientos: (usuario: number | undefined, producto: number) =>
    ["movimientos-reales", usuario, producto] as const,
  propuesta: (usuario: number | undefined, recibida: boolean, solicitud: number) =>
    ["propuesta-real", usuario, recibida, solicitud] as const,
};
