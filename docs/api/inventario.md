# Contrato de API — Inventario de unidades estándar y reservas V1 (AUD-07)

**Fecha:** 22 de octubre de 2026 (America/Managua).
**Estado:** inventario de unidades estándar, reservas transaccionales al confirmar pedido y
bitácora append-only de movimientos (`apps/inventario/`). Liberación por vencimiento en
AUD-11; consumo por entrega y por inicio de transformación en AUD-12; liberación del
remanente al cancelar o cerrar parcialmente, clasificación, reincorporación y baja de unidades
manipuladas en AUD-13.
**Fuentes:** RF-001, RF-005, RF-017, RF-018, RF-022, RF-023; RN-009, RN-011, RN-021,
RN-022, RN-023; RNF-008, RNF-011, RNF-014, RNF-015.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Inventario`.
**Decisiones:** [D-AUD07-04 a D-AUD07-12](../decisiones/v1.md#concreciones-de-aud-07),
[D-AUD11](../decisiones/v1.md#concreciones-de-aud-11), [D-AUD12](../decisiones/v1.md#concreciones-de-aud-12)
y [D-AUD13](../decisiones/v1.md#concreciones-de-aud-13).
**Relacionados:** [pedidos confirmados](pedidos.md), [revisión y propuesta](propuestas.md),
[idempotencia](idempotencia.md).

## Modelo de inventario por producto

Cada producto del catálogo puede tener a lo sumo un registro `InventarioProducto`
(`OneToOne` con `catalogo.Producto`, `on_delete=PROTECT`). No se exige que exista al crear
el producto en el catálogo; el artesano lo inicializa explícitamente o antes de operar con
stock estándar.

| Campo | Tipo | Significado |
|---|---|---|
| `existencia_fisica` | Entero $\ge 0$ | Unidades estándar físicamente existentes en el taller |
| `reservada` | Entero $\ge 0$ | Unidades comprometidas en reservas activas de pedidos confirmados |
| `disponible` | Calculado | `existencia_fisica - reservada` |

Restricciones en PostgreSQL (`CHECK`):

- `existencia_fisica >= 0`
- `reservada >= 0`
- `reservada <= existencia_fisica` (nunca puede existir `disponible < 0`)

Reservar unidades al confirmar un pedido **incrementa `reservada` y no reduce `existencia_fisica`** (RF-022, RN-011). La existencia física solo disminuye por un `consumo` de una reserva (entrega de stock o inicio de transformación, AUD-12), por un ajuste negativo o por una baja sobre unidades disponibles no comprometidas.

## Reglas de reserva por modalidad de renglón

Cuando el comprador acepta una propuesta (`POST /api/v1/solicitudes/mias/{solicitud_id}/propuesta/decision/`), el servicio evalúa cada línea de la propuesta según la modalidad y el origen del renglón:

| Modalidad | Origen de personalización | ¿Requiere reserva de stock estándar? | Cantidad reservada |
|---|---|---|---|
| `stock` | `""` | **Sí** | `linea.cantidad` |
| `personalizacion` | `unidad_estandar` | **Sí** | `linea.cantidad` |
| `produccion` | `""` | **No** | `0` |
| `personalizacion` | `desde_cero` | **No** | `0` |

### Suma agregada por producto y bloqueo determinista

Si una misma propuesta incluye varias líneas del mismo `producto_id` que requieren stock estándar (por ejemplo, una línea en `stock` por 2 unidades y otra en `personalizacion` con `unidad_estandar` por 1 unidad), el servicio **suma primero el total requerido por producto** ($2 + 1 = 3$), bloquea las filas de `InventarioProducto` en orden ascendente de `producto_id` (`SELECT … FOR UPDATE`) para evitar interbloqueos y comprueba `disponible >= total_requerido` en todos los productos antes de crear el pedido o reservar.

Si el producto no tiene `InventarioProducto` inicializado o `disponible < total_requerido`, responde `409` con `codigo: "stock_insuficiente"` y revierte toda la transacción.

## Reservas (`ReservaInventario`)

Cada `LineaPedido` que compromete unidades estándar genera una fila en `ReservaInventario` (`OneToOne` con `LineaPedido`, `on_delete=PROTECT`):

| Campo | Significado |
|---|---|
| `pedido` | Referencia al `Pedido` confirmado (`PROTECT`) |
| `linea_pedido` | Referencia única a la `LineaPedido` (`OneToOne`, `PROTECT`) |
| `producto` | Producto cuyas unidades estándar quedan reservadas (`PROTECT`) |
| `cantidad` | Entero $> 0$, igual a `linea_pedido.cantidad`; dato histórico que nunca se reescribe |
| `cantidad_consumida` | Entero, `0 <= cantidad_consumida <= cantidad` (AUD-12); `cantidad_pendiente = cantidad - cantidad_consumida` |
| `estado` | `activa` (consumida < cantidad), `liberada` (vencimiento, AUD-11; puede conservar un consumo previo) o `consumida` (consumida = cantidad, AUD-12) |
| `creada_en` | Timestamp de creación |

## Bitácora de movimientos (`MovimientoInventario`)

Todo cambio en `existencia_fisica` o `reservada` registra un `MovimientoInventario` append-only dentro de la misma transacción. El modelo bloquea cualquier `save()` posterior a la creación o `delete()`.

| Tipo (`TipoMovimientoInventario`) | Fase | `cantidad` | Efecto en `(existencia_fisica, reservada)` |
|---|---|---|---|
| `existencia_inicial` | AUD-07 | $\ge 0$ | Establece `(cantidad, 0)` al crear `InventarioProducto` |
| `entrada` | AUD-07 | $> 0$ | `(+cantidad, +0)` |
| `ajuste_positivo` | AUD-07 | $> 0$ | `(+cantidad, +0)` con `motivo` obligatorio |
| `ajuste_negativo` | AUD-07 | $< 0$ | `(-|delta|, +0)` con `motivo` obligatorio; exige `existencia_fisica - |delta| >= reservada` |
| `reserva` | AUD-07 | $> 0$ | `(+0, +cantidad)` vinculada a `pedido`, `linea_pedido` y `reserva` |
| `liberacion` | AUD-11/13 | $> 0$ | `(+0, -cantidad)` vinculada a `pedido`, `linea_pedido` y `reserva`; `actor = NULL` en el vencimiento automático; el artesano (cancelación) o el comprador (aceptación del cierre) en AUD-13 |
| `consumo` | AUD-12 | $> 0$ | `(-cantidad, -cantidad)` vinculada a `pedido`, `linea_pedido` y `reserva`; entrega de stock o inicio de transformación sobre unidad estándar |
| `reincorporacion` | AUD-13 | $> 0$ | `(+cantidad, +0)` vinculada a `pedido`, `linea_pedido` y `reserva`: unidad manipulada clasificada «Reutilizable» (CHECK `movimiento_reincorporacion_coherente`) |
| `baja` | AUD-13 | $> 0$ | Con reserva: `(+0, +0)` y motivo obligatorio, disposición final de una unidad ya consumida, sin doble descuento (CHECK `movimiento_baja_clasificada_coherente`); otros usos futuros sin reserva no se limitan |

Cada movimiento almacena `existencia_posterior` y `reservada_posterior` (con `CHECK` `reservada_posterior <= existencia_posterior`), `actor`, `motivo`, referencias opcionales a `pedido`, `linea_pedido` y `reserva`, y `creado_en`.

## Liberación por vencimiento (AUD-11)

`liberar_reservas_de_pedido` (en `apps/inventario/services.py`) se ejecuta dentro de la
transacción de vencimiento, con el `Pedido` ya bloqueado: bloquea las reservas del pedido y
después los `InventarioProducto` en orden ascendente de `producto_id`, valida que **todas**
estén `activa` y solo entonces escribe. Por reserva: `reservada -= cantidad`,
`estado = "liberada"` y un movimiento `liberacion` con `existencia_despues = existencia_antes`,
`reservada_despues = reservada_antes - cantidad` y motivo «Vencimiento automático por falta de
pago.». Ejemplo: física 10, reservada 4, disponible 6 → física 10, reservada 0, disponible 10.

PostgreSQL lo respalda con `movimiento_liberacion_coherente` (pedido, línea y reserva
obligatorios; existencia sin cambio; reservada reducida exactamente en `cantidad`) y
`movimiento_liberacion_unica_por_reserva` (`UNIQUE` parcial). Una reserva `consumida` o
`liberada` en un pedido sin pago confirmado es una inconsistencia: se aborta todo
(`ReservaInconsistente`), sin reparación automática ([D-AUD11-11](../decisiones/v1.md#concreciones-de-aud-11)).

## Consumo de reservas (AUD-12)

`consumir_reserva` (servicio interno de `apps/inventario/services.py`, sin endpoint) solo lo
invocan los servicios de cumplimiento, con `Pedido`, reserva e inventario ya bloqueados. Valida
reserva `activa`, `0 < q <= cantidad_pendiente`, inventario del producto y saldos suficientes, y
aplica `existencia_fisica -= q`, `reservada -= q`, `cantidad_consumida += q` (estado `consumida`
al agotarla). La disponibilidad no cambia. Ejemplo de stock 5 con física 10: entrega 2 → física
8, reservada 3; entrega 3 → física 5, reservada 0; disponible 5 en ambos casos. Una
personalización sobre unidad estándar consume toda su reserva al iniciar la transformación;
producción y personalización desde cero nunca consumen. CHECK `movimiento_consumo_coherente`;
sin `UNIQUE` por reserva (varias entregas parciales). La liberación de AUD-11 libera solo
`cantidad_pendiente`. Detalle en [cumplimiento](cumplimiento.md#inventario-por-modalidad).

En la interfaz, el historial muestra `consumo` como «Consumo de unidad reservada» junto con su
motivo («Consumo por entrega #N del pedido #X.» o «Consumo al iniciar transformación del
pedido #X.»).

## Finalización del pedido y clasificación (AUD-13)

Al cancelar el taller o aceptar el comprador un cierre parcial,
`liberar_remanentes_por_finalizacion` libera solo `cantidad_pendiente` de cada reserva `activa`
(`reservada -= q`, existencia igual, `activa → liberada` conservando `cantidad_consumida`); las
`consumida` no cambian y una `liberada` previa aborta la transacción. A diferencia del liberador
de AUD-11, admite reservas consumidas por el cumplimiento. Ejemplos: stock 5 con 2 entregadas →
se liberan 3 y no queda nada por clasificar; personalización sobre unidad base de 4, consumida
al iniciar y 1 entregada → nada que liberar y una obligación de clasificación por 3.

Las unidades consumidas y no entregadas (`cantidad_consumida − entregada`) generan una
`ObligacionClasificacionInventario` por reserva. El artesano las clasifica desde el detalle del
pedido (`/api/v1/pedidos/recibidos/{id}/clasificaciones/`, ver
[resolución de pedidos](resolucion-pedidos.md#clasificación-solo-artesano)): `reutilizable`
reincorpora (`existencia_fisica += q`, disponible otra vez) y `baja` deja existencia y
reservada iguales. Ejemplo: existencia 6 → 2 reutilizables → 8; 1 baja → 8. El historial
muestra ambos movimientos con su motivo.

## Endpoints del artesano

Todas las rutas requieren `Authorization: Bearer` de un artesano activo con taller `aprobado`, y filtran por `producto__taller__propietario = request.user` en SQL (`404` si el producto no existe o pertenece a otro taller).

| Método | Ruta | Idempotencia | Código |
|---|---|---|---|
| GET | `/api/v1/inventario/` | No | `200` |
| GET | `/api/v1/inventario/productos/{producto_id}/` | No | `200` (`404` si aún no se inicializó) |
| POST | `/api/v1/inventario/productos/{producto_id}/inicial/` | `establecer_inventario_inicial` | `201` |
| POST | `/api/v1/inventario/productos/{producto_id}/entradas/` | `registrar_entrada_inventario` | `200` |
| POST | `/api/v1/inventario/productos/{producto_id}/ajustes/` | `ajustar_inventario` | `200` |
| GET | `/api/v1/inventario/productos/{producto_id}/movimientos/` | No | `200` (paginado) |

### 1. Establecer existencia inicial

`POST /api/v1/inventario/productos/{producto_id}/inicial/` con `Idempotency-Key`.

```json
{"cantidad": 10, "motivo": "Inventario físico inicial"}
```

- `cantidad`: entero $\ge 0$ (se permite `0`). `motivo`: opcional, hasta 500 caracteres.
- Crea `InventarioProducto` y un `MovimientoInventario` de tipo `existencia_inicial`.
- Si el producto ya tiene inventario inicializado y se usa una clave de idempotencia distinta, responde `409` con `codigo: "inventario_ya_inicializado"`.

### 2. Registrar entrada de unidades estándar

`POST /api/v1/inventario/productos/{producto_id}/entradas/` con `Idempotency-Key`.

```json
{"cantidad": 5, "motivo": "Horneada semanal"}
```

- `cantidad`: entero $> 0$. `motivo`: opcional, hasta 500 caracteres.
- Incrementa `existencia_fisica` y registra un movimiento `entrada`.
- Si el producto aún no tiene inventario inicializado, responde `409` con `codigo: "inventario_no_inicializado"`.

### 3. Ajustar inventario (positivo o negativo)

`POST /api/v1/inventario/productos/{producto_id}/ajustes/` con `Idempotency-Key`.

```json
{"delta": -2, "motivo": "Dos piezas quebradas en estantería"}
```

- `delta`: entero distinto de `0` (`0` responde `400`).
- `motivo`: **obligatorio** (no vacío tras recortar espacios, hasta 500 caracteres).
- Si `delta > 0`: incrementa `existencia_fisica` y registra `ajuste_positivo`.
- Si `delta < 0`: verifica bajo `SELECT … FOR UPDATE` que `existencia_fisica + delta >= reservada`. Si intentara reducir la existencia por debajo de las unidades comprometidas en reservas activas (RN-022), responde `409` con `codigo: "ajuste_bajo_comprometido"` sin modificar el inventario ni crear movimiento.

### 4. Consultar inventario y movimientos

`GET /api/v1/inventario/productos/{producto_id}/`

```json
{
  "id": 1,
  "producto": {
    "id": 16,
    "nombre": "Jarrón tradicional",
    "publicado": true,
    "categoria": {
      "id": 1,
      "codigo": "ceramica",
      "nombre": "Cerámica"
    }
  },
  "existencia_fisica": 13,
  "reservada": 2,
  "disponible": 11,
  "creado_en": "2026-10-22T08:00:00-06:00",
  "actualizado_en": "2026-10-22T09:15:00-06:00"
}
```

`GET /api/v1/inventario/productos/{producto_id}/movimientos/` devuelve la bitácora paginada (`-creado_en, -id`, `page_size` por defecto 12 y máximo 48) con `tipo`, `cantidad`, `existencia_posterior`, `reservada_posterior`, `motivo`, `pedido`, `linea_pedido`, `reserva`, `actor: {id, nombre}` y `creado_en`.

## Códigos de conflicto (`409`)

| Código | Endpoint | Causa |
|---|---|---|
| `inventario_ya_inicializado` | `POST .../inicial/` | El producto ya cuenta con `InventarioProducto` |
| `inventario_no_inicializado` | `POST .../entradas/` o `POST .../ajustes/` | El producto aún no tiene `InventarioProducto` |
| `ajuste_bajo_comprometido` | `POST .../ajustes/` | Un `delta < 0` dejaría `existencia_fisica < reservada` |
| `stock_insuficiente` | `POST /api/v1/solicitudes/mias/{id}/propuesta/decision/` | Algún producto requerido no tiene inventario o `disponible < requerido` al momento de aceptar |
| `clave_idempotencia_reutilizada` | Cualquier `POST` protegido | Reutilización de `Idempotency-Key` con otra huella o producto |
