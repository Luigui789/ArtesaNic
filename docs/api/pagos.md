# Contrato de API — Pago externo del pedido confirmado V1 (AUD-10)

**Fecha:** 24 de octubre de 2026 (America/Managua).
**Estado:** implementado en backend (`apps/pagos/`) y frontend real (`src/features/pagos/`).
**Fuentes:** RF-011; RN-006, RN-012, RN-013 (preparación), RN-014, RN-015; RNF-004, RNF-011,
RNF-013, RNF-014, RNF-015.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Pagos`.
**Decisiones:** [D-AUD10-01 a D-AUD10-24](../decisiones/v1.md#concreciones-de-aud-10).
**Relacionados:** [pedidos confirmados](pedidos.md), [idempotencia](idempotencia.md).

ArtesaNic **no procesa fondos** (RF-012 queda fuera de V1): el comprador paga fuera de la
plataforma, declara método, referencia y comprobante, y el artesano verifica manualmente la
recepción. Este contrato sustituye, para pagos, a las secciones preliminares del
[contrato previo](contrato-api.md) y de la [frontera mock/backend](frontera-mock-backend.md)
(por ejemplo `pago.monto`, `POST /pedidos/{id}/pago/confirmar/`).

## 1. Modelo

```text
Pedido (AUD-07, inmutable) 1 ── 0..1 Pago 1 ── 1..N IntentoPago 1 ── 0..1 RevisionIntentoPago
```

| Entidad | Contenido | Mutabilidad |
|---|---|---|
| `Pago` | `pedido` (único), `estado`, `moneda` (`NIO`), `total` (copia de `Pedido.total`), `plazo_hasta`, `confirmado_en`, timestamps | Proyección del estado actual; solo la cambian los servicios |
| `IntentoPago` | `numero` (1, 2, 3… único por pago), `origen`, `intento_previo`, `metodo`, `referencia`, comprobante (referencia privada + nombre saneado, MIME detectado, tamaño, SHA-256), `registrado_por`, `registrado_en` | Append-only |
| `RevisionIntentoPago` | `resultado`, `motivo`, `revisado_por`, `revisado_en`, `plazo_hasta` | Append-only, una por intento |

Un pedido **sin** `Pago` está «Pendiente de pago»: la fila nace con el primer intento, en la
misma transacción. No se añade ningún campo de pago al snapshot contractual del `Pedido`.

## 2. Estados y transiciones

| Código | Etiqueta | Significado |
|---|---|---|
| `pendiente` | Pendiente de pago | Pedido confirmado sin intento registrado |
| `registrado` | Pago registrado | Hay un intento esperando la revisión del artesano |
| `observado` | Pago observado | Problema con la evidencia o los datos presentados; requiere corrección |
| `confirmado` | Pago confirmado | El artesano verificó los fondos. **Terminal en AUD-10** |
| `no_recibido` | Pago no recibido | Los fondos declarados no aparecen acreditados en el medio externo |

```text
pendiente ──registrar (comprador, ahora < confirmado_en + 48 h)──► registrado
registrado ──confirmado (artesano)───────────────────────────────► confirmado (terminal)
registrado ──observado + motivo (artesano)───────────────────────► observado   (plazo = revisado_en + 48 h)
registrado ──no_recibido + motivo (artesano)─────────────────────► no_recibido (plazo = revisado_en + 48 h)
observado  ──corregir intento observado (comprador, ahora < plazo)► registrado (origen correccion)
no_recibido──registrar nuevo intento (comprador, ahora < plazo)───► registrado (origen nuevo_tras_no_recibido)
```

**Observado ≠ no recibido.** `observado` es un problema de la evidencia (comprobante ilegible,
captura incompleta, referencia incorrecta, comprobante equivocado, datos inconsistentes): el
comprador **corrige** ese intento. `no_recibido` significa que el comprador declaró un pago y
el artesano verificó que los fondos no llegaron: el comprador registra un **pago nuevo**, no
reemplaza el archivo anterior. Un archivo ilegible es `observado`, nunca `no_recibido`.

No hay límite numérico de intentos ni correcciones: los límites son temporales. Los estados
de pago no son estados del pedido: confirmar el pago no inicia producción, no entrega y no
mueve inventario; deja disponible la condición de RN-015 para las fases siguientes.

## 3. Plazos (reloj del servidor)

| Situación | Límite | Error al vencer |
|---|---|---|
| Registro inicial | `pedido.confirmado_en + 48 h` | `409 plazo_pago_vencido` |
| Corrección de observado | `revision.revisado_en + 48 h` | `409 correccion_fuera_plazo` |
| Nuevo intento tras no recibido | `revision.revisado_en + 48 h` | `409 nuevo_intento_fuera_plazo` |

Se permite si `ahora < límite`; **el instante exacto del límite ya está vencido**. La lectura
devuelve `registrable_hasta` y `plazo_vencido` calculados por el servidor; el navegador no es
autoridad. Un intento `registrado` esperando revisión no tiene plazo para el comprador
(`revision_pendiente: true`) y no es falta de pago.

AUD-10 **no** marca pedidos como vencidos, no libera reservas ni ejecuta tareas periódicas:
eso pertenece a AUD-11, que puede consultar `apps.pagos.services.situacion_pago(pedido, pago)`
o la ausencia de `Pago` + `Pedido.confirmado_en` sin reconstruir fechas.

## 4. Endpoints

Todas las rutas cuelgan del pedido de cada parte, como las [lecturas de AUD-07](pedidos.md).
Requieren `Authorization: Bearer`. Las mutaciones exigen `Idempotency-Key`.

| Método y ruta | Parte | Descripción |
|---|---|---|
| `GET /api/v1/pedidos/mios/{pedido_id}/pago/` | Comprador del pedido | Estado e historial |
| `POST /api/v1/pedidos/mios/{pedido_id}/pago/intentos/` | Comprador | Registro inicial o nuevo intento tras `no_recibido` (multipart) |
| `POST /api/v1/pedidos/mios/{pedido_id}/pago/intentos/{intento_id}/corregir/` | Comprador | Corrección del intento observado (multipart) |
| `GET /api/v1/pedidos/mios/{pedido_id}/pago/intentos/{intento_id}/comprobante/` | Comprador | Descarga protegida |
| `GET /api/v1/pedidos/recibidos/{pedido_id}/pago/` | Artesano del taller (aprobado) | Estado e historial |
| `POST /api/v1/pedidos/recibidos/{pedido_id}/pago/intentos/{intento_id}/resolver/` | Artesano | Confirmar, observar o marcar no recibido (JSON) |
| `GET /api/v1/pedidos/recibidos/{pedido_id}/pago/intentos/{intento_id}/comprobante/` | Artesano | Descarga protegida |

### Registro, nuevo intento y corrección (`multipart/form-data`)

```text
metodo=transferencia            # transferencia | otro
referencia=TRX-123456           # 1–120 caracteres tras recortar
comprobante=<archivo>           # exactamente uno
```

No se aceptan `monto`, `moneda`, `estado`, `comprador_id`, `taller_id`, `pedido_total`,
`intento_previo` ni ningún otro campo (`400 "Campo no permitido."`). El total es siempre el
100 % de `Pedido.total` y la moneda `NIO`: no hay pagos parciales ni abonos. En la corrección
el intento observado viene de la URL; la interfaz puede precargar método y referencia, pero el
comprobante nuevo es obligatorio.

### Resolución (JSON)

```json
{"estado": "confirmado"}
{"estado": "observado", "motivo": "La referencia del comprobante no es legible."}
{"estado": "no_recibido", "motivo": "Los fondos no aparecen acreditados en la cuenta."}
```

`motivo`: obligatorio en `observado` y `no_recibido`, se recorta, no puede quedar vacío y
admite hasta 1000 caracteres; con `confirmado` no se admite (`400`). Cada intento se resuelve
**una sola vez**.

### Lectura (y cuerpo de las mutaciones)

```json
{
  "pedido": 42,
  "estado": "observado",
  "moneda": "NIO",
  "total": "1250.00",
  "registrable_hasta": "2026-10-26T14:35:00-06:00",
  "plazo_vencido": false,
  "revision_pendiente": false,
  "confirmado_en": null,
  "intentos": [
    {
      "id": 7,
      "numero": 1,
      "origen": "inicial",
      "intento_previo": null,
      "metodo": "transferencia",
      "referencia": "TRX-123",
      "registrado_en": "2026-10-24T10:00:00-06:00",
      "comprobante": {
        "nombre": "comprobante.pdf",
        "tipo": "application/pdf",
        "tamano": 862201,
        "url": "/pedidos/mios/42/pago/intentos/7/comprobante/"
      },
      "resolucion": {
        "estado": "observado",
        "motivo": "Referencia ilegible.",
        "revisado_en": "2026-10-24T14:35:00-06:00",
        "plazo_hasta": "2026-10-26T14:35:00-06:00"
      }
    }
  ]
}
```

`intentos` va en orden cronológico (`numero`); el vigente es el último. `origen`:
`inicial`, `correccion` o `nuevo_tras_no_recibido`. `comprobante.url` es relativa a la raíz
de la API y apunta al endpoint protegido de la parte que lee; nunca se devuelve la ruta física,
`PRIVATE_MEDIA_ROOT`, el nombre en el storage ni una URL pública. Registro y corrección
responden `201`; la resolución, `200`.

## 5. Comprobantes

**Whitelist única** (`apps/pagos/comprobantes.py`; el frontend la refleja en
`src/features/pagos/comprobante.ts`):

| Formato | Extensiones | MIME |
|---|---|---|
| JPEG | `.jpg`, `.jpeg` | `image/jpeg` |
| PNG | `.png` | `image/png` |
| WebP | `.webp` | `image/webp` |
| PDF | `.pdf` | `application/pdf` |

Máximo **10 MiB (10 485 760 bytes)**; vacío no. Todo lo demás se rechaza, incluidos SVG
(contenido activo), HTML, ejecutables, scripts, comprimidos, documentos de Office, GIF, TIFF
y HEIC. Validación del servidor, en orden: tamaño, extensión del nombre, firma del contenido,
decodificación completa de imágenes con Pillow (`verify` + `load`, sin animaciones, límite
técnico de 50 MP) o parseo real del PDF, y coherencia entre extensión, MIME declarado
(`application/octet-stream` o vacío no contradicen) y contenido detectado.

**PDF.** Tras un filtro barato (cabecera `%PDF-1.x/2.x`, `startxref` y `%%EOF` en la cola),
el servidor lo abre con [pypdf](https://pypi.org/project/pypdf/) en modo estricto: tabla o
flujo xref y trailer legibles, cada entrada del xref clásico apuntando exactamente a su
`N G obj` (pypdf recuperaría offsets erróneos buscando el objeto), todos los objetos
resolubles y al menos una página legible. Un archivo con los marcadores pero sin estructura
válida, truncado o con xref corrupto responde `400`. Se rechazan los PDF protegidos con
contraseña de apertura (el artesano no podría abrirlos); un PDF cifrado sin contraseña de
apertura se acepta. El PDF no se renderiza ni se extrae su contenido.

Errores por campo (`400 {"comprobante": ["..."]}`):

| Situación | Mensaje |
|---|---|
| Falta el archivo | Adjunta el comprobante del pago. |
| Más de un archivo | Adjunta un único comprobante por intento. |
| Vacío | El archivo está vacío. |
| > 10 MiB | El comprobante no puede superar 10 MB. |
| Formato fuera de whitelist (por nombre o contenido) | Usa un comprobante JPG, JPEG, PNG, WebP o PDF. |
| Extensión, MIME y contenido no coinciden | La extensión o el tipo del archivo no coinciden con su contenido. |
| Corrupto, truncado o PDF no parseable | No pudimos leer el comprobante: el archivo está dañado. |
| PDF con contraseña de apertura | El PDF está protegido con contraseña: adjunta uno sin protección. |
| Animado / demasiados píxeles | Mensajes propios de protección de recursos |

**Almacenamiento privado.** Los archivos van a `PRIVATE_MEDIA_ROOT` (`DJANGO_PRIVATE_MEDIA_ROOT`;
por defecto `apps/backend/private_media/`, ignorada por Git; en Compose el volumen
`backend_private_media`), fuera de `MEDIA_ROOT`, que no se sirve. Una comprobación de sistema
(`pagos.E002`) impide configurarlo dentro de `MEDIA_ROOT`/`STATIC_ROOT`. El storage no genera
URL. Ruta generada por el servidor: `pagos/<uuid>/<uuid>.<extensión canónica>`, sin nombre
original, PK ni datos del pedido. La base de datos guarda solo esa referencia y los metadatos.

**Descarga.** Cada petición repite el ownership en SQL (intento → pago → pedido → comprador o
taller del artesano). Respuesta: el binario en streaming con su MIME detectado,
`Content-Disposition: attachment; filename="comprobante-pedido-<id>-intento-<n>.<ext>"`,
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` y
`Cache-Control: private, no-store`. El archivo se ubica por la referencia persistida (no por
datos del cliente) y el storage rechaza rutas fuera de su raíz.

**Archivos y transacciones.** El archivo se escribe dentro de la transacción, después de
validar estado y plazo bajo lock. Si falla la base de datos en el servicio, se borra el archivo
nuevo. Storage y PostgreSQL no comparten transacción: una caída del proceso o un rollback de la
transacción externa posterior al servicio puede dejar un archivo **huérfano** (nunca una fila
sin archivo). Ningún comprobante confirmado se borra: el historial es evidencia. Las copias de
seguridad deben incluir PostgreSQL **y** el storage privado.

## 6. Privacidad y permisos

| Actor | Lectura del pago | Comprobante | Mutaciones |
|---|---|---|---|
| Comprador del pedido | `200` | `200` | registrar, nuevo intento, corregir |
| Artesano del taller del pedido (aprobado) | `200` | `200` | resolver |
| Otro comprador / otro artesano | `404` | `404` | `404` |
| Rol distinto en la ruta de la otra parte | `403` | `403` | `403` |
| Administración (también superusuario) | `401`: no usa la API pública | `401` | — |
| Anónimo | `401` | `401` | `401` |

RN-006 / RNF-004.7: la administración no recibe archivo, URL, binario ni referencia de storage;
los modelos de pagos no se registran en Django Admin. Una futura función administrativa
podrá consultar estado y timestamps, nunca el comprobante.

## 7. Errores

| HTTP | Cuándo |
|---|---|
| `400` | Campos inválidos o no permitidos, comprobante inválido, motivo ausente/vacío/largo, `Idempotency-Key` ausente o mal formada |
| `401` | Sin sesión, token inválido o cuenta de administración |
| `403` | Rol incorrecto o taller no aprobado |
| `404` | Pedido o intento inexistente o ajeno; archivo ausente del storage |
| `409` | Conflicto de negocio con `codigo` estable, o `clave_idempotencia_reutilizada` |
| `415` | Registro/corrección sin `multipart/form-data` |

| `codigo` (409) | Cuándo |
|---|---|
| `pago_ya_confirmado` | Cualquier acción sobre un pago confirmado |
| `pago_en_revision` | Registrar o corregir mientras hay un intento `registrado` |
| `correccion_pendiente` | Registrar un intento nuevo cuando el pago está `observado` (debe corregirse) |
| `correccion_no_permitida` | Corregir un intento que no es el observado vigente (incluido `no_recibido`) |
| `intento_ya_resuelto` | Resolver de nuevo un intento con resolución |
| `plazo_pago_vencido` | Registro inicial con `ahora >= confirmado_en + 48 h` |
| `correccion_fuera_plazo` | Corrección con `ahora >= plazo_hasta` |
| `nuevo_intento_fuera_plazo` | Nuevo intento con `ahora >= plazo_hasta` |
| `pedido_vencido` | Registrar, corregir o resolver en un pedido «Vencido por falta de pago» (AUD-11, D-AUD11-17) |
| `clave_idempotencia_reutilizada` | Misma clave con otra huella |

Un `409` de negocio no deja registro idempotente ni archivo.

## 8. Idempotencia y concurrencia

| Tipo | Endpoint | Huella |
|---|---|---|
| `registrar_intento_pago` | `POST …/pago/intentos/` | `pedido_id`, `metodo`, `referencia` recortada, SHA-256 del contenido del comprobante |
| `corregir_intento_pago` | `POST …/intentos/{id}/corregir/` | lo anterior + `intento_previo_id` |
| `resolver_intento_pago` | `POST …/intentos/{id}/resolver/` | `pedido_id`, `intento_id`, `estado`, `motivo` recortado |

El nombre del archivo no forma parte de la huella: dos archivos distintos llamados `pago.pdf`
tienen huellas distintas, y el mismo contenido con otro nombre repite. Un replay no escribe
otro archivo. Recuperación: `GET /api/v1/operaciones/{tipo}/{clave}/` (recurso `intentopago`
o `revisionintentopago`).

Toda mutación bloquea `Pedido` y después `Pago` (`SELECT … FOR UPDATE`) y valida estado y
plazo dentro del lock; la numeración de intentos se calcula bajo ese lock con
`UNIQUE (pago, numero)` como respaldo, además de `UNIQUE` de pago por pedido, revisión por
intento y corrección por intento. Dos registros, dos correcciones o dos revisiones
simultáneas: una gana y la otra recibe `409`.

## 9. Restricciones de PostgreSQL

`pago_estado_valido` (sin `pendiente`), `pago_moneda_nio`, `pago_total_no_negativo`,
`pago_plazo_coherente` (plazo solo en `observado`/`no_recibido`), `pago_confirmacion_coherente`,
`intento_pago_numero_unico`, `intento_pago_numero_positivo`, `intento_pago_origen_valido`,
`intento_pago_metodo_valido`, `intento_pago_referencia_no_vacia`,
`intento_pago_origen_coherente` (inicial = número 1 sin previo; otros con previo),
`intento_pago_comprobante_valido` (MIME de la whitelist, 1 byte–10 MiB, SHA-256),
`revision_pago_resultado_valido` y `revision_pago_motivo_y_plazo` (confirmado sin motivo ni
plazo; observado/no recibido con motivo y `plazo_hasta = revisado_en + 48 h`). La máquina de
estados vive en `apps/pagos/services.py` y sus pruebas.

## 10. Integraciones posteriores

- **AUD-11 (implementado):** el proceso `procesar_vencimientos_pago` vence el pedido con
  `situacion_pago()` dentro del lock (`Pedido → Pago → …`): sin `Pago` a las 48 h de la
  confirmación, u `observado`/`no_recibido` al llegar `plazo_hasta`; `registrado` y
  `confirmado` nunca vencen. El `Pago` y su historial no cambian (no hay estado «vencido» de
  pago); las mutaciones posteriores responden `409 pedido_vencido` y las lecturas siguen
  disponibles. Ver [pedidos](pedidos.md#estado-operativo-y-vencimiento-aud-11) y
  [D-AUD11](../decisiones/v1.md#concreciones-de-aud-11).
- **RF-010 / fases de producción:** consultar `Pago.estado == "confirmado"` como precondición.
- **RF-021:** devoluciones de pagos confirmados; AUD-10 no revierte un pago confirmado.
- **RF-020 (AUD-20):** notificaciones de eventos de pago. No existe aún infraestructura
  persistente de notificaciones; el punto de integración son los servicios
  `registrar_intento`, `corregir_intento` y `resolver_intento`, al confirmar la transacción.
- **Protección técnica pendiente:** límite de tamaño del cuerpo en el proxy de producción y
  limitación de frecuencia de subidas (hoy: autenticación, ownership, 10 MiB y plazos).
