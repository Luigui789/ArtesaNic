/**
 * Piezas Leaflet compartidas por el selector (FEAT-GEO-02) y el mapa público
 * (FEAT-GEO-04). Importa `leaflet`, que usa `window`: solo lo importan los módulos que
 * se cargan con `lazy` en el navegador.
 */
import { divIcon } from "leaflet";

// Pin propio en SVG: los iconos PNG por defecto de Leaflet no sobreviven al empaquetado.
export const ICONO_PIN = divIcon({
  className: "",
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 2C9.7 2 3 8.6 3 16.8 3 28 18 42 18 42s15-14 15-25.2C33 8.6 26.3 2 18 2z" fill="var(--color-primary, #b45309)" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="17" r="5.5" fill="#fff"/></svg>',
  iconSize: [36, 44],
  iconAnchor: [18, 42],
  popupAnchor: [0, -38],
});
