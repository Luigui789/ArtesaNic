import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage } from "@/components/common/form-field";
import { Section } from "@/components/common/page";
import { ConfirmAction } from "@/components/common/confirm-action";
import { useSession } from "@/features/auth/use-session";
import { mensajeDominio } from "@/lib/errores-dominio";
import { crearIntentoSeguro } from "@/lib/intento-seguro";
import { claves } from "@/lib/query-keys";
import { ApiError } from "@/lib/http";
import { resolverRenglon, emitirPropuesta } from "../api";
import { invalidarSolicitud } from "../queries";
import {
  MODALIDADES_ENTREGA,
  type Solicitud,
  type PropuestaEntrada,
  type ResolucionEntrada,
} from "../types";
import { ENTREGA_LABELS } from "@/features/solicitudes/labels";

export function RevisionRenglon({ solicitud, renglon }: { solicitud: number; renglon: number }) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const intento = useRef(crearIntentoSeguro());
  const [motivo, setMotivo] = useState("");
  const enCurso = useRef(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: ResolucionEntrada) => {
      const cuerpo = { solicitud, renglon, ...input };
      try {
        return await resolverRenglon(solicitud, renglon, input, intento.current.clave(cuerpo));
      } catch (e) {
        intento.current.fallar(e, cuerpo);
        throw e;
      }
    },
    onSuccess: () => {
      intento.current.completar();
      invalidarSolicitud(client, usuario, true, solicitud);
      toast.success("Producto revisado");
    },
  });
  const ejecutar = async (input: ResolucionEntrada) => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      await mutation.mutateAsync(input);
    } catch {
      /* visible */
    } finally {
      enCurso.current = false;
    }
  };
  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">
        Revisa este producto sin cambiar la cantidad solicitada. La resolución es definitiva.
      </p>
      <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
      <Button
        disabled={mutation.isPending}
        onClick={() => void ejecutar({ resolucion: "aceptado" })}
      >
        Aceptar producto
      </Button>
      <FormField id={`rechazo-${renglon}`} label="Motivo si rechazas este producto">
        <Textarea
          id={`rechazo-${renglon}`}
          value={motivo}
          maxLength={500}
          disabled={mutation.isPending || intento.current.incierto}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </FormField>
      <ConfirmAction
        trigger={
          <Button variant="outline" disabled={mutation.isPending || !motivo.trim()}>
            Rechazar producto
          </Button>
        }
        title="¿Rechazar este producto?"
        description="El comprador verá el motivo y este producto quedará fuera de la propuesta."
        confirm="Rechazar producto"
        destructive
        busy={mutation.isPending}
        onConfirm={() => ejecutar({ resolucion: "rechazado", motivoRechazo: motivo.trim() })}
      />
    </div>
  );
}
const decimal = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Indica un importe válido con hasta dos decimales.");
const esquema = z
  .object({
    modalidadEntrega: z.enum(MODALIDADES_ENTREGA),
    descripcionEntrega: z.string().trim().max(500),
    costoEntrega: decimal,
    lineas: z.array(
      z.object({
        renglon: z.number(),
        modalidad: z.string(),
        fechaComprometida: z.string(),
        cargoPersonalizacion: z.string(),
      }),
    ),
    otrosCargos: z.array(
      z.object({
        descripcion: z.string().trim().min(1, "Describe el cargo.").max(200),
        monto: decimal,
      }),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.modalidadEntrega === "otra" && !data.descripcionEntrega)
      ctx.addIssue({
        code: "custom",
        path: ["descripcionEntrega"],
        message: "Describe la modalidad de entrega.",
      });
    data.lineas.forEach((l, i) => {
      if (l.modalidad === "produccion" && !/^\d{4}-\d{2}-\d{2}$/.test(l.fechaComprometida))
        ctx.addIssue({
          code: "custom",
          path: ["lineas", i, "fechaComprometida"],
          message: "Indica la fecha comprometida.",
        });
      if (l.modalidad === "personalizacion" && !decimal.safeParse(l.cargoPersonalizacion).success)
        ctx.addIssue({
          code: "custom",
          path: ["lineas", i, "cargoPersonalizacion"],
          message: "Indica un cargo válido.",
        });
    });
  });
type Datos = z.infer<typeof esquema>;
export function FormularioPropuesta({ solicitud: s }: { solicitud: Solicitud }) {
  const { usuario } = useSession();
  const client = useQueryClient();
  const intento = useRef(crearIntentoSeguro());
  const enCurso = useRef(false);
  const aceptados = s.renglones.filter((r) => r.resolucion === "aceptado");
  const form = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      modalidadEntrega: s.modalidadEntregaPreferida || "retiro_taller",
      descripcionEntrega: s.descripcionEntregaPreferida,
      costoEntrega: "0.00",
      lineas: aceptados.map((r) => ({
        renglon: r.id,
        modalidad: r.modalidad,
        fechaComprometida: "",
        cargoPersonalizacion: "0.00",
      })),
      otrosCargos: [],
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: PropuestaEntrada) => {
      const cuerpo = { solicitud: s.id, ...input };
      try {
        return await emitirPropuesta(s.id, input, intento.current.clave(cuerpo));
      } catch (e) {
        intento.current.fallar(e, cuerpo);
        throw e;
      }
    },
    onSuccess: () => {
      intento.current.completar();
      invalidarSolicitud(client, usuario, true, s.id);
      void client.invalidateQueries({ queryKey: claves.propuesta(usuario?.id, true, s.id) });
      toast.success("Propuesta enviada al comprador");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) {
        for (const [campo, mensajes] of Object.entries(e.campos)) {
          const field =
            campo === "costo_entrega"
              ? "costoEntrega"
              : campo === "descripcion_entrega"
                ? "descripcionEntrega"
                : null;
          if (field) form.setError(field, { message: mensajes.join(" ") });
        }
      }
    },
  });
  const enviar = form.handleSubmit(async (data) => {
    if (enCurso.current) return;
    enCurso.current = true;
    const input: PropuestaEntrada = {
      modalidadEntrega: data.modalidadEntrega,
      descripcionEntrega: data.descripcionEntrega,
      costoEntrega: data.costoEntrega,
      lineas: data.lineas.map((l) => ({
        renglon: l.renglon,
        ...(l.modalidad === "produccion" ? { fechaComprometida: l.fechaComprometida } : {}),
        ...(l.modalidad === "personalizacion"
          ? { cargoPersonalizacion: l.cargoPersonalizacion }
          : {}),
      })),
      otrosCargos: data.otrosCargos,
    };
    try {
      await mutation.mutateAsync(input);
    } catch {
      /* conserva formulario */
    } finally {
      enCurso.current = false;
    }
  });
  const cargos = form.watch("otrosCargos");
  return (
    <Section
      title="Preparar propuesta final"
      description="Incluye todos los productos aceptados. El servidor fijará los precios vigentes y calculará el total."
    >
      <form
        noValidate
        onSubmit={(e) => void enviar(e)}
        aria-label="Preparar propuesta final"
        className="space-y-5"
      >
        <FormMessage>{mutation.isError ? mensajeDominio(mutation.error) : null}</FormMessage>
        <fieldset disabled={mutation.isPending || intento.current.incierto} className="space-y-5">
          {aceptados.map((r, i) => (
            <div key={r.id} className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">
                {r.producto.nombre} · {r.cantidad} unidades
              </h3>
              {r.modalidad === "produccion" ? (
                <FormField
                  id={`fecha-${r.id}`}
                  label="Fecha comprometida *"
                  error={form.formState.errors.lineas?.[i]?.fechaComprometida?.message}
                >
                  <Input
                    id={`fecha-${r.id}`}
                    type="date"
                    {...form.register(`lineas.${i}.fechaComprometida`)}
                  />
                </FormField>
              ) : null}
              {r.modalidad === "personalizacion" ? (
                <FormField
                  id={`cargo-${r.id}`}
                  label="Cargo de personalización (C$) *"
                  error={form.formState.errors.lineas?.[i]?.cargoPersonalizacion?.message}
                >
                  <Input
                    id={`cargo-${r.id}`}
                    inputMode="decimal"
                    {...form.register(`lineas.${i}.cargoPersonalizacion`)}
                  />
                </FormField>
              ) : null}
            </div>
          ))}
          <FormField id="propuesta-entrega" label="Modalidad de entrega *">
            <select
              id="propuesta-entrega"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3"
              {...form.register("modalidadEntrega")}
            >
              {MODALIDADES_ENTREGA.map((m) => (
                <option key={m} value={m}>
                  {ENTREGA_LABELS[m]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            id="propuesta-descripcion"
            label="Descripción de la entrega"
            error={form.formState.errors.descripcionEntrega?.message}
          >
            <Textarea
              id="propuesta-descripcion"
              maxLength={500}
              {...form.register("descripcionEntrega")}
            />
          </FormField>
          <FormField
            id="propuesta-costo"
            label="Costo de entrega (C$) *"
            error={form.formState.errors.costoEntrega?.message}
          >
            <Input id="propuesta-costo" inputMode="decimal" {...form.register("costoEntrega")} />
          </FormField>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Otros cargos (opcional)</legend>
            {cargos.map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <FormField
                  id={`extra-desc-${i}`}
                  label="Descripción del cargo *"
                  error={form.formState.errors.otrosCargos?.[i]?.descripcion?.message}
                >
                  <Input
                    id={`extra-desc-${i}`}
                    {...form.register(`otrosCargos.${i}.descripcion`)}
                  />
                </FormField>
                <FormField
                  id={`extra-monto-${i}`}
                  label="Importe (C$) *"
                  error={form.formState.errors.otrosCargos?.[i]?.monto?.message}
                >
                  <Input
                    id={`extra-monto-${i}`}
                    inputMode="decimal"
                    {...form.register(`otrosCargos.${i}.monto`)}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    form.setValue(
                      "otrosCargos",
                      cargos.filter((_, j) => j !== i),
                    )
                  }
                >
                  Quitar cargo
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={cargos.length >= 20}
              onClick={() =>
                form.setValue("otrosCargos", [...cargos, { descripcion: "", monto: "0.00" }])
              }
            >
              Agregar cargo
            </Button>
          </fieldset>
        </fieldset>
        <p className="text-sm text-muted-foreground">
          Enviar la propuesta todavía no confirma el pedido ni reserva unidades.
        </p>
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending
            ? "Enviando…"
            : intento.current.incierto
              ? "Reintentar la misma propuesta"
              : "Enviar propuesta al comprador"}
        </Button>
      </form>
    </Section>
  );
}
