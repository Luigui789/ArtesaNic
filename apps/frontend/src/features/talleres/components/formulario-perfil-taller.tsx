import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Campo } from "@/features/auth/components/campo";
import { useSession } from "@/features/auth/use-session";
import { erroresDeValidacion, esquemaTaller } from "@/features/auth/validacion";
import { ApiError } from "@/features/catalogo/api";
import { FOTOGRAFIA_ACCEPT, errorFotografia } from "@/features/catalogo/imagenes";
import { actualizarMiTaller, type TallerPropio } from "@/features/talleres/api";
import { SeccionUbicacionTaller } from "@/features/talleres/components/seccion-ubicacion-taller";
import {
  aplicarTallerActualizado,
  cambiosDelFormulario,
  erroresDelPerfil,
  perfilEditableDe,
} from "@/features/talleres/perfil-propio";
import type { PerfilTallerEntrada } from "@/features/talleres/types";
import { estadoUbicacionDe, type EstadoUbicacion } from "@/features/talleres/ubicacion";

type Props = { taller: TallerPropio; onTerminar: () => void };

/**
 * Edición del perfil público del taller (RF-008) con `PATCH /talleres/mi-taller/`.
 * Permite actualizar también `imagen_perfil` e `imagen_portada` de forma independiente,
 * y la ubicación del taller en el mapa (FEAT-GEO-02): mover el pin solo cambia el estado
 * local; todo viaja en el mismo `PATCH` al guardar, y «Cancelar» lo descarta.
 * Estado, motivo y revisión son de solo lectura y no forman parte del formulario.
 */
export function FormularioPerfilTaller({ taller, onTerminar }: Props) {
  const { usuario } = useSession();
  const queryClient = useQueryClient();
  const original = perfilEditableDe(taller);
  const formulario = useForm<PerfilTallerEntrada>({ defaultValues: original });
  const perfil = formulario.watch();
  const [imagenPerfil, setImagenPerfil] = useState<File | undefined>(undefined);
  const [imagenPortada, setImagenPortada] = useState<File | undefined>(undefined);
  const [previewPerfil, setPreviewPerfil] = useState<string | undefined>(undefined);
  const [previewPortada, setPreviewPortada] = useState<string | undefined>(undefined);
  const [errorLocalPerfil, setErrorLocalPerfil] = useState<string | undefined>(undefined);
  const [errorLocalPortada, setErrorLocalPortada] = useState<string | undefined>(undefined);
  const ubicacionGuardada = estadoUbicacionDe(taller);
  const [ubicacion, setUbicacion] = useState<EstadoUbicacion>(() => ({
    ubicacion: ubicacionGuardada.ubicacion,
    publica: ubicacionGuardada.publica,
  }));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!imagenPerfil) {
      setPreviewPerfil(undefined);
      return;
    }
    const url = URL.createObjectURL(imagenPerfil);
    setPreviewPerfil(url);
    return () => URL.revokeObjectURL(url);
  }, [imagenPerfil]);

  useEffect(() => {
    if (!imagenPortada) {
      setPreviewPortada(undefined);
      return;
    }
    const url = URL.createObjectURL(imagenPortada);
    setPreviewPortada(url);
    return () => URL.revokeObjectURL(url);
  }, [imagenPortada]);

  const guardar = useMutation({
    mutationFn: actualizarMiTaller,
    onSuccess: (actualizado) => {
      aplicarTallerActualizado(queryClient, usuario?.id, actualizado);
      toast.success("Perfil del taller actualizado");
      onTerminar();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        const fallo = erroresDelPerfil(error.campos);
        setErrores(fallo.campos);
        setGeneral(fallo.general);
      } else setGeneral(error.message);
    },
  });

  const campo = (k: keyof PerfilTallerEntrada) => (v: string) =>
    formulario.setValue(k, v, { shouldDirty: true });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (guardar.isPending) return;
    setGeneral(null);
    if (errorLocalPerfil || errorLocalPortada) return;
    const r = esquemaTaller.safeParse(perfil);
    if (!r.success) {
      setErrores(erroresDeValidacion(r.error));
      return;
    }
    setErrores({});
    const payload = cambiosDelFormulario({
      original,
      editado: perfil,
      ubicacionGuardada,
      ubicacion,
      imagenPerfil,
      imagenPortada,
    });
    if (Object.keys(payload).length === 0) {
      onTerminar();
      return;
    }
    guardar.mutate(payload);
  };

  const comun = (k: keyof PerfilTallerEntrada, id: string) => ({
    id: `perfil-${id}`,
    valor: perfil[k],
    onCambio: campo(k),
    error: errores[k],
  });

  const urlPerfilMostrada = previewPerfil ?? taller.imagenPerfil ?? taller.demo?.fotoUrl;
  const urlPortadaMostrada = previewPortada ?? taller.imagenPortada ?? taller.demo?.portadaUrl;
  const mensajeErrorPerfil = errorLocalPerfil ?? errores["imagenPerfil"];
  const mensajeErrorPortada = errorLocalPortada ?? errores["imagenPortada"];

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-label="Editar perfil del taller"
      className="space-y-4 rounded-xl border bg-card p-5"
    >
      <h2 className="font-semibold">Editar perfil del taller</h2>
      <p className="text-sm text-muted-foreground">
        Editar estos datos no cambia el estado de aprobación del taller.
      </p>
      <fieldset disabled={guardar.isPending} className="space-y-4">
        <div className="grid gap-6 rounded-xl border bg-surface/40 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="perfil-imagen-perfil">Cambiar imagen de perfil</Label>
            <p id="perfil-imagen-perfil-ayuda" className="text-xs text-muted-foreground">
              Logo o imagen cuadrada del taller (JPEG, PNG o WebP, máx. 5 MiB). Si no eliges archivo
              se conserva la actual.
            </p>
            <div className="flex items-center gap-3">
              {urlPerfilMostrada ? (
                <img
                  src={urlPerfilMostrada}
                  alt={`Vista previa de imagen de perfil de ${taller.nombre}`}
                  className="size-20 shrink-0 rounded-xl border bg-surface object-cover"
                />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border bg-surface text-muted-foreground">
                  <Store className="size-8" aria-hidden="true" />
                </div>
              )}
              {imagenPerfil ? (
                <span className="text-xs font-medium text-secondary">
                  Nueva imagen seleccionada
                </span>
              ) : null}
            </div>
            <Input
              id="perfil-imagen-perfil"
              type="file"
              accept={FOTOGRAFIA_ACCEPT}
              aria-invalid={!!mensajeErrorPerfil}
              aria-describedby="perfil-imagen-perfil-ayuda perfil-imagen-perfil-error"
              onChange={(event) => {
                const file = event.target.files?.[0];
                const invalida = file ? errorFotografia(file) : undefined;
                setErrorLocalPerfil(invalida);
                setImagenPerfil(invalida ? undefined : file);
                if (invalida) event.target.value = "";
              }}
            />
            {mensajeErrorPerfil ? (
              <p id="perfil-imagen-perfil-error" role="alert" className="text-xs text-destructive">
                {mensajeErrorPerfil}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="perfil-imagen-portada">Cambiar imagen de portada</Label>
            <p id="perfil-imagen-portada-ayuda" className="text-xs text-muted-foreground">
              Imagen horizontal de cabecera (JPEG, PNG o WebP, máx. 5 MiB). Si no eliges archivo se
              conserva la actual.
            </p>
            <div className="aspect-[3/1] w-full overflow-hidden rounded-xl border bg-surface">
              {urlPortadaMostrada ? (
                <img
                  src={urlPortadaMostrada}
                  alt={`Vista previa de portada de ${taller.nombre}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sin imagen de portada
                </div>
              )}
            </div>
            {imagenPortada ? (
              <p className="text-xs font-medium text-secondary">Nueva portada seleccionada</p>
            ) : null}
            <Input
              id="perfil-imagen-portada"
              type="file"
              accept={FOTOGRAFIA_ACCEPT}
              aria-invalid={!!mensajeErrorPortada}
              aria-describedby="perfil-imagen-portada-ayuda perfil-imagen-portada-error"
              onChange={(event) => {
                const file = event.target.files?.[0];
                const invalida = file ? errorFotografia(file) : undefined;
                setErrorLocalPortada(invalida);
                setImagenPortada(invalida ? undefined : file);
                if (invalida) event.target.value = "";
              }}
            />
            {mensajeErrorPortada ? (
              <p id="perfil-imagen-portada-error" role="alert" className="text-xs text-destructive">
                {mensajeErrorPortada}
              </p>
            ) : null}
          </div>
        </div>

        <Campo etiqueta="Nombre del taller *" {...comun("nombre", "nombre")} />
        <Campo etiqueta="Rubro *" {...comun("rubro", "rubro")} />
        <Campo
          etiqueta="Dirección completa *"
          autoComplete="street-address"
          {...comun("direccionCompleta", "direccion")}
        />
        <SeccionUbicacionTaller
          value={ubicacion}
          onChange={setUbicacion}
          invalida={ubicacionGuardada.invalida}
          error={errores["ubicacion"]}
          disabled={guardar.isPending}
        />
        <Campo etiqueta="Historia del taller" multilinea {...comun("historia", "historia")} />
        <Campo etiqueta="Horario de atención" {...comun("horario", "horario")} />
        <p className="text-sm text-muted-foreground">
          Contactos públicos (opcionales). Tu teléfono de acceso no se publica; deja un campo vacío
          para retirarlo.
        </p>
        <Campo
          etiqueta="Teléfono público"
          type="tel"
          inputMode="tel"
          {...comun("telefonoPublico", "telefono")}
        />
        <Campo
          etiqueta="WhatsApp público"
          type="tel"
          inputMode="tel"
          {...comun("whatsappPublico", "whatsapp")}
        />
        <Campo etiqueta="Facebook" type="url" {...comun("facebookUrl", "facebook")} />
        <Campo etiqueta="Instagram" type="url" {...comun("instagramUrl", "instagram")} />
        <Campo etiqueta="Sitio web" type="url" {...comun("sitioWeb", "sitio-web")} />
      </fieldset>
      <PieFormulario
        guardando={guardar.isPending}
        conImagenes={!!(imagenPerfil || imagenPortada)}
        general={general}
        onCancelar={onTerminar}
      />
    </form>
  );
}

/** Estado del guardado, error general y acciones del formulario. */
function PieFormulario({
  guardando,
  conImagenes,
  general,
  onCancelar,
}: {
  guardando: boolean;
  conImagenes: boolean;
  general: string | null;
  onCancelar: () => void;
}) {
  return (
    <>
      {guardando ? (
        <p role="status" className="text-sm text-muted-foreground">
          {conImagenes ? "Subiendo imágenes y guardando cambios…" : "Guardando cambios…"}
        </p>
      ) : null}
      {general ? (
        <p role="alert" className="text-sm text-destructive">
          {general}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="touch-target" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="touch-target"
          onClick={onCancelar}
          disabled={guardando}
        >
          Cancelar
        </Button>
      </div>
    </>
  );
}
