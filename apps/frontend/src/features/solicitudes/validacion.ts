/** Validación temprana de la composición (RF-009/017/018); el backend es la autoridad. */
import { z } from "zod";
import type { CatalogProduct } from "@/features/catalogo/types";
import { MODALIDADES_ENTREGA, ORIGENES_PERSONALIZACION } from "./types";
import type { EntregaPreferidaBorrador, RenglonBorrador, SolicitudEntrada } from "./types";

/** Fecha de calendario local del navegador, sin desplazarla al día UTC. */
export function fechaLocalISO(fecha = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function esFechaCalendarioDesdeHoy(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === valor &&
    valor >= fechaLocalISO()
  );
}

const esFechaSolicitadaValida = esFechaCalendarioDesdeHoy;

/** Espejo de los límites del backend (MAX_RENGLONES, MAX_CARACTERISTICAS). */
export const MAX_RENGLONES = 50;
export const MAX_CARACTERISTICAS = 2000;
export const MAX_DESCRIPCION_ENTREGA = 500;

const camposComunes = {
  producto: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  cantidad: z
    .number({ message: "Indica una cantidad válida." })
    .int("La cantidad debe ser un número entero.")
    .min(1, "Solicita al menos una unidad.")
    .max(2_147_483_647, "La cantidad supera el máximo admitido."),
};

const esquemaRenglon = z.discriminatedUnion("modalidad", [
  z.object({ ...camposComunes, modalidad: z.literal("stock") }).strict(),
  z
    .object({
      ...camposComunes,
      modalidad: z.literal("produccion"),
      fechaSolicitada: z
        .string()
        .refine(esFechaSolicitadaValida, "Selecciona una fecha válida desde hoy."),
    })
    .strict(),
  z
    .object({
      ...camposComunes,
      modalidad: z.literal("personalizacion"),
      caracteristicas: z
        .string()
        .trim()
        .min(1, "Describe las características solicitadas.")
        .max(MAX_CARACTERISTICAS, `Usa como máximo ${MAX_CARACTERISTICAS} caracteres.`),
      origenPersonalizacion: z.enum(ORIGENES_PERSONALIZACION, {
        message: "Selecciona si se fabrica desde cero o se usa una unidad estándar.",
      }),
    })
    .strict(),
]);

/**
 * Entrada explícita: rechaza identidad, estado, importes y cualquier campo desconocido.
 * La preferencia de entrega (RF-016) es opcional; «otra» exige descripción.
 */
export const esquemaSolicitudEntrada = z
  .object({
    renglones: z
      .array(esquemaRenglon)
      .min(1, "Agrega al menos un producto a la solicitud.")
      .max(MAX_RENGLONES, `Una solicitud admite hasta ${MAX_RENGLONES} productos.`),
    modalidadEntregaPreferida: z
      .enum(MODALIDADES_ENTREGA, { message: "Selecciona una modalidad de entrega válida." })
      .optional(),
    descripcionEntregaPreferida: z
      .string()
      .trim()
      .min(1, "Describe la entrega preferida.")
      .max(MAX_DESCRIPCION_ENTREGA, `Usa como máximo ${MAX_DESCRIPCION_ENTREGA} caracteres.`)
      .optional(),
  })
  .strict()
  .superRefine((entrada, contexto) => {
    if (entrada.descripcionEntregaPreferida && !entrada.modalidadEntregaPreferida)
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modalidadEntregaPreferida"],
        message: "Indica primero la modalidad de entrega.",
      });
    if (entrada.modalidadEntregaPreferida === "otra" && !entrada.descripcionEntregaPreferida)
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["descripcionEntregaPreferida"],
        message: "Describe la modalidad de entrega «Otra».",
      });
  });

export function nuevoRenglon(producto: CatalogProduct): RenglonBorrador {
  return {
    producto,
    modalidad: producto.modalidades[0] ?? "stock",
    cantidad: 1,
    fechaSolicitada: "",
    caracteristicas: "",
    origenPersonalizacion: "",
  };
}

/** Permite repetir un producto deliberadamente, pero nunca mezclar talleres. */
export function puedeAgregarProducto(
  renglones: RenglonBorrador[],
  producto: CatalogProduct,
): boolean {
  return renglones.every((renglon) => renglon.producto.taller.id === producto.taller.id);
}

const SIN_PREFERENCIA: EntregaPreferidaBorrador = { modalidad: "", descripcion: "" };

function datosEntrada(renglones: RenglonBorrador[], entrega: EntregaPreferidaBorrador) {
  const descripcion = entrega.descripcion.trim();
  return {
    ...(entrega.modalidad ? { modalidadEntregaPreferida: entrega.modalidad } : {}),
    ...(descripcion ? { descripcionEntregaPreferida: descripcion } : {}),
    renglones: renglones.map((renglon) => {
      const base = {
        producto: renglon.producto.id,
        modalidad: renglon.modalidad,
        cantidad: renglon.cantidad,
      };
      switch (renglon.modalidad) {
        case "produccion":
          return { ...base, fechaSolicitada: renglon.fechaSolicitada };
        case "personalizacion":
          return {
            ...base,
            caracteristicas: renglon.caracteristicas,
            origenPersonalizacion: renglon.origenPersonalizacion,
          };
        default:
          return base;
      }
    }),
  };
}

function esquemaDelBorrador(renglones: RenglonBorrador[]) {
  return esquemaSolicitudEntrada.superRefine((_, contexto) => {
    const taller = renglones[0]?.producto.taller.id;
    renglones.forEach((renglon, indice) => {
      if (renglon.producto.taller.id !== taller) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["renglones", indice, "producto"],
          message: "Todos los productos deben pertenecer al mismo taller.",
        });
      }
      if (!renglon.producto.modalidades.includes(renglon.modalidad)) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["renglones", indice, "modalidad"],
          message: "El producto no admite esta modalidad.",
        });
      }
      if (
        renglon.modalidad === "stock" &&
        typeof renglon.producto.disponibleStock === "number" &&
        renglon.cantidad > renglon.producto.disponibleStock
      ) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["renglones", indice, "cantidad"],
          message:
            renglon.producto.disponibleStock === 0
              ? "Sin unidades disponibles actualmente para venta desde stock."
              : `Supera el stock disponible actualmente (${renglon.producto.disponibleStock} unidades).`,
        });
      }
    });
  });
}

/** Conserva el orden y los duplicados; los errores señalan el renglón y el campo. */
export function validarSolicitudBorrador(
  renglones: RenglonBorrador[],
  entrega: EntregaPreferidaBorrador = SIN_PREFERENCIA,
) {
  return esquemaDelBorrador(renglones).safeParse(datosEntrada(renglones, entrega));
}

/** Allowlist por modalidad: ningún dato de catálogo, sesión o etapa futura se envía. */
export function crearEntradaSolicitud(
  renglones: RenglonBorrador[],
  entrega: EntregaPreferidaBorrador = SIN_PREFERENCIA,
): SolicitudEntrada {
  return esquemaDelBorrador(renglones).parse(datosEntrada(renglones, entrega));
}
