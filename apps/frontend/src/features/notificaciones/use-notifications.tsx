import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { listOrders } from "@/features/pedidos/api";
import { pollNewMessages } from "@/features/mensajes/api";
import { DEMO_ARTISAN_ID } from "@/features/auth/api";
import { chatMode } from "@/lib/order-state";
import { useSession } from "@/features/auth/use-session";

/** RNF-010: notificaciones simuladas por sondeo periódico. */
const POLL_MS = 20000;

export interface NotificacionMensaje {
  pedidoId: number;
  codigo: string;
  autorNombre: string;
  texto: string;
  fecha: string;
}

interface NotificationsContextValue {
  /**
   * Mensajes no leídos por pedido. La clave es el identificador del pedido:
   * `Record<number, …>` no es exigido por el compilador (TypeScript admite
   * índice numérico sobre firma de texto), pero el tipo debe decir la verdad.
   */
  noLeidos: Record<number, number>;
  /** Total de mensajes no leídos. */
  total: number;
  /** Últimas notificaciones recibidas (más recientes primero). */
  recientes: NotificacionMensaje[];
  marcarLeido: (pedidoId: number) => void;
  marcarTodoLeido: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { usuario } = useSession();
  const rol = usuario?.rol ?? "comprador";
  const [noLeidos, setNoLeidos] = useState<Record<number, number>>({});
  const [recientes, setRecientes] = useState<NotificacionMensaje[]>([]);
  const desde = useRef<Record<number, string>>({});
  const inicio = useRef<string>(new Date().toISOString());

  // Al cambiar de rol se reinician los contadores de la sesión simulada.
  useEffect(() => {
    setNoLeidos({});
    setRecientes([]);
    desde.current = {};
    inicio.current = new Date().toISOString();
  }, [rol]);

  useEffect(() => {
    let cancelado = false;

    const revisar = async () => {
      try {
        const pedidos = await listOrders(
          rol === "artesano" ? { rol, artesanoId: DEMO_ARTISAN_ID } : { rol },
        );
        const activos = pedidos.filter((o) => chatMode(o.estado) === "active");
        for (const pedido of activos) {
          if (cancelado) return;
          const marca = desde.current[pedido.id] ?? inicio.current;
          const nuevos = await pollNewMessages(pedido.id, marca);
          const ajenos = nuevos.filter((m) => m.autor !== rol);
          const ultimo = nuevos.at(-1);
          if (ultimo) desde.current[pedido.id] = ultimo.fecha;
          if (cancelado || ajenos.length === 0) continue;

          setNoLeidos((prev) => ({
            ...prev,
            [pedido.id]: (prev[pedido.id] ?? 0) + ajenos.length,
          }));
          const nota = ajenos.at(-1)!;
          setRecientes((prev) =>
            [
              {
                pedidoId: pedido.id,
                codigo: pedido.codigo,
                autorNombre: nota.autorNombre,
                texto: nota.texto,
                fecha: nota.fecha,
              },
              ...prev,
            ].slice(0, 10),
          );
          toast.message(`Nuevo mensaje en ${pedido.codigo}`, {
            description: nota.texto,
          });
        }
      } catch {
        /* el sondeo simulado puede fallar: se reintenta en el siguiente ciclo */
      }
    };

    const id = setInterval(() => void revisar(), POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [rol]);

  const marcarLeido = useCallback((pedidoId: number) => {
    setNoLeidos((prev) => {
      if (!prev[pedidoId]) return prev;
      const next = { ...prev };
      delete next[pedidoId];
      return next;
    });
    setRecientes((prev) => prev.filter((n) => n.pedidoId !== pedidoId));
  }, []);

  const marcarTodoLeido = useCallback(() => {
    setNoLeidos({});
    setRecientes([]);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      noLeidos,
      total: Object.values(noLeidos).reduce((a, b) => a + b, 0),
      recientes,
      marcarLeido,
      marcarTodoLeido,
    }),
    [noLeidos, recientes, marcarLeido, marcarTodoLeido],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  return ctx;
}
