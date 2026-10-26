import { useState } from "react";
import { Link } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Store, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/common/page";
import { FormMessage } from "@/components/common/form-field";
import { SiteLayout } from "@/components/layout/site-layout";
import { Button } from "@/components/ui/button";
import { useSession, type SesionUsuario } from "@/features/auth/use-session";
import { interpretarFallo } from "@/features/auth/errores";
import {
  CAMPOS_SERVIDOR_CUENTA,
  cambiaTelefono,
  crearEnvioUnico,
  entradaDeCambios,
  esquemaCuenta,
  valoresDeCuenta,
  type ValoresCuenta,
} from "@/features/auth/cuenta";
import { Campo } from "@/features/auth/components/campo";
import { useDocumentHead } from "@/hooks/use-document-head";
import { ROLE_LABELS } from "@/lib/labels";

/**
 * Datos personales propios (AUD-15): nombre y teléfono de acceso. Es la cuenta de la
 * persona, común a comprador y artesano; el perfil público del taller está en
 * `/panel/perfil` y no se edita aquí (D-AUD15-07).
 */
export default function Cuenta() {
  const { usuario } = useSession();
  useDocumentHead({ title: "Mi cuenta | ArtesaNic" });
  return (
    <SiteLayout>
      <PageContainer narrow>
        <header>
          <h1 className="font-display text-3xl font-bold">Mi cuenta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus datos personales y tu teléfono para iniciar sesión.
          </p>
        </header>
        {usuario ? (
          <FormularioCuenta key={usuario.id} usuario={usuario} />
        ) : (
          <p role="status" className="text-sm">
            Cargando tu cuenta…
          </p>
        )}
      </PageContainer>
    </SiteLayout>
  );
}

export function FormularioCuenta({
  usuario,
  inicial,
}: {
  usuario: SesionUsuario;
  /** Valores con los que abre el formulario; por defecto, los de la cuenta. */
  inicial?: Partial<ValoresCuenta>;
}) {
  const { actualizarPerfil } = useSession();
  const [general, setGeneral] = useState<string | null>(null);
  const [mostrarPassword, setMostrarPassword] = useState(false);
  // El servidor puede pedir la contraseña aunque aquí el teléfono pareciera igual.
  const [passwordPedida, setPasswordPedida] = useState(false);
  const [enviarUnaVez] = useState(() => crearEnvioUnico(actualizarPerfil));
  const form = useForm<ValoresCuenta>({
    resolver: zodResolver(esquemaCuenta(usuario)),
    defaultValues: { ...valoresDeCuenta(usuario), ...inicial },
  });
  const telefono = form.watch("telefono");
  const pedirPassword = passwordPedida || cambiaTelefono(usuario, telefono);

  const enviar = form.handleSubmit(async (valores) => {
    setGeneral(null);
    const entrada = entradaDeCambios(usuario, valores);
    if (Object.keys(entrada).length === 0) {
      setGeneral("No hay cambios que guardar.");
      return;
    }
    try {
      const actualizado = await enviarUnaVez(entrada);
      if (!actualizado) return;
      form.reset(valoresDeCuenta(actualizado));
      setPasswordPedida(false);
      setMostrarPassword(false);
      toast.success("Datos actualizados");
    } catch (error) {
      const fallo = interpretarFallo(error, Object.keys(CAMPOS_SERVIDOR_CUENTA));
      for (const [campo, message] of Object.entries(fallo.campos)) {
        const destino = CAMPOS_SERVIDOR_CUENTA[campo];
        if (destino === "passwordActual") setPasswordPedida(true);
        if (destino) form.setError(destino, { message });
      }
      setGeneral(fallo.general);
    }
  });

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="cuenta-rol"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
          >
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="cuenta-rol" className="text-sm font-medium text-muted-foreground">
              Rol
            </h2>
            <p className="font-semibold" data-campo="rol">
              {ROLE_LABELS[usuario.rol]}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">El rol de una cuenta no se puede cambiar.</p>
      </section>

      <form
        onSubmit={(e) => void enviar(e)}
        noValidate
        aria-label="Datos personales"
        className="space-y-5 rounded-xl border bg-card p-5"
      >
        <Controller
          control={form.control}
          name="nombre"
          render={({ field, fieldState }) => (
            <Campo
              id="cuenta-nombre"
              etiqueta="Nombre"
              autoComplete="name"
              maxLength={150}
              valor={field.value}
              onCambio={field.onChange}
              ref={field.ref}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="telefono"
          render={({ field, fieldState }) => (
            <Campo
              id="cuenta-telefono"
              etiqueta="Teléfono de acceso"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="8555 1234"
              ayuda={
                usuario.rol === "artesano"
                  ? "Es tu identificador para iniciar sesión. Cambiarlo no modifica los contactos públicos de tu taller."
                  : "Es tu identificador para iniciar sesión."
              }
              valor={field.value}
              onCambio={field.onChange}
              ref={field.ref}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        {pedirPassword ? (
          <div className="space-y-2 rounded-lg border border-dashed p-4">
            <Controller
              control={form.control}
              name="passwordActual"
              render={({ field, fieldState }) => (
                <Campo
                  id="cuenta-password-actual"
                  etiqueta="Contraseña actual"
                  type={mostrarPassword ? "text" : "password"}
                  autoComplete="current-password"
                  ayuda="La necesitamos porque el teléfono es tu identificador para iniciar sesión."
                  valor={field.value}
                  onCambio={field.onChange}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="touch-target"
              aria-controls="cuenta-password-actual"
              aria-pressed={mostrarPassword}
              onClick={() => setMostrarPassword((v) => !v)}
            >
              {mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            </Button>
          </div>
        ) : null}
        <FormMessage>{general}</FormMessage>
        <Button
          type="submit"
          className="touch-target w-full sm:w-auto"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      {usuario.rol === "artesano" ? (
        <aside
          aria-label="Mi taller"
          className="flex flex-col gap-3 rounded-xl border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Store className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm">
              <span className="font-semibold">Mi taller</span> es aparte: el nombre del taller y sus
              contactos públicos se editan en el perfil del taller.
            </p>
          </div>
          <Button asChild variant="outline" className="touch-target shrink-0">
            <Link to="/panel/perfil">Perfil del taller</Link>
          </Button>
        </aside>
      ) : null}
    </div>
  );
}
