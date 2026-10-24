/**
 * Política de comprobantes D-AUD10-04, reflejo exacto de `apps/pagos/comprobantes.py`.
 * Solo adelanta el aviso: el servidor valida el contenido real y es la autoridad.
 */
export const EXTENSIONES_COMPROBANTE = [".jpg", ".jpeg", ".png", ".webp", ".pdf"] as const;
export const TIPOS_COMPROBANTE = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
/** `accept` del input: extensiones y MIME de la whitelist, nada más. */
export const ACCEPT_COMPROBANTE = [...EXTENSIONES_COMPROBANTE, ...TIPOS_COMPROBANTE].join(",");
export const MAX_COMPROBANTE_BYTES = 10 * 1024 * 1024;
export const REGLAS_COMPROBANTE = "Formatos permitidos: JPG, JPEG, PNG, WebP y PDF. Máximo 10 MB.";
export const MAX_REFERENCIA = 120;
export const MAX_MOTIVO_PAGO = 1000;

const TIPO_POR_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto < 0 ? "" : nombre.slice(punto).toLowerCase();
}

export function errorComprobante(archivo: { name: string; type: string; size: number }) {
  const esperado = TIPO_POR_EXTENSION[extension(archivo.name)];
  if (!esperado) return "Usa un comprobante JPG, JPEG, PNG, WebP o PDF.";
  // Algunos navegadores no informan el tipo; el servidor lo detecta por contenido.
  if (archivo.type && archivo.type !== "application/octet-stream" && archivo.type !== esperado)
    return "La extensión o el tipo del archivo no coinciden con su contenido.";
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > MAX_COMPROBANTE_BYTES) return "El comprobante no puede superar 10 MB.";
  return null;
}

export function esPdf(tipo: string): boolean {
  return tipo === "application/pdf";
}

export function etiquetaTipo(tipo: string): string {
  return esPdf(tipo) ? "PDF" : (tipo.split("/")[1]?.toUpperCase() ?? "Archivo");
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-NI", { maximumFractionDigits: 1 })} MB`;
}
