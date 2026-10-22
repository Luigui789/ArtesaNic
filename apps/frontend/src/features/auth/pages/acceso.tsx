import { Link, useNavigate, useSearchParams } from "react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/layout/site-layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession, type SesionUsuario } from "@/features/auth/use-session";
import { INICIO_POR_ROL, destinoTrasAcceso } from "@/features/auth/destino";
import { FormularioIngreso } from "@/features/auth/components/formulario-ingreso";
import { FormularioRegistro } from "@/features/auth/components/formulario-registro";
import { useDocumentHead } from "@/hooks/use-document-head";
import { ROLE_LABELS } from "@/lib/labels";

export default function Auth() {
  useDocumentHead({
    title: "Ingresar o crear cuenta | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Ingresa con tu teléfono y contraseña o crea una cuenta para comprar o vender artesanías de Masaya.",
      },
      { property: "og:title", content: "Ingresar o crear cuenta" },
      { property: "og:url", content: "/auth" },
    ],
    canonical: "/auth",
  });

  const { modo, estado, usuario } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pestana, setPestana] = useState(
    params.get("modo") === "registro" ? "registro" : "ingreso",
  );

  // El destino depende del rol que devolvió el servidor, no de lo elegido en la interfaz.
  const alIngresar = (u: SesionUsuario) => {
    toast.success(`Hola, ${u.nombre}`);
    void navigate(destinoTrasAcceso(u.rol, params.get("siguiente")), { replace: true });
  };
  const alRegistrar = (u: SesionUsuario) => {
    if (u.rol === "artesano")
      toast.success("Cuenta creada. Tu taller está pendiente de aprobación.");
    else toast.success("Cuenta creada");
    void navigate(destinoTrasAcceso(u.rol, params.get("siguiente")), { replace: true });
  };

  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="font-display text-3xl font-bold">Acceso</h1>
        {modo === "mock" ? (
          <p className="mt-3 rounded-lg border bg-surface p-3 text-sm text-muted-foreground">
            Modo de demostración: la sesión es simulada y no se envía a ningún servidor. El selector
            «Vista de demostración» de la cabecera alterna las vistas; en el sistema real el rol lo
            asigna el servidor.
          </p>
        ) : null}

        {modo === "real" && estado === "autenticada" && usuario ? (
          <section className="mt-8 space-y-4 rounded-xl border bg-card p-5" role="status">
            <p>
              Ya iniciaste sesión como <strong>{usuario.nombre}</strong> (
              {ROLE_LABELS[usuario.rol].toLowerCase()}).
            </p>
            <Button asChild className="touch-target">
              <Link to={INICIO_POR_ROL[usuario.rol]}>Continuar</Link>
            </Button>
          </section>
        ) : (
          <Tabs value={pestana} onValueChange={setPestana} className="mt-8">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ingreso" className="min-h-11">
                Ingresar
              </TabsTrigger>
              <TabsTrigger value="registro" className="min-h-11">
                Crear cuenta
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ingreso">
              <FormularioIngreso onExito={alIngresar} />
            </TabsContent>
            <TabsContent value="registro">
              <FormularioRegistro onExito={alRegistrar} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </SiteLayout>
  );
}
