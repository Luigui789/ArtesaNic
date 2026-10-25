/**
 * Controlador de la sesión, independiente de React (AUD-18). `SessionProvider` lo
 * expone con `useSyncExternalStore`; las pruebas lo usan sin navegador.
 *
 * Estados: `cargando` (arranque), `anonima`, `autenticada` y `error` (no se pudo
 * comprobar la sesión: red o servidor). Ninguno fabrica una identidad: el usuario
 * autenticado es el que devolvió el adaptador.
 *
 * Aislamiento entre cuentas: al iniciar o cerrar sesión, y cuando la sesión expira,
 * se cancelan las consultas en curso y se vacía toda la caché de TanStack Query
 * **antes** de publicar la identidad nueva. Así ninguna pantalla puede mostrar datos
 * de la cuenta anterior. Las lecturas públicas simplemente se vuelven a pedir.
 */
import { MENSAJE_SIN_CONEXION } from "@/lib/http";
import type { Role } from "@/types";
import type {
  Credenciales,
  RegistroArtesanoEntrada,
  RegistroCompradorEntrada,
  SesionUsuario,
} from "./types";

export type EstadoSesion =
  | { estado: "cargando"; usuario: null; error: null }
  | { estado: "anonima"; usuario: null; error: null }
  | { estado: "autenticada"; usuario: SesionUsuario; error: null }
  | { estado: "error"; usuario: null; error: string };

export interface AdaptadorSesion {
  restaurar(): Promise<SesionUsuario | null>;
  iniciarSesion(credenciales: Credenciales): Promise<SesionUsuario>;
  registrarComprador(entrada: RegistroCompradorEntrada): Promise<SesionUsuario>;
  registrarArtesano(entrada: RegistroArtesanoEntrada): Promise<SesionUsuario>;
  cerrarSesion(): Promise<void>;
  /** Aviso de sesión terminada por el servidor (renovación `401`). */
  alExpirar(oyente: () => void): () => void;
  /** Exclusivo de la demo: alterna la vista simulada. No existe en modo real. */
  cambiarVista?: (rol: Role) => SesionUsuario;
}

/** Lo que el controlador necesita de `QueryClient`. */
export interface CachePrivada {
  cancelQueries(): Promise<unknown>;
  clear(): void;
}

const CARGANDO: EstadoSesion = { estado: "cargando", usuario: null, error: null };
const ANONIMA: EstadoSesion = { estado: "anonima", usuario: null, error: null };

export function crearControladorSesion(adaptador: AdaptadorSesion, cache: CachePrivada) {
  let actual: EstadoSesion = CARGANDO;
  let iniciado = false;
  const suscriptores = new Set<() => void>();

  const publicar = (siguiente: EstadoSesion) => {
    actual = siguiente;
    for (const avisar of [...suscriptores]) avisar();
  };

  /** Vacía la caché antes de publicar otra identidad (o ninguna). */
  const limpiarCache = () => {
    void cache.cancelQueries().catch(() => undefined);
    cache.clear();
  };

  const autenticar = (usuario: SesionUsuario) => {
    limpiarCache();
    publicar({ estado: "autenticada", usuario, error: null });
    return usuario;
  };

  const restaurar = async () => {
    publicar(CARGANDO);
    try {
      const usuario = await adaptador.restaurar();
      if (usuario) publicar({ estado: "autenticada", usuario, error: null });
      else publicar(ANONIMA);
    } catch (error) {
      // Red caída o servidor con error: no se sabe si hay sesión, y no se inventa una.
      const mensaje =
        error instanceof Error && error.message ? error.message : MENSAJE_SIN_CONEXION;
      publicar({ estado: "error", usuario: null, error: mensaje });
    }
  };

  return {
    obtener: (): EstadoSesion => actual,

    suscribir(avisar: () => void): () => void {
      suscriptores.add(avisar);
      return () => {
        suscriptores.delete(avisar);
      };
    },

    /** Idempotente: el doble efecto de StrictMode no lanza dos renovaciones. */
    iniciar(): void {
      if (iniciado) return;
      iniciado = true;
      adaptador.alExpirar(() => {
        if (actual.estado === "autenticada") limpiarCache();
        if (actual.estado !== "anonima") publicar(ANONIMA);
      });
      void restaurar();
    },

    /** Tras un error de red en el arranque, vuelve a comprobar la sesión. */
    reintentar: () => restaurar(),

    iniciarSesion: async (credenciales: Credenciales) =>
      autenticar(await adaptador.iniciarSesion(credenciales)),

    registrarComprador: async (entrada: RegistroCompradorEntrada) =>
      autenticar(await adaptador.registrarComprador(entrada)),

    registrarArtesano: async (entrada: RegistroArtesanoEntrada) =>
      autenticar(await adaptador.registrarArtesano(entrada)),

    /**
     * Si el servidor no confirma el cierre, la sesión sigue abierta (la cookie de
     * renovación seguiría siendo válida) y el error llega a la interfaz.
     */
    async cerrarSesion(): Promise<void> {
      await adaptador.cerrarSesion();
      limpiarCache();
      publicar(ANONIMA);
    },

    cambiarVistaDemo: adaptador.cambiarVista
      ? (rol: Role) => {
          const usuario = adaptador.cambiarVista!(rol);
          publicar({ estado: "autenticada", usuario, error: null });
        }
      : null,
  };
}

export type ControladorSesion = ReturnType<typeof crearControladorSesion>;
