/**
 * «Usar mi ubicación actual» (FEAT-GEO-02). Una sola lectura con `getCurrentPosition`,
 * solo cuando el artesano pulsa el botón: no hay seguimiento (`watchPosition`) ni
 * petición de permiso al abrir la página. Los navegadores exigen contexto seguro
 * (HTTPS o localhost); sin él no se intenta y el mapa manual sigue disponible.
 */
import type { UbicacionTaller } from "./types";
import { crearUbicacion } from "./ubicacion";

export type FalloGeolocalizacion =
  "denegado" | "no-disponible" | "tiempo" | "no-soportado" | "inseguro";

export type ResultadoGeolocalizacion =
  { ok: true; ubicacion: UbicacionTaller } | { ok: false; fallo: FalloGeolocalizacion };

const ALTERNATIVA = "Puedes buscar un lugar o mover el marcador manualmente.";

export const MENSAJES_GEOLOCALIZACION: Record<FalloGeolocalizacion, string> = {
  denegado: `No diste permiso para usar tu ubicación. ${ALTERNATIVA}`,
  "no-disponible": `No pudimos obtener tu ubicación. ${ALTERNATIVA}`,
  tiempo: `Tu dispositivo tardó demasiado en responder. ${ALTERNATIVA}`,
  "no-soportado": `Tu navegador no permite obtener la ubicación. ${ALTERNATIVA}`,
  inseguro: `La ubicación del dispositivo solo funciona en una conexión segura (HTTPS). ${ALTERNATIVA}`,
};

export const OPCIONES_GEOLOCALIZACION: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 60_000,
};

interface Entorno {
  geolocalizacion?: Pick<Geolocation, "getCurrentPosition"> | undefined;
  contextoSeguro?: boolean | undefined;
}

function entornoDelNavegador(): Entorno {
  if (typeof navigator === "undefined") return {};
  return {
    geolocalizacion: navigator.geolocation,
    contextoSeguro: typeof window === "undefined" ? undefined : window.isSecureContext,
  };
}

/** Pide la posición una vez. Nunca rechaza: los fallos vuelven como `{ ok: false }`. */
export function obtenerUbicacionActual(
  entorno: Entorno = entornoDelNavegador(),
): Promise<ResultadoGeolocalizacion> {
  const { geolocalizacion, contextoSeguro } = entorno;
  if (contextoSeguro === false) return Promise.resolve({ ok: false, fallo: "inseguro" });
  if (!geolocalizacion) return Promise.resolve({ ok: false, fallo: "no-soportado" });
  return new Promise((resolve) => {
    geolocalizacion.getCurrentPosition(
      ({ coords }) => {
        const ubicacion = crearUbicacion(coords.latitude, coords.longitude);
        resolve(ubicacion ? { ok: true, ubicacion } : { ok: false, fallo: "no-disponible" });
      },
      (error) =>
        resolve({
          ok: false,
          fallo: error.code === 1 ? "denegado" : error.code === 3 ? "tiempo" : "no-disponible",
        }),
      OPCIONES_GEOLOCALIZACION,
    );
  });
}
