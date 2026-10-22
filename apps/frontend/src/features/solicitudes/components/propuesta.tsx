import { useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Section } from "@/components/common/page";
import { FormMessage } from "@/components/common/form-field";
import { ErrorState, LoadingState } from "@/components/common/states";
import { ConfirmAction } from "@/components/common/confirm-action";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/use-session";
import { ResumenContractual } from "@/features/pedidos/components/resumen-contractual";
import { ENTREGA_LABELS } from "@/features/solicitudes/labels";
import { claves } from "@/lib/query-keys";
import { mensajeDominio } from "@/lib/errores-dominio";
import { mostrarImporte } from "@/lib/importes";
import { crearIntentoSeguro } from "@/lib/intento-seguro";
import { consultarPropuesta } from "../api";
import { decidirPropuesta } from "../decision";
import { invalidarSolicitud } from "../queries";

export function PropuestaFinal({ solicitud, recibida }: { solicitud: number; recibida: boolean }) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const intento = useRef(crearIntentoSeguro());
  const enCurso = useRef(false);
  const query = useQuery({
    queryKey: claves.propuesta(usuario?.id, recibida, solicitud),
    queryFn: () => consultarPropuesta(solicitud, usuario, recibida),
    retry: false,
  });
  const decidir = useMutation({
    retry: false,
    mutationFn: async (decision: "aceptar" | "rechazar") => {
      const cuerpo = { solicitud, decision };
      const key = intento.current.clave(cuerpo);
      try {
        return await decidirPropuesta(solicitud, decision, key);
      } catch (error) {
        intento.current.fallar(error, cuerpo);
        throw error;
      }
    },
    onSuccess: (resultado) => {
      intento.current.completar();
      invalidarSolicitud(client, usuario, recibida, solicitud);
      void client.invalidateQueries({
        queryKey: claves.propuesta(usuario?.id, recibida, solicitud),
      });
      void client.invalidateQueries({ queryKey: claves.pedidos(usuario?.id) });
      if (resultado.pedido) {
        client.setQueryData(
          claves.pedido(usuario?.id, false, resultado.pedido.id),
          resultado.pedido,
        );
        toast.success("Pedido confirmado");
        void navigate(`/pedidos/${resultado.pedido.id}`);
      } else toast.success("Propuesta rechazada");
    },
    onError: () => {
      void client.invalidateQueries({
        queryKey: claves.propuesta(usuario?.id, recibida, solicitud),
      });
      invalidarSolicitud(client, usuario, recibida, solicitud);
    },
  });
  const ejecutar = async (decision: "aceptar" | "rechazar") => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      await decidir.mutateAsync(decision);
    } catch {
      /* mensaje visible, conserva intento */
    } finally {
      enCurso.current = false;
    }
  };
  const p = query.data;
  return (
    <Section
      title="Propuesta final"
      description="Revisa los productos, los cargos y la entrega antes de decidir."
    >
      {query.isPending ? (
        <LoadingState label="Cargando propuesta…" />
      ) : query.isError ? (
        <ErrorState mensaje={mensajeDominio(query.error)} onRetry={() => void query.refetch()} />
      ) : p ? (
        <>
          <StatusBadge
            tone={
              p.decision === "aceptada"
                ? "success"
                : p.decision === "rechazada"
                  ? "danger"
                  : "pending"
            }
          >
            {p.decision === "aceptada"
              ? "Propuesta aceptada"
              : p.decision === "rechazada"
                ? "Propuesta rechazada"
                : "Pendiente de decisión"}
          </StatusBadge>
          <ol className="divide-y">
            {p.lineas.map((l) => (
              <li key={l.id} className="space-y-1 py-4">
                <h3 className="font-semibold">{l.producto.nombre}</h3>
                <p className="text-sm">
                  {l.cantidad} unidades · {mostrarImporte(l.precioUnitario)} por unidad · Subtotal{" "}
                  {mostrarImporte(l.subtotal)}
                </p>
                {l.fechaComprometida ? (
                  <p className="text-sm text-muted-foreground">
                    Fecha comprometida: {l.fechaComprometida}
                  </p>
                ) : null}
                {l.modalidad === "personalizacion" ? (
                  <p className="text-sm">
                    Personalización: {mostrarImporte(l.cargoPersonalizacion)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {p.otrosCargos.length ? (
            <ul className="space-y-2 text-sm">
              {p.otrosCargos.map((c) => (
                <li key={c.posicion}>
                  {c.descripcion}: {mostrarImporte(c.monto)}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">{ENTREGA_LABELS[p.modalidadEntrega]}</p>
            {p.descripcionEntrega ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {p.descripcionEntrega}
              </p>
            ) : null}
          </div>
          <ResumenContractual datos={p} />
          <FormMessage>{decidir.isError ? mensajeDominio(decidir.error) : null}</FormMessage>
          {p.pedidoId ? (
            <Button asChild>
              <Link to={`${recibida ? "/panel/pedidos" : "/pedidos"}/${p.pedidoId}`}>
                Ver pedido confirmado
              </Link>
            </Button>
          ) : null}
          {!recibida && p.decision === "pendiente" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Al aceptar, el servidor comprobará las unidades disponibles y confirmará el pedido
                completo. Si no alcanza el stock, no se confirmará ningún producto.
              </p>
              <div className="flex flex-wrap gap-2">
                <ConfirmAction
                  trigger={<Button disabled={decidir.isPending}>Aceptar propuesta</Button>}
                  title="¿Confirmar este pedido?"
                  description={`El total acordado es ${mostrarImporte(p.total)}. La confirmación se realizará cuando el taller tenga las unidades necesarias.`}
                  confirm="Confirmar pedido"
                  busy={decidir.isPending}
                  onConfirm={() => ejecutar("aceptar")}
                />
                <ConfirmAction
                  trigger={
                    <Button variant="outline" disabled={decidir.isPending}>
                      Rechazar propuesta
                    </Button>
                  }
                  title="¿Rechazar esta propuesta?"
                  description="La decisión es definitiva. No se creará un pedido ni se reservarán unidades."
                  confirm="Rechazar propuesta"
                  destructive
                  busy={decidir.isPending}
                  onConfirm={() => ejecutar("rechazar")}
                />
              </div>
            </>
          ) : null}
          {decidir.isError ? (
            <Button variant="outline" onClick={() => void query.refetch()}>
              Actualizar propuesta
            </Button>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
