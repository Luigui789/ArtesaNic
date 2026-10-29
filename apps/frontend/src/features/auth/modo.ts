/**
 * Fuente de la sesión y del catálogo, explícita (AUD-18):
 *
 * - `real` (por defecto): la identidad y los datos provienen exclusivamente de Django.
 *   Sin vuelta silenciosa a la demo: si el servidor falla, la sesión queda en error o anónima.
 * - `mock`: sesión y catálogo simulados de la demo, aislados exclusivamente para pruebas
 *   locales de regresión con el selector «Vista de demostración».
 *
 * La sesión real exige `VITE_CATALOGO_API=real`: los datos simulados usan identidades
 * de la demo que no existen en PostgreSQL, y mezclarlas haría pasar a una persona real
 * por un taller de la demo. Una configuración inválida detiene la aplicación en lugar
 * de elegir un modo por su cuenta.
 */
export type ModoAuth = "real" | "mock";

export function leerModoCatalogo(catalogo: string | undefined): ModoAuth {
  const modo = catalogo === undefined || catalogo === "" ? "real" : catalogo;
  if (modo !== "real" && modo !== "mock")
    throw new Error(`VITE_CATALOGO_API debe ser "real" o "mock"; se recibió "${catalogo}".`);
  return modo;
}

export function leerModoAuth(auth: string | undefined, catalogo: string | undefined): ModoAuth {
  const modoCatalogo = leerModoCatalogo(catalogo);
  const modo = auth === undefined || auth === "" ? modoCatalogo : auth;
  if (modo !== "real" && modo !== "mock")
    throw new Error(`VITE_AUTH_API debe ser "real" o "mock"; se recibió "${auth}".`);
  if (modo === "real" && modoCatalogo !== "real")
    throw new Error("VITE_AUTH_API=real requiere VITE_CATALOGO_API=real.");
  return modo;
}

export const modoCatalogo: ModoAuth = leerModoCatalogo(
  import.meta.env["VITE_CATALOGO_API"] as string | undefined,
);

export const catalogoReal = modoCatalogo === "real";

export const modoAuth: ModoAuth = leerModoAuth(
  import.meta.env["VITE_AUTH_API"] as string | undefined,
  import.meta.env["VITE_CATALOGO_API"] as string | undefined,
);

export const authReal = modoAuth === "real";
