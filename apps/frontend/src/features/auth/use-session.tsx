import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adaptadorSesion, modoAuth, type ModoAuth } from "@/features/auth/api";
import { crearControladorSesion, type ControladorSesion, type EstadoSesion } from "./sesion";
import type {
  ActualizarPerfilEntrada,
  Credenciales,
  RegistroArtesanoEntrada,
  RegistroCompradorEntrada,
  SesionUsuario,
} from "./types";
import type { Role } from "@/types";

export type { SesionUsuario } from "./types";

interface SessionContextValue {
  modo: ModoAuth;
  estado: EstadoSesion["estado"];
  /** Identidad devuelta por el servidor (o la vista simulada en modo demo). */
  usuario: SesionUsuario | null;
  /** Motivo cuando la sesión no se pudo comprobar (estado `error`). */
  error: string | null;
  iniciarSesion: (credenciales: Credenciales) => Promise<SesionUsuario>;
  registrarComprador: (entrada: RegistroCompradorEntrada) => Promise<SesionUsuario>;
  registrarArtesano: (entrada: RegistroArtesanoEntrada) => Promise<SesionUsuario>;
  cerrarSesion: () => Promise<void>;
  /** `PATCH /auth/perfil/`: la identidad devuelta reemplaza a `usuario` de inmediato. */
  actualizarPerfil: (entrada: ActualizarPerfilEntrada) => Promise<SesionUsuario>;
  reintentar: () => Promise<void>;
  /** Solo en modo demo; `null` en modo real, donde el rol lo asigna el servidor. */
  cambiarVistaDemo: ((rol: Role) => void) | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Sesión de la aplicación. Debe estar dentro de `QueryClientProvider`: al cambiar de
 * identidad vacía la caché de consultas. `controlador` permite inyectar uno en pruebas.
 */
export function SessionProvider({
  children,
  controlador: inyectado,
}: {
  children: ReactNode;
  controlador?: ControladorSesion;
}) {
  const queryClient = useQueryClient();
  const [controlador] = useState(
    () => inyectado ?? crearControladorSesion(adaptadorSesion, queryClient),
  );
  const actual = useSyncExternalStore(
    controlador.suscribir,
    controlador.obtener,
    controlador.obtener,
  );

  useEffect(() => controlador.iniciar(), [controlador]);

  const value = useMemo<SessionContextValue>(
    () => ({
      modo: modoAuth,
      estado: actual.estado,
      usuario: actual.usuario,
      error: actual.error,
      iniciarSesion: controlador.iniciarSesion,
      registrarComprador: controlador.registrarComprador,
      registrarArtesano: controlador.registrarArtesano,
      cerrarSesion: controlador.cerrarSesion,
      actualizarPerfil: controlador.actualizarPerfil,
      reintentar: controlador.reintentar,
      cambiarVistaDemo: controlador.cambiarVistaDemo,
    }),
    [actual, controlador],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}
