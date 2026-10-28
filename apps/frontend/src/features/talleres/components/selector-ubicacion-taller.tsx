import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  busquedaDisponible,
  buscarLugar,
  ErrorGeocodificacion,
  MENSAJE_SIN_PROVEEDOR,
  MENSAJES_GEOLOCALIZACION,
  obtenerUbicacionActual,
  type ResultadoLugar,
  type UbicacionTaller,
} from "@/features/talleres/api";
import { crearUbicacion } from "@/features/talleres/ubicacion";
import { LimiteErrorMapa, useEnNavegador } from "./mapa-diferido";

// Leaflet necesita `window` al importarse: se carga aparte y solo en el navegador.
const MapaUbicacionLeaflet = lazy(() => import("./mapa-ubicacion-leaflet"));

type Aviso = { tipo: "estado" | "error"; texto: string } | null;

type Props = {
  value: UbicacionTaller | null;
  onChange: (ubicacion: UbicacionTaller | null) => void;
  disabled?: boolean;
};

/**
 * Selector visual de la ubicación del taller (FEAT-GEO-02). Solo elige coordenadas y
 * las emite redondeadas: no guarda en la API ni decide si la ubicación es pública.
 * El artesano no escribe latitud ni longitud: busca un lugar, usa su ubicación actual,
 * hace clic/tap en el mapa o arrastra el pin. La búsqueda solo se lanza con el botón o
 * Enter (sin autocompletado, por la política de Nominatim) y no aparece si no hay
 * proveedor configurado (`busquedaDisponible`).
 */
export function SelectorUbicacionTaller({ value, onChange, disabled = false }: Props) {
  const enNavegador = useEnNavegador();
  const [enfoque, setEnfoque] = useState(0);
  const [errorTiles, setErrorTiles] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  const seleccionar = useCallback(
    (latitud: number, longitud: number) => {
      const ubicacion = crearUbicacion(latitud, longitud);
      if (ubicacion) onChange(ubicacion);
    },
    [onChange],
  );
  const alFallarTiles = useCallback(() => setErrorTiles(true), []);

  /** Posición que llega de fuera del mapa: se emite y el mapa se recentra en ella. */
  const llevarA = (ubicacion: UbicacionTaller, texto: string) => {
    onChange(ubicacion);
    setEnfoque((n) => n + 1);
    setAviso({ tipo: "estado", texto });
  };

  const usarUbicacionActual = async () => {
    if (localizando || disabled) return;
    setLocalizando(true);
    setAviso({ tipo: "estado", texto: "Obteniendo tu ubicación…" });
    const resultado = await obtenerUbicacionActual();
    setLocalizando(false);
    if (resultado.ok)
      llevarA(
        resultado.ubicacion,
        "Ubicación detectada. Revisa el marcador y muévelo si no coincide con tu taller.",
      );
    else setAviso({ tipo: "error", texto: MENSAJES_GEOLOCALIZACION[resultado.fallo] });
  };

  return (
    <div className="space-y-3">
      {busquedaDisponible ? (
        <BusquedaLugar disabled={disabled} onAviso={setAviso} onElegir={llevarA} />
      ) : (
        <p className="text-sm text-muted-foreground">{MENSAJE_SIN_PROVEEDOR}</p>
      )}

      <div
        role="region"
        aria-label="Mapa para seleccionar la ubicación del taller"
        className="relative z-0 h-72 w-full overflow-hidden rounded-xl border bg-surface sm:h-96"
      >
        {enNavegador ? (
          <LimiteErrorMapa mensaje="No pudimos mostrar el mapa. Puedes buscar un lugar, usar tu ubicación actual o seguir editando el resto del perfil.">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <MapaUbicacionLeaflet
                ubicacion={value}
                enfoque={enfoque}
                disabled={disabled}
                onSeleccionar={seleccionar}
                onErrorTiles={alFallarTiles}
              />
            </Suspense>
          </LimiteErrorMapa>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>
      {errorTiles ? (
        <p role="alert" className="text-xs text-destructive">
          Algunas partes del mapa no cargaron. Puedes seguir seleccionando la ubicación.
        </p>
      ) : null}
      <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {value
          ? "Ubicación seleccionada. Puedes mover el marcador para ajustarla."
          : "Aún no has seleccionado la ubicación. Haz clic o toca el mapa sobre tu taller."}
      </p>
      {aviso ? (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={
            aviso.tipo === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {aviso.texto}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="touch-target"
          disabled={disabled || localizando}
          onClick={() => void usarUbicacionActual()}
        >
          <LocateFixed className="size-4" aria-hidden="true" />
          {localizando ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="outline"
            className="touch-target"
            disabled={disabled}
            onClick={() => {
              setEnfoque(0);
              setAviso(null);
              onChange(null);
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Quitar ubicación
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Búsqueda de lugares con acción explícita (botón o Enter). Solo se monta si hay
 * proveedor de geocodificación; elegir un resultado mueve el pin, no guarda.
 */
function BusquedaLugar({
  disabled,
  onAviso,
  onElegir,
}: {
  disabled: boolean;
  onAviso: (aviso: Aviso) => void;
  onElegir: (ubicacion: UbicacionTaller, texto: string) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoLugar[] | null>(null);
  const busqueda = useRef<AbortController | null>(null);

  // Al desmontar (p. ej. «Cancelar») se aborta la búsqueda en curso.
  useEffect(() => () => busqueda.current?.abort(), []);

  const buscar = async () => {
    const texto = consulta.trim();
    if (!texto || buscando || disabled) return;
    busqueda.current?.abort();
    const control = new AbortController();
    busqueda.current = control;
    setBuscando(true);
    onAviso({ tipo: "estado", texto: "Buscando lugares…" });
    try {
      const encontrados = await buscarLugar(texto, control.signal);
      setResultados(encontrados);
      onAviso(
        encontrados.length
          ? {
              tipo: "estado",
              texto: `${encontrados.length === 1 ? "1 resultado" : `${encontrados.length} resultados`}. Elige uno para verlo en el mapa.`,
            }
          : {
              tipo: "estado",
              texto:
                "No encontramos lugares con ese nombre en Nicaragua. Prueba con otro nombre o selecciona el punto en el mapa.",
            },
      );
    } catch (error) {
      if (control.signal.aborted) return;
      setResultados(null);
      onAviso({
        tipo: "error",
        texto:
          error instanceof ErrorGeocodificacion
            ? error.message
            : "No pudimos buscar ese lugar. Puedes intentarlo nuevamente o seleccionarlo manualmente en el mapa.",
      });
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="ubicacion-busqueda">Buscar lugar</Label>
      {/* Sin <form>: el selector vive dentro del formulario del perfil. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="ubicacion-busqueda"
          type="search"
          value={consulta}
          placeholder="Buscar barrio, calle o lugar…"
          autoComplete="off"
          enterKeyHint="search"
          disabled={disabled}
          className="touch-target min-w-0 flex-1"
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault(); // no enviar el formulario del perfil
            void buscar();
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="touch-target"
          disabled={disabled || buscando || !consulta.trim()}
          onClick={() => void buscar()}
        >
          <Search className="size-4" aria-hidden="true" />
          {buscando ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      {resultados && resultados.length > 0 ? (
        <ul aria-label="Resultados de la búsqueda" className="divide-y rounded-xl border">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={disabled}
                className="touch-target flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface focus-visible:bg-surface disabled:opacity-50"
                onClick={() => {
                  setResultados(null);
                  onElegir(
                    r.ubicacion,
                    `Mostrando «${r.nombre}» en el mapa. Ajusta el marcador sobre tu taller si hace falta.`,
                  );
                }}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
                <span className="min-w-0 break-words">{r.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">Búsqueda con datos de OpenStreetMap.</p>
    </div>
  );
}
