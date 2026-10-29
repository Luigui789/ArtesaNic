import { useForm } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession, type SesionUsuario } from "@/features/auth/use-session";
import { interpretarFallo } from "@/features/auth/errores";
import {
  UBICACION_REGISTRO_INICIAL,
  solicitudDeRegistro,
  type CuentaFormulario,
} from "@/features/auth/registro";
import {
  CAMPO_ACEPTACION,
  PASOS_POR_ROL,
  erroresDelPaso,
  erroresDelRegistro,
  primerPasoConError,
  type PasoRegistro,
} from "@/features/auth/registro-pasos";
import {
  CAMPO_UBICACION_TALLER,
  TALLER_VACIO,
  type TallerFormulario,
} from "@/features/auth/validacion";
import { SeccionUbicacionTaller } from "@/features/talleres/components/seccion-ubicacion-taller";
import type { EstadoUbicacion } from "@/features/talleres/ubicacion";
import { useEnfocarPrimerError } from "@/hooks/use-enfocar-primer-error";
import type { Role } from "@/types";
import { IndicadorPasos, PasoDatos, PasoTaller, PasoTipoCuenta } from "./registro-pasos";
import { PasoRevision } from "./registro-revision";

const CAMPOS_CUENTA = ["nombre", "telefono", "password", "confirmacion"];
/** Inputs de texto del taller + el campo virtual de errores de la ubicación. */
const CAMPOS_TALLER = [
  ...Object.keys(TALLER_VACIO).map((c) => `taller.${c}`),
  CAMPO_UBICACION_TALLER,
];

/**
 * Registro público en pasos. La intención elegida decide **qué endpoint** se usa
 * (`registro/comprador/` o `registro/artesano/`); el cuerpo nunca lleva `rol`. El
 * artesano envía además los datos iniciales de su taller, que queda pendiente de
 * aprobación, y opcionalmente su ubicación (FEAT-GEO-03) en el mismo `POST`. No existe
 * registro de administradores.
 *
 * Los pasos solo dividen la presentación: los valores viven aquí (React Hook Form y
 * estado), así que avanzar, retroceder o cambiar de rol no los pierde; nada se envía
 * hasta «Crear cuenta». La aceptación de términos no forma parte del contrato.
 */
export function FormularioRegistro({
  onExito,
  intencionInicial = "comprador",
  pasoInicial = "tipo",
}: {
  onExito: (usuario: SesionUsuario) => void;
  intencionInicial?: Role;
  /** Paso con el que abre; por defecto, la elección del tipo de cuenta. */
  pasoInicial?: PasoRegistro;
}) {
  const { registrarComprador, registrarArtesano } = useSession();
  const [intencion, setIntencion] = useState<Role>(intencionInicial);
  const cuentaForm = useForm<CuentaFormulario>({
    defaultValues: { nombre: "", telefono: "", password: "", confirmacion: "" },
  });
  const tallerForm = useForm<TallerFormulario>({ defaultValues: TALLER_VACIO });
  // Coordenadas fuera de React Hook Form: no son inputs de texto.
  const [ubicacionTaller, setUbicacionTaller] = useState<EstadoUbicacion>(
    UBICACION_REGISTRO_INICIAL,
  );
  const [aceptacion, setAceptacion] = useState(false);
  const cuenta = cuentaForm.watch();
  const taller = tallerForm.watch();
  const bloqueo = useRef(false);
  const [pasoElegido, setPaso] = useState<PasoRegistro>(pasoInicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const formulario = useRef<HTMLFormElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const enfocarError = useEnfocarPrimerError(formulario);
  const [cambiosDePaso, setCambiosDePaso] = useState(0);
  useEffect(() => {
    if (cambiosDePaso > 0) titulo.current?.focus();
  }, [cambiosDePaso]);

  const pasos = PASOS_POR_ROL[intencion];
  // Un paso que no corresponde al rol (p. ej. «taller» para comprador) vuelve al inicio.
  const paso = pasos.includes(pasoElegido) ? pasoElegido : "tipo";
  const indice = pasos.indexOf(paso);
  const datos = { intencion, cuenta, taller, ubicacion: ubicacionTaller, aceptacion };

  const quitarError = (campo: string) =>
    setErrores((actuales) => {
      if (!(campo in actuales)) return actuales;
      const { [campo]: _quitado, ...resto } = actuales;
      return resto;
    });
  const campoCuenta = (k: keyof CuentaFormulario) => (v: string) => {
    cuentaForm.setValue(k, v, { shouldDirty: true });
    quitarError(k);
  };
  const campoTaller = (k: keyof TallerFormulario) => (v: string) => {
    tallerForm.setValue(k, v, { shouldDirty: true });
    quitarError(`taller.${k}`);
  };

  const irA = (destino: PasoRegistro) => {
    setGeneral(null);
    setPaso(destino);
    setCambiosDePaso((n) => n + 1);
  };

  /** Muestra los errores, vuelve al primer paso que tenga alguno y enfoca su campo. */
  const mostrarErrores = (nuevos: Record<string, string>) => {
    setErrores(nuevos);
    const destino = primerPasoConError(pasos, nuevos);
    if (destino) setPaso(destino);
    enfocarError();
  };

  const continuar = () => {
    const delPaso = erroresDelPaso(paso, datos);
    if (Object.keys(delPaso).length) {
      setErrores((actuales) => ({ ...actuales, ...delPaso }));
      enfocarError();
      return;
    }
    const siguiente = pasos[indice + 1];
    if (siguiente) irA(siguiente);
  };

  const crearCuenta = async () => {
    if (bloqueo.current) return;
    setGeneral(null);
    const delCliente = erroresDelRegistro(datos);
    if (Object.keys(delCliente).length) {
      mostrarErrores(delCliente);
      return;
    }
    const solicitud = solicitudDeRegistro(intencion, cuenta, taller, ubicacionTaller);
    if (!solicitud.valida) return;
    setErrores({});
    bloqueo.current = true;
    setEnviando(true);
    try {
      // El endpoint lo decide la intención; el cuerpo no lleva rol.
      const usuario =
        solicitud.rol === "artesano"
          ? await registrarArtesano(solicitud.entrada)
          : await registrarComprador(solicitud.entrada);
      onExito(usuario);
    } catch (error) {
      const fallo = interpretarFallo(error, [...CAMPOS_CUENTA, ...CAMPOS_TALLER]);
      setGeneral(fallo.general);
      mostrarErrores(fallo.campos);
    } finally {
      bloqueo.current = false;
      setEnviando(false);
    }
  };

  // Enter en un campo avanza de paso; solo la revisión crea la cuenta.
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (paso === "revision") void crearCuenta();
    else continuar();
  };

  const cambiarIntencion = (nueva: Role) => {
    setIntencion(nueva);
    setErrores({});
    setGeneral(null);
  };

  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      noValidate
      aria-label="Crear cuenta"
      className="space-y-6 rounded-xl border bg-card p-5"
    >
      <IndicadorPasos pasos={pasos} paso={paso} tituloRef={titulo} />
      <fieldset disabled={enviando} aria-labelledby="registro-paso-titulo" className="min-w-0">
        {paso === "tipo" ? (
          <PasoTipoCuenta intencion={intencion} onCambio={cambiarIntencion} />
        ) : paso === "datos" ? (
          <PasoDatos cuenta={cuenta} errores={errores} onCambio={campoCuenta} />
        ) : paso === "taller" ? (
          <PasoTaller taller={taller} errores={errores} onCambio={campoTaller} />
        ) : paso === "ubicacion" ? (
          <div className="space-y-3">
            <DireccionIndicada direccion={taller.direccionCompleta} />
            <SeccionUbicacionTaller
              contexto="registro"
              value={ubicacionTaller}
              onChange={setUbicacionTaller}
              error={errores[CAMPO_UBICACION_TALLER]}
              disabled={enviando}
            />
          </div>
        ) : (
          <PasoRevision
            intencion={intencion}
            cuenta={cuenta}
            taller={taller}
            ubicacion={ubicacionTaller}
            aceptacion={aceptacion}
            error={errores[CAMPO_ACEPTACION]}
            onAceptar={(acepta) => {
              setAceptacion(acepta);
              if (acepta) quitarError(CAMPO_ACEPTACION);
            }}
            onEditar={irA}
          />
        )}
      </fieldset>
      {general ? (
        <p role="alert" className="text-sm text-destructive">
          {general}
        </p>
      ) : null}
      <AccionesRegistro
        hayAnterior={indice > 0}
        final={paso === "revision"}
        enviando={enviando}
        aceptacion={aceptacion}
        onAtras={() => irA(pasos[indice - 1] ?? "tipo")}
      />
    </form>
  );
}

/** Referencia escrita en el paso anterior, para ubicar el taller en el mapa. */
function DireccionIndicada({ direccion }: { direccion: string }) {
  if (!direccion.trim()) return null;
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Dirección indicada: </span>
      <span className="break-words">{direccion.trim()}</span>
    </p>
  );
}

/**
 * «Atrás» y la acción principal. «Crear cuenta» solo existe en el último paso; sin la
 * aceptación queda `aria-disabled` pero enfocable, y pulsarlo explica qué falta.
 */
function AccionesRegistro({
  hayAnterior,
  final,
  enviando,
  aceptacion,
  onAtras,
}: {
  hayAnterior: boolean;
  final: boolean;
  enviando: boolean;
  aceptacion: boolean;
  onAtras: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      {hayAnterior ? (
        <Button
          type="button"
          variant="outline"
          className="touch-target"
          disabled={enviando}
          onClick={onAtras}
        >
          Atrás
        </Button>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}
      {final ? (
        <Button
          type="submit"
          className="touch-target aria-disabled:opacity-60 sm:min-w-40"
          disabled={enviando}
          aria-disabled={!aceptacion || undefined}
        >
          {enviando ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
      ) : (
        <Button type="submit" className="touch-target sm:min-w-40">
          Continuar
        </Button>
      )}
    </div>
  );
}
