/**
 * Piezas de los mapas Leaflet que sí se renderizan en Node (FEAT-GEO-02/04): detectar el
 * navegador antes de montar el módulo diferido y contener sus fallos. No importan
 * Leaflet.
 */
import { Component, useSyncExternalStore, type ReactNode } from "react";

const sinSuscripcion = () => () => undefined;

/** true en el navegador, false al renderizar en Node (pruebas con react-dom/server). */
export function useEnNavegador(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => typeof window !== "undefined",
    () => false,
  );
}

/** Si Leaflet no carga, se muestra `mensaje` y el resto de la página sigue funcionando. */
export class LimiteErrorMapa extends Component<
  { mensaje: string; children: ReactNode },
  { fallo: boolean }
> {
  override state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  override render() {
    if (this.state.fallo)
      return (
        <p role="alert" className="p-4 text-sm text-destructive">
          {this.props.mensaje}
        </p>
      );
    return this.props.children;
  }
}
