/**
 * Mapa público de solo lectura (FEAT-GEO-04): un marcador por taller con ubicación
 * publicada, sin arrastre ni selección. Leaflet usa `window` al importarse: este módulo
 * solo se carga con `lazy` desde `mapa-talleres-publico.tsx`, en el navegador.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  CAPA_MAPA,
  CENTRO_INICIAL_MASAYA,
  MARGEN_ENCUADRE,
  ZOOM_INICIAL,
  ZOOM_TALLER_PUBLICO,
  encuadreDeUbicaciones,
  type Encuadre,
} from "../mapa";
import type { MarcadorTaller } from "../types";
import { ICONO_PIN } from "./leaflet-comun";
import { PopupTaller } from "./popup-taller";

export interface PropsMapaTalleresPublico {
  marcadores: readonly MarcadorTaller[];
  /** Popup con «Ver taller» (mapa general); el mapa del perfil no lo necesita. */
  enlaces: boolean;
  onErrorTiles: () => void;
}

function aplicarEncuadre(map: ReturnType<typeof useMap>, encuadre: Encuadre) {
  if (encuadre.tipo === "centro")
    map.setView([encuadre.centro.latitud, encuadre.centro.longitud], encuadre.zoom);
  else
    map.fitBounds(encuadre.limites, {
      padding: [MARGEN_ENCUADRE, MARGEN_ENCUADRE],
      maxZoom: ZOOM_TALLER_PUBLICO,
    });
}

/** Encuadra los marcadores al montar y cuando cambian (p. ej. tras recargar la lista). */
function Encuadrar({ encuadre, clave }: { encuadre: Encuadre; clave: string }) {
  const map = useMap();
  useEffect(() => {
    aplicarEncuadre(map, encuadre);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume las posiciones
  }, [map, clave]);
  return null;
}

export default function MapaTalleresPublicoLeaflet({
  marcadores,
  enlaces,
  onErrorTiles,
}: PropsMapaTalleresPublico) {
  const encuadre = useMemo(
    () => encuadreDeUbicaciones(marcadores.map((m) => m.ubicacion)),
    [marcadores],
  );
  const clave = marcadores
    .map((m) => `${m.id}:${m.ubicacion.latitud},${m.ubicacion.longitud}`)
    .join("|");
  const eventosTiles = useMemo(() => ({ tileerror: onErrorTiles }), [onErrorTiles]);

  return (
    <MapContainer
      // Vista provisional: `Encuadrar` la reemplaza por la de los marcadores al montar.
      center={[CENTRO_INICIAL_MASAYA.latitud, CENTRO_INICIAL_MASAYA.longitud]}
      zoom={ZOOM_INICIAL}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        url={CAPA_MAPA.url}
        attribution={CAPA_MAPA.atribucion}
        maxZoom={CAPA_MAPA.zoomMaximo}
        eventHandlers={eventosTiles}
      />
      <Encuadrar encuadre={encuadre} clave={clave} />
      {marcadores.map((m) => (
        <Marker
          key={m.id}
          position={[m.ubicacion.latitud, m.ubicacion.longitud]}
          icon={ICONO_PIN}
          keyboard
          title={m.nombre}
          alt={`Taller ${m.nombre}`}
        >
          <Popup>
            <PopupTaller marcador={m} enlace={enlaces} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
