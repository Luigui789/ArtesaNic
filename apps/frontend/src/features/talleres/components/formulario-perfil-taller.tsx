import { useForm } from "react-hook-form";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/common/confirm-action";
import { Button } from "@/components/ui/button";
import { Campo } from "@/features/auth/components/campo";
import { useSession } from "@/features/auth/use-session";
import { erroresDeValidacion, esquemaTaller } from "@/features/auth/validacion";
import { ApiError } from "@/features/catalogo/api";
import { actualizarMiTaller, type TallerPropio } from "@/features/talleres/api";
import { CampoImagenTaller } from "@/features/talleres/components/campo-imagen-taller";
import { SeccionUbicacionTaller } from "@/features/talleres/components/seccion-ubicacion-taller";
import {
  aplicarTallerActualizado,
  cambiosDelFormulario,
  erroresDelPerfil,
  perfilEditableDe,
} from "@/features/talleres/perfil-propio";
import type { PerfilTallerEntrada } from "@/features/talleres/types";
import { estadoUbicacionDe, type EstadoUbicacion } from "@/features/talleres/ubicacion";
import { useEnfocarPrimerError } from "@/hooks/use-enfocar-primer-error";

/** Cómo terminó la edición, para que la página lo confirme. */
export type FinEdicion = "guardado" | "sin-cambios" | "cancelado";

type Props = { taller: TallerPropio; onTerminar: (fin: FinEdicion) => void };

/**
 * Edición del perfil público del taller (RF-008) con `PATCH /talleres/mi-taller/`.
 * Las secciones son solo visuales: perfil, imágenes (`imagen_perfil`, `imagen_portada`)
 * y ubicación (FEAT-GEO-02) viajan en un único `PATCH` al pulsar «Guardar cambios»;
 * mover el pin solo cambia el estado local y «Cancelar» lo descarta.
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
  const [errorLocalPerfil, setErrorLocalPerfil] = useState<string | undefined>(undefined);
  const [errorLocalPortada, setErrorLocalPortada] = useState<string | undefined>(undefined);
  const ubicacionGuardada = estadoUbicacionDe(taller);
  const [ubicacion, setUbicacion] = useState<EstadoUbicacion>(() => ({
    ubicacion: ubicacionGuardada.ubicacion,
    publica: ubicacionGuardada.publica,
  }));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const contenedor = useRef<HTMLFormElement>(null);
  const enfocarError = useEnfocarPrimerError(contenedor);

  const guardar = useMutation({
    mutationFn: actualizarMiTaller,
    onSuccess: (actualizado) => {
      aplicarTallerActualizado(queryClient, usuario?.id, actualizado);
      toast.success("Perfil del taller actualizado");
      onTerminar("guardado");
    },
    // Ante cualquier fallo el formulario sigue montado: textos, imágenes y pin se conservan.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        const fallo = erroresDelPerfil(error.campos);
        setErrores(fallo.campos);
        setGeneral(fallo.general);
        enfocarError();
      } else setGeneral(error.message);
    },
  });

  const cambios = cambiosDelFormulario({
    original,
    editado: perfil,
    ubicacionGuardada,
    ubicacion,
    imagenPerfil,
    imagenPortada,
  });
  const hayCambios = Object.keys(cambios).length > 0;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (guardar.isPending) return;
    setGeneral(null);
    const r = esquemaTaller.safeParse(perfil);
    if (!r.success) {
      setErrores(erroresDeValidacion(r.error));
      setGeneral("Revisa los campos marcados.");
      enfocarError();
      return;
    }
    setErrores({});
    if (!hayCambios) {
      onTerminar("sin-cambios");
      return;
    }
    guardar.mutate(cambios);
  };

  const comun = (k: keyof PerfilTallerEntrada, id: string) => ({
    id: `perfil-${id}`,
    valor: perfil[k],
    onCambio: (v: string) => {
      formulario.setValue(k, v, { shouldDirty: true });
      // Al corregir un campo su error deja de mostrarse; el resto sigue a la vista.
      if (!(k in errores)) return;
      const { [k]: _corregido, ...resto } = errores;
      setErrores(resto);
      if (Object.keys(resto).length === 0) setGeneral(null);
    },
    error: errores[k],
  });

  return (
    <form
      ref={contenedor}
      onSubmit={enviar}
      noValidate
      aria-label="Editar perfil del taller"
      className="rounded-xl border bg-card"
    >
      <div className="space-y-2 p-5">
        <h2 id="perfil-titulo" className="font-semibold">
          Editar perfil del taller
        </h2>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Lo que completes aquí se mostrará a los compradores en el perfil público del taller
            {taller.estado === "aprobado" ? "" : " cuando la administración lo apruebe"}. La
            ubicación en el mapa solo se muestra si lo activas.
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          Nombre, rubro y dirección son obligatorios. Editar estos datos no cambia el estado de
          aprobación del taller.
        </p>
      </div>
      <fieldset disabled={guardar.isPending} className="min-w-0 space-y-8 px-5 pb-5">
        <Seccion id="perfil-identidad" titulo="Identidad del taller">
          <Campo
            etiqueta="Nombre del taller"
            requerido
            maxLength={120}
            {...comun("nombre", "nombre")}
          />
          <Campo
            etiqueta="Rubro"
            requerido
            maxLength={80}
            ayuda="Qué elaboran. Por ejemplo: cerámica, hamacas, madera."
            {...comun("rubro", "rubro")}
          />
        </Seccion>

        <Seccion id="perfil-presentacion" titulo="Presentación">
          <Campo
            etiqueta="Historia del taller"
            multilinea
            filas={5}
            opcional
            maxLength={2000}
            ayuda="Cuenta brevemente qué elaboran y la historia de tu taller."
            {...comun("historia", "historia")}
          />
          <Campo
            etiqueta="Horario de atención"
            opcional
            maxLength={200}
            ayuda="Por ejemplo: lunes a sábado, de 8:00 a 17:00."
            {...comun("horario", "horario")}
          />
        </Seccion>

        <Seccion
          id="perfil-imagenes"
          titulo="Fotos"
          descripcion="JPEG, PNG o WebP de hasta 5 MiB. Si no eliges otra, se conserva la actual."
        >
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <CampoImagenTaller
              id="perfil-imagen-perfil"
              etiqueta="Foto del taller"
              ayuda="Logo o foto cuadrada que identifica al taller."
              forma="cuadrada"
              actual={taller.imagenPerfil ?? taller.demo?.fotoUrl}
              alt={`Foto del taller ${taller.nombre}`}
              archivo={imagenPerfil}
              onArchivo={setImagenPerfil}
              error={errorLocalPerfil ?? errores["imagenPerfil"]}
              onErrorLocal={setErrorLocalPerfil}
              disabled={guardar.isPending}
            />
            <CampoImagenTaller
              id="perfil-imagen-portada"
              etiqueta="Imagen de portada"
              ayuda="Imagen horizontal que aparece arriba del perfil."
              forma="portada"
              actual={taller.imagenPortada ?? taller.demo?.portadaUrl}
              alt={`Portada del taller ${taller.nombre}`}
              archivo={imagenPortada}
              onArchivo={setImagenPortada}
              error={errorLocalPortada ?? errores["imagenPortada"]}
              onErrorLocal={setErrorLocalPortada}
              disabled={guardar.isPending}
            />
          </div>
        </Seccion>

        <Seccion id="perfil-direccion" titulo="Dirección">
          <Campo
            etiqueta="Dirección completa"
            autoComplete="street-address"
            requerido
            maxLength={255}
            ayuda="Barrio, calle y una referencia para llegar. Se muestra en el perfil público."
            {...comun("direccionCompleta", "direccion")}
          />
          <SeccionUbicacionTaller
            value={ubicacion}
            onChange={setUbicacion}
            invalida={ubicacionGuardada.invalida}
            error={errores["ubicacion"]}
            disabled={guardar.isPending}
          />
        </Seccion>

        <Seccion
          id="perfil-contacto"
          titulo="Contacto público"
          descripcion="Solo se publica lo que escribas aquí. El teléfono con el que inicias sesión no se muestra. Deja un campo vacío para quitarlo del perfil."
        >
          <Campo
            etiqueta="Teléfono de contacto"
            type="tel"
            inputMode="tel"
            opcional
            {...comun("telefonoPublico", "telefono")}
          />
          <Campo
            etiqueta="WhatsApp"
            type="tel"
            inputMode="tel"
            opcional
            {...comun("whatsappPublico", "whatsapp")}
          />
          <Campo
            etiqueta="Facebook"
            type="url"
            inputMode="url"
            opcional
            placeholder="https://facebook.com/…"
            {...comun("facebookUrl", "facebook")}
          />
          <Campo
            etiqueta="Instagram"
            type="url"
            inputMode="url"
            opcional
            placeholder="https://instagram.com/…"
            {...comun("instagramUrl", "instagram")}
          />
          <Campo
            etiqueta="Sitio web"
            type="url"
            inputMode="url"
            opcional
            placeholder="https://…"
            {...comun("sitioWeb", "sitio-web")}
          />
        </Seccion>
      </fieldset>
      <PieFormulario
        guardando={guardar.isPending}
        conImagenes={!!(imagenPerfil || imagenPortada)}
        hayCambios={hayCambios}
        general={general}
        onCancelar={() => onTerminar("cancelado")}
      />
    </form>
  );
}

/** Agrupación visual con título; no cambia cómo se guarda el formulario. */
function Seccion({
  id,
  titulo,
  descripcion,
  children,
}: {
  id: string;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-4">
      <div className="space-y-1 border-b pb-2">
        <h3 id={`${id}-titulo`} className="font-semibold">
          {titulo}
        </h3>
        {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Estado del guardado, error general y acciones, fijos al pie mientras se recorre el
 * formulario. Cancelar con cambios sin guardar pide confirmación.
 */
function PieFormulario({
  guardando,
  conImagenes,
  hayCambios,
  general,
  onCancelar,
}: {
  guardando: boolean;
  conImagenes: boolean;
  hayCambios: boolean;
  general: string | null;
  onCancelar: () => void;
}) {
  const cancelar = (
    <Button type="button" variant="outline" className="touch-target" disabled={guardando}>
      Cancelar
    </Button>
  );
  return (
    <div className="sticky bottom-0 z-10 space-y-2 rounded-b-xl border-t bg-card px-5 py-3">
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
        {hayCambios ? (
          <ConfirmAction
            trigger={cancelar}
            title="¿Descartar los cambios?"
            description="Los cambios que no guardaste en el perfil del taller se perderán."
            confirm="Descartar cambios"
            destructive
            onConfirm={onCancelar}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="touch-target"
            disabled={guardando}
            onClick={onCancelar}
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
