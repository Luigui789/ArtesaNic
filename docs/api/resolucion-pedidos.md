# Contrato de API — Cancelación del taller, cierre parcial y clasificación de unidades (AUD-13)

**Fecha:** 24 de octubre de 2026 (America/Managua).
**Estado:** implementado en backend (`apps/pedidos/resolucion.py`, `apps/pedidos/clasificacion.py`,
`apps/inventario/services.py`) y en el detalle real de pedido del frontend
(`features/pedidos/components/resolucion-pedido.tsx`).
**Fuentes:** RF-010, RF-015, RF-021, RF-022, RF-023; RN-017, RN-019, RN-021, RN-024;
RNF-008, RNF-011, RNF-014, RNF-015.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Resolución de pedidos`.
**Decisiones:** [D-AUD13-01 a D-AUD13-24](../decisiones/v1.md#concreciones-de-aud-13).
**Relacionados:** [reembolsos](reembolsos.md), [pedidos](pedidos.md), [cumplimiento](cumplimiento.md),
[pagos](pagos.md), [inventario](inventario.md), [idempotencia](idempotencia.md).

## Modelo

```text
Pedido (snapshot inmutable, AUD-07)
 ├── LineaPedido ── DistribucionEconomicaLineaPedido   copia congelada de la propuesta
 ├── EstadoOperativoPedido   … → cancelado_artesano | cerrado_parcial   (terminales)
 ├── CancelacionPedido (motivo, registrado_por, registrado_en)          0..1, append-only
 ├── CierreParcialPedido (numero, motivo, propuesto_por, propuesto_en)  0..N, UNIQUE (pedido, numero)
 │    ├── LineaCierreParcial (acordada, entregada, no_entregada, importe_reembolso)  snapshot
 │    └── DecisionCierreParcial (aceptado | objetado, motivo)          0..1 por propuesta
 ├── ReembolsoPedido ── DevolucionReembolso                             ver reembolsos.md
 └── ObligacionClasificacionInventario (reserva, cantidad, causa)       0..1 por reserva
      └── ClasificacionInventario (cantidad, resultado, motivo) ── MovimientoInventario 1:1
```

Todo el historial de AUD-13 es append-only (`save` de una fila existente y `delete` lanzan
`ValidationError`). El snapshot `Pedido`/`LineaPedido`/`CargoPedido` no cambia.

## Estados del pedido

| `estado` | Etiqueta | Cómo se alcanza | Terminal |
|---|---|---|---|
| `confirmado` | Pedido confirmado | Inicial (AUD-07/11) | No |
| `en_cumplimiento` | En cumplimiento | Primer renglón iniciado (AUD-12) | No |
| `entregado` | Entregado | Todas las cantidades entregadas (AUD-12) | Sí |
| `vencido_falta_pago` | Vencido por falta de pago | Proceso automático (AUD-11) | Sí |
| `cancelado_artesano` | Cancelado por el taller | Cancelación del artesano | Sí |
| `cerrado_parcial` | Cerrado parcialmente | El comprador acepta un cierre parcial | Sí |

En un estado terminal no se inician renglones, no se registran entregas ni se modifican pagos
(`409 pedido_finalizado`, o `pedido_vencido` para el vencido); el historial sigue legible.
Cada transición deja un `EventoEstadoPedido`: la cancelación con `tipo="artesano"` y el
artesano real; la aceptación del cierre con `tipo="comprador"` (nuevo) y el comprador real
(CHECK `evento_pedido_comprador_con_actor`). `UNIQUE` parciales
`evento_pedido_cancelacion_unica` y `evento_pedido_cierre_parcial_unico`.

## Cancelación del artesano

- Solo desde `confirmado` o `en_cumplimiento` y **sin ninguna `EntregaPedido`**
  (`409 cancelacion_requiere_sin_entregas`: con entregas la vía es el cierre parcial).
- Motivo obligatorio, recortado, 1–1000 caracteres (`400`).
- Pago `registrado` u `observado` sin resolver: `409 pago_pendiente_de_resolucion`
  (D-AUD13-03). Sin `Pago` o `no_recibido`: se cancela sin reembolso. `confirmado`: reembolso
  total por `Pedido.total`.
- Una transacción: `CancelacionPedido` → liberación del remanente de reservas activas →
  obligaciones de clasificación → reembolso total si corresponde → `cancelado_artesano` y su
  evento. Cualquier fallo revierte todo.

## Cierre parcial

1. **Propuesta (artesano).** Procede con `0 < entregado < acordado` calculado **por renglón**
   desde el ledger `LineaEntrega` (`409 cierre_requiere_entrega_parcial`) y sin otra propuesta
   pendiente (`409 cierre_parcial_pendiente`). El cliente solo envía el motivo (1–1000); el
   servidor congela en `LineaCierreParcial` acordado, entregado, no entregado e importe a
   reembolsar ([cálculo](reembolsos.md#reembolso-parcial)). No toca inventario, reembolso ni
   estado.
2. **Pendiente.** Mientras no hay `DecisionCierreParcial`, el pedido sigue `en_cumplimiento`
   pero iniciar, entregar y proponer otro cierre responden `409 cierre_parcial_pendiente`: el
   snapshot económico nunca queda desactualizado.
3. **Objeción (comprador).** Motivo obligatorio (1–1000). Solo crea la decisión: sin cambios de
   estado, reservas, inventario ni reembolso. El artesano puede seguir entregando y proponer otro
   cierre (`numero` siguiente; los anteriores no cambian).
4. **Aceptación (comprador).** Sin motivo. En una transacción: decisión → liberación del
   remanente → obligaciones de clasificación → reembolso parcial (suma congelada) →
   `cerrado_parcial` y evento `tipo="comprador"`. Una sola decisión por propuesta
   (`409 cierre_ya_resuelto`).

## Inventario al finalizar

`liberar_remanentes_por_finalizacion` (no el liberador estricto de AUD-11, que exige reservas
activas):

| Reserva | Efecto |
|---|---|
| `activa` | Libera `cantidad_pendiente`: `reservada -= q`, existencia igual, `activa → liberada` conservando `cantidad_consumida`; `MovimientoInventario(tipo="liberacion")` |
| `consumida` | Sin cambios: lo consumido no vuelve solo al stock |
| `liberada` | Inconsistencia (el pedido no estaba finalizado): `CRITICAL` y rollback |

**Unidades manipuladas** (D-AUD13-15): por reserva, `cantidad_consumida − entregada` (≥ 0). En
stock el consumo ocurre al entregar, así que normalmente es 0. En personalización sobre unidad
estándar (consumida al iniciar) queda la diferencia: p. ej. 4 consumidas y 1 entregada → una
`ObligacionClasificacionInventario` por 3. Producción y personalización desde cero no tienen
reserva y nunca generan obligación. La clasificación y el reembolso pueden quedar pendientes:
no bloquean el cierre comercial.

## Clasificación (solo artesano)

`POST …/clasificaciones/` con `[{obligacion, cantidad, resultado, motivo}]` (sin obligaciones
repetidas; motivo obligatorio, 1–500). Todo o nada; varios pasos permitidos mientras
`Σ clasificado ≤ obligacion.cantidad` (`409 clasificacion_excede_pendiente` con
`"obligaciones": [ids]`). Una obligación ajena o repetida responde `400`.

| Resultado | Movimiento | Saldos |
|---|---|---|
| `reutilizable` | `reincorporacion` | `existencia_fisica += q`, `reservada` igual (vuelve a disponibilidad) |
| `baja` | `baja` | Existencia y reservada **iguales**: la unidad ya salió al consumirse; registra su disposición final (D-AUD13-17) |

CHECK `movimiento_reincorporacion_coherente` y `movimiento_baja_clasificada_coherente` (este
solo aplica a bajas vinculadas a una reserva). Cada `ClasificacionInventario` guarda su
movimiento (`OneToOne`).

## Endpoints

| Método | Ruta | Acceso | Idempotencia | Código |
|---|---|---|---|---|
| GET | `/api/v1/pedidos/mios/{pedido_id}/resolucion/` | Comprador propietario | — | `200` |
| GET | `/api/v1/pedidos/recibidos/{pedido_id}/resolucion/` | Artesano, taller aprobado | — | `200` |
| POST | `/api/v1/pedidos/recibidos/{pedido_id}/cancelacion/` | Artesano | `cancelar_pedido_artesano` | `201` |
| POST | `/api/v1/pedidos/recibidos/{pedido_id}/cierres-parciales/` | Artesano | `proponer_cierre_parcial` | `201` |
| POST | `/api/v1/pedidos/mios/{pedido_id}/cierres-parciales/{cierre_id}/respuesta/` | Comprador | `responder_cierre_parcial` | `201` |
| POST | `/api/v1/pedidos/recibidos/{pedido_id}/reembolso/realizacion/` | Artesano | `registrar_devolucion_reembolso` | `201` |
| GET | `/api/v1/pedidos/recibidos/{pedido_id}/clasificaciones/` | Artesano | — | `200` |
| POST | `/api/v1/pedidos/recibidos/{pedido_id}/clasificaciones/` | Artesano | `clasificar_inventario_pedido` | `201` |

Las rutas de AUD-07/10/12 no cambian. Ownership: comprador ajeno o taller ajeno `404`; rol
incorrecto o taller no aprobado `403`; sin autenticación `401`. Todas las mutaciones exigen
`Idempotency-Key` y responden con la lectura actual.

### Lectura de la resolución

```json
{
  "pedido": 9,
  "estado": "en_cumplimiento",
  "cancelacion": null,
  "cierres_parciales": [
    {
      "id": 3, "numero": 1, "estado": "pendiente", "motivo": "…",
      "propuesto_en": "2026-10-24T12:00:00-06:00",
      "lineas": [
        { "linea": 14, "posicion": 1, "cantidad_acordada": 5, "cantidad_entregada": 2,
          "cantidad_no_entregada": 3, "importe_reembolso": "321.43" }
      ],
      "monto_reembolso": "321.43",
      "decision": null
    }
  ],
  "reembolso": null,
  "acciones": {
    "cancelar": { "disponible": false, "codigo": "cancelacion_requiere_sin_entregas" },
    "proponer_cierre": { "disponible": false, "codigo": "cierre_parcial_pendiente" }
  },
  "estimacion_cierre": null
}
```

`acciones` y `estimacion_cierre` (cantidades e importe que congelaría un cierre propuesto
ahora) aplican las mismas reglas del servidor sin lock: son orientativas; la mutación revalida.
La lectura no expone datos internos de inventario; la clasificación tiene su propia lectura,
solo para el artesano (obligación, producto del snapshot, línea, total, clasificado, pendiente
e historial).

### Huellas de idempotencia

| Tipo | Huella |
|---|---|
| `cancelar_pedido_artesano` | `pedido_id`, `motivo` recortado |
| `proponer_cierre_parcial` | `pedido_id`, `motivo` recortado (cantidades e importes no: los deriva el servidor) |
| `responder_cierre_parcial` | `pedido_id`, `cierre_id`, `decision`, `motivo` recortado |
| `registrar_devolucion_reembolso` | `pedido_id`, `reembolso_id`, `fecha`, `referencia` recortada |
| `clasificar_inventario_pedido` | `pedido_id`, `clasificaciones` ordenadas por `obligacion` y `resultado` |

Misma clave y mismo cuerpo: replay (`Idempotency-Replayed: true`). Misma clave y otro cuerpo:
`409 clave_idempotencia_reutilizada`. Clave nueva tras finalizar: `409 pedido_finalizado`.

## Códigos

| HTTP | `codigo` | Cuándo |
|---|---|---|
| `409` | `pedido_finalizado` | Pedido entregado, cancelado o cerrado parcialmente |
| `409` | `pedido_vencido` | Pedido vencido por falta de pago |
| `409` | `cancelacion_requiere_sin_entregas` | Cancelar con al menos una entrega |
| `409` | `pago_pendiente_de_resolucion` | Cancelar con pago `registrado` u `observado` |
| `409` | `cierre_requiere_entrega_parcial` | Proponer sin entrega o sin pendiente |
| `409` | `cierre_parcial_pendiente` | Proponer, iniciar o entregar con un cierre pendiente |
| `409` | `cierre_ya_resuelto` | Segunda respuesta a la misma propuesta |
| `409` | `reembolso_ya_realizado` | Segunda devolución |
| `409` | `clasificacion_excede_pendiente` | Clasificar más de lo pendiente |
| `409` | `clave_idempotencia_reutilizada` | Misma clave con otra petición |

## Concurrencia

Orden de locks con el prefijo de AUD-10/11/12: `Pedido → Pago → EstadoOperativoPedido →
CierreParcialPedido → ReservaInventario → InventarioProducto` (inventarios por `producto_id`
ascendente); la clasificación: `Pedido → ObligacionClasificacionInventario →
InventarioProducto`; la devolución: `Pedido → ReembolsoPedido`. Carreras verificadas con dos
conexiones reales de PostgreSQL (`apps/pedidos/tests/test_resolucion_concurrencia.py`):

| Carrera | Resultado |
|---|---|
| Entrega gana a la propuesta | El cierre congela la entrega nueva |
| Propuesta gana a la entrega | La entrega responde `409 cierre_parcial_pendiente` |
| Dos cancelaciones | Una cancelación, un evento, un reembolso, una liberación por reserva; la otra `pedido_finalizado` |
| Aceptar y objetar | Una decisión; la otra `cierre_ya_resuelto` |
| Dos clasificaciones del último remanente | Una reincorporación; la otra `clasificacion_excede_pendiente` |
| Dos devoluciones | Una `DevolucionReembolso`; la otra `reembolso_ya_realizado` |
| Vencimiento gana a la cancelación | La cancelación responde `pedido_vencido` |
| Cancelación gana al vencimiento | El proceso revalida y no vence |
| Registro de pago gana a la cancelación | La cancelación responde `pago_pendiente_de_resolucion` |
| Cancelación gana al registro de pago | El registro responde `pedido_finalizado` |

## Frontend

Integrado en el detalle real existente (`/pedidos/:id` y `/panel/pedidos/:id`), sin páginas
nuevas. Cliente `features/pedidos/resolucion.ts`; query keys `claves.resolucion(usuario,
recibido, pedido)` y `claves.clasificacionesPedido(usuario, recibido, pedido)`. El artesano ve
«Cancelar pedido» solo cuando `acciones.cancelar.disponible`, y «Proponer cierre parcial» con la
estimación del servidor; el comprador ve la propuesta pendiente con «Aceptar cierre» y
«Objetar». «Seguimiento y entregas» queda en modo histórico tras finalizar y sin acciones con un
cierre pendiente; la línea de tiempo muestra «Cancelado por el taller» o «Cerrado
parcialmente» como estado final. Sin actualizaciones optimistas: tras cada respuesta se
reemplaza la resolución y se invalidan pedido, listado, cumplimiento y pago (e inventario,
movimientos y clasificaciones cuando cambia el inventario).

## Fuera de alcance

Correo, WhatsApp, pasarela, movimiento automático de dinero, devoluciones de mercancía ya entregada, disputas, chargebacks y valoración de inventario. Los eventos de cancelación, cierre y reembolso generan [notificaciones internas](notificaciones.md) dentro de la transacción.
