/** Servidor simulado: talleres y su perfil (RF-008). */
import type { Artisan } from "@/types";
import { api, store } from "./core";

export function featuredArtisans(): Promise<Artisan[]> {
  return api(() => store.artisans.slice(0, 4));
}

export function listArtisans(): Promise<Artisan[]> {
  return api(() => store.artisans);
}

export function getArtisan(id: number): Promise<Artisan> {
  return api(() => {
    const a = store.artisans.find((x) => x.id === id);
    if (!a) throw new Error("No encontramos este artesano.");
    return a;
  });
}

export function updateArtisan(id: number, data: Partial<Artisan>): Promise<Artisan> {
  return api(
    () => {
      const a = store.artisans.find((x) => x.id === id);
      if (!a) throw new Error("No encontramos el taller.");
      Object.assign(a, data);
      return a;
    },
    600,
    true,
  );
}
