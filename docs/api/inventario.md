# Contrato de API — Inventario de unidades estándar y reservas V1 (AUD-07)

**Fecha:** 22 de octubre de 2026 (America/Managua).
**Estado:** inventario de unidades estándar, reservas transaccionales al confirmar pedido y
bitácora append-only de movimientos (`apps/inventario/`). La liberación, clasificación,
consumo por entrega y baja por cancelación/devolución pertenecen a AUD-11/12/13.
**Fuentes:** RF-001, RF-005, RF-017, RF-018, RF-022, RF-023; RN-009, RN-011, RN-021,
RN-022, RN-023; RNF-008, RNF-011, RNF-014, RNF-015.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Inventario`.
**Decisiones:** [D-AUD07-04 a D-AUD07-12](../decisiones/v1.md#concreciones-de-aud-07).
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

Reservar unidades al confirmar un pedido **incrementa `reservada` y no reduce `existencia_fisica`** (RF-022, RN-011). La existencia física solo disminuirá cuando una entrega se complete (`consumo`, AUD-11) o por un ajuste negativo o baja sobre unidades disponibles no comprometidas.

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
| `cantidad` | Entero $> 0$, igual a `linea_pedido.cantidad` |
| `estado` | `activa` (creada en AUD-07), `liberada` o `consumida` (preparados para AUD-11/12/13) |
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
| `liberacion` | AUD-12/13 | $> 0$ | Preparado en el esquema para liberación de reserva sin manipulación |
| `consumo` | AUD-11 | $< 0$ | Preparado en el esquema para entrega completada |
| `reincorporacion` | AUD-12/13 | $> 0$ | Preparado en el esquema para clasificación posterior |
| `baja` | AUD-12/13 | $< 0$ | Preparado en el esquema para unidades dañadas o dadas de baja |

Cada movimiento almacena `existencia_posterior` y `reservada_posterior` (con `CHECK` `reservada_posterior <= existencia_posterior`), `actor`, `motivo`, referencias opcionales a `pedido`, `linea_pedido` y `reserva`, y `creado_en`.

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
