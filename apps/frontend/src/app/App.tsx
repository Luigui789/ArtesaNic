import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { SessionProvider } from "@/features/auth/use-session";
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
import PanelPerfil from "@/features/talleres/pages/panel-perfil";
import PanelProductos from "@/features/catalogo/pages/panel-productos";
import PanelPedidosIndex from "@/features/pedidos/pages/panel-pedidos";
import PanelPedidosDetalle from "@/features/pedidos/pages/panel-pedido-detalle";

const queryClient = new QueryClient();

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
                  <Route path="/solicitar/:productId" element={<Solicitar />} />
                  <Route path="/solicitudes/nueva" element={<Solicitar />} />
                  <Route path="/solicitudes" element={<ListadoSolicitudes />} />
                  <Route path="/solicitudes/:id" element={<DetalleSolicitud />} />
                  <Route path="/panel/solicitudes" element={<ListadoSolicitudes recibidas />} />
                  <Route path="/panel/solicitudes/:id" element={<DetalleSolicitud recibidas />} />
                  <Route path="/pedidos" element={<PedidosIndex />} />
                  <Route path="/pedidos/:id" element={<PedidosDetalle />} />
                  <Route path="/mensajes" element={<Mensajes />} />
                  <Route path="/panel" element={<PanelIndex />} />
                  <Route path="/panel/perfil" element={<PanelPerfil />} />
                  <Route path="/panel/productos" element={<PanelProductos />} />
                  <Route path="/panel/pedidos" element={<PanelPedidosIndex />} />
                  <Route path="/panel/pedidos/:id" element={<PanelPedidosDetalle />} />
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
