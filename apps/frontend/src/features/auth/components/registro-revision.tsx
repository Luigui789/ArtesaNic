import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CuentaFormulario } from "@/features/auth/registro";
import {
  CAMPO_ACEPTACION,
  ENLACES_LEGALES,
  type PasoRegistro,
} from "@/features/auth/registro-pasos";
import type { TallerFormulario } from "@/features/auth/validacion";
import type { EstadoUbicacion } from "@/features/talleres/ubicacion";
import type { Role } from "@/types";

function textoUbicacion({ ubicacion, publica }: EstadoUbicacion): string {
  if (!ubicacion) return "Sin marcar en el mapa (puedes hacerlo después)";
  return publica
    ? "Marcada en el mapa; se mostrará cuando aprueben tu taller"
    : "Marcada en el mapa; no se mostrará públicamente";
}

function Bloque({
  titulo,
  onEditar,
  children,
}: {
  titulo: string;
  onEditar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-3 last:border-b-0">
      <dl className="min-w-0 space-y-1 text-sm">
        <dt className="font-medium">{titulo}</dt>
        {children}
      </dl>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="touch-target shrink-0"
        aria-label={`Editar ${titulo.toLowerCase()}`}
        onClick={onEditar}
      >
        Editar
      </Button>
    </div>
  );
}

/** Resumen breve (sin contraseñas) y aceptación obligatoria antes de crear la cuenta. */
export function PasoRevision({
  intencion,
  cuenta,
  taller,
  ubicacion,
  aceptacion,
  error,
  onAceptar,
  onEditar,
}: {
  intencion: Role;
  cuenta: CuentaFormulario;
  taller: TallerFormulario;
  ubicacion: EstadoUbicacion;
  aceptacion: boolean;
  error: string | undefined;
  onAceptar: (acepta: boolean) => void;
  onEditar: (paso: PasoRegistro) => void;
}) {
  const id = `registro-${CAMPO_ACEPTACION}`;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Revisa tus datos antes de crear la cuenta. Puedes volver a cualquier paso sin perder lo que
        escribiste.
      </p>
      <div className="rounded-lg border px-4">
        <Bloque titulo="Tipo de cuenta" onEditar={() => onEditar("tipo")}>
          <dd>{intencion === "artesano" ? "Artesano: vender mis artesanías" : "Comprador"}</dd>
        </Bloque>
        <Bloque titulo="Tus datos" onEditar={() => onEditar("datos")}>
          <dd className="break-words">{cuenta.nombre.trim()}</dd>
          <dd className="text-muted-foreground">Teléfono de acceso: {cuenta.telefono.trim()}</dd>
        </Bloque>
        {intencion === "artesano" ? (
          <>
            <Bloque titulo="Tu taller" onEditar={() => onEditar("taller")}>
              <dd className="break-words">
                {taller.nombre.trim()} · {taller.rubro.trim()}
              </dd>
              <dd className="break-words text-muted-foreground">
                {taller.direccionCompleta.trim()}
              </dd>
            </Bloque>
            <Bloque titulo="Ubicación" onEditar={() => onEditar("ubicacion")}>
              <dd>{textoUbicacion(ubicacion)}</dd>
            </Bloque>
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id={id}
            checked={aceptacion}
            onCheckedChange={(v) => onAceptar(v === true)}
            aria-required="true"
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className="mt-3 size-5"
          />
          <Label htmlFor={id} className="min-h-11 py-2 font-normal leading-relaxed">
            <span>
              He leído y acepto los{" "}
              <a
                href={ENLACES_LEGALES.terminos}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Términos y condiciones
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>{" "}
              y la{" "}
              <a
                href={ENLACES_LEGALES.privacidad}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Política de privacidad
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
              .
            </span>
          </Label>
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
