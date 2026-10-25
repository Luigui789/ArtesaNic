import { useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSession, type SesionUsuario } from "@/features/auth/use-session";
import { interpretarFallo } from "@/features/auth/errores";
import {
  TALLER_VACIO,
  erroresDeValidacion,
  esquemaRegistroArtesano,
  esquemaRegistroComprador,
  type TallerFormulario,
} from "@/features/auth/validacion";
import type { Role } from "@/types";
import { Campo } from "./campo";

const CAMPOS_CUENTA = ["nombre", "telefono", "password", "confirmacion"];

/** La confirmación es solo de la interfaz: no viaja al servidor. */
function cuentaSinConfirmacion<T extends { confirmacion: string }>({
  confirmacion,
  ...resto
}: T): Omit<T, "confirmacion"> {
  return resto;
}
const CAMPOS_TALLER = Object.keys(TALLER_VACIO).map((c) => `taller.${c}`);

/**
 * Registro público. La intención elegida decide **qué endpoint** se usa
 * (`registro/comprador/` o `registro/artesano/`); el cuerpo nunca lleva `rol`. El
 * artesano envía además los datos iniciales de su taller, que queda pendiente de
 * aprobación. No existe registro de administradores.
 */
export function FormularioRegistro({
  onExito,
  intencionInicial = "comprador",
}: {
  onExito: (usuario: SesionUsuario) => void;
  intencionInicial?: Role;
}) {
  const { registrarComprador, registrarArtesano } = useSession();
  const [intencion, setIntencion] = useState<Role>(intencionInicial);
  const cuentaForm = useForm({
    defaultValues: { nombre: "", telefono: "", password: "", confirmacion: "" },
  });
  const tallerForm = useForm<TallerFormulario>({ defaultValues: TALLER_VACIO });
  const cuenta = cuentaForm.watch();
  const taller = tallerForm.watch();
  const bloqueo = useRef(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const campoCuenta = (k: keyof typeof cuenta) => (v: string) =>
    cuentaForm.setValue(k, v, { shouldDirty: true });
  const campoTaller = (k: keyof TallerFormulario) => (v: string) =>
    tallerForm.setValue(k, v, { shouldDirty: true });
  const artesano = intencion === "artesano";

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bloqueo.current) return;
    setGeneral(null);
    const comprador = esquemaRegistroComprador.safeParse(cuenta);
    const vendedor = artesano ? esquemaRegistroArtesano.safeParse({ ...cuenta, taller }) : null;
    const invalido = vendedor ?? comprador;
    if (!invalido.success) {
      setErrores(erroresDeValidacion(invalido.error));
      return;
    }
    setErrores({});
    bloqueo.current = true;
    setEnviando(true);
    try {
      // El endpoint lo decide la intención; el cuerpo no lleva rol.
      const usuario = vendedor?.success
        ? await registrarArtesano(cuentaSinConfirmacion(vendedor.data))
        : await registrarComprador(cuentaSinConfirmacion(comprador.data!));
      onExito(usuario);
    } catch (error) {
      const fallo = interpretarFallo(error, [...CAMPOS_CUENTA, ...CAMPOS_TALLER]);
      setErrores(fallo.campos);
      setGeneral(fallo.general);
    } finally {
      bloqueo.current = false;
      setEnviando(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      aria-label="Crear cuenta"
      className="space-y-5 rounded-xl border bg-card p-5"
    >
      <fieldset disabled={enviando} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">¿Qué quieres hacer en ArtesaNic?</legend>
          <RadioGroup
            value={intencion}
            onValueChange={(v) => setIntencion(v as Role)}
            className="gap-2"
          >
            <div className="flex min-h-11 items-center gap-2">
              <RadioGroupItem id="intencion-comprador" value="comprador" />
              <Label htmlFor="intencion-comprador" className="font-normal">
                Quiero comprar
              </Label>
            </div>
            <div className="flex min-h-11 items-center gap-2">
              <RadioGroupItem id="intencion-artesano" value="artesano" />
              <Label htmlFor="intencion-artesano" className="font-normal">
                Quiero vender mis artesanías
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Cada cuenta tiene un único rol, que no se puede cambiar después.
          </p>
        </fieldset>

        <Campo
          id="registro-nombre"
          etiqueta="Nombre completo *"
          autoComplete="name"
          valor={cuenta.nombre}
          onCambio={campoCuenta("nombre")}
          error={errores["nombre"]}
        />
        <Campo
          id="registro-telefono"
          etiqueta="Teléfono *"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="8555 1234"
          ayuda="Lo usarás para iniciar sesión. Es privado: no se publica."
          valor={cuenta.telefono}
          onCambio={campoCuenta("telefono")}
          error={errores["telefono"]}
        />
        <Campo
          id="registro-password"
          etiqueta="Contraseña *"
          type="password"
          autoComplete="new-password"
          ayuda="Al menos 8 caracteres, no solo números ni parecida a tu nombre o teléfono."
          valor={cuenta.password}
          onCambio={campoCuenta("password")}
          error={errores["password"]}
        />
        <Campo
          id="registro-confirmacion"
          etiqueta="Confirma la contraseña *"
          type="password"
          autoComplete="new-password"
          valor={cuenta.confirmacion}
          onCambio={campoCuenta("confirmacion")}
          error={errores["confirmacion"]}
        />

        {artesano ? (
          <fieldset className="space-y-4 border-t pt-4">
            <legend className="pt-4 font-semibold">Datos de tu taller</legend>
            <p className="text-sm text-muted-foreground">
              La administración revisará estos datos antes de aprobar tu taller.
            </p>
            <Campo
              id="taller-nombre"
              etiqueta="Nombre del taller *"
              valor={taller.nombre}
              onCambio={campoTaller("nombre")}
              error={errores["taller.nombre"]}
            />
            <Campo
              id="taller-rubro"
              etiqueta="Rubro *"
              placeholder="Cerámica, hamacas, madera…"
              valor={taller.rubro}
              onCambio={campoTaller("rubro")}
              error={errores["taller.rubro"]}
            />
            <Campo
              id="taller-direccion"
              etiqueta="Dirección completa *"
              autoComplete="street-address"
              valor={taller.direccionCompleta}
              onCambio={campoTaller("direccionCompleta")}
              error={errores["taller.direccionCompleta"]}
            />
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer py-2 text-sm font-medium">
                Historia y contactos públicos (opcional)
              </summary>
              <div className="mt-3 space-y-4">
                {" "}
                <Campo
                  id="taller-historia"
                  etiqueta="Historia del taller"
                  multilinea
                  valor={taller.historia ?? ""}
                  onCambio={campoTaller("historia")}
                  error={errores["taller.historia"]}
                />
                <Campo
                  id="taller-horario"
                  etiqueta="Horario de atención"
                  valor={taller.horario ?? ""}
                  onCambio={campoTaller("horario")}
                  error={errores["taller.horario"]}
                />
                <p className="text-sm text-muted-foreground">
                  Contactos públicos (opcionales). Solo se publica lo que escribas aquí; tu teléfono
                  de acceso no se muestra.
                </p>
                <Campo
                  id="taller-telefono-publico"
                  etiqueta="Teléfono público"
                  type="tel"
                  inputMode="tel"
                  valor={taller.telefonoPublico ?? ""}
                  onCambio={campoTaller("telefonoPublico")}
                  error={errores["taller.telefonoPublico"]}
                />
                <Campo
                  id="taller-whatsapp-publico"
                  etiqueta="WhatsApp público"
                  type="tel"
                  inputMode="tel"
                  valor={taller.whatsappPublico ?? ""}
                  onCambio={campoTaller("whatsappPublico")}
                  error={errores["taller.whatsappPublico"]}
                />
                <Campo
                  id="taller-facebook"
                  etiqueta="Facebook"
                  type="url"
                  placeholder="https://facebook.com/…"
                  valor={taller.facebookUrl ?? ""}
                  onCambio={campoTaller("facebookUrl")}
                  error={errores["taller.facebookUrl"]}
                />
                <Campo
                  id="taller-instagram"
                  etiqueta="Instagram"
                  type="url"
                  placeholder="https://instagram.com/…"
                  valor={taller.instagramUrl ?? ""}
                  onCambio={campoTaller("instagramUrl")}
                  error={errores["taller.instagramUrl"]}
                />
                <Campo
                  id="taller-sitio-web"
                  etiqueta="Sitio web"
                  type="url"
                  placeholder="https://…"
                  valor={taller.sitioWeb ?? ""}
                  onCambio={campoTaller("sitioWeb")}
                  error={errores["taller.sitioWeb"]}
                />
              </div>
            </details>
          </fieldset>
        ) : null}
      </fieldset>
      {general ? (
        <p role="alert" className="text-sm text-destructive">
          {general}
        </p>
      ) : null}
      <Button type="submit" className="w-full touch-target" disabled={enviando}>
        {enviando ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
