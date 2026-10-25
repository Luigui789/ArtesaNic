import { mostrarImporte } from "@/lib/importes";
export interface DesgloseContractual {
  subtotalProductos: string;
  totalPersonalizacion: string;
  totalOtrosCargos: string;
  costoEntrega: string;
  total: string;
}
export function ResumenContractual({ datos }: { datos: DesgloseContractual }) {
  const filas: [[string, string], [string, string], [string, string], [string, string]] = [
    ["Productos", datos.subtotalProductos],
    ["Personalización", datos.totalPersonalizacion],
    ["Otros cargos", datos.totalOtrosCargos],
    ["Entrega", datos.costoEntrega],
  ];
  return (
    <dl className="space-y-3 text-sm">
      {filas.map(([nombre, importe]) => (
        <div key={nombre} className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">{nombre}</dt>
          <dd className="font-medium tabular-nums">{mostrarImporte(importe)}</dd>
        </div>
      ))}
      <div className="flex flex-wrap justify-between gap-3 border-t pt-4 text-lg font-semibold">
        <dt>Total acordado</dt>
        <dd className="tabular-nums text-primary">{mostrarImporte(datos.total)}</dd>
      </div>
    </dl>
  );
}
