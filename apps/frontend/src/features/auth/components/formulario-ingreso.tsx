import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/common/form-field";
import { useSession, type SesionUsuario } from "@/features/auth/use-session";
import { interpretarFallo } from "@/features/auth/errores";
import { esquemaIngreso } from "@/features/auth/validacion";
import { Campo } from "./campo";
type Datos = z.infer<typeof esquemaIngreso>;
export function FormularioIngreso({ onExito }: { onExito: (usuario: SesionUsuario) => void }) {
  const { iniciarSesion } = useSession();
  const [general, setGeneral] = useState<string | null>(null);
  const pending = useRef(false);
  const form = useForm<Datos>({
    resolver: zodResolver(esquemaIngreso),
    defaultValues: { telefono: "", password: "" },
  });
  const enviar = form.handleSubmit(async (data) => {
    if (pending.current) return;
    pending.current = true;
    setGeneral(null);
    try {
      onExito(await iniciarSesion(data));
    } catch (error) {
      const fallo = interpretarFallo(error, ["telefono", "password"]);
      for (const [key, message] of Object.entries(fallo.campos))
        if (key === "telefono" || key === "password") form.setError(key, { message });
      setGeneral(fallo.general);
    } finally {
      pending.current = false;
    }
  });
  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      aria-label="Ingresar"
      className="space-y-5 rounded-xl border bg-card p-5"
    >
      <Controller
        control={form.control}
        name="telefono"
        render={({ field, fieldState }) => (
          <Campo
            id="ingreso-telefono"
            etiqueta="Teléfono *"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="8555 1234"
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
        name="password"
        render={({ field, fieldState }) => (
          <Campo
            id="ingreso-password"
            etiqueta="Contraseña *"
            type="password"
            autoComplete="current-password"
            valor={field.value}
            onCambio={field.onChange}
            ref={field.ref}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <FormMessage>{general}</FormMessage>
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
