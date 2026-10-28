/**
 * Mapa Leaflet del selector de ubicación (FEAT-GEO-02). Leaflet usa `window` al
 * importarse, así que este módulo solo se carga en el navegador mediante `lazy` desde
 * `selector-ubicacion-taller.tsx`; nada que se renderice en Node debe importarlo.
 */
import "leaflet/dist/leaflet.css";
import { divIcon, type LatLng } from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { CAPA_MAPA, CENTRO_INICIAL_MASAYA, ZOOM_INICIAL, ZOOM_UBICACION } from "../mapa";
import type { UbicacionTaller } from "../types";

export interface PropsMapaUbicacion {
  ubicacion: UbicacionTaller | null;
  /** Cambia cuando la posición llega de fuera del mapa (búsqueda o GPS) para recentrar. */
  enfoque: number;
  disabled: boolean;
  onSeleccionar: (latitud: number, longitud: number) => void;
  onErrorTiles: () => void;
}

// Pin propio en SVG: los iconos PNG por defecto de Leaflet no sobreviven al empaquetado.
const ICONO_PIN = divIcon({
  className: "",
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 2C9.7 2 3 8.6 3 16.8 3 28 18 42 18 42s15-14 15-25.2C33 8.6 26.3 2 18 2z" fill="var(--color-primary, #b45309)" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="17" r="5.5" fill="#fff"/></svg>',
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});

const posicion = (u: UbicacionTaller): [number, number] => [u.latitud, u.longitud];

function Interacciones({
  ubicacion,
  enfoque,
  disabled,
  onSeleccionar,
}: Pick<PropsMapaUbicacion, "ubicacion" | "enfoque" | "disabled" | "onSeleccionar">) {
  const map = useMap();
  useMapEvents({
    click: (e) => {
      if (disabled) return;
      const p = e.latlng.wrap();
      onSeleccionar(p.lat, p.lng);
    },
  });
  // Recentrar solo cuando cambia el enfoque, no en cada clic o arrastre.
  useEffect(() => {
    if (enfoque === 0 || !ubicacion) return;
    map.setView(posicion(ubicacion), Math.max(map.getZoom(), ZOOM_UBICACION));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al enfoque
  }, [enfoque, map]);
  return null;
}

export default function MapaUbicacionLeaflet({
  ubicacion,
  enfoque,
  disabled,
  onSeleccionar,
  onErrorTiles,
}: PropsMapaUbicacion) {
  const eventosMarcador = useMemo(
    () => ({
      dragend: (e: { target: { getLatLng: () => LatLng } }) => {
        const p = e.target.getLatLng().wrap();
        onSeleccionar(p.lat, p.lng);
      },
    }),
    [onSeleccionar],
  );
  const eventosTiles = useMemo(() => ({ tileerror: onErrorTiles }), [onErrorTiles]);

  return (
    <MapContainer
      center={posicion(ubicacion ?? CENTRO_INICIAL_MASAYA)}
      zoom={ubicacion ? ZOOM_UBICACION : ZOOM_INICIAL}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        url={CAPA_MAPA.url}
        attribution={CAPA_MAPA.atribucion}
        maxZoom={CAPA_MAPA.zoomMaximo}
        eventHandlers={eventosTiles}
      />
      <Interacciones
        ubicacion={ubicacion}
        enfoque={enfoque}
        disabled={disabled}
        onSeleccionar={onSeleccionar}
      />
      {ubicacion ? (
        <Marker
          position={posicion(ubicacion)}
          icon={ICONO_PIN}
          draggable={!disabled}
          keyboard
          title="Ubicación del taller. Arrástrala para ajustarla."
          alt="Ubicación del taller"
          eventHandlers={eventosMarcador}
        />
      ) : null}
    </MapContainer>
  );
}
