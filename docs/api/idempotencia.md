# Contrato de idempotencia V1 (AUD-08)

**Fecha:** 20 de octubre de 2026 (America/Managua).
**Fuentes:** RF-009.7, RNF-011, RNF-014.3–5, RNF-015.7; regla de no duplicar solicitudes por reintentos.
**Esquema:** [OpenAPI generado](openapi.yaml), etiquetas `Solicitudes` y `Operaciones`.
**Decisiones:** [D-AUD08-01 a D-AUD08-08](../decisiones/v1.md#concreciones-de-aud-08).

## Principio

La idempotencia identifica **intentos**, no contenidos. El cliente genera una clave
por operación deliberada y la repite en cada reintento de esa misma operación.

| Clave | Cuerpo | Resultado |
|---|---|---|
| nueva | cualquiera | se ejecuta la operación |
| ya usada por el mismo actor y tipo | igual (huella idéntica) | misma operación lógica: no se ejecuta otra vez; se devuelve el mismo recurso con el código registrado |
| ya usada por el mismo actor y tipo | distinto | `409 clave_idempotencia_reutilizada`; no se ejecuta |
| distinta | igual | **otra operación válida**: no se deduplica por contenido |

No existen heurísticas por comprador, producto, tiempo, total ni JSON idéntico.

## Semántica del replay

Un replay devuelve el resultado de la misma operación lógica sin ejecutar nuevamente la
mutación. Se conserva la referencia al mismo recurso y el código HTTP registrado, y la
respuesta lleva `Idempotency-Replayed: true`. La representación del recurso se reconstruye
desde su estado persistido actual; AUD-08 no almacena un snapshot histórico del cuerpo
HTTP. La idempotencia garantiza no duplicar efectos, no congelar la representación: si
una etapa posterior modifica legítimamente el recurso (por ejemplo, la revisión de
renglones de AUD-06), un replay muestra ese estado actual.

## Cabecera `Idempotency-Key`

- **Obligatoria** en las mutaciones protegidas. Sin ella, o con formato inválido:
  `400 {"Idempotency-Key": ["..."]}`, antes de validar el cuerpo y sin efectos.
- Formato técnico: `^[A-Za-z0-9._:~-]{16,128}$`. Se recomienda un UUID v4. Se rechazan
  vacíos, espacios, controles, no ASCII, `/` y `,` (cabeceras duplicadas).
- Ámbito: `(actor autenticado, tipo de operación, clave)`. Dos compradores pueden usar el
  mismo valor sin interferir. La clave **no autentica ni autoriza**: autenticación y
  permisos se evalúan antes (`401`, `403` sin cambios).
- Los `GET` no la usan.

## Operaciones protegidas

| Tipo | Endpoint | Huella |
|---|---|---|
| `crear_solicitud` | `POST /api/v1/solicitudes/` | `renglones` validados y normalizados, en su orden: producto, modalidad, cantidad, fecha solicitada, características y origen cuando aplican |

La huella es SHA-256 de un JSON canónico (claves ordenadas, sin espacios, fechas ISO).
No incluye comprador, taller, estado, cabeceras, token ni timestamps; el orden de las
claves JSON no la altera, el orden de los renglones sí. Nunca se devuelve al cliente.

## Ejemplos

**1. Primer envío**

```http
POST /api/v1/solicitudes/
Authorization: Bearer <access>
Idempotency-Key: 3f6d2c1e-8a4b-4c7d-9e0f-1a2b3c4d5e6f

{"renglones": [{"producto": 15, "modalidad": "stock", "cantidad": 2}]}
```

`201` con la solicitud `{"id": 42, ...}`.

**2. Reintento con la misma clave y el mismo cuerpo** → `201` (código registrado), la
misma solicitud (`"id": 42`) y cabecera `Idempotency-Replayed: true`. No se crea otra
solicitud ni se revalida el catálogo: un producto despublicado después no altera la
repetición. El cuerpo es la representación actual de la solicitud 42; no tiene por qué
coincidir campo por campo con la primera respuesta si la solicitud cambió después.

**3. Misma clave, otro cuerpo**

```json
409 {"detail": "Esta clave de idempotencia ya se usó para otra petición con datos distintos. Genera una clave nueva para una operación nueva.", "codigo": "clave_idempotencia_reutilizada"}
```

**4. Mismo cuerpo, clave distinta** → `201` con `"id": 43`. Son dos solicitudes deliberadas.

**5. Respuesta perdida.** Si el cliente no sabe si la operación se ejecutó, tiene dos vías
equivalentes: repetir el `POST` con la misma clave (paso 2) o consultar sin efectos:

```http
GET /api/v1/operaciones/crear_solicitud/3f6d2c1e-8a4b-4c7d-9e0f-1a2b3c4d5e6f/
Authorization: Bearer <access>
```

```json
200 {"tipo": "crear_solicitud", "estado": "completada",
     "recurso": {"tipo": "solicitud", "id": 42}, "codigo_http": 201,
     "creado_en": "...", "completado_en": "..."}
```

`404` significa que no hay operación completada con esa clave: puede reenviarse con la misma.
El recurso se lee después en `GET /api/v1/solicitudes/mias/42/`.

**6. Ownership.** La búsqueda filtra por actor en SQL. Una clave ajena responde igual que
una inexistente (`404`); no se exponen huella, cuerpo ni actor. Solo `GET`: otros métodos `405`.

**7. Concurrencia.** El registro idempotente y la mutación comparten una transacción. El
`UNIQUE (actor, tipo, clave)` es el árbitro: si dos peticiones llegan a la vez, PostgreSQL
hace esperar el `INSERT` de la segunda hasta que la primera confirme (la segunda lee y
devuelve el mismo resultado, o `409` si su cuerpo difiere) o se revierta (la segunda
ejecuta normalmente). Nunca se ejecutan dos mutaciones por la misma clave.

## Errores y transacciones

- Solo se registran operaciones **completadas**. El estado interno `en_progreso` existe
  únicamente dentro de la transacción en curso y nunca es visible ni queda persistido:
  un fallo revierte registro y mutación juntos.
- Un `400` de negocio (mezcla de talleres, producto despublicado, cantidad inválida) no deja
  registro: la misma clave puede reutilizarse, por ejemplo con el cuerpo corregido.
- Un registro completado siempre referencia un recurso existente (restricción CHECK y
  misma transacción). No se guardan JWT, cookies, cabeceras ni el cuerpo.

## Cliente frontend

`features/solicitudes/idempotencia.ts` genera UUID v4 (con alternativa a
`crypto.randomUUID` fuera de contexto seguro). La página de composición guarda un intento
en un `useRef`: misma clave mientras el cuerpo no cambie, nueva tras el éxito o si se
edita el cuerpo, de modo que el cliente nunca provoca un `409`. El mock aplica una tabla
equivalente en memoria por usuario demo; la autoridad es el servidor.

## Integración futura

Cada operación se añade a `TipoOperacion` (con migración del CHECK) y su servicio de
dominio se envuelve con `apps.operaciones.services.ejecutar_idempotente(actor=..., tipo=...,
clave=..., datos=<contrato normalizado>, operacion=<mutación>)`. La vista usa
`apps.operaciones.api.contrato` para la cabecera, el `409` y `Idempotency-Replayed`.
Pendientes: resolución de renglón y finalización de propuesta (AUD-06); aceptación de
propuesta y confirmación/reserva (AUD-07); registro de pago (AUD-10); entregas, ajustes
de inventario y reembolsos (AUD-11 en adelante).

## Tema operativo pendiente

Los registros se conservan indefinidamente: los requisitos no fijan retención ni
expiración. Una política de limpieza (por ejemplo, conservar como mínimo el plazo en que
un cliente puede reintentar) queda como decisión operativa futura; no bloquea V1.
