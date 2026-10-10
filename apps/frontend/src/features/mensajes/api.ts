/**
 * API de mensajería del pedido que consume la interfaz.
 * Hoy delega en el servidor simulado; al integrar Django se reemplaza cada
 * función por su llamada HTTP con la misma firma (ver `src/features/README.md`).
 */
export { listMessages, pollNewMessages, sendMessage } from "@/mocks/mensajes";
