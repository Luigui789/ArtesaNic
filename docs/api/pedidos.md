# Contrato de API — Pedidos confirmados y snapshot contractual V1 (AUD-07)

**Fecha:** 22 de octubre de 2026 (America/Managua).
**Estado:** implementado en backend (`apps/pedidos/` y decisión en `apps/propuestas/`).
La interfaz de confirmación y consulta pertenece a AUD-09; los pagos, entregas,
cancelaciones y reembolsos pertenecen a AUD-10/11/12/13.
**Fuentes:** RF-005, RF-006, RF-016, RF-017, RF-018, RF-022, RF-023; RN-009, RN-010,
RN-011, RN-016, RN-021, RN-022, RN-023, RN-024; RNF-008, RNF-011, RNF-014, RNF-015.
**Esquema:** [OpenAPI generado](openapi.yaml), etiquetas `Pedidos` y `Solicitudes`.
**Decisiones:** [D-AUD07-01 a D-AUD07-12](../decisiones/v1.md#concreciones-de-aud-07);
estado operativo y vencimiento: [D-AUD11-01 a D-AUD11-18](../decisiones/v1.md#concreciones-de-aud-11).
**Relacionados:** [revisión y propuesta](propuestas.md), [inventario y reservas](inventario.md),
[idempotencia](idempotencia.md), [pago externo (AUD-10)](pagos.md): el pago vive en su propio
agregado y no modifica este snapshot.

## Separación conceptual del dominio

```text
Solicitud (intención del comprador)
  └─ Revisión por renglón (artesano)
       └─ Propuesta comercial final (oferta emitida por el artesano)
            └─ Decisión final del comprador (DecisionPropuesta)
                 ├─ rechazar ──► decisión histórica ("rechazada"), sin Pedido ni reservas
                 └─ aceptar  ──► Pedido confirmado + snapshot contractual + reservas de inventario
```

- **Solicitud** (`apps/solicitudes/`): intención inicial del comprador, renglones por modalidad y su revisión individual.
- **Propuesta** (`apps/propuestas/`): oferta comercial emitida por el artesano sobre los renglones aceptados. No es un compromiso bilateral ni reserva inventario.
- **Decisión de propuesta** (`DecisionPropuesta` en `apps/propuestas/`): registro histórico inmutable (`aceptada` o `rechazada`) tomado exclusivamente por el comprador propietario de la solicitud.
- **Pedido confirmado** (`Pedido`, `LineaPedido` y `CargoPedido` en `apps/pedidos/`): contrato comercial congelado que nace únicamente cuando el comprador acepta la propuesta dentro de una transacción exitosa que también revalida y reserva el inventario estándar requerido.

## Cómo nace un pedido confirmado

El comprador decide sobre la propuesta emitida mediante:

`POST /api/v1/solicitudes/mias/{solicitud_id}/propuesta/decision/`
con `Authorization: Bearer` e `Idempotency-Key`.

```json
{"decision": "aceptar"}
```

La aceptación ejecuta en una única transacción ACID en PostgreSQL:

1. Bloqueo de `Solicitud` y `Propuesta` (`SELECT … FOR UPDATE`).
2. Verificación de que la propuesta no tenga decisión previa (`409 propuesta_ya_decidida`).
3. Cálculo agregado por producto de las unidades estándar requeridas (`stock` y `personalizacion` con `unidad_estandar`) y bloqueo en orden ascendente de `producto_id` de cada `InventarioProducto` (`SELECT … FOR UPDATE`).
4. Revalidación de disponibilidad (`disponible >= requerido` para todos los productos requeridos; si alguno no alcanza, responde `409 stock_insuficiente` y revierte toda la transacción).
5. Registro de `DecisionPropuesta(decision="aceptada")`.
6. Creación de `Pedido`, `LineaPedido` y `CargoPedido` con snapshot contractual completo.
7. Creación de `ReservaInventario(estado="activa")`, incremento de `InventarioProducto.reservada` y registro de `MovimientoInventario(tipo="reserva")` por cada línea que compromete stock estándar.
8. Creación de `EstadoOperativoPedido(estado="confirmado")` (AUD-11, D-AUD11-02).

Si `"decision": "rechazar"`, se registra únicamente `DecisionPropuesta(decision="rechazada")` y no se crea `Pedido`, `ReservaInventario` ni `MovimientoInventario`.

## Snapshot contractual inmutable

Una vez confirmado el pedido, su lectura **no depende de las tablas vivas del catálogo** (`catalogo_producto`, `catalogo_categoria`) ni de mutaciones posteriores de precio, nombre, categoría o estado de publicación (RN-010, RN-024):

| Nivel | Datos congelados en `apps/pedidos/` |
|---|---|
| `Pedido` | `solicitud`, `propuesta`, `comprador`, `taller`, `confirmado_por`, `confirmado_en`, `moneda` (`"NIO"`), `modalidad_entrega`, `descripcion_entrega`, `costo_entrega`, `subtotal_productos`, `total_personalizacion`, `total_otros_cargos`, `total` |
| `LineaPedido` | `posicion`, `renglon_solicitud`, `linea_propuesta`, `producto` (`PROTECT`), `producto_nombre`, `categoria_id_historico`, `categoria_codigo`, `categoria_nombre`, `modalidad`, `cantidad`, `precio_unitario`, `subtotal`, `cargo_personalizacion`, `fecha_solicitada`, `fecha_comprometida`, `caracteristicas`, `origen_personalizacion` |
| `CargoPedido` | `posicion`, `cargo_propuesta`, `linea_pedido` (opcional), `descripcion`, `monto` |

Restricciones garantizadas en PostgreSQL (`CHECK` y `UNIQUE`) y en el modelo:

- `Pedido` es `OneToOne` con `Solicitud` y con `Propuesta` (`on_delete=PROTECT`).
- `LineaPedido` es `OneToOne` con `RenglonSolicitud` y con `LineaPropuesta` (`on_delete=PROTECT`).
- `CargoPedido` es `OneToOne` con `CargoPropuesta` (`on_delete=PROTECT`).
- `subtotal == precio_unitario * cantidad` en cada línea.
- `total == subtotal_productos + total_personalizacion + total_otros_cargos + costo_entrega`.
- `fecha_comprometida` obligatoria y exclusiva de `modalidad = "produccion"`.
- `cargo_personalizacion == 0` fuera de `modalidad = "personalizacion"`.
- `caracteristicas` y `origen_personalizacion` no vacíos en `personalizacion` y vacíos en las demás modalidades.
- `Pedido`, `LineaPedido` y `CargoPedido` rechazan cualquier `save()` posterior a su creación o `delete()`.

## Endpoints de lectura

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/v1/pedidos/mios/` | Comprador propietario |
| GET | `/api/v1/pedidos/mios/{pedido_id}/` | Comprador propietario |
| GET | `/api/v1/pedidos/recibidos/` | Artesano activo con taller aprobado destinatario |
| GET | `/api/v1/pedidos/recibidos/{pedido_id}/` | Artesano activo con taller aprobado destinatario |

### Listados paginados

Orden estable `-confirmado_en, -id`. Parámetros opcionales `page` y `page_size` (por defecto `12`, máximo `48`).

### Representación de un pedido (comprador)

```json
{
  "id": 9,
  "solicitud": 25,
  "propuesta": 4,
  "taller": {
    "id": 3,
    "nombre": "Barro Vivo",
    "slug": "barro-vivo",
    "departamento": "Masaya",
    "municipio": "San Juan de Oriente"
  },
  "estado": "confirmado",
  "vencido_en": null,
  "confirmado_en": "2026-10-22T09:15:00-06:00",
  "moneda": "NIO",
  "modalidad_entrega": "entrega_artesano",
  "descripcion_entrega": "Entrega en Masaya centro",
  "lineas": [
    {
      "id": 14,
      "posicion": 1,
      "renglon_solicitud": 70,
      "linea_propuesta": 1,
      "producto": {
        "id": 16,
        "nombre": "Jarrón tradicional",
        "categoria": {
          "id": 1,
          "codigo": "ceramica",
          "nombre": "Cerámica"
        }
      },
      "modalidad": "stock",
      "cantidad": 2,
      "precio_unitario": "100.00",
      "subtotal": "200.00",
      "cargo_personalizacion": "0.00",
      "fecha_solicitada": null,
      "fecha_comprometida": null,
      "caracteristicas": "",
      "origen_personalizacion": ""
    }
  ],
  "otros_cargos": [
    {
      "posicion": 1,
      "descripcion": "Empaque de regalo",
      "monto": "20.00",
      "linea_pedido": 14
    }
  ],
  "costo_entrega": "120.00",
  "subtotal_productos": "200.00",
  "total_personalizacion": "0.00",
  "total_otros_cargos": "20.00",
  "total": "340.00"
}
```

La vista del artesano (`/api/v1/pedidos/recibidos/...`) sustituye `taller` por `comprador: {"id": ..., "nombre": "..."}` y nunca expone el teléfono de acceso del comprador.

### Consultas y rendimiento

Los selectores de pedidos (`pedidos_con_detalle`) resuelven el detalle o cada página en **3 consultas SQL** (`Pedido` con `taller`, `comprador` y `estado_operativo`, `Prefetch` de `lineas` y `Prefetch` de `otros_cargos`), sin unir las tablas del catálogo porque el nombre del producto y la categoría provienen directamente del snapshot persistido en `LineaPedido`.

## Estado operativo y vencimiento (AUD-11)

`estado` y `vencido_en` vienen de `EstadoOperativoPedido`, una proyección mutable separada del
snapshot (que sigue inmutable). Son independientes del estado del pago (`GET …/pago/`):

| `estado` | Etiqueta | `vencido_en` |
|---|---|---|
| `confirmado` | Pedido confirmado | `null` |
| `vencido_falta_pago` | Vencido por falta de pago | instante en que el proceso ejecutó la transición |

**Cuándo vence (RN-013).** Un pedido `confirmado` vence cuando `situacion_pago()` indica plazo
vencido, con `ahora >= límite` (el instante exacto ya está vencido):

| Situación del pago | Límite | ¿Vence? |
|---|---|---|
| Sin `Pago` | `confirmado_en + 48 h` | Sí, al alcanzar el límite |
| `observado` sin corrección | `Pago.plazo_hasta` | Sí, al alcanzar el límite |
| `no_recibido` sin nuevo intento | `Pago.plazo_hasta` | Sí, al alcanzar el límite |
| `registrado` (en revisión) | — | Nunca mientras siga en revisión |
| `confirmado` | — | Nunca |

**Efectos, en una transacción por pedido:** todas las reservas `activa` pasan a `liberada`,
`InventarioProducto.reservada` baja (la existencia física no cambia), se crea un movimiento
`liberacion` por reserva, el estado pasa a `vencido_falta_pago` y se registra
`EventoEstadoPedido(confirmado → vencido_falta_pago, tipo="automatico", actor=NULL)`. El `Pago`,
sus intentos, revisiones y comprobantes no cambian. Después, toda mutación de pago responde
`409 pedido_vencido`. No hay reembolso: no existía pago confirmado.

**Quién lo ejecuta.** El proceso `procesar_vencimientos_pago` (servicio Compose
`vencimientos`, cada 60 s), nunca una petición HTTP ni el navegador: no existe endpoint para
forzarlo. Operación en [desarrollo local](../arquitectura/desarrollo-local-backend.md#vencimientos-automáticos-aud-11).

**Concurrencia.** El comprador (registrar/corregir) y el proceso compiten por el lock del
`Pedido` y ambos revalidan dentro de él: o el pago quedó `registrado` antes del límite y el
proceso no vence, o venció primero y el comprador recibe `409`. Nunca ambos.

## Permisos y aislamiento

- Comprador consultando `/pedidos/recibidos/...`: `403`.
- Artesano consultando `/pedidos/mios/...`: `403`.
- Artesano con taller `pendiente` o `rechazado`: `403`.
- Pedido de otro comprador o de otro taller: `404` (filtrado por ownership en SQL).
- Sin token o cuenta con rol `administrador` en API comercial: `401`.

## Fuera de alcance en AUD-07

- Interfaz de usuario de aceptación/rechazo y vista de pedido (AUD-09).
- Plazo de pago, selección de método de pago, comprobantes y verificación de pagos (AUD-10).
- Vencimiento por falta de pago, liberación de reservas y estado operativo inicial (AUD-11, sección anterior).
- Producción, preparación, entregas, cancelaciones, clasificación de inventario manipulado y reembolsos (AUD-12 y AUD-13).
