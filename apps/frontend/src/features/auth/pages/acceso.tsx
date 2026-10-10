import { useNavigate } from "react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { SiteLayout } from "@/components/layout/site-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";
import type { Role } from "@/types";

const telefono = z
  .string()
  .trim()
  .regex(/^[0-9]{4}[ -]?[0-9]{4}$/, "Ingresa un teléfono nicaragüense de 8 dígitos.");
const clave = z.string().min(6, "La contraseña debe tener al menos 6 caracteres.");

const esquemaIngreso = z.object({ telefono, clave });
const esquemaRegistro = z.object({
  nombre: z.string().trim().min(3, "Escribe tu nombre completo.").max(80, "Máximo 80 caracteres."),
  telefono,
  clave,
});

export default function Auth() {
  useDocumentHead({
    title: "Ingresar o crear cuenta | Artesanías de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Accede como comprador o artesano para gestionar solicitudes de pedidos artesanales en Masaya.",
      },
      { property: "og:title", content: "Ingresar o crear cuenta" },
      { property: "og:description", content: "Acceso simulado para comprador y artesano." },
      { property: "og:url", content: "/auth" },
    ],
    canonical: "/auth",
  });

  const { ingresar } = useSession();
  const navigate = useNavigate();
  const [rol, setRol] = useState<Role>("comprador");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [pass, setPass] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const entrar = (modo: "ingreso" | "registro") => (e: React.FormEvent) => {
    e.preventDefault();
    const datos =
      modo === "ingreso" ? { telefono: tel, clave: pass } : { nombre, telefono: tel, clave: pass };
    const r = (modo === "ingreso" ? esquemaIngreso : esquemaRegistro).safeParse(datos);
    if (!r.success) {
      const map: Record<string, string> = {};
      for (const issue of r.error.issues) map[String(issue.path[0])] = issue.message;
      setErrores(map);
      return;
    }
    setErrores({});
    ingresar(rol, modo === "registro" ? nombre : undefined);
    toast.success(modo === "ingreso" ? "Sesión iniciada" : "Cuenta creada");
    void navigate(rol === "artesano" ? "/panel" : "/catalogo");
  };

  const campoRol = (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Quiero entrar como</legend>
      <RadioGroup value={rol} onValueChange={(v) => setRol(v as Role)} className="gap-2">
        <div className="flex items-center gap-2">
          <RadioGroupItem id="rol-comprador" value="comprador" />
          <Label htmlFor="rol-comprador" className="font-normal">
            Comprador — solicito piezas a los talleres
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="rol-artesano" value="artesano" />
          <Label htmlFor="rol-artesano" className="font-normal">
            Artesano — gestiono mi taller y mis pedidos
          </Label>
        </div>
      </RadioGroup>
    </fieldset>
  );

  const campoTelefono = (idSuffix: string) => (
    <div className="space-y-2">
      <Label htmlFor={`tel-${idSuffix}`}>Teléfono *</Label>
      <Input
        id={`tel-${idSuffix}`}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className="min-h-11"
        placeholder="8555 1234"
        value={tel}
        onChange={(e) => setTel(e.target.value)}
        aria-invalid={!!errores["telefono"]}
        aria-describedby={errores["telefono"] ? `err-tel-${idSuffix}` : undefined}
      />
      {errores["telefono"] ? (
        <p id={`err-tel-${idSuffix}`} role="alert" className="text-sm text-destructive">
          {errores["telefono"]}
        </p>
      ) : null}
    </div>
  );

  const campoClave = (idSuffix: string) => (
    <div className="space-y-2">
      <Label htmlFor={`clave-${idSuffix}`}>Contraseña *</Label>
      <Input
        id={`clave-${idSuffix}`}
        type="password"
        autoComplete={idSuffix === "registro" ? "new-password" : "current-password"}
        className="min-h-11"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        aria-invalid={!!errores["clave"]}
        aria-describedby={errores["clave"] ? `err-clave-${idSuffix}` : undefined}
      />
      {errores["clave"] ? (
        <p id={`err-clave-${idSuffix}`} role="alert" className="text-sm text-destructive">
          {errores["clave"]}
        </p>
      ) : null}
    </div>
  );

  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="font-display text-3xl font-bold">Acceso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prototipo de demostración: los datos son simulados y no se envían a ningún servidor.
        </p>
        <p className="mt-3 rounded-lg border bg-surface p-3 text-sm text-muted-foreground">
          El selector «Vista de demostración» de la cabecera es una herramienta del prototipo para
          alternar entre las vistas de comprador y artesano. No inicia sesión ni verifica identidad:
          en el sistema real, el acceso se hace en esta pantalla y el rol lo asigna el servidor.
        </p>

        <Tabs defaultValue="ingreso" className="mt-8">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ingreso" className="min-h-11">
              Ingresar
            </TabsTrigger>
            <TabsTrigger value="registro" className="min-h-11">
              Crear cuenta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ingreso">
            <form
              onSubmit={entrar("ingreso")}
              noValidate
              className="space-y-5 rounded-xl border bg-card p-5"
            >
              {campoRol}
              {campoTelefono("ingreso")}
              {campoClave("ingreso")}
              <Button type="submit" className="w-full touch-target">
                Ingresar
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="registro">
            <form
              onSubmit={entrar("registro")}
              noValidate
              className="space-y-5 rounded-xl border bg-card p-5"
            >
              {campoRol}
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre completo *</Label>
                <Input
                  id="nombre"
                  autoComplete="name"
                  className="min-h-11"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  aria-invalid={!!errores["nombre"]}
                  aria-describedby={errores["nombre"] ? "err-nombre" : undefined}
                />
                {errores["nombre"] ? (
                  <p id="err-nombre" role="alert" className="text-sm text-destructive">
                    {errores["nombre"]}
                  </p>
                ) : null}
              </div>
              {campoTelefono("registro")}
              {campoClave("registro")}
              <Button type="submit" className="w-full touch-target">
                Crear cuenta
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </SiteLayout>
  );
}
