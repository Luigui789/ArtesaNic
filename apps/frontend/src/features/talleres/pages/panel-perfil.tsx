import { ImageUploader } from "@/features/catalogo/components/image-uploader";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { SiteLayout } from "@/components/layout/site-layout";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_ARTISAN_ID } from "@/features/auth/api";
import { getArtisan, updateArtisan } from "@/features/talleres/api";
import { useSession } from "@/features/auth/use-session";
import { useDocumentHead } from "@/hooks/use-document-head";

const esquema = z.object({
  nombreTaller: z
    .string()
    .trim()
    .min(3, "Escribe el nombre del taller.")
    .max(80, "Máximo 80 caracteres."),
  responsable: z
    .string()
    .trim()
    .min(3, "Escribe el nombre del responsable.")
    .max(80, "Máximo 80 caracteres."),
  historia: z
    .string()
    .trim()
    .min(20, "Cuenta la historia del taller (mínimo 20 caracteres).")
    .max(800, "Máximo 800 caracteres."),
  ubicacion: z
    .string()
    .trim()
    .min(5, "Indica la ubicación del taller.")
    .max(120, "Máximo 120 caracteres."),
  horario: z
    .string()
    .trim()
    .min(5, "Indica el horario de atención.")
    .max(120, "Máximo 120 caracteres."),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9]{4}[ -]?[0-9]{4}$/, "Teléfono de 8 dígitos."),
  whatsapp: z
    .string()
    .trim()
    .regex(/^[0-9]{4}[ -]?[0-9]{4}$/, "WhatsApp de 8 dígitos."),
});

type Campos = z.infer<typeof esquema>;

const VACIO: Campos = {
  nombreTaller: "",
  responsable: "",
  historia: "",
  ubicacion: "",
  horario: "",
  telefono: "",
  whatsapp: "",
};

export default function PerfilTaller() {
  useDocumentHead({
    title: "Perfil del taller | Panel del artesano",
    meta: [
      {
        name: "description",
        content:
          "Actualiza la información pública de tu taller: historia, ubicación, horario y datos de contacto.",
      },
      { property: "og:title", content: "Perfil del taller | Panel del artesano" },
      { property: "og:description", content: "Perfilamiento del taller artesanal de Masaya." },
      { property: "og:url", content: "/panel/perfil" },
      { name: "robots", content: "noindex" },
    ],
    canonical: "/panel/perfil",
  });

  const { usuario } = useSession();
  const queryClient = useQueryClient();
  const artesanoId = usuario?.artesanoId ?? DEMO_ARTISAN_ID;

  const artesano = useQuery({
    queryKey: ["artesano", artesanoId],
    queryFn: () => getArtisan(artesanoId),
  });
  const [foto, setFoto] = useState("");
  const [portada, setPortada] = useState("");
  const [fotoBusy, setFotoBusy] = useState(false);
  const [portadaBusy, setPortadaBusy] = useState(false);
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!artesano.data) return;
    const a = artesano.data;
    setFoto(a.fotoUrl);
    setPortada(a.portadaUrl);
    setCampos({
      nombreTaller: a.nombreTaller,
      responsable: a.responsable,
      historia: a.historia,
      ubicacion: a.ubicacion,
      horario: a.horario,
      telefono: a.telefono,
      whatsapp: a.whatsapp,
    });
  }, [artesano.data]);

  const guardar = useMutation({
    mutationFn: (data: Campos) =>
      updateArtisan(artesanoId, { ...data, fotoUrl: foto, portadaUrl: portada }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast.success("Perfil del taller actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof Campos) => (v: string) => setCampos((c) => ({ ...c, [k]: v }));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = esquema.safeParse(campos);
    if (!r.success) {
      const map: Record<string, string> = {};
      for (const issue of r.error.issues) map[String(issue.path[0])] = issue.message;
      setErrores(map);
      return;
    }
    setErrores({});
    guardar.mutate(r.data);
  };

  const campo = (id: keyof Campos, label: string, tipo: "input" | "textarea" = "input") => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} *</Label>
      {tipo === "input" ? (
        <Input
          id={id}
          className="min-h-11"
          value={campos[id]}
          onChange={(e) => set(id)(e.target.value)}
          aria-invalid={!!errores[id]}
        />
      ) : (
        <Textarea
          id={id}
          rows={6}
          maxLength={800}
          value={campos[id]}
          onChange={(e) => set(id)(e.target.value)}
          aria-invalid={!!errores[id]}
        />
      )}
      {errores[id] ? (
        <p role="alert" className="text-sm text-destructive">
          {errores[id]}
        </p>
      ) : null}
    </div>
  );

  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/panel"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold">Perfil del taller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta información es la que ven los compradores en tu perfil público.
        </p>

        {artesano.isError ? (
          <div className="mt-8">
            <ErrorState onRetry={() => void artesano.refetch()} />
          </div>
        ) : artesano.isPending ? (
          <div className="mt-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <form
            onSubmit={enviar}
            noValidate
            className="mt-8 space-y-6 rounded-xl border bg-card p-5"
          >
            <ImageUploader
              label="Foto del taller"
              aspectRatio="1 / 1"
              value={foto}
              onChange={setFoto}
              onBusyChange={setFotoBusy}
            />
            <ImageUploader
              label="Imagen de portada"
              aspectRatio="4 / 1"
              value={portada}
              onChange={setPortada}
              onBusyChange={setPortadaBusy}
            />
            {campo("nombreTaller", "Nombre del taller")}
            {campo("responsable", "Persona responsable")}
            {campo("historia", "Historia del taller", "textarea")}
            {campo("ubicacion", "Ubicación")}
            {campo("horario", "Horario de atención")}
            <div className="grid gap-4 sm:grid-cols-2">
              {campo("telefono", "Teléfono")}
              {campo("whatsapp", "WhatsApp")}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="touch-target"
                disabled={guardar.isPending || fotoBusy || portadaBusy}
              >
                {guardar.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
              <Button asChild type="button" variant="outline" className="touch-target">
                <Link to={`/artesano/${artesanoId}`}>Ver perfil público</Link>
              </Button>
            </div>
          </form>
        )}
      </div>
    </SiteLayout>
  );
}
