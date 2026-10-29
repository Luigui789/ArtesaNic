import { PageContainer } from "@/components/common/page";
import { Link } from "react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Pencil, RefreshCw, Store, XCircle } from "lucide-react";
import { SiteLayout } from "@/components/layout/site-layout";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/use-session";
import { getMiTaller, type TallerPropio } from "@/features/talleres/api";
import { reintentarSalvoErrorDelCliente } from "@/features/catalogo/api";
import {
  FormularioPerfilTaller,
  type FinEdicion,
} from "@/features/talleres/components/formulario-perfil-taller";
import { claveMiTaller } from "@/features/talleres/perfil-propio";
import { estadoUbicacionDe } from "@/features/talleres/ubicacion";
import { formatDate } from "@/lib/format";
import { useDocumentHead } from "@/hooks/use-document-head";

/**
 * Panel del artesano con la sesión real (AUD-18). El estado del taller sale de
 * `GET /talleres/mi-taller/`; la interfaz no lo deduce. Los enlaces operativos se
 * muestran solo con el taller aprobado por comodidad: el servidor responde `403` a
 * cualquier operación de un taller no aprobado aunque se llegue por otra vía.
 *
 * «Mi taller» permite editar el perfil público en cualquier estado (RF-008,
 * `PATCH /talleres/mi-taller/`); `/panel/perfil` abre la misma pantalla en edición.
 */
export default function PanelTaller({ editarAlAbrir = false }: { editarAlAbrir?: boolean }) {
  useDocumentHead({
    title: "Panel del artesano | Artesanías de Masaya",
    meta: [{ name: "robots", content: "noindex" }],
    canonical: "/panel",
  });
  const { usuario } = useSession();
  const taller = useQuery({
    queryKey: claveMiTaller(usuario?.id),
    queryFn: ({ signal }) => getMiTaller(signal),
    retry: reintentarSalvoErrorDelCliente,
  });
  const [editando, setEditando] = useState(editarAlAbrir);
  // Confirmación visible tras salir del formulario; se descarta al volver a editar.
  const [fin, setFin] = useState<FinEdicion | null>(null);

  return (
    <SiteLayout>
      <PageContainer className="max-w-4xl">
        <header>
          <p className="text-sm font-medium text-secondary">Panel del artesano</p>
          <h1 className="font-display text-3xl font-bold">{taller.data?.nombre ?? "Mi taller"}</h1>
          {usuario ? (
            <p className="text-sm text-muted-foreground">A cargo de {usuario.nombre}</p>
          ) : null}
        </header>

        {taller.isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : taller.isError ? (
          <ErrorState mensaje={taller.error.message} onRetry={() => void taller.refetch()} />
        ) : (
          <>
            <EstadoDelTaller
              taller={taller.data}
              actualizando={taller.isFetching}
              onActualizar={() => void taller.refetch()}
            />
            {editando ? (
              <FormularioPerfilTaller
                taller={taller.data}
                onTerminar={(resultado) => {
                  setFin(resultado);
                  setEditando(false);
                }}
              />
            ) : (
              <>
                <AvisoEdicion fin={fin} taller={taller.data} />
                <DatosDelTaller
                  taller={taller.data}
                  onEditar={() => {
                    setFin(null);
                    setEditando(true);
                  }}
                />
              </>
            )}
          </>
        )}
      </PageContainer>
    </SiteLayout>
  );
}

function EstadoDelTaller({
  taller,
  actualizando,
  onActualizar,
}: {
  taller: TallerPropio;
  actualizando: boolean;
  onActualizar: () => void;
}) {
  const actualizar = (
    <Button
      variant="outline"
      className="touch-target"
      onClick={onActualizar}
      disabled={actualizando}
    >
      <RefreshCw className="size-4" aria-hidden="true" />
      Actualizar estado
    </Button>
  );

  if (taller.estado === "pendiente")
    return (
      <section role="status" className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-secondary" aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="font-semibold">Tu taller está pendiente de aprobación.</h2>
            <p className="text-sm text-muted-foreground">
              La administración revisará los datos de tu taller. Hasta que lo apruebe no podrás
              publicar productos ni gestionar solicitudes.
            </p>
            {actualizar}
          </div>
        </div>
      </section>
    );

  if (taller.estado === "rechazado")
    return (
      <section role="status" className="rounded-xl border border-destructive/30 bg-card p-5">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="font-semibold">La administración rechazó tu taller.</h2>
            <Revision taller={taller} />
            {taller.motivoRechazo ? (
              <p className="text-sm">Motivo: {taller.motivoRechazo}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              No puedes publicar productos ni gestionar solicitudes. Puedes corregir los datos de tu
              perfil, pero la aplicación todavía no ofrece una forma de volver a solicitar la
              revisión.
            </p>
            {actualizar}
          </div>
        </div>
      </section>
    );

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-secondary" aria-hidden="true" />
        <div className="space-y-3">
          <h2 className="font-semibold">Tu taller está aprobado.</h2>
          <Revision taller={taller} />
          <div className="flex flex-wrap gap-2">
            <Button asChild className="touch-target">
              <Link to="/panel/solicitudes">Solicitudes recibidas</Link>
            </Button>
            <Button asChild variant="outline" className="touch-target">
              <Link to="/panel/productos">Mis productos</Link>
            </Button>
            <Button asChild variant="outline" className="touch-target">
              <Link to={`/artesano/${taller.id}`}>Ver perfil público</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Resultado de la última edición, junto a los datos que el servidor devolvió. */
function AvisoEdicion({ fin, taller }: { fin: FinEdicion | null; taller: TallerPropio }) {
  if (fin !== "guardado" && fin !== "sin-cambios") return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-secondary/30 bg-secondary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-sm font-medium">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
        {fin === "guardado" ? "Cambios guardados." : "No había cambios que guardar."}
      </p>
      {taller.estado === "aprobado" ? (
        <Button asChild variant="outline" className="touch-target shrink-0">
          <Link to={`/artesano/${taller.id}`}>Ver perfil público</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Resumen de texto de la ubicación (FEAT-GEO-02); el mapa solo aparece al editar. */
function textoUbicacion(taller: TallerPropio): string {
  const { ubicacion, publica } = estadoUbicacionDe(taller);
  if (!ubicacion) return "Sin ubicación en el mapa";
  return publica ? "Registrada, visible en el mapa público" : "Registrada, privada";
}

function DatosDelTaller({ taller, onEditar }: { taller: TallerPropio; onEditar: () => void }) {
  const filas: [string, string][] = [
    ["Rubro", taller.rubro],
    ["Dirección", taller.direccion],
    ["Ubicación del taller", textoUbicacion(taller)],
    ["Horario", taller.horario],
    ["Teléfono de contacto", taller.telefono],
    ["WhatsApp", taller.whatsapp],
    ["Facebook", taller.facebook],
    ["Instagram", taller.instagram],
    ["Sitio web", taller.sitioWeb],
  ];
  return (
    <section aria-labelledby="datos-taller" className="overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-[3/1] w-full overflow-hidden bg-surface sm:aspect-[4/1]">
        {taller.imagenPortada ? (
          <img
            src={taller.imagenPortada}
            alt={`Portada del taller ${taller.nombre}`}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="p-5">
        <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3">
            {taller.imagenPerfil ? (
              <img
                src={taller.imagenPerfil}
                alt={`Imagen de perfil del taller ${taller.nombre}`}
                className="size-16 shrink-0 rounded-xl border-4 border-card bg-surface object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border-4 border-card bg-surface text-muted-foreground">
                <Store className="size-6" aria-hidden="true" />
              </div>
            )}
            <h2 id="datos-taller" className="font-semibold">
              Mi taller
            </h2>
          </div>
          <Button variant="outline" className="touch-target" onClick={onEditar}>
            <Pencil className="size-4" aria-hidden="true" />
            Editar perfil del taller
          </Button>
        </div>
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Nombre: </span>
          {taller.nombre}
        </p>
        {taller.historia ? <p className="mt-2 text-sm">{taller.historia}</p> : null}
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-muted-foreground">{etiqueta}</dt>
              <dd className="break-words">{valor || "No publicado"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Fecha de la revisión administrativa, de solo lectura. */
function Revision({ taller }: { taller: TallerPropio }) {
  if (!taller.revisadoEn) return null;
  return (
    <p className="text-sm text-muted-foreground">Revisado el {formatDate(taller.revisadoEn)}</p>
  );
}
