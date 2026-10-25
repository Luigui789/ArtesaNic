# Contrato de API — Catálogo

**Estado:** contrato de AUD-04 ampliado con fotografía principal real por DR-01 ([sección 7](#7-fotografía-principal-dr-01)) y moderación administrativa por AUD-14 ([sección 5.1](#51-moderación-administrativa-aud-14)).

**Fecha:** 2026-10-25

**Esquema generado:** [`openapi.yaml`](openapi.yaml), etiquetas `Catálogo` y `Productos propios`.

**Requisitos:** RF-001, RF-003, RF-013.3, RF-017, RF-019; RN-002, RN-003, RN-004; RNF-003, RNF-004, RNF-005, RNF-007. Decisiones de la tarea: D-AUD04-01 a D-AUD04-09 ([sección 8](#8-decisiones-aplicadas-en-aud-04)) y D-AUD14-01 a D-AUD14-04 y D-AUD14-07 ([decisiones V1](../decisiones/v1.md#concreciones-de-aud-14)).

La habilitación del artesano (`EsArtesanoAprobado`) se describe en [talleres §3](talleres.md#3-habilitación-operativa-del-artesano).

---

## 1. Endpoints

| Método | Ruta | Acceso | Éxito |
|---|---|---|---|
| `GET` | `/api/v1/categorias/` | Público | `200` |
| `GET` | `/api/v1/productos/` | Público | `200` |
| `GET` | `/api/v1/productos/{producto_id}/` | Público | `200` |
| `GET` | `/api/v1/productos/mios/` | Bearer, artesano con taller aprobado | `200` |
| `POST` | `/api/v1/productos/mios/` | Bearer, artesano con taller aprobado | `201` |
| `GET` | `/api/v1/productos/mios/{producto_id}/` | Bearer, artesano con taller aprobado, propietario | `200` |
| `PATCH` | `/api/v1/productos/mios/{producto_id}/` | Bearer, artesano con taller aprobado, propietario | `200` |
| `POST` | `/api/v1/productos/mios/{producto_id}/publicar/` | Bearer, artesano con taller aprobado, propietario | `200` |
| `POST` | `/api/v1/productos/mios/{producto_id}/despublicar/` | Bearer, artesano con taller aprobado, propietario | `200` |

No existen `PUT` ni `DELETE` (`405`): la edición es parcial y retirar un producto es despublicarlo, no borrarlo (RN-003). Las lecturas públicas no requieren autenticación y no dependen de un token enviado.

## 2. Categorías

```json
200 [
  { "id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado" },
  { "id": 2, "codigo": "hamacas", "nombre": "Hamacas" }
]
```

Colección completa, ordenada por nombre y sin paginar. En los productos la categoría se **lee anidada** y se **escribe por código** (`"categoria": "hamacas"`).

- **Alta y cambio de nombre:** Django Admin (`/admin/catalogo/categoria/`), con los permisos de modelo de Django. No hay endpoint de escritura.
- **El código es estable:** minúsculas, dígitos y guiones bajos; no se modifica después de crearlo. Código y nombre son únicos.
- **Una categoría con productos no se puede borrar** (`on_delete=PROTECT`).
- **Datos de desarrollo:** [`apps/backend/apps/catalogo/fixtures/categorias_desarrollo.json`](../../apps/backend/apps/catalogo/fixtures/categorias_desarrollo.json) contiene las seis categorías de la demo para un entorno local. No se carga sola ni es una lista normativa:

  ```bash
  uv run python manage.py loaddata categorias_desarrollo
  ```

## 3. Producto

### Lectura pública

```json
{
  "id": 15,
  "nombre": "Sandalias de cuero natural",
  "descripcion": "Sandalias cosidas a mano en cuero curtido al vegetal.",
  "precio": "850.00",
  "categoria": { "id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado" },
  "modalidades": ["stock", "personalizacion"],
  "taller": { "id": 3, "nombre": "Barro y Sombra" },
  "fotografia_url": "/media/productos/{uuid}/principal/{uuid}.jpg",
  "disponible_stock": 5,
  "creado_en": "2026-10-15T10:30:00-06:00"
}
```

**`disponible_stock`** (solo en la lectura pública; decisión [D-POST09-04](../decisiones/v1.md#decisiones-post-aud-09)):
unidades disponibles actualmente para venta desde stock (`existencia_fisica − reservada`).

| Valor | Significado |
|---|---|
| Entero ≥ 0 | Disponibilidad pública actual. Un producto que admite stock pero no tiene inventario inicializado muestra `0` |
| `null` | El producto no admite la modalidad `stock` |

Es informativo: no reserva unidades. No se exponen `existencia_fisica`, `reservada`, movimientos, ajustes ni historial; esos datos son del taller ([inventario](inventario.md)).

`taller.id` es el identificador de `GET /api/v1/talleres/{id}/`, el perfil público del taller (RF-003.6). El producto público no incluye estado de publicación, propietario, datos de revisión del taller ni el teléfono de la cuenta.

### Lectura del taller propio

La misma forma más `publicado` (booleano), `moderacion` y `actualizado_en`. `moderacion` es `null` o `{"motivo": "…", "moderado_en": "2026-10-25T15:30:00-06:00"}`: motivo y fecha del retiro administrativo, sin la identidad del administrador ([sección 5.1](#51-moderación-administrativa-aud-14)). La lectura pública no incluye `moderacion`, porque un producto moderado nunca aparece en ella.

### Escritura (`POST` y `PATCH`)

| Campo | Reglas |
|---|---|
| `nombre` | Texto no vacío, máximo 120 caracteres |
| `descripcion` | Texto no vacío, máximo 2000 caracteres |
| `precio` | Córdobas, decimal con hasta 2 decimales y 10 dígitos, mayor que cero. Se acepta número o texto (`"850.50"`); se responde como texto decimal |
| `categoria` | Código de una categoría existente (`400` si no existe) |
| `modalidades` | Lista no vacía y sin repetir de `stock`, `produccion` y `personalizacion` |
| `fotografia_principal` | Archivo opcional JPEG/PNG/WebP estático, hasta 5 MiB. Omitido conserva; `null` JSON retira solo en borrador |

En `POST` todos salvo `fotografia_principal` son obligatorios. En `PATCH` todos son opcionales; `modalidades` **reemplaza la lista completa** y, si no se envía, no cambia.

**Cualquier otro campo responde `400`** (`{"taller": ["Campo no permitido."]}`), entre ellos `taller`, `taller_id`, `propietario`, `publicado`, `id`, `creado_en`, `actualizado_en`, `imagen` y los de inventario. **El taller dueño se deriva siempre del token**; ninguna petición lo elige ni lo cambia.

Un producto **se registra sin publicar** (`publicado = false`) y se publica con la acción de la [sección 5](#5-publicación-y-despublicación).

## 4. Modalidades (RF-017, RN-004)

| Código | Significado |
|---|---|
| `stock` | Admite venta desde stock |
| `produccion` | Admite producción por cantidad |
| `personalizacion` | Admite personalización |

Se combinan libremente; al menos una es obligatoria. La API valida la lista (`400`) y PostgreSQL rechaza un producto sin ninguna (restricción `producto_al_menos_una_modalidad`). La lista se responde en el orden de la tabla.

**Las modalidades son declarativas.** Indican qué admite el producto, no cuántas unidades hay: **ninguna modalidad exige registrar existencias**. Cantidad física, disponibilidad, reservas y movimientos pertenecen al inventario (RF-022, RF-023; AUD-07). La cantidad y fecha solicitadas, los atributos de personalización y la unidad estándar de base pertenecen a la solicitud y sus renglones (RF-009, RF-018; AUD-05).

## 5. Publicación y despublicación

`POST …/publicar/` y `POST …/despublicar/` no reciben cuerpo y responden el producto propio. Son **idempotentes**: repetir la acción responde `200` sin cambios.

- El catálogo público muestra solo productos con `publicado = true` **y** taller con `estado = aprobado`. La condición se aplica en el servidor: un producto marcado como publicado de un taller pendiente o rechazado no aparece ni se resuelve por su identificador (`404`).
- Despublicar **no borra la fila**: el producto deja de aparecer en el catálogo y en el detalle público, pero sigue existiendo y el artesano lo ve en `GET /productos/mios/`.
- Despublicar tiene **efecto inmediato solo para nuevas solicitudes**: el producto ya no puede agregarse a una solicitud nueva. Las solicitudes creadas antes continúan su revisión, propuesta y etapas posteriores con la referencia al producto; la despublicación no las cancela ni modifica, y no se bloquea aunque existan solicitudes activas ([D-AUD06-06](../decisiones/v1.md#concreciones-de-aud-06)). La advertencia previa al artesano cuando el producto aparece en solicitudes activas queda pendiente de la interfaz de productos.
- Editar no cambia la publicación.
- Publicar exige fotografía principal persistida; de lo contrario responde `409` con `{"codigo": "producto_sin_fotografia", "detail": "Agrega una fotografía principal válida antes de publicar."}`. Se verifica también al repetir la acción sobre históricos sin foto.
- Despublicar conserva la imagen. Eliminar la imagen de un publicado responde `400` en `fotografia_principal`.
- Publicar un producto moderado responde `409` con `{"codigo": "producto_moderado", "detail": "Este producto fue retirado por moderación y no puede publicarse."}` y no cambia `publicado`. Esta comprobación va antes que la de la fotografía.

### 5.1 Moderación administrativa (AUD-14)

**Publicación del artesano ≠ moderación administrativa.** `Producto.publicado` es la intención del artesano. La moderación es una decisión distinta del administrador de plataforma, registrada en `ModeracionProducto` (1:1 con el producto, `PROTECT`) con actor, motivo y fecha (RF-019.5, RN-003). Moderar **no** modifica `publicado`: se conservan las dos decisiones. Si moderar consistiera en poner `publicado = false`, el artesano podría volver a publicar.

- **Visibilidad derivada, no persistida:** `visible = publicado ∧ taller aprobado ∧ sin moderación`. `Producto.objects.catalogo()` aplica las tres condiciones. Un producto moderado desaparece del listado, de los filtros y del detalle público (`404`), y también de **nuevas solicitudes**, que validan contra el mismo `catalogo()` (`400`, «El producto no está disponible para nuevas solicitudes.»).
- **Los históricos continúan (D-AUD14-03):** las solicitudes, renglones, propuestas, pedidos, pagos, reservas, entregas y reembolsos creados antes no cambian. Una solicitud previa puede revisarse, proponerse, aceptarse y convertirse en pedido. Retirar del catálogo no cancela compromisos existentes, el mismo principio que la despublicación (D-AUD06-06).
- **El artesano (D-AUD14-04)** puede editar (`PATCH`) y despublicar el producto moderado. Despublicar no levanta la moderación. No puede volver a publicarlo (`409 producto_moderado`).
- **Terminal en V1 (D-AUD14-02):** la moderación es append-only, no se edita ni se borra, y no existe restitución, apelación ni reapertura.
- **Escritura solo en Django Admin** (`/admin/catalogo/producto/`, acción «Retirar productos por moderación», permiso `catalogo.moderar_producto`). Pide un motivo obligatorio de hasta 1000 caracteres tras recortar espacios (D-AUD14-01) e invoca `services.moderar_producto` por cada producto, con `request.user` como actor. Al terminar informa `moderados: N` y `ya moderados: M`. Moderar de nuevo un producto ya moderado no crea otra fila ni cambia el actor o el motivo originales. El admin de productos es de solo lectura: no agrega, edita ni borra. No hay endpoints REST administrativos.
- **Concurrencia (D-AUD14-07):** moderar, publicar y crear una solicitud se serializan sobre el `SELECT … FOR UPDATE` del `Producto`. `crear_solicitud` bloquea sus productos por `id` ascendente antes de validar el catálogo. Si la moderación obtiene antes el lock, la solicitud responde `400`. Si la solicitud lo obtiene antes, queda como compromiso previo. Nunca queda una solicitud a medias ni un producto moderado visible.

## 6. Catálogo público (RF-003)

### `GET /api/v1/productos/`

| Parámetro | Tipo | Descripción |
|---|---|---|
| `q` | texto | Búsqueda por nombre: contiene, sin distinguir mayúsculas |
| `categoria` | texto | Código de categoría. Un código inexistente no da error: no hay resultados |
| `precio_min` | decimal ≥ 0 | Precio mínimo, inclusive |
| `precio_max` | decimal ≥ 0 | Precio máximo, inclusive. Menor que `precio_min` responde `400` |
| `taller` | entero ≥ 1 | Identificador del taller |
| `orden` | texto | `recientes` (por defecto), `precio_asc`, `precio_desc`, `nombre` |
| `page` | entero | Página, desde 1. Una página inexistente responde `404` |
| `page_size` | entero | Por defecto 12, máximo 48 |

Los parámetros con formato inválido responden `400` por campo. Cada orden desempata por identificador, así que las páginas no repiten ni pierden productos.

En el OpenAPI la respuesta es el componente `PaginatedProductoPublicoList` (`count`, `next`, `previous` y `results` de `ProductoPublico`), generado desde el paginador de la vista junto con los parámetros `page` y `page_size`. Una prueba compara ese esquema con la respuesta real.

```json
200 {
  "count": 30,
  "next": "http://host/api/v1/productos/?page=2&page_size=12",
  "previous": null,
  "results": [ { "id": 15, "...": "producto público" } ]
}
```

Búsqueda, filtros, orden y paginación se resuelven en PostgreSQL. Cada página hace dos consultas, el total y la página, con taller y categoría unidos (sin N+1).

### `GET /api/v1/productos/{producto_id}/`

Un producto publicado de un taller aprobado. Si no existe, no está publicado o su taller no está aprobado, responde `404`.

### `GET /api/v1/productos/mios/`

Productos del taller propio, publicados, no publicados y moderados, del más reciente al más antiguo, con la misma paginación (`page`, `page_size`). No admite parámetro de taller. En el OpenAPI: `PaginatedProductoPropioList`, con `results` de `ProductoPropio`.

### Errores de la gestión

| Código | Causa |
|---|---|
| `400` | Validación: `{"campo": ["mensaje"]}` |
| `401` | Sin token o token no válido |
| `403` | La cuenta no es de artesano, o su taller está pendiente, rechazado o no existe (`"Tu taller todavía no está aprobado: …"`). El artesano no aprobado sigue gestionando `GET`/`PATCH /api/v1/talleres/mi-taller/` |
| `404` | El producto no existe **o pertenece a otro taller**: las dos respuestas son idénticas, para no revelar productos ajenos |
| `405` | `PUT` o `DELETE` |
| `409` | `producto_sin_fotografia` o `producto_moderado` al publicar |

## 7. Fotografía principal: DR-01

**Cerrada para productos** por [D-DR01-01 a D-DR01-07](../decisiones/v1.md#concreciones-de-dr-01-fotografía-principal-de-producto).
RF-001 exige fotografía y RNF-005 exige archivos fuera de PostgreSQL. JPEG/PNG/WebP y
5 MiB son decisiones de implementación V1; no se atribuyen al texto original del RF.

`POST /productos/mios/` y `PATCH /productos/mios/{id}/` aceptan `application/json`
(sin archivo nuevo) y `multipart/form-data` (archivo binario). Ejemplo:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'nombre=Jarrón' -F 'descripcion=Jarrón artesanal' -F 'precio=850.00' \
  -F 'categoria=ceramica' -F 'modalidades=stock' -F 'modalidades=personalizacion' \
  -F 'fotografia_principal=@foto.webp' http://localhost:8000/api/v1/productos/mios/
```

La categoría debe existir. El navegador fija el boundary; el cliente HTTP común de AUD-18
mantiene Bearer en memoria, cookies, renovación/reintento y CSRF donde corresponde.
No se permite enviar taller, propietario, publicación ni rutas arbitrarias. Los booleanos
`permite_*` siguen siendo internos: el contrato vigente recibe `modalidades`.

Solo una foto, estática, JPEG/PNG/WebP hasta **5 242 880 bytes**. Pillow valida tamaño,
formato real, estructura y decodificación completa. No confía en nombre/extensión/MIME.
SVG, GIF, BMP, TIFF, PDF, ejecutables y corruptos responden `400` en `fotografia_principal`.
Ejemplos: «El archivo no puede superar 5 MiB.», «Usa una imagen JPEG, PNG o WebP.» o
«El archivo no es una imagen válida.». Protección técnica: hasta 25 millones de píxeles,
sin resolución mínima comercial, redimensionado ni optimización automática.

Lecturas propias y públicas incluyen `fotografia_url` (URL relativa al origen API o `null`).
El frontend la usa en tarjetas, detalle, home y perfil del taller a través del mapeo común.
Los históricos sin imagen conservan placeholder visual, sin URL inventada.
Archivos en `ImageField`/Django Storage, columna con referencia y nombres UUID + extensión
canónica. No se guarda base64, bytes ni nombre original en PostgreSQL.

La edición sin archivo mantiene el actual. El reemplazo valida y guarda el nuevo antes
de actualizar la fila; elimina el previo después del commit. Fallo SQL inmediato limpia
el archivo nuevo. Fallo de limpieza se registra; caída del proceso o rollback externo
pueden dejar huérfanos porque filesystem y BD no comparten transacción. Despublicar no
borra imágenes. EXIF se conserva en el archivo y no se extrae como dato de negocio.

Media es pública por URL incluso en borradores/despublicados; no sirve para archivos
privados de pagos. AUD-10 necesita política adicional. No incluye galerías, S3/CDN,
miniaturas ni transformación. [Configuración local](../arquitectura/desarrollo-local-backend.md#media-de-productos-dr-01).

## 8. Decisiones aplicadas en AUD-04

Pendientes de formalizar en una tarea documental separada. No modifican las fichas RF/RNF/RN.

| Decisión | Contenido |
|---|---|
| D-AUD04-01 | Las modalidades viajan como lista de códigos `stock`, `produccion` y `personalizacion`. En la base son tres booleanos con la restricción de al menos uno. |
| D-AUD04-02 | El producto pertenece al **taller**, no a la cuenta. El taller se deriva del token. |
| D-AUD04-03 | Se registra sin publicar. Publicar y despublicar son acciones explícitas e idempotentes. No hay `PUT` ni `DELETE`. |
| D-AUD04-04 | El precio es `Decimal(10, 2)` en córdobas, mayor que cero, y viaja como texto decimal. |
| D-AUD04-05 | Las categorías son un recurso propio con código estable e inmutable. Se administran en Django Admin y quedan protegidas si tienen productos. Los datos de desarrollo van en un fixture que no se carga automáticamente. |
| D-AUD04-06 | Las rutas públicas (`/productos/`) y las de gestión (`/productos/mios/`) están separadas. El listado propio se pagina, a diferencia del array sin paginar del contrato previo. |
| D-AUD04-07 | Parámetros del catálogo: `q`, `categoria`, `precio_min`, `precio_max`, `taller` (el contrato previo usaba `artesano`) y `orden`. `page_size` es 12 por defecto y 48 como máximo. |
| D-AUD04-08 | Nombre y descripción son obligatorios (máximo 120 y 2000 caracteres). |
| D-AUD04-09 | `publicado` lo controla el artesano (RF-019), no el administrador como decía el contrato previo. La moderación administrativa con actor y motivo (RF-019.4, AUD-14) deberá ser un estado propio que el artesano no pueda revertir publicando. AUD-04 no la implementa. |

## 9. Conservación histórica (RN-003)

Editar o despublicar un producto no puede alterar pedidos confirmados. **El dominio de pedidos V1 todavía no existe**, así que esta garantía **no está verificada de extremo a extremo**. El catálogo la hace posible así:

- el producto no se borra (`PROTECT` desde taller y categoría; sin `DELETE`);
- el producto solo guarda sus valores **vigentes**.

El **snapshot contractual pertenece al futuro dominio de pedidos** (AUD-05/AUD-06). Cada renglón deberá copiar nombre, precio, modalidad y desglose acordado al confirmarse, y conservar la referencia al producto solo como vínculo. No debe leer esos valores del catálogo vivo.

## 10. Frontend

`apps/frontend/src/features/catalogo/http.ts` implementa este contrato: parámetros, `snake_case` → `camelCase`, paginación y errores 400/401/403/404. `api.ts` elige la fuente:

| `VITE_CATALOGO_API` | Catálogo, detalle, portada, perfil del taller y panel de productos |
|---|---|
| sin definir o `mock` (por defecto) | Servidor simulado, con la misma forma V1 (modalidades combinables, publicación) |
| `real` | Django |

Por defecto sigue el simulado porque pedidos, solicitudes y mensajes todavía son simulados y resuelven productos de la demo por su identificador. Con `real`:

- la gestión del artesano responde `401` hasta que exista la sesión real (AUD-18 registra el token con `configurarTokenDeAcceso`);
- el botón *Preparar solicitud* abre la composición de [solicitudes V1](solicitudes.md); su creación real exige Bearer y la sesión frontend sigue pendiente de AUD-18;
- el perfil público del taller (`/artesano/{id}`) lee `GET /api/v1/talleres/{id}/` (`talleres/http.ts`), así que el `taller.id` del producto abre el taller real. Como la API pública no publica al responsable ni tiene fotografías del taller, la página no los muestra. El panel, los pedidos y los mensajes siguen usando los talleres simulados;
- la fotografía principal se carga como archivo y se muestra desde `fotografia_url` (DR-01).

El inventario simulado (existencias) solo aparece en el formulario del modo simulado y solo con la modalidad `stock`.

La validación temprana del formulario (`catalogo/validacion.ts`) aplica los mismos límites que la [sección 3](#escritura-post-y-patch): nombre y descripción no vacíos (máximo 120 y 2000 caracteres), precio mayor que cero con hasta dos decimales y como máximo 99 999 999,99, categoría y al menos una modalidad. No impone mínimos ni máximos propios.
