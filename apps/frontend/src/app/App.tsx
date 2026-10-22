import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { SessionProvider } from "@/features/auth/use-session";
import { authReal } from "@/features/auth/api";
import { RequiereSesion, SoloDemo } from "@/features/auth/components/requiere-sesion";
import { CurrencyProvider } from "@/hooks/use-currency";
import { NotificationsProvider } from "@/features/notificaciones/use-notifications";
import { Toaster } from "@/components/ui/sonner";
import { AppErrorBoundary } from "./error-boundary";
import { ScrollToTop } from "./scroll-to-top";
import { NotFound } from "./not-found";

import Index from "@/features/catalogo/pages/inicio";
import Auth from "@/features/auth/pages/acceso";
import Catalogo from "@/features/catalogo/pages/catalogo";
import Producto from "@/features/catalogo/pages/producto";
import Artesano from "@/features/talleres/pages/artesano";
import Solicitar from "@/features/solicitudes/pages/preparar";
import { ListadoSolicitudes, DetalleSolicitud } from "@/features/solicitudes/pages/consultas";
import PedidosIndex from "@/features/pedidos/pages/pedidos";
import PedidosDetalle from "@/features/pedidos/pages/pedido-detalle";
import Mensajes from "@/features/mensajes/pages/mensajes";
import PanelIndex from "@/features/talleres/pages/panel-inicio";
import PanelTaller from "@/features/talleres/pages/panel-taller";
import PanelPerfil from "@/features/talleres/pages/panel-perfil";
import PanelProductos from "@/features/catalogo/pages/panel-productos";
import PanelPedidosIndex from "@/features/pedidos/pages/panel-pedidos";
import PanelPedidosDetalle from "@/features/pedidos/pages/panel-pedido-detalle";

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CurrencyProvider>
          <NotificationsProvider>
            <BrowserRouter>
              <AppErrorBoundary>
                <ScrollToTop />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
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
                  <Route path="/pedidos" element={demo(<PedidosIndex />)} />
                  <Route path="/pedidos/:id" element={demo(<PedidosDetalle />)} />
                  <Route path="/mensajes" element={demo(<Mensajes />)} />
                  <Route
                    path="/panel"
                    element={artesano(authReal ? <PanelTaller /> : <PanelIndex />)}
                  />
                  <Route path="/panel/perfil" element={demo(<PanelPerfil />)} />
                  <Route path="/panel/productos" element={artesano(<PanelProductos />)} />
                  <Route path="/panel/pedidos" element={demo(<PanelPedidosIndex />)} />
                  <Route path="/panel/pedidos/:id" element={demo(<PanelPedidosDetalle />)} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppErrorBoundary>
            </BrowserRouter>
            <Toaster richColors position="top-center" />
          </NotificationsProvider>
        </CurrencyProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
