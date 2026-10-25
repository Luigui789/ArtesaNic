# Contrato de API — Reembolsos externos y distribución económica (AUD-13)

**Fecha:** 24 de octubre de 2026 (America/Managua).
**Estado:** implementado en backend (`apps/pedidos/reembolsos.py`, `apps/propuestas/distribucion.py`)
y en el frontend (`features/pedidos/components/resolucion-pedido.tsx`).
**Fuentes:** RF-006 (criterio 4), RF-015, RF-021; RN-017, RN-019; RNF-008, RNF-011, RNF-014.
**Decisiones:** [D-AUD13-08 a D-AUD13-13](../decisiones/v1.md#concreciones-de-aud-13).
**Relacionados:** [resolución de pedidos](resolucion-pedidos.md), [propuestas](propuestas.md),
[pedidos](pedidos.md), [pagos](pagos.md).

ArtesaNic **no mueve dinero**: registra la obligación de reembolso calculada por el servidor y
la evidencia de la devolución que el taller hace fuera de la plataforma.

## Distribución económica congelada

`CargoPedido.linea` puede ser `NULL` (cargo global) y `Pedido.costo_entrega` es global: sin un
reparto por renglón, el desglose no permitía calcular un reembolso parcial (RF-006.4). AUD-13
reparte esas partidas al **emitir la propuesta** y lo congela antes de la decisión del
comprador:

- `DistribucionEconomicaLineaPropuesta` (1:1 con `LineaPropuesta`): `otros_compartidos_asignados`
  y `entrega_asignada`, NIO, dos decimales, `>= 0`. Se expone en la lectura de la propuesta
  (`lineas[].otros_compartidos_asignados`, `lineas[].entrega_asignada`).
- `DistribucionEconomicaLineaPedido` (1:1 con `LineaPedido`): copia exacta, creada en la misma
  transacción de confirmación (AUD-07). Inmutable.

### Algoritmo (centavos enteros, nunca floats)

```text
base_linea   = subtotal + cargo_personalizacion + Σ CargoPropuesta de la línea
pool_otros   = Σ CargoPropuesta con linea IS NULL
pool_entrega = Propuesta.costo_entrega
```

Cada pool se reparte por separado en proporción a `base_linea / Σ base_linea` con el **método
de mayor residuo**: 1) cuota exacta en centavos, 2) parte entera, 3) los centavos restantes, uno
por línea, a los mayores residuos, 4) empate → menor posición del renglón. Por construcción
`Σ otros_compartidos_asignados = pool_otros` y `Σ entrega_asignada = costo_entrega`, al centavo.
Ejemplo: C$ 10.00 entre tres líneas iguales → 3.34, 3.33, 3.33.

Pedidos y propuestas anteriores a AUD-13 reciben su distribución por migración de datos
(`propuestas.0005`, `pedidos.0008`) con el mismo algoritmo; solo se crean las filas que faltan
(idempotente) y no se modifica ningún importe.

### Base reembolsable por línea

```text
base_reembolsable = subtotal + cargo_personalizacion + Σ CargoPedido de la línea
                    + otros_compartidos_asignados + entrega_asignada
```

`Σ base_reembolsable = Pedido.total` (se comprueba en cada cálculo; si no, `CRITICAL` y
rollback).

## Reembolso total

Cancelación del artesano con `Pago.estado = confirmado`: `ReembolsoPedido(tipo="total",
monto = Pedido.total)`. No consulta precios ni catálogo actuales.

## Reembolso parcial

Cierre parcial aceptado, por renglón:

```text
importe = ROUND_HALF_UP(base_reembolsable × cantidad_no_entregada / cantidad_acordada, 0.01)
monto   = Σ importe   (0 < monto < Pedido.total)
```

La proporción por unidad no entregada se aplica a **todos** los importes asignados a la línea:
precio, personalización, cargos de la línea, cargos globales asignados y entrega asignada
(D-AUD13-10). Los importes se congelan en `LineaCierreParcial` al proponer y el reembolso usa
esa suma al aceptar; no se recalculan.

## Modelo

| Modelo | Campos | Reglas |
|---|---|---|
| `ReembolsoPedido` | `pedido` (1:1), `tipo` (`total`/`parcial`), `monto`, `moneda` (`NIO`), `cancelacion` (1:1, nullable), `cierre_parcial` (1:1, nullable), `creado_en` | Exactamente un origen coherente con el tipo (`reembolso_origen_unico`); `monto > 0`; una obligación por pedido; append-only |
| `DevolucionReembolso` | `reembolso` (1:1), `fecha`, `monto`, `referencia`, `registrado_por`, `registrado_en` | `monto` copiado de la obligación; referencia no vacía; append-only |

**Estado** (derivado, D-AUD13-13): `pendiente` sin `DevolucionReembolso`; `realizado` con ella.

## Registrar la devolución

`POST /api/v1/pedidos/recibidos/{pedido_id}/reembolso/realizacion/` (artesano propietario,
`Idempotency-Key`):

```json
{ "fecha": "2026-10-25", "referencia": "Transferencia BAC 12345" }
```

- `fecha`: no posterior a la fecha actual de America/Managua según el servidor (`400`).
- `referencia`: recortada, 1–120 caracteres (`400`).
- `monto`, `moneda` o `estado` en el cuerpo: `400` (campo no permitido).
- Pedido sin reembolso: `404`. Ya realizado: `409 reembolso_ya_realizado`.
- Respuesta `201` con la [lectura de la resolución](resolucion-pedidos.md#lectura-de-la-resolución):

```json
"reembolso": {
  "id": 4, "tipo": "parcial", "monto": "321.43", "moneda": "NIO",
  "estado": "realizado", "origen": "cierre_parcial", "cierre": 3,
  "creado_en": "2026-10-24T13:00:00-06:00",
  "devolucion": { "fecha": "2026-10-25", "monto": "321.43",
                  "referencia": "Transferencia BAC 12345",
                  "registrado_en": "2026-10-25T09:00:00-06:00" }
}
```

Huella: `pedido_id`, `reembolso_id`, `fecha`, `referencia` recortada; nunca el monto.

## Fuera de alcance

Pasarela, procesamiento automático de dinero, disputas y chargebacks. La notificación al
comprador (RF-021.7) pertenece a AUD-20: hoy se emiten los puntos de integración
`reembolso_creado` y `reembolso_realizado` tras el `COMMIT`.
