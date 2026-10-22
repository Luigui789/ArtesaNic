# Contrato de API — Revisión y propuesta final V1 (AUD-06)

**Fecha:** 21 de octubre de 2026 (America/Managua).
**Estado:** revisión individual de renglones con historial, DR-03 y propuesta comercial final
persistente, visible para el comprador. La aceptación o el rechazo del comprador, el pedido
confirmado y las reservas pertenecen a AUD-07/AUD-09.
**Fuentes:** RF-005, RF-006, RF-016, RF-017, RF-018; RN-007, RN-008, RN-009, RN-010.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Solicitudes`.
**Decisiones:** [DR-03 y D-AUD06-01 a D-AUD06-15](../decisiones/v1.md#concreciones-de-aud-06).
**Relacionados:** [solicitudes](solicitudes.md), [idempotencia](idempotencia.md).

## Etapas

```text
Solicitud (comprador)
  └─ revisión individual de cada renglón (artesano) ── historial append-only
       ├─ todos rechazados ─────────────► rechazada (DR-03, terminal, sin propuesta)
       └─ todos resueltos, ≥1 aceptado ─► lista_propuesta
                                            └─ emisión ─► propuesta_emitida + Propuesta
                                                             └─ AUD-07: decisión del comprador,
                                                                snapshot contractual y reservas
```

Solicitud ≠ Propuesta ≠ Pedido confirmado. Una propuesta emitida es una oferta comercial
estable; **no** es un pedido, no reserva inventario y no congela el snapshot contractual.

## Estados de la solicitud

| Código | Significado |
|---|---|
| `pendiente_revision` | Al menos un renglón sigue `pendiente` |
| `lista_propuesta` | Todos resueltos y al menos uno `aceptado`; el artesano puede emitir la propuesta |
| `propuesta_emitida` | Existe la propuesta final; la decisión del comprador es de AUD-07 |
| `rechazada` | DR-03: todos resueltos y ninguno aceptado. Terminal |

El estado se deriva en un único lugar (`estado_tras_revision`) dentro de la misma transacción
que registra la resolución. No se reutilizan estados del pedido anterior (`aceptado`,
`en_produccion`, `cancelada`, …). Un CHECK de PostgreSQL limita los valores.

## Revisión individual

`POST /api/v1/solicitudes/recibidas/{solicitud_id}/renglones/{renglon_id}/resolver/`
con `Authorization: Bearer` e `Idempotency-Key`.

```json
{"resolucion": "aceptado"}
{"resolucion": "rechazado", "motivo_rechazo": "Sin materia prima este mes"}
```

- Transiciones: `pendiente → aceptado` y `pendiente → rechazado`. La resolución es final:
  no se invierte, no se repite con otra clave ni cambia el motivo (`409 renglon_ya_resuelto`).
  V1 no define reabrir ni reconsiderar.
- Rechazar exige motivo no vacío (se recortan espacios; hasta 1000 caracteres). Aceptar no
  admite el campo `motivo_rechazo`, ni siquiera vacío.
- No hay contraoferta: cualquier otro campo (cantidad, producto, modalidad, precio,
  estado, actor, taller…) responde `400`. Producto, modalidad, cantidad, fecha solicitada,
  características y origen permanecen intactos; el renglón rechazado no se elimina.
- Responde `200` con la solicitud actualizada (`SolicitudArtesano`).

**Historial.** Cada resolución crea un registro `RevisionRenglonSolicitud` (resolución,
motivo, revisor y fecha), único por renglón y sin edición ni borrado desde el ORM. Los
campos `resolucion`/`motivo_rechazo` del renglón son su proyección operativa y se escriben
en la misma transacción. En lectura, cada renglón expone `resuelto_en` (null si está
pendiente); la vista del taller añade `resuelto_por: {id, nombre}`.

## Propuesta final

`POST /api/v1/solicitudes/recibidas/{solicitud_id}/propuesta/` con `Idempotency-Key`.
Una sola operación crea la propuesta completa: no hay borradores ni edición posterior.

```json
{
  "modalidad_entrega": "entrega_artesano",
  "descripcion_entrega": "Entrega en Masaya centro",
  "costo_entrega": "120.00",
  "lineas": [
    {"renglon": 70},
    {"renglon": 71, "fecha_comprometida": "2026-12-01"},
    {"renglon": 72, "cargo_personalizacion": "45.50"}
  ],
  "otros_cargos": [
    {"descripcion": "Empaque de regalo", "monto": "20.00"},
    {"descripcion": "Barniz especial", "monto": "15.25", "renglon": 72}
  ]
}
```

Requisitos de la emisión, comprobados con la solicitud bloqueada:

| Condición | Respuesta si falla |
|---|---|
| Solicitud del taller propio | `404` |
| Artesano activo con taller aprobado | `403` |
| Sin renglones pendientes | `409 solicitud_con_renglones_pendientes` |
| No rechazada (DR-03) | `409 solicitud_rechazada` |
| Al menos un renglón aceptado | `409 solicitud_sin_renglones_aceptados` |
| Sin propuesta previa | `409 propuesta_ya_emitida` |
| `lineas` = exactamente los renglones aceptados, una vez cada uno | `400` |

Reglas de las condiciones comerciales:

- **Precio unitario:** lo toma el servidor del producto vigente al emitir. El cliente no
  envía precio, subtotal, total, cantidad, modalidad, comprador, taller ni estado (`400`).
  Un producto despublicado después de crear la solicitud sigue pudiendo revisarse y
  cotizarse: la despublicación solo afecta a nuevas solicitudes y no cancela compromisos
  en curso ([D-AUD06-06](../decisiones/v1.md#concreciones-de-aud-06)).
- **Subtotal por línea** = precio unitario × cantidad del renglón (CHECK en PostgreSQL).
- **Cargo de personalización:** solo en renglones de personalización; ≥ 0; por defecto 0.
- **Fecha comprometida:** obligatoria solo en producción; fecha válida, hoy o posterior
  (Managua). No se exige que sea igual o posterior a la fecha solicitada: ninguna regla lo fija.
- **Plan de entrega:** `retiro_taller`, `punto_encuentro`, `entrega_artesano` u `otra`;
  `otra` exige descripción, en las demás es opcional. El costo lo define manualmente el
  artesano (≥ 0); retirar en el taller no lo fuerza a 0.
- **Otros cargos:** descripción no vacía (hasta 200), monto ≥ 0, opcionalmente atribuido a un
  renglón aceptado; hasta 20. No existen descuentos, promociones ni impuestos en V1.
- **Importes:** C$ con dos decimales exactos (`Decimal`, nunca float). Entradas hasta
  99 999 999.99; importes calculados hasta 16 dígitos enteros (si se excede: `400`).
- **Total** = subtotal de productos + personalización + otros cargos + entrega (CHECK).

La emisión crea propuesta, líneas y cargos y pasa la solicitud a `propuesta_emitida` en la
misma transacción; cualquier fallo revierte todo. Responde `201` con la propuesta.

## Lectura

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/v1/solicitudes/mias/{solicitud_id}/propuesta/` | Comprador propietario |
| GET | `/api/v1/solicitudes/recibidas/{solicitud_id}/propuesta/` | Artesano aprobado del taller |

`404` si la solicitud es ajena o todavía no tiene propuesta. Ownership filtrado en SQL;
tres consultas de dominio, sin importar el número de líneas o cargos.

```json
{
  "id": 4, "solicitud": 25, "emitida_en": "2026-10-21T10:00:00-06:00", "moneda": "NIO",
  "modalidad_entrega": "entrega_artesano", "descripcion_entrega": "Entrega en Masaya centro",
  "lineas": [{
    "id": 1, "renglon": 71, "posicion": 2,
    "producto": {"id": 16, "nombre": "Taza", "categoria": {"id": 1, "codigo": "ceramica", "nombre": "Cerámica"}},
    "modalidad": "produccion", "cantidad": 7, "precio_unitario": "25.00", "subtotal": "175.00",
    "cargo_personalizacion": "0.00", "fecha_solicitada": "2026-11-20", "fecha_comprometida": "2026-12-01"
  }],
  "otros_cargos": [{"posicion": 1, "descripcion": "Empaque de regalo", "monto": "20.00", "renglon": null}],
  "costo_entrega": "120.00", "subtotal_productos": "175.00", "total_personalizacion": "0.00",
  "total_otros_cargos": "20.00", "total": "315.00"
}
```

La propuesta contiene solo los renglones aceptados. Los rechazados, con su motivo e
historial, se consultan en la solicitud. Nombre y categoría del producto son referencias
vigentes del catálogo; los importes, en cambio, quedan fijados en la propuesta.

## Cotización frente a snapshot contractual

| | AUD-06 (esta fase) | AUD-07 |
|---|---|---|
| Qué es | Oferta del artesano: precio cotizado, cargos, entrega y total | Pedido confirmado al aceptar el comprador |
| Precio | Tomado del producto vigente al emitir y guardado en la línea | Se congela el desglose contractual del pedido |
| Estabilidad | No se edita, regenera ni recalcula por cambios del catálogo | No cambia por catálogo ni por tasa de conversión |
| Inventario | No consulta disponibilidad definitiva ni reserva | Revalida stock y reserva de forma atómica |

## Idempotencia y concurrencia

Ambas mutaciones usan `ejecutar_idempotente` (AUD-08), con los tipos `resolver_renglon`
(código registrado `200`, recurso `revisionrenglonsolicitud`) y `finalizar_propuesta`
(`201`, recurso `propuesta`). Huellas:

- `resolver_renglon`: `{solicitud_id, renglon_id, resolucion, motivo_rechazo normalizado}`.
- `finalizar_propuesta`: `{solicitud_id, modalidad_entrega, descripcion_entrega,
  costo_entrega, lineas, otros_cargos}` validados y normalizados, en su orden.

| Caso | Resultado |
|---|---|
| Misma clave, mismo destino y cuerpo | Replay: mismo recurso, `Idempotency-Replayed: true`, sin duplicar historial ni propuesta |
| Misma clave, otro renglón, otra solicitud u otro cuerpo | `409 clave_idempotencia_reutilizada` |
| Clave distinta contra un renglón ya resuelto | `409 renglon_ya_resuelto` (conflicto de negocio) |
| Clave distinta con propuesta ya emitida | `409 propuesta_ya_emitida` |

AUD-08 no evita carreras entre claves distintas. Toda mutación de revisión o propuesta
bloquea primero la fila de la solicitud (`SELECT … FOR UPDATE`) y valida el estado dentro
del lock. Así, aceptar y rechazar a la vez el mismo renglón deja una sola resolución; dos
renglones resueltos a la vez como «últimos» producen un estado final determinista
(`lista_propuesta` o `rechazada`); y dos emisiones simultáneas crean una sola propuesta.
Un conflicto o fallo revierte también el registro idempotente. Las restricciones `UNIQUE`
(revisión por renglón, propuesta por solicitud, línea por renglón) son la última garantía.

## Permisos

Mutaciones: Bearer de artesano activo con taller aprobado y propietario del taller
destinatario. Comprador o taller pendiente/rechazado: `403`; taller ajeno o renglón de otra
solicitud: `404`; sin token: `401`. La administración no tiene acceso comercial por la API
(`401`, política vigente). Actor, taller y comprador nunca se leen del cuerpo.

## Fuera de alcance

Aceptar o rechazar la propuesta en nombre del comprador, pedido confirmado, reservas,
movimientos de inventario, snapshot contractual, plazo de pago y pagos (AUD-07/09/10).
Tampoco hay edición de propuesta emitida, contraofertas ni negociación de precio: requerirían
un requisito o una decisión nueva.
