/**
 * Fuente de la sesión, explícita (AUD-18):
 *
 * - `VITE_AUTH_API=real`: la identidad sale exclusivamente de Django. Sin vuelta
 *   silenciosa a la demo: si el servidor falla, la sesión queda en error o anónima.
 * - `VITE_AUTH_API=mock` (o sin definir): sesión simulada de la demo, aislada, con el
 *   selector «Vista de demostración».
 *
 * La sesión real exige `VITE_CATALOGO_API=real`: los datos simulados usan identidades
 * de la demo que no existen en PostgreSQL, y mezclarlas haría pasar a una persona real
 * por un taller de la demo. Una configuración inválida detiene la aplicación en lugar
 * de elegir un modo por su cuenta.
 */
export type ModoAuth = "real" | "mock";

export function leerModoAuth(auth: string | undefined, catalogo: string | undefined): ModoAuth {
  const modo = auth === undefined || auth === "" ? "mock" : auth;
  if (modo !== "real" && modo !== "mock")
    throw new Error(`VITE_AUTH_API debe ser "real" o "mock"; se recibió "${auth}".`);
  if (modo === "real" && catalogo !== "real")
    throw new Error("VITE_AUTH_API=real requiere VITE_CATALOGO_API=real.");
  return modo;
}

export const modoAuth: ModoAuth = leerModoAuth(
  import.meta.env["VITE_AUTH_API"] as string | undefined,
  import.meta.env["VITE_CATALOGO_API"] as string | undefined,
);

export const authReal = modoAuth === "real";
