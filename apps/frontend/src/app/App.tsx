import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { SessionProvider } from "@/features/auth/use-session";
import { authReal } from "@/features/auth/api";
import { RequiereSesion, SoloDemo } from "@/features/auth/components/requiere-sesion";
import { CurrencyProvider } from "@/hooks/use-currency";
import { NotificationsProvider } from "@/features/notificaciones/use-notifications-demo";
import { Toaster } from "@/components/ui/sonner";
import { LoadingState } from "@/components/common/states";
import { AppErrorBoundary } from "./error-boundary";
import { ScrollToTop } from "./scroll-to-top";
import { NotFound } from "./not-found";

import Home from "@/routes/home";
import Ayuda from "@/routes/ayuda";
import Index from "@/features/catalogo/pages/inicio";
import Auth from "@/features/auth/pages/acceso";
import Cuenta from "@/features/auth/pages/cuenta";
import Catalogo from "@/features/catalogo/pages/catalogo";
import Producto from "@/features/catalogo/pages/producto";
import Artesano from "@/features/talleres/pages/artesano";
import Solicitar from "@/features/solicitudes/pages/preparar";
import { ListadoSolicitudes, DetalleSolicitud } from "@/features/solicitudes/pages/consultas";
import {
  ListadoPedidosConfirmados,
  DetallePedidoConfirmado,
} from "@/features/pedidos/pages/confirmados";
import { ListadoInventario, DetalleInventario } from "@/features/inventario/pages/inventario";
import { InventarioSoloReal } from "@/features/inventario/pages/solo-real";
import PanelIndex from "@/features/talleres/pages/panel-inicio";
import PanelResumen from "@/features/talleres/pages/panel-resumen";
import PanelTaller from "@/features/talleres/pages/panel-taller";
import PanelPerfil from "@/features/talleres/pages/panel-perfil";
import PanelProductos from "@/features/catalogo/pages/panel-productos";

/** Pantallas de la demo antigua: se cargan de forma diferida. */
const PedidosIndex = lazy(() => import("@/features/pedidos/pages/pedidos"));
const PedidosDetalle = lazy(() => import("@/features/pedidos/pages/pedido-detalle"));
const Notificaciones = lazy(() => import("@/features/notificaciones/pages/notificaciones"));
const NotificacionesDemo = lazy(
  () => import("@/features/notificaciones/pages/notificaciones-demo"),
);
const Mensajes = lazy(() => import("@/features/mensajes/pages/mensajes"));
const PanelPedidosIndex = lazy(() => import("@/features/pedidos/pages/panel-pedidos"));
const PanelPedidosDetalle = lazy(() => import("@/features/pedidos/pages/panel-pedido-detalle"));

const queryClient = new QueryClient();

/**
 * Rutas privadas: el guard es de UX y solo actúa con la sesión real; el servidor vuelve
 * a comprobar sesión, rol y taller aprobado en cada petición. Las pantallas que siguen
 * simuladas con la identidad de la demo se envuelven en `SoloDemo`.
 */
const comprador = (pagina: React.ReactNode) => (
  <RequiereSesion rol="comprador">{pagina}</RequiereSesion>
);
const artesano = (pagina: React.ReactNode) => (
  <RequiereSesion rol="artesano">{pagina}</RequiereSesion>
);
const demo = (pagina: React.ReactNode) => <SoloDemo>{pagina}</SoloDemo>;

function ProveedorNotificacionesSegunModo({ children }: { children: React.ReactNode }) {
  return authReal ? <>{children}</> : <NotificationsProvider>{children}</NotificationsProvider>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CurrencyProvider>
          <ProveedorNotificacionesSegunModo>
            <BrowserRouter>
              <AppErrorBoundary>
                <ScrollToTop />
                <Suspense
                  fallback={
                    <div className="mx-auto max-w-5xl px-4 py-12">
                      <LoadingState label="Abriendo página…" />
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/descubrir" element={<Index />} />
                    <Route path="/ayuda" element={<Ayuda />} />
                    <Route path="/auth" element={<Auth />} />
                    {/* Cuenta personal, de cualquier rol; distinta del perfil del taller. */}
                    <Route
                      path="/cuenta"
                      element={
                        <RequiereSesion>
                          <Cuenta />
                        </RequiereSesion>
                      }
                    />
                    <Route path="/catalogo" element={<Catalogo />} />
                    <Route path="/producto/:id" element={<Producto />} />
                    <Route path="/artesano/:id" element={<Artesano />} />
                    <Route path="/solicitar/:productId" element={comprador(<Solicitar />)} />
                    <Route path="/solicitudes/nueva" element={comprador(<Solicitar />)} />
                    <Route path="/solicitudes" element={comprador(<ListadoSolicitudes />)} />
                    <Route path="/solicitudes/:id" element={comprador(<DetalleSolicitud />)} />
                    <Route
                      path="/panel/solicitudes"
                      element={artesano(<ListadoSolicitudes recibidas />)}
                    />
                    <Route
                      path="/panel/solicitudes/:id"
                      element={artesano(<DetalleSolicitud recibidas />)}
                    />
                    <Route
                      path="/pedidos"
                      element={
                        authReal ? comprador(<ListadoPedidosConfirmados />) : demo(<PedidosIndex />)
                      }
                    />
                    <Route
                      path="/pedidos/:id"
                      element={
                        authReal ? comprador(<DetallePedidoConfirmado />) : demo(<PedidosDetalle />)
                      }
                    />
                    <Route
                      path="/mensajes"
                      element={
                        authReal ? (
                          <RequiereSesion>
                            <Mensajes />
                          </RequiereSesion>
                        ) : (
                          demo(<Mensajes />)
                        )
                      }
                    />
                    <Route
                      path="/notificaciones"
                      element={
                        authReal ? (
                          <RequiereSesion>
                            <Notificaciones />
                          </RequiereSesion>
                        ) : (
                          demo(<NotificacionesDemo />)
                        )
                      }
                    />
                    <Route
                      path="/panel"
                      element={artesano(authReal ? <PanelResumen /> : <PanelIndex />)}
                    />
                    <Route
                      path="/panel/perfil"
                      element={
                        authReal ? artesano(<PanelTaller editarAlAbrir />) : demo(<PanelPerfil />)
                      }
                    />
                    <Route
                      path="/panel/inventario"
                      element={artesano(authReal ? <ListadoInventario /> : <InventarioSoloReal />)}
                    />
                    <Route
                      path="/panel/inventario/:productoId"
                      element={artesano(authReal ? <DetalleInventario /> : <InventarioSoloReal />)}
                    />
                    <Route path="/panel/productos" element={artesano(<PanelProductos />)} />
                    <Route
                      path="/panel/pedidos"
                      element={
                        authReal
                          ? artesano(<ListadoPedidosConfirmados recibidos />)
                          : demo(<PanelPedidosIndex />)
                      }
                    />
                    <Route
                      path="/panel/pedidos/:id"
                      element={
                        authReal
                          ? artesano(<DetallePedidoConfirmado recibido />)
                          : demo(<PanelPedidosDetalle />)
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AppErrorBoundary>
            </BrowserRouter>
            <Toaster richColors position="top-center" />
          </ProveedorNotificacionesSegunModo>
        </CurrencyProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
