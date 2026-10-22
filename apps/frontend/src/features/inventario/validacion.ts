import { z } from "zod";
export const esquemaMovimiento = z
  .object({
    accion: z.enum(["inicial", "entradas", "ajustes"]),
    cantidad: z.coerce
      .number()
      .int("Indica un número entero.")
      .min(0, "La cantidad no puede ser negativa.")
      .max(2147483647, "La cantidad supera el límite admitido."),
    direccion: z.enum(["sumar", "restar"]),
    motivo: z.string().trim().max(500, "Usa hasta 500 caracteres."),
  })
  .superRefine((d, ctx) => {
    if (d.accion !== "inicial" && d.cantidad === 0)
      ctx.addIssue({ code: "custom", path: ["cantidad"], message: "Indica al menos una unidad." });
    if (d.accion === "ajustes" && !d.motivo)
      ctx.addIssue({ code: "custom", path: ["motivo"], message: "Explica el motivo del ajuste." });
  });
export type MovimientoFormulario = z.infer<typeof esquemaMovimiento>;
