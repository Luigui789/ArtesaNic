import type { Role } from "@/types";
import {
  Bell,
  Boxes,
  Home,
  Inbox,
  MessageCircle,
  Package,
  Store,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
export interface NavigationItem {
  to: string;
  label: string;
  end?: boolean;
  icon?: LucideIcon;
  secondary?: boolean;
}
export const PUBLIC_NAV: NavigationItem[] = [
  { to: "/catalogo", label: "Catálogo" },
  { to: "/descubrir", label: "Talleres y artesanías" },
  { to: "/ayuda", label: "Ayuda" },
];
export function navigationFor(rol: Role, real: boolean): NavigationItem[] {
  if (rol === "artesano")
    return [
      { to: "/panel", label: "Inicio", end: true, icon: Home },
      { to: "/panel/productos", label: "Productos", icon: ShoppingBag },
      { to: "/panel/pedidos", label: real ? "Pedidos" : "Pedidos de demo", icon: Package },
      { to: "/mensajes", label: "Mensajes", icon: MessageCircle },
      { to: "/panel/perfil", label: "Mi taller", icon: Store },
      { to: "/panel/solicitudes", label: "Solicitudes", icon: Inbox, secondary: true },
      ...(real
        ? [{ to: "/panel/inventario", label: "Inventario", icon: Boxes, secondary: true }]
        : []),
      { to: "/notificaciones", label: "Notificaciones", icon: Bell, secondary: true },
    ];
  return [
    { to: "/solicitudes", label: "Mis solicitudes", icon: Inbox },
    { to: "/pedidos", label: real ? "Mis pedidos" : "Pedidos de demo", icon: Package },
    { to: "/mensajes", label: "Mensajes", icon: MessageCircle },
    { to: "/notificaciones", label: "Notificaciones", icon: Bell, secondary: true },
  ];
}
