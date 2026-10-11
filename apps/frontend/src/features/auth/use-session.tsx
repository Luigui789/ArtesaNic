import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role } from "@/types";
import { DEMO_ARTISAN_ID, DEMO_ARTISAN_RESPONSABLE, DEMO_USER_ID } from "@/features/auth/api";

export interface SesionUsuario {
  id: number;
  nombre: string;
  telefono: string;
  rol: Role;
  artesanoId?: number;
}

/**
 * Los dos perfiles siguientes son **estados de sesión alternativos** del
 * prototipo, no dos personas usuarias simultáneas: comparten `DEMO_USER_ID`
 * a propósito, para poder demostrar ambas navegaciones con un solo dataset.
 * Esto no es el modelo de identidad del sistema real, donde cada cuenta tiene
 * un identificador único y el rol lo determina el backend (D-6).
 *
 * `id` identifica a la persona; `artesanoId`, al taller. No son el mismo dato.
 */
const COMPRADOR: SesionUsuario = {
  id: DEMO_USER_ID,
  nombre: "Ana Lucía Delgado",
  telefono: "8555 1234",
  rol: "comprador",
};

const ARTESANO: SesionUsuario = {
  id: DEMO_USER_ID,
  nombre: DEMO_ARTISAN_RESPONSABLE,
  telefono: "8777 9090",
  rol: "artesano",
  artesanoId: DEMO_ARTISAN_ID,
};

interface SessionContextValue {
  usuario: SesionUsuario | null;
  ingresar: (rol: Role, nombre?: string) => void;
  salir: () => void;
  cambiarRol: (rol: Role) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Clave versionada. La v1 guardaba identificadores de texto ("art-1") que hoy
 * entrarían en un tipo `number` sin que nada lo detecte, porque la lectura usa
 * una aserción y no valida. No se migra el objeto antiguo: convertirlo sería
 * fabricar una sesión aparentemente válida a partir de otro modelo de datos.
 */
const KEY = "masaya-artisan-connect.session.v2";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SesionUsuario | null>(null);

  // Se lee después de hidratar para evitar diferencias entre servidor y cliente.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setUsuario(raw ? (JSON.parse(raw) as SesionUsuario) : COMPRADOR);
    } catch {
      setUsuario(COMPRADOR);
    }
  }, []);

  const value = useMemo<SessionContextValue>(() => {
    const persist = (u: SesionUsuario | null) => {
      setUsuario(u);
      try {
        if (u) localStorage.setItem(KEY, JSON.stringify(u));
        else localStorage.removeItem(KEY);
      } catch {
        /* almacenamiento no disponible */
      }
    };
    return {
      usuario,
      ingresar: (rol, nombre) => {
        const base = rol === "artesano" ? ARTESANO : COMPRADOR;
        persist(nombre ? { ...base, nombre } : base);
      },
      salir: () => persist(null),
      cambiarRol: (rol) => persist(rol === "artesano" ? ARTESANO : COMPRADOR),
    };
  }, [usuario]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}
