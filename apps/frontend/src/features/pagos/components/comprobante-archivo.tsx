import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { mensajeDominio } from "@/lib/errores-dominio";
import { reintentarSalvoErrorDelCliente } from "@/lib/http";
import { claves } from "@/lib/query-keys";
import { descargarComprobante } from "../api";
import { esPdf, etiquetaTipo, tamanoLegible } from "../comprobante";
import type { ComprobantePago } from "../types";

/**
 * URL temporal de un contenido en memoria; se revoca al cambiar o desmontar. Nunca se
 * convierte a DataURL/base64 ni se guarda en almacenamiento del navegador.
 */
export function useUrlTemporal(contenido: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!contenido) {
      setUrl(null);
      return;
    }
    const temporal = URL.createObjectURL(contenido);
    setUrl(temporal);
    return () => URL.revokeObjectURL(temporal);
  }, [contenido]);
  return url;
}

/** Ficha del archivo: imagen con vista previa; PDF como tarjeta, nunca como `<img>`. */
export function VistaPreviaArchivo({
  nombre,
  tipo,
  tamano,
  src,
  alt,
  acciones = false,
}: {
  nombre: string;
  tipo: string;
  tamano: number;
  src?: string | null | undefined;
  alt: string;
  acciones?: boolean;
}) {
  const pdf = esPdf(tipo);
  const Icono = pdf ? FileText : ImageIcon;
  return (
    <div className="min-w-0 space-y-2 rounded-lg border bg-background p-3">
      <p className="flex min-w-0 items-start gap-2 text-sm">
        <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-all font-medium">{nombre}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {etiquetaTipo(tipo)} · {tamanoLegible(tamano)}
      </p>
      {src && !pdf ? (
        <img src={src} alt={alt} className="max-h-64 w-full rounded border object-contain" />
      ) : null}
      {src && acciones ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={src} target="_blank" rel="noopener noreferrer">
              Abrir
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={src} download={nombre}>
              Descargar
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Comprobante guardado: se pide al endpoint protegido solo cuando la persona lo abre. La
 * caché lleva la identidad, no conserva el binario al desmontar y se vacía al cerrar sesión.
 */
export function ComprobanteGuardado({
  comprobante,
  numero,
}: {
  comprobante: ComprobantePago;
  numero: number;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <VistaPreviaArchivo
        nombre={comprobante.nombre}
        tipo={comprobante.tipo}
        tamano={comprobante.tamano}
        alt={`Comprobante del intento ${numero}`}
      />
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="touch-target">
            Ver comprobante
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comprobante de pago</DialogTitle>
            <DialogDescription>
              Archivo privado del registro {numero}. Puedes revisarlo o descargarlo.
            </DialogDescription>
          </DialogHeader>
          <ContenidoComprobante comprobante={comprobante} numero={numero} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Solo se monta al abrir el Dialog; al cerrarlo se libera el binario y su Blob URL. */
function ContenidoComprobante({
  comprobante,
  numero,
}: {
  comprobante: ComprobantePago;
  numero: number;
}) {
  const { usuario } = useSession();
  const archivo = useQuery({
    queryKey: claves.comprobante(usuario?.id, comprobante.url),
    queryFn: ({ signal }) => descargarComprobante(comprobante.url, signal),
    gcTime: 0,
    staleTime: Infinity,
    retry: reintentarSalvoErrorDelCliente,
  });
  const url = useUrlTemporal(archivo.data);
  return archivo.isError ? (
    <div role="alert" className="space-y-3">
      <p className="text-sm text-destructive">{mensajeDominio(archivo.error)}</p>
      <Button variant="outline" onClick={() => void archivo.refetch()}>
        Reintentar
      </Button>
    </div>
  ) : !url ? (
    <p role="status">Cargando comprobante…</p>
  ) : (
    <VistaPreviaArchivo
      nombre={comprobante.nombre}
      tipo={comprobante.tipo}
      tamano={comprobante.tamano}
      src={url}
      alt={`Comprobante del intento ${numero}`}
      acciones
    />
  );
}
