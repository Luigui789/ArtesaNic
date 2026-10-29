/**
 * Mapa Leaflet del selector de ubicación (FEAT-GEO-02). Leaflet usa `window` al
 * importarse, así que este módulo solo se carga en el navegador mediante `lazy` desde
 * `selector-ubicacion-taller.tsx`; nada que se renderice en Node debe importarlo.
 */
import "leaflet/dist/leaflet.css";
import type { LatLng } from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { CAPA_MAPA, CENTRO_INICIAL_MASAYA, ZOOM_INICIAL, ZOOM_UBICACION } from "../mapa";
import type { UbicacionTaller } from "../types";
import { ICONO_PIN } from "./leaflet-comun";

export interface PropsMapaUbicacion {
  ubicacion: UbicacionTaller | null;
  /** Cambia cuando la posición llega de fuera del mapa (búsqueda o GPS) para recentrar. */
  enfoque: number;
  disabled: boolean;
  onSeleccionar: (latitud: number, longitud: number) => void;
  onErrorTiles: () => void;
}

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
