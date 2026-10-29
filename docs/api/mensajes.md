# Contrato de API — Mensajería privada del pedido confirmado V1 (AUD-16)

**Fecha:** 25 de octubre de 2026 (America/Managua).
**Estado:** implementado en backend (`apps/mensajes/`) y frontend real (`src/features/mensajes/`).
**Fuentes:** RF-014; RN-006, RN-020; RNF-004, RNF-010, RNF-013.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Mensajes`; componentes `ConversacionPedido`, `MensajePedido`, `AutorMensaje`, `MensajeEntradaRequest` (la entrada lleva el sufijo `Request` del esquema dividido, como el resto de entradas) y `ConflictoConversacion`.
**Decisiones:** [D-AUD16-01 a D-AUD16-10](../decisiones/v1.md#concreciones-de-aud-16).
**Relacionados:** [pedidos confirmados](pedidos.md), [resolución del pedido](resolucion-pedidos.md).

Conversación de texto entre el comprador y el artesano de un **pedido confirmado**. Este
contrato sustituye, para mensajes, a las secciones preliminares del
[contrato previo](contrato-api.md) y de la [frontera mock/backend](frontera-mock-backend.md)
(cursor `desde=<fecha>`, ventana de estados legacy `aceptado`/`en_produccion`).

Fuera de V1: adjuntos, imágenes, audio, WhatsApp, correo, WebSockets, indicadores de escritura,
reacciones, edición, borrado, confirmaciones de lectura, bandeja global y notificaciones
persistentes por mensaje (estas últimas son de AUD-17).

## 1. Modelo

```text
Pedido (AUD-07) 1 ── 0..N MensajePedido
```

| Campo | Contenido |
|---|---|
| `id` | Orden contractual de la conversación y cursor del polling |
| `pedido` | FK `PROTECT`. El `Pedido` es la identidad de la conversación: no hay entidad `Conversacion` |
| `autor` | FK `PROTECT` a la cuenta. El nombre se lee vigente por la relación; no se duplican nombre, rol ni teléfono |
| `texto` | Texto plano, recortado, 1–500 caracteres (`varchar(500)` y CHECK `mensaje_pedido_texto_no_vacio`) |
| `creado_en` | Instante del servidor |

Append-only: guardar una fila existente o borrarla lanza `ValidationError`, y no existen
rutas `PUT`, `PATCH` ni `DELETE`. La única escritura productiva es `services.enviar_mensaje`.
Índice `mensaje_pedido_cursor_idx (pedido_id, id)` para el polling. Migración
`mensajes.0001_initial`: solo crea esta tabla, sin migración de datos.

**No existe conversación de solicitud.** El `Pedido` nace únicamente cuando el comprador acepta
la propuesta final (AUD-07); `Solicitud` y `Propuesta` no tienen chat ni banderas para él.

## 2. Estados

El servidor es la autoridad; los estados legacy de `order-state.ts` no intervienen.

| `EstadoOperativoPedido.estado` | Lectura | Envío |
|---|---|---|
| `confirmado`, `en_cumplimiento` | `200`, `solo_lectura: false` | `201` |
| `entregado`, `vencido_falta_pago`, `cancelado_artesano`, `cerrado_parcial` | `200`, `solo_lectura: true`; el historial nunca desaparece | `409 conversacion_cerrada` |

## 3. Acceso

| Petición | Respuesta |
|---|---|
| Sin token o token inválido | `401` |
| Cuenta de administración de plataforma (su token no autentica la API, ADR-007) | `401`; si llegara autenticada, `403` |
| Artesano con el taller pendiente o rechazado | `403` |
| Comprador o artesano aprobado que no es parte del pedido, o pedido inexistente | `404` idéntico: no revela existencia |
| Comprador del pedido (`Pedido.comprador`) o propietario de su taller (`Pedido.taller.propietario`) | Acceso |

La pertenencia se filtra en SQL, igual que `Pedido.pertenece_a`. Todas las respuestas son
privadas: `Cache-Control: no-store, private` (`never_cache`). Autenticación Bearer; sin CSRF,
porque la operación no depende de cookies.

**Administración.** `MensajePedido` no se registra en Django Admin: `/admin/mensajes/` responde
`404` incluso al superusuario, y la sesión de Django Admin no autentica la API. Una prueba fija
la superficie exacta del admin (`apps/pedidos/tests/test_admin.py`).

## 4. `GET /api/v1/pedidos/{pedido_id}/mensajes/`

Sin parámetros devuelve el historial completo. Con `despues_de=<id>` (entero ≥ 0) devuelve solo
los mensajes con `id > despues_de` del mismo pedido, en orden de `id`.

```json
{
  "mensajes": [
    {
      "id": 127,
      "autor": { "id": 4, "nombre": "Ana López" },
      "texto": "Podemos coordinar la entrega mañana.",
      "creado_en": "2026-10-26T15:30:00-06:00"
    }
  ],
  "cursor": 127,
  "solo_lectura": false
}
```

`cursor` es el mayor `id` entregado o, si no hay novedades, el `despues_de` recibido (`0` sin
mensajes ni cursor): **nunca retrocede**. `despues_de` negativo, no entero o mayor que un
`bigint` responde `400 {"despues_de": [...]}`. El autor expone solo `id` y `nombre`: nunca
teléfono, correo, rol, privilegios, pagos, comprobantes ni rutas privadas.

## 5. `POST /api/v1/pedidos/{pedido_id}/mensajes/`

```json
{ "texto": "Podemos entregar el sábado por la mañana." }
```

Lista cerrada: solo `texto`. `autor`, `rol`, `fecha` o cualquier otro campo responde
`400 {"<campo>": ["Campo no permitido."]}` y no escribe nada. El autor es siempre
`request.user`. El texto se recorta en los extremos (los saltos de línea internos se
conservan); vacío o con más de 500 caracteres responde `400 {"texto": [...]}`.

`201 Created` devuelve el `MensajePedido` creado. En un pedido terminal:

```json
{
  "detail": "Este pedido ya finalizó. La conversación está disponible solo para consulta.",
  "codigo": "conversacion_cerrada"
}
```

con `409`; nada se escribe y el `GET` sigue respondiendo `200`.

## 6. Concurrencia y cursor

`enviar_mensaje` ejecuta, en una transacción:

```text
SELECT … FOR UPDATE del Pedido (con ownership en SQL)
→ leer EstadoOperativoPedido → rechazar si es terminal → crear MensajePedido → COMMIT
```

Es el mismo lock que toman el vencimiento automático, el cumplimiento, la cancelación y el
cierre parcial antes de cambiar el estado:

- **Dos envíos del mismo pedido** se serializan: el segundo obtiene su `id` después del commit
  del primero, de modo que el orden de `id` coincide con el orden de commit dentro de la
  conversación y `id > cursor` no puede saltarse un mensaje que se confirme tarde. Por eso el
  cursor es el `id` y no un timestamp, que puede repetirse o confirmarse en otro orden.
- **Mensaje contra cierre:** si gana el mensaje, queda confirmado antes de la transición; si gana
  el cierre, el envío revalida dentro del lock, ve el estado terminal y responde `409`. Nunca hay
  un mensaje posterior al cierre.
- Un mensaje aún sin commit no es visible para el polling y no adelanta su cursor.

Las tres carreras se prueban con hilos y conexiones reales de PostgreSQL
(`apps/mensajes/tests/test_concurrencia.py`).

## 7. Polling (RNF-010)

La interfaz real hace la primera lectura sin cursor y después, cada **15 segundos** y solo
mientras `solo_lectura` es `false`, pide `despues_de=<cursor>`. Mezcla el delta en la caché
(deduplica por `id`, ordena por `id` ascendente, `cursor = max(actual, respuesta)`) sin volver a
descargar el historial. Tras un `201` agrega el mensaje propio **sin adelantar el cursor** y pide
un delta inmediato: entre el último sondeo y el envío pudo confirmarse un mensaje de la otra
parte con un `id` menor, que un salto del cursor omitiría. Un `409 conversacion_cerrada` pasa el
chat a solo lectura de inmediato.

## 8. Registro

Tras el commit se registra `mensaje_pedido_creado pedido_id=… mensaje_id=… actor_id=…`. Nunca el
texto, nombres, teléfonos ni el contenido de la conversación.
