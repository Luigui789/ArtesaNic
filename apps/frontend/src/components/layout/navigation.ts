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
      { to: "/panel", label: "Mi taller", end: true },
      { to: "/panel/solicitudes", label: "Solicitudes" },
      { to: "/panel/pedidos", label: real ? "Pedidos" : "Pedidos de demo" },
      { to: "/panel/productos", label: "Productos" },
      ...(real ? [{ to: "/panel/inventario", label: "Inventario" }] : []),
      { to: "/panel/perfil", label: "Perfil del taller" },
      ...(!real
        ? [
            { to: "/mensajes", label: "Mensajes" },
            { to: "/notificaciones", label: "Notificaciones" },
          ]
        : []),
    ];
  return [
    { to: "/solicitudes", label: "Mis solicitudes" },
    { to: "/pedidos", label: real ? "Mis pedidos" : "Pedidos de demo" },
    ...(!real
      ? [
          { to: "/mensajes", label: "Mensajes" },
          { to: "/notificaciones", label: "Notificaciones" },
        ]
      : []),
  ];
}
