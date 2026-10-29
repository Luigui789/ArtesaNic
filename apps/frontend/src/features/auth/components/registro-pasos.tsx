import { useState, type Ref } from "react";
import { CheckCircle2, ShoppingBag, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { CuentaFormulario } from "@/features/auth/registro";
import { TITULOS_PASO, type PasoRegistro } from "@/features/auth/registro-pasos";
import type { TallerFormulario } from "@/features/auth/validacion";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";
import { Campo } from "./campo";

type Errores = Record<string, string>;

/** «Paso 2 de 4» con el nombre del paso; recibe el foco al cambiar de paso. */
export function IndicadorPasos({
  pasos,
  paso,
  tituloRef,
}: {
  pasos: PasoRegistro[];
  paso: PasoRegistro;
  tituloRef?: Ref<HTMLHeadingElement>;
}) {
  const indice = pasos.indexOf(paso);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Paso {indice + 1} de {pasos.length}
      </p>
      <h2
        id="registro-paso-titulo"
        ref={tituloRef}
        tabIndex={-1}
        className="font-display text-xl font-semibold outline-none"
      >
        {TITULOS_PASO[paso]}
      </h2>
      <div aria-hidden="true" className="flex gap-1">
        {pasos.map((p, i) => (
          <span
            key={p}
            className={cn("h-1.5 flex-1 rounded-full", i <= indice ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>
    </div>
  );
}

const OPCIONES_ROL = [
  {
    valor: "comprador",
    titulo: "Quiero comprar",
    descripcion: "Explora el catálogo y haz solicitudes a los talleres de Masaya.",
    Icono: ShoppingBag,
  },
  {
    valor: "artesano",
    titulo: "Quiero vender mis artesanías",
    descripcion:
      "Publica tus productos y administra tu taller. La administración revisa el taller antes de habilitarlo.",
    Icono: Store,
  },
] as const;

/**
 * Elección comprador/artesano como tarjetas. Siguen siendo radios de Radix (grupo con
 * flechas de teclado y un solo valor); la tarjeta entera es la etiqueta del radio.
 */
export function PasoTipoCuenta({
  intencion,
  onCambio,
}: {
  intencion: Role;
  onCambio: (intencion: Role) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend id="registro-intencion" className="mb-3 text-sm font-medium">
        ¿Qué quieres hacer en ArtesaNic?
      </legend>
      <RadioGroup
        value={intencion}
        onValueChange={(v) => onCambio(v as Role)}
        aria-labelledby="registro-intencion"
        className="gap-3"
      >
        {OPCIONES_ROL.map(({ valor, titulo, descripcion, Icono }) => {
          const elegida = intencion === valor;
          const id = `intencion-${valor}`;
          return (
            <label
              key={valor}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                elegida ? "border-primary bg-primary/5" : "border-border hover:bg-surface",
              )}
            >
              <RadioGroupItem
                id={id}
                value={valor}
                aria-labelledby={`${id}-titulo`}
                aria-describedby={`${id}-descripcion`}
                className="mt-1 size-5"
              />
              <Icono className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span
                  id={`${id}-titulo`}
                  className={cn("block", elegida ? "font-semibold" : "font-medium")}
                >
                  {titulo}
                </span>
                <span id={`${id}-descripcion`} className="block text-sm text-muted-foreground">
                  {descripcion}
                </span>
                {elegida ? (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Opción elegida
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </RadioGroup>
      <p className="text-sm text-muted-foreground">
        Cada cuenta tiene un único rol, que no se puede cambiar después.
      </p>
    </fieldset>
  );
}

/** Nombre, teléfono de acceso y contraseña: todo obligatorio. */
export function PasoDatos({
  cuenta,
  errores,
  onCambio,
}: {
  cuenta: CuentaFormulario;
  errores: Errores;
  onCambio: (campo: keyof CuentaFormulario) => (valor: string) => void;
}) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Todos los datos de este paso son obligatorios.
      </p>
      <Campo
        id="registro-nombre"
        etiqueta="Nombre completo"
        autoComplete="name"
        requerido
        maxLength={150}
        valor={cuenta.nombre}
        onCambio={onCambio("nombre")}
        error={errores["nombre"]}
      />
      <Campo
        id="registro-telefono"
        etiqueta="Teléfono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        requerido
        ayuda="Lo usarás para iniciar sesión. Es privado: no se publica."
        valor={cuenta.telefono}
        onCambio={onCambio("telefono")}
        error={errores["telefono"]}
      />
      <Campo
        id="registro-password"
        etiqueta="Contraseña"
        type={mostrar ? "text" : "password"}
        autoComplete="new-password"
        requerido
        ayuda="Al menos 8 caracteres. No puede ser solo números, una contraseña muy común ni parecida a tu nombre o teléfono."
        valor={cuenta.password}
        onCambio={onCambio("password")}
        error={errores["password"]}
      />
      <Campo
        id="registro-confirmacion"
        etiqueta="Repite la contraseña"
        type={mostrar ? "text" : "password"}
        autoComplete="new-password"
        requerido
        valor={cuenta.confirmacion}
        onCambio={onCambio("confirmacion")}
        error={errores["confirmacion"]}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="touch-target"
        aria-controls="registro-password registro-confirmacion"
        aria-pressed={mostrar}
        onClick={() => setMostrar((v) => !v)}
      >
        {mostrar ? "Ocultar contraseñas" : "Mostrar contraseñas"}
      </Button>
    </div>
  );
}

const OPCIONALES_TALLER = [
  "historia",
  "horario",
  "telefonoPublico",
  "whatsappPublico",
  "facebookUrl",
  "instagramUrl",
  "sitioWeb",
] as const;

/**
 * Datos iniciales del taller. Lo obligatorio queda a la vista; presentación y contactos
 * públicos, opcionales, en un bloque plegable que se abre si tiene datos o errores.
 */
export function PasoTaller({
  taller,
  errores,
  onCambio,
}: {
  taller: TallerFormulario;
  errores: Errores;
  onCambio: (campo: keyof TallerFormulario) => (valor: string) => void;
}) {
  const [abierto, setAbierto] = useState(() =>
    OPCIONALES_TALLER.some((c) => (taller[c] ?? "").trim() !== ""),
  );
  const conError = OPCIONALES_TALLER.some((c) => errores[`taller.${c}`]);
  const comun = (campo: keyof TallerFormulario, id: string) => ({
    id: `taller-${id}`,
    valor: taller[campo] ?? "",
    onCambio: onCambio(campo),
    error: errores[`taller.${campo}`],
  });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        La administración revisará estos datos antes de aprobar tu taller. Cuando lo apruebe, se
        mostrarán en el perfil público del taller.
      </p>
      <Campo
        etiqueta="Nombre del taller"
        requerido
        maxLength={120}
        {...comun("nombre", "nombre")}
      />
      <Campo
        etiqueta="Rubro"
        requerido
        maxLength={80}
        ayuda="Qué elaboran. Por ejemplo: cerámica, hamacas, madera."
        {...comun("rubro", "rubro")}
      />
      <Campo
        etiqueta="Dirección completa"
        autoComplete="street-address"
        requerido
        maxLength={255}
        ayuda="Barrio, calle y una referencia para llegar."
        {...comun("direccionCompleta", "direccion")}
      />
      <details
        open={abierto || conError}
        onToggle={(e) => setAbierto(e.currentTarget.open)}
        className="rounded-lg border p-3"
      >
        <summary className="cursor-pointer py-2 text-sm font-medium">
          Historia y contactos públicos (opcional)
        </summary>
        <div className="mt-3 space-y-4">
          <Campo
            etiqueta="Historia del taller"
            multilinea
            filas={4}
            opcional
            maxLength={2000}
            ayuda="Cuenta brevemente qué elaboran y la historia de tu taller."
            {...comun("historia", "historia")}
          />
          <Campo
            etiqueta="Horario de atención"
            opcional
            maxLength={200}
            ayuda="Por ejemplo: lunes a sábado, de 8:00 a 17:00."
            {...comun("horario", "horario")}
          />
          <p className="text-sm text-muted-foreground">
            Contactos públicos (opcionales). Solo se publica lo que escribas aquí; tu teléfono de
            acceso no se muestra.
          </p>
          <Campo
            etiqueta="Teléfono de contacto"
            type="tel"
            inputMode="tel"
            opcional
            {...comun("telefonoPublico", "telefono-publico")}
          />
          <Campo
            etiqueta="WhatsApp"
            type="tel"
            inputMode="tel"
            opcional
            {...comun("whatsappPublico", "whatsapp-publico")}
          />
          <Campo
            etiqueta="Facebook"
            type="url"
            inputMode="url"
            opcional
            placeholder="https://facebook.com/…"
            {...comun("facebookUrl", "facebook")}
          />
          <Campo
            etiqueta="Instagram"
            type="url"
            inputMode="url"
            opcional
            placeholder="https://instagram.com/…"
            {...comun("instagramUrl", "instagram")}
          />
          <Campo
            etiqueta="Sitio web"
            type="url"
            inputMode="url"
            opcional
            placeholder="https://…"
            {...comun("sitioWeb", "sitio-web")}
          />
        </div>
      </details>
    </div>
  );
}
