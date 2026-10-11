/**
 * API de talleres que consume la interfaz.
 * Hoy delega en el servidor simulado; al integrar Django se reemplaza cada
 * función por su llamada HTTP con la misma firma (ver `src/features/README.md`).
 */
export { featuredArtisans, getArtisan, listArtisans, updateArtisan } from "@/mocks/talleres";
