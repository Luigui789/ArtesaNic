# Contrato de API — Cumplimiento por renglón, entregas y recepción V1 (AUD-12)

**Fecha:** 24 de octubre de 2026 (America/Managua).
**Estado:** implementado en backend (`apps/pedidos/cumplimiento.py`, `apps/inventario/services.py`)
y en el detalle real de pedido del frontend (`features/pedidos/components/cumplimiento-pedido.tsx`).
**Fuentes:** RF-010, RF-017, RF-022, RF-023; RN-015, RN-018, RN-021, RN-022, RN-023 y RN-024
(solo para conservar la información de consumo).
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Cumplimiento`.
**Decisiones:** [D-AUD12-01 a D-AUD12-20](../decisiones/v1.md#concreciones-de-aud-12); cambios de
AUD-13 en [D-AUD13-01 y D-AUD13-05](../decisiones/v1.md#concreciones-de-aud-13).
**Relacionados:** [pedidos](pedidos.md), [pagos](pagos.md), [inventario](inventario.md),
[idempotencia](idempotencia.md).

## Modelo

```text
Pedido (snapshot inmutable, AUD-07)
 ├── EstadoOperativoPedido   confirmado → en_cumplimiento → entregado   (vencido_falta_pago: AUD-11)
 ├── LineaPedido (snapshot)
 │    ├── CumplimientoLineaPedido   iniciado_en, iniciado_por (1:1, nace con el pedido)
 │    └── ReservaInventario          cantidad (original) + cantidad_consumida
 └── EntregaPedido (numero, fecha, registrado_por, registrado_en)   ledger append-only
      ├── LineaEntrega (linea_pedido, cantidad > 0)                 UNIQUE (entrega, linea)
      └── RecepcionEntrega (resultado, motivo)                      una por entrega
```

- El snapshot contractual (`Pedido`, `LineaPedido`, `CargoPedido`) **no cambia**; AUD-12 solo
  extiende la proyección operativa de AUD-11.
- El estado de cada renglón **se deriva**, no se persiste:

  | Condición | `estado` del renglón |
  |---|---|
  | Sin `iniciado_en` | `pendiente` |
  | Iniciado y `cantidad_entregada < cantidad` | `en_cumplimiento` |
  | `cantidad_entregada == cantidad` | `entregado` |

- `cantidad_entregada = SUM(LineaEntrega.cantidad)` de la línea; nunca un contador enviado
  por el cliente. Nunca supera la cantidad acordada.

## Estado global del pedido

| `estado` | Etiqueta | Cómo se alcanza |
|---|---|---|
| `confirmado` | Pedido confirmado | Inicial (AUD-07/11) |
| `en_cumplimiento` | En cumplimiento | Primer renglón iniciado |
| `entregado` | Entregado | Todas las líneas con `cantidad_entregada == cantidad` |
| `vencido_falta_pago` | Vencido por falta de pago | Proceso de AUD-11 (terminal para AUD-12) |
| `cancelado_artesano` | Cancelado por el taller | Cancelación antes de cualquier entrega (AUD-13, terminal) |
| `cerrado_parcial` | Cerrado parcialmente | El comprador acepta un cierre parcial (AUD-13, terminal) |

No existen los estados globales históricos `aceptado`, `en_produccion` ni
`listo_para_entrega`. Cada transición deja un `EventoEstadoPedido(tipo="artesano",
actor=<artesano real>)`; el vencimiento sigue con `tipo="automatico"` y `actor = NULL`.
`UNIQUE` parciales garantizan como máximo un evento `en_cumplimiento` y uno `entregado` por
pedido. `entregado` no espera la respuesta del comprador.

## Regla de Pago confirmado

Iniciar y entregar exigen `Pago.estado = "confirmado"`, comprobado en el servidor dentro de la
transacción y después de bloquear `Pedido` y `Pago`. Sin `Pago`, `registrado`, `observado` o
`no_recibido` responden `409 pago_no_confirmado` sin efectos. El frontend solo oculta las
acciones por comodidad; no es autoridad.

## Inventario por modalidad

| Modalidad | Al iniciar | Al entregar |
|---|---|---|
| `stock` | Sin cambios: la reserva sigue comprometida | Consume de su reserva lo entregado: `existencia_fisica -= q`, `reservada -= q`, `cantidad_consumida += q` |
| `produccion` | Sin cambios | Sin cambios (no se incorpora a stock) |
| `personalizacion` + `desde_cero` | Sin cambios | Sin cambios |
| `personalizacion` + `unidad_estandar` | Consume **toda** su reserva (`consumida`) | Sin cambios (ya consumida) |

Consumir descuenta a la vez existencia física y reservada: la disponibilidad pública no
cambia. Ejemplo (stock 5): física 10, reservada 5 → entrega 2 → física 8, reservada 3 →
entrega 3 → física 5, reservada 0; disponible = 5 en todo momento. Cada consumo crea un
`MovimientoInventario(tipo="consumo")` con pedido, línea y reserva; motivos «Consumo por
entrega #N del pedido #X.» o «Consumo al iniciar transformación del pedido #X.».

## Endpoints

| Método | Ruta | Acceso | Idempotencia | Código |
|---|---|---|---|---|
| GET | `/api/v1/pedidos/mios/{pedido_id}/cumplimiento/` | Comprador propietario | — | `200` |
| GET | `/api/v1/pedidos/recibidos/{pedido_id}/cumplimiento/` | Artesano activo, taller aprobado, pedido propio | — | `200` |
| POST | `/api/v1/pedidos/recibidos/{pedido_id}/lineas/{linea_id}/iniciar/` | Artesano propietario | `iniciar_cumplimiento_linea` | `200` |
| POST | `/api/v1/pedidos/recibidos/{pedido_id}/entregas/` | Artesano propietario | `registrar_entrega_pedido` | `201` |
| POST | `/api/v1/pedidos/mios/{pedido_id}/entregas/{entrega_id}/recepcion/` | Comprador propietario | `registrar_recepcion_entrega` | `201` |

Las rutas de lectura y de pago existentes (`/pedidos/mios/`, `/pedidos/recibidos/`, `…/pago/…`)
no cambian. Todas las mutaciones exigen `Idempotency-Key` y responden con la representación
de cumplimiento actual. Recuperación tras una respuesta perdida:
`GET /api/v1/operaciones/{tipo}/{clave}/` (AUD-08), sin endpoints nuevos.

### Lectura

Comprador y artesano reciben la misma representación, sin identificadores de inventario:

```json
{
  "pedido": 9,
  "estado": "en_cumplimiento",
  "lineas": [
    {
      "linea": 14,
      "posicion": 1,
      "modalidad": "stock",
      "cantidad": 5,
      "estado": "en_cumplimiento",
      "iniciado_en": "2026-10-24T10:00:00-06:00",
      "cantidad_entregada": 2,
      "cantidad_pendiente": 3
    },
    {
      "linea": 15,
      "posicion": 2,
      "modalidad": "produccion",
      "cantidad": 1,
      "estado": "pendiente",
      "iniciado_en": null,
      "cantidad_entregada": 0,
      "cantidad_pendiente": 1
    }
  ],
  "entregas": [
    {
      "id": 3,
      "numero": 1,
      "fecha": "2026-10-24",
      "registrado_en": "2026-10-24T15:30:00-06:00",
      "lineas": [{ "linea": 14, "cantidad": 2 }],
      "recepcion": null
    }
  ]
}
```

Tras la respuesta del comprador, `recepcion` es
`{"resultado": "confirmada" | "discrepancia", "motivo": "...", "registrado_en": "..."}`.
La lectura usa cuatro consultas fijas (pedido + estado, líneas + cumplimiento, entregas +
recepción, líneas de entrega). Nombre, fecha comprometida y características del producto se
leen del detalle del pedido (snapshot).

### Iniciar un renglón

Cuerpo `{}` (cualquier campo responde `400`). Orden de validación dentro de la transacción:
pedido propio (`404`), línea del pedido (`404`), `pedido_vencido`, `pedido_entregado`,
`pedido_finalizado` (AUD-13), `pago_no_confirmado`, `cierre_parcial_pendiente` (AUD-13),
`linea_ya_iniciada`. Huella: `{"pedido_id", "linea_id"}`. Misma clave y
otra línea: `409 clave_idempotencia_reutilizada`; dos claves distintas sobre la misma línea:
`409 linea_ya_iniciada`.

### Registrar una entrega

```json
{ "fecha": "2026-10-24", "lineas": [{ "linea": 14, "cantidad": 2 }, { "linea": 15, "cantidad": 1 }] }
```

- `fecha`: `YYYY-MM-DD`, fecha declarada de la entrega efectiva; no posterior a la fecha actual
  de America/Managua según el reloj del servidor (`400`). `registrado_en` siempre es del
  servidor.
- `lineas`: no vacía, sin líneas repetidas, cantidades enteras `> 0` (`400`); todas del pedido
  (`400`); todas iniciadas (`409 linea_no_iniciada`); ninguna por encima de lo pendiente
  (`409 cantidad_entrega_excede_pendiente`). Los `409` de renglón incluyen `"lineas": [ids]`.
- Todo o nada: se valida todo antes de escribir y cualquier error revierte la entrega, sus
  líneas, los consumos y el cambio de estado.
- Numeración `1..N` por pedido bajo el lock del pedido (`UNIQUE (pedido, numero)`).
- Huella: `pedido_id`, `fecha` y `lineas` **ordenadas por `linea`** (el orden del cliente no
  importa). Una clave nueva con el mismo cuerpo es otra operación: el dominio reevalúa las
  cantidades.

### Confirmar recepción o registrar discrepancia

`{"resultado": "confirmada"}` (sin motivo; con motivo `400`) o
`{"resultado": "discrepancia", "motivo": "..."}` (motivo recortado, 1–1000 caracteres; vacío
`400`). Una sola respuesta por entrega (`409 recepcion_ya_registrada`); se admite aunque el
pedido ya esté `entregado`. Huella: `pedido_id`, `entrega_id`, `resultado` y `motivo`
recortado.

**Una discrepancia no revierte nada:** no repone inventario, no reabre reservas, no borra
movimientos, no revierte la entrega, no cambia el estado del pedido ni crea reembolsos o
cierres parciales. Es evidencia histórica para AUD-13.

## Códigos

| HTTP | `codigo` | Cuándo |
|---|---|---|
| `400` | — | Entrada mal formada, fecha futura, campos extra, `Idempotency-Key` inválida |
| `401` | — | Sin autenticación (o cuenta de administración en la API comercial) |
| `403` | — | Rol incorrecto o taller pendiente/rechazado |
| `404` | — | Pedido, línea o entrega inexistente o ajeno |
| `409` | `pedido_vencido` | Pedido vencido por falta de pago |
| `409` | `pedido_entregado` | Pedido ya entregado por completo |
| `409` | `pedido_finalizado` | Pedido cancelado por el taller o cerrado parcialmente (AUD-13) |
| `409` | `cierre_parcial_pendiente` | Hay una propuesta de cierre parcial sin respuesta (AUD-13) |
| `409` | `pago_no_confirmado` | Pago inexistente o no confirmado |
| `409` | `linea_ya_iniciada` | El renglón ya fue iniciado |
| `409` | `linea_no_iniciada` | Entrega de un renglón sin iniciar |
| `409` | `cantidad_entrega_excede_pendiente` | La cantidad supera lo pendiente |
| `409` | `recepcion_ya_registrada` | La entrega ya tiene respuesta del comprador |
| `409` | `clave_idempotencia_reutilizada` | Misma clave con otra petición |

## Concurrencia

Orden de locks, compatible con AUD-10 y AUD-11:
`Pedido → Pago → EstadoOperativoPedido → CumplimientoLineaPedido → ReservaInventario →
InventarioProducto` (inventarios por `producto_id` ascendente). El lock del `Pedido` serializa
entregas simultáneas (nunca 4 entregadas sobre 3), inicios repetidos (nunca dos consumos) y la
carrera con el proceso de vencimiento: si el pedido venció, iniciar o entregar responde
`409 pedido_vencido`; con Pago confirmado el proceso nunca lo vence.

## Frontend

El seguimiento vive en el detalle real existente (`/pedidos/:id` y `/panel/pedidos/:id`,
`DetallePedidoConfirmado`), sin rutas nuevas. Cliente en `features/pedidos/cumplimiento.ts`
(DTO `snake_case` → `camelCase`), query key `claves.cumplimiento(usuario, recibido, pedido)`,
`Idempotency-Key` con `crearIntentoSeguro()` (misma clave tras timeout, red caída o 5xx) y, tras
cada respuesta, la representación del servidor reemplaza la caché e invalida pedido, listado y,
si hubo consumo, inventario y movimientos de los productos afectados. Sin actualizaciones
optimistas.

La tarjeta «Progreso del pedido» (`components/progreso-pedido.tsx`, derivación en
`progreso.ts`) resume la etapa general en una línea de tiempo vertical: pedido confirmado →
pago → en cumplimiento → entregas → pedido entregado, o confirmado → vencido por falta de
pago. Los hitos son solo visuales (no hay estados nuevos en el backend) y se derivan del
estado del pedido, del estado del pago y del cumplimiento, leídos de las mismas `queryKey`
que las secciones de pago y seguimiento, sin peticiones adicionales.

## Resolución (AUD-13) y fuera de alcance (AUD-20)

Cancelación del artesano, cierre parcial y su objeción, reembolsos, reincorporación, baja y
clasificación reutilizable/baja están en [resolución de pedidos](resolucion-pedidos.md). Desde
AUD-13, iniciar y entregar responden `409 pedido_finalizado` en un pedido cancelado o cerrado
parcialmente y `409 cierre_parcial_pendiente` mientras una propuesta de cierre espera al
comprador; el seguimiento queda visible en modo histórico. La respuesta del comprador a una
entrega sigue admitida. Las notificaciones persistentes pertenecen a AUD-20; los
puntos de integración (`pedido_en_cumplimiento`, `entrega_registrada`, `pedido_entregado`,
`recepcion_confirmada`, `discrepancia_entrega`) se emiten tras el `COMMIT` en
`apps/pedidos/cumplimiento.py` y hoy solo registran un log `INFO`.
