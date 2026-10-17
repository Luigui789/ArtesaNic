/**
 * Validación temprana del formulario de producto, alineada con el contrato V1
 * (docs/api/catalogo.md §3). Es solo comodidad: el servidor es la autoridad y esta
 * validación no debe rechazar nada que el contrato admita.
 */
import { z } from "zod";
import { MODALIDADES } from "@/types";

export const LIMITES_PRODUCTO = {
  nombre: 120,
  descripcion: 2000,
  /** `DecimalField(max_digits=10, decimal_places=2)`. */
  precioMaximo: 99_999_999.99,
} as const;

const tieneHastaDosDecimales = (valor: number) => Math.round(valor * 100) / 100 === valor;

export const esquemaProducto = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribe el nombre del producto.")
    .max(LIMITES_PRODUCTO.nombre, `Máximo ${LIMITES_PRODUCTO.nombre} caracteres.`),
  precio: z
    .number({ message: "Ingresa un precio válido." })
    .finite("Ingresa un precio válido.")
    .positive("El precio debe ser mayor que cero.")
    .max(LIMITES_PRODUCTO.precioMaximo, "El precio supera el máximo admitido.")
    .refine(tieneHastaDosDecimales, "Usa como máximo dos decimales."),
  // Código de categoría; vacío significa "sin elegir".
  categoria: z.string().min(1, "Selecciona un rubro."),
  descripcion: z
    .string()
    .trim()
    .min(1, "Describe el producto.")
    .max(LIMITES_PRODUCTO.descripcion, `Máximo ${LIMITES_PRODUCTO.descripcion} caracteres.`),
  // RN-004: al menos una modalidad; se combinan libremente y ninguna exige existencias.
  modalidades: z.array(z.enum(MODALIDADES)).min(1, "Selecciona al menos una modalidad de venta."),
});

export type DatosProducto = z.infer<typeof esquemaProducto>;
