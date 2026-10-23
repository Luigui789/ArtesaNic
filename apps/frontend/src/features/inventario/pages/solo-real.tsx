import { Link } from "react-router";
import { SiteLayout } from "@/components/layout/site-layout";
import { PageContainer } from "@/components/common/page";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

/** La demo no simula inventario AUD-07: el acceso directo a sus rutas lo explica. */
export function InventarioSoloReal() {
  return (
    <SiteLayout>
      <PageContainer>
        <EmptyState
          titulo="Inventario disponible solo con tu cuenta real"
          descripcion="La demostración no registra existencias, reservas ni movimientos. Inicia sesión con el servidor de ArtesaNic para gestionar el inventario de tu taller."
          accion={
            <Button asChild variant="outline">
              <Link to="/panel/productos">Ver mis productos</Link>
            </Button>
          }
        />
      </PageContainer>
    </SiteLayout>
  );
}
