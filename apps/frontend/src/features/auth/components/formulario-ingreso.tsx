import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession, type SesionUsuario } from "@/features/auth/use-session";
import { interpretarFallo } from "@/features/auth/errores";
import { erroresDeValidacion, esquemaIngreso } from "@/features/auth/validacion";
import { Campo } from "./campo";

const CAMPOS = ["telefono", "password"];

/**
 * Login con teléfono y contraseña. No pregunta el rol: lo determina la cuenta y llega
 * en la respuesta del servidor (RF-004, RN-001).
 */
export function FormularioIngreso({ onExito }: { onExito: (usuario: SesionUsuario) => void }) {
  const { iniciarSesion } = useSession();
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = esquemaIngreso.safeParse({ telefono, password });
    if (!r.success) {
      setErrores(erroresDeValidacion(r.error));
      setGeneral(null);
      return;
    }
    setErrores({});
    setGeneral(null);
    setEnviando(true);
    try {
      onExito(await iniciarSesion(r.data));
    } catch (error) {
      const fallo = interpretarFallo(error, CAMPOS);
      setErrores(fallo.campos);
      setGeneral(fallo.general);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      aria-label="Ingresar"
      className="space-y-5 rounded-xl border bg-card p-5"
    >
      <Campo
        id="ingreso-telefono"
        etiqueta="Teléfono *"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="8555 1234"
        valor={telefono}
        onCambio={setTelefono}
        error={errores["telefono"]}
      />
      <Campo
        id="ingreso-password"
        etiqueta="Contraseña *"
        type="password"
        autoComplete="current-password"
        valor={password}
        onCambio={setPassword}
        error={errores["password"]}
      />
      {general ? (
        <p role="alert" className="text-sm text-destructive">
          {general}
        </p>
      ) : null}
      <Button type="submit" className="w-full touch-target" disabled={enviando}>
        {enviando ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
