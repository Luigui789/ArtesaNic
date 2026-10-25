import { z } from "zod";
import { esRetiroTaller } from "./entrega";
import { MODALIDADES_ENTREGA } from "./types";
import { MAX_DESCRIPCION_ENTREGA, esFechaCalendarioDesdeHoy } from "./validacion";

const decimal = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Indica un importe válido con hasta dos decimales.");
/**
 * Con preferencia del comprador, `modalidadEntrega` y `descripcionEntrega` llegan fijados
 * (solo lectura). Sin preferencia, la modalidad empieza vacía y el artesano debe elegirla:
 * nunca se asume `retiro_taller`. El costo solo se valida si la modalidad no es retiro.
 */
export const esquemaPropuesta = z
  .object({
    modalidadEntrega: z.union([z.enum(MODALIDADES_ENTREGA), z.literal("")]),
    descripcionEntrega: z.string().trim().max(MAX_DESCRIPCION_ENTREGA),
    costoEntrega: z.string(),
    lineas: z.array(
      z.object({
        renglon: z.number(),
        modalidad: z.string(),
        fechaComprometida: z.string(),
        cargoPersonalizacion: z.string(),
      }),
    ),
    otrosCargos: z.array(
      z.object({
        descripcion: z.string().trim().min(1, "Describe el cargo.").max(200),
        monto: decimal,
      }),
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.modalidadEntrega)
      ctx.addIssue({
        code: "custom",
        path: ["modalidadEntrega"],
        message: "Selecciona la modalidad de entrega.",
      });
    if (!esRetiroTaller(data.modalidadEntrega) && !decimal.safeParse(data.costoEntrega).success)
      ctx.addIssue({
        code: "custom",
        path: ["costoEntrega"],
        message: "Indica un importe válido con hasta dos decimales.",
      });
    if (data.modalidadEntrega === "otra" && !data.descripcionEntrega)
      ctx.addIssue({
        code: "custom",
        path: ["descripcionEntrega"],
        message: "Describe la modalidad de entrega.",
      });
    data.lineas.forEach((l, i) => {
      if (l.modalidad === "produccion" && !esFechaCalendarioDesdeHoy(l.fechaComprometida))
        ctx.addIssue({
          code: "custom",
          path: ["lineas", i, "fechaComprometida"],
          message: "Indica una fecha comprometida válida desde hoy.",
        });
      if (l.modalidad === "personalizacion" && !decimal.safeParse(l.cargoPersonalizacion).success)
        ctx.addIssue({
          code: "custom",
          path: ["lineas", i, "cargoPersonalizacion"],
          message: "Indica un cargo válido.",
        });
    });
  });
