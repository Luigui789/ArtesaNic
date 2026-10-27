import type { Role } from "@/types";
export interface NavigationItem {
  to: string;
  label: string;
  end?: boolean;
}
export const PUBLIC_NAV: NavigationItem[] = [
  { to: "/catalogo", label: "Catálogo" },
  { to: "/descubrir", label: "Talleres y artesanías" },
  { to: "/ayuda", label: "Ayuda" },
];
export function navigationFor(rol: Role, real: boolean): NavigationItem[] {
  if (rol === "artesano")
    return [
      { to: "/panel", label: "Resumen", end: true },
      { to: "/panel/solicitudes", label: "Solicitudes" },
      { to: "/panel/pedidos", label: real ? "Pedidos" : "Pedidos de demo" },
      { to: "/panel/productos", label: "Productos" },
      ...(real ? [{ to: "/panel/inventario", label: "Inventario" }] : []),
      { to: "/panel/perfil", label: "Perfil del taller" },
      { to: "/mensajes", label: "Mensajes" },
      { to: "/notificaciones", label: "Notificaciones" },
    ];
  return [
    { to: "/solicitudes", label: "Mis solicitudes" },
    { to: "/pedidos", label: real ? "Mis pedidos" : "Pedidos de demo" },
    { to: "/mensajes", label: "Mensajes" },
    { to: "/notificaciones", label: "Notificaciones" },
  ];
}
