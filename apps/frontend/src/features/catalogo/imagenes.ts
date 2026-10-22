/** D-DR01-01: validación temprana; el servidor verifica los bytes. */
export const FOTOGRAFIA_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_FOTOGRAFIA_BYTES = 5 * 1024 * 1024;

export function errorFotografia(file: File): string | undefined {
  if (file.size > MAX_FOTOGRAFIA_BYTES) return "El archivo no puede superar 5 MiB.";
  if (!FOTOGRAFIA_ACCEPT.split(",").includes(file.type)) return "Usa una imagen JPEG, PNG o WebP.";
  return undefined;
}
