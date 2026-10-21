/**
 * Claves `Idempotency-Key` de AUD-08 (docs/api/idempotencia.md). El servidor es la
 * autoridad: esta capa solo garantiza que un mismo intento conserve su clave.
 *
 * - Una operación deliberadamente nueva obtiene una clave nueva.
 * - Reintentar el mismo cuerpo (tras un fallo de red, un 5xx o un clic repetido)
 *   reutiliza la clave, para que el servidor devuelva el resultado ya registrado.
 * - Si el cuerpo cambia, ya es otra operación y recibe otra clave: así el cliente
 *   nunca reutiliza una clave con datos distintos (409 en el servidor).
 */

/** UUID v4. `randomUUID` exige contexto seguro; `getRandomValues` existe también fuera de él. */
export function nuevaClaveIdempotencia(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface IntentoIdempotente {
  /** Clave del cuerpo dado: la misma mientras el cuerpo no cambie ni se complete. */
  clave(cuerpo: unknown): string;
  /** La operación terminó con éxito: el próximo envío, aunque sea igual, es nuevo. */
  completar(): void;
}

export function crearIntentoIdempotente(
  generar: () => string = nuevaClaveIdempotencia,
): IntentoIdempotente {
  let actual: { cuerpo: string; clave: string } | null = null;
  return {
    clave(cuerpo) {
      const serializado = JSON.stringify(cuerpo);
      if (actual?.cuerpo !== serializado) actual = { cuerpo: serializado, clave: generar() };
      return actual.clave;
    },
    completar() {
      actual = null;
    },
  };
}
