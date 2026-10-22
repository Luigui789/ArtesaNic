import { useForm } from "react-hook-form";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Campo } from "@/features/auth/components/campo";
import { useSession } from "@/features/auth/use-session";
import { erroresDeValidacion, esquemaTaller } from "@/features/auth/validacion";
import { ApiError } from "@/features/catalogo/api";
import { actualizarMiTaller, type TallerPropio } from "@/features/talleres/api";
import {
  aplicarTallerActualizado,
  cambiosDelPerfil,
  erroresDelPerfil,
  perfilEditableDe,
} from "@/features/talleres/perfil-propio";
import type { PerfilTallerEntrada } from "@/features/talleres/types";

type Props = { taller: TallerPropio; onTerminar: () => void };

/**
 * Edición del perfil público del taller (RF-008) con `PATCH /talleres/mi-taller/`.
 * Solo campos de `CAMPOS_PERFIL`; estado, motivo y revisión son de solo lectura y no
 * forman parte del formulario. El servidor valida y su `400` se muestra por campo.
 */
export function FormularioPerfilTaller({ taller, onTerminar }: Props) {
  const { usuario } = useSession();
  const queryClient = useQueryClient();
  const original = perfilEditableDe(taller);
  const formulario = useForm<PerfilTallerEntrada>({ defaultValues: original });
  const perfil = formulario.watch();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

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
    const r = esquemaTaller.safeParse(perfil);
    if (!r.success) {
      setErrores(erroresDeValidacion(r.error));
      return;
    }
    setErrores({});
    const cambios = cambiosDelPerfil(original, perfil);
    if (Object.keys(cambios).length === 0) {
      onTerminar();
      return;
    }
    guardar.mutate(cambios);
  };

  const comun = (k: keyof PerfilTallerEntrada, id: string) => ({
    id: `perfil-${id}`,
    valor: perfil[k],
    onCambio: campo(k),
    error: errores[k],
  });

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
        <Campo etiqueta="Nombre del taller *" {...comun("nombre", "nombre")} />
        <Campo etiqueta="Rubro *" {...comun("rubro", "rubro")} />
        <Campo
          etiqueta="Dirección completa *"
          autoComplete="street-address"
          {...comun("direccionCompleta", "direccion")}
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
      {general ? (
        <p role="alert" className="text-sm text-destructive">
          {general}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="touch-target" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="touch-target"
          onClick={onTerminar}
          disabled={guardar.isPending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
