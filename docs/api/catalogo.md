# Contrato de API — Catálogo

**Estado:** implementado en la rama `feature/catalogo-productos-v1` (AUD-04), **salvo la fotografía principal**, bloqueada por la decisión abierta DR-01 ([sección 7](#7-fotografía-principal-dr-01-bloqueada)). Verificado con la suite de pruebas contra PostgreSQL.

**Fecha:** 2026-10-15

**Esquema generado:** [`openapi.yaml`](openapi.yaml), etiquetas `Catálogo` y `Productos propios`.

**Requisitos:** RF-001, RF-003, RF-017, RF-019; RN-002, RN-003, RN-004; RNF-003, RNF-004, RNF-005, RNF-007. Decisiones de la tarea: D-AUD04-01 a D-AUD04-09 ([sección 8](#8-decisiones-aplicadas-en-aud-04)).

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
  "creado_en": "2026-10-15T10:30:00-06:00"
}
```

`taller.id` es el identificador de `GET /api/v1/talleres/{id}/`, el perfil público del taller (RF-003.6). El producto público no incluye estado de publicación, propietario, datos de revisión del taller ni el teléfono de la cuenta.

### Lectura del taller propio

La misma forma más `publicado` (booleano) y `actualizado_en`.

### Escritura (`POST` y `PATCH`)

| Campo | Reglas |
|---|---|
| `nombre` | Texto no vacío, máximo 120 caracteres |
| `descripcion` | Texto no vacío, máximo 2000 caracteres |
| `precio` | Córdobas, decimal con hasta 2 decimales y 10 dígitos, mayor que cero. Se acepta número o texto (`"850.50"`); se responde como texto decimal |
| `categoria` | Código de una categoría existente (`400` si no existe) |
| `modalidades` | Lista no vacía y sin repetir de `stock`, `produccion` y `personalizacion` |

En `POST` todos son obligatorios. En `PATCH` todos son opcionales; `modalidades` **reemplaza la lista completa** y, si no se envía, no cambia.

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
- Editar no cambia la publicación.

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

Productos del taller propio, publicados y no publicados, del más reciente al más antiguo, con la misma paginación (`page`, `page_size`). No admite parámetro de taller.

### Errores de la gestión

| Código | Causa |
|---|---|
| `400` | Validación: `{"campo": ["mensaje"]}` |
| `401` | Sin token o token no válido |
| `403` | La cuenta no es de artesano, o su taller está pendiente, rechazado o no existe (`"Tu taller todavía no está aprobado: …"`). El artesano no aprobado sigue gestionando `GET`/`PATCH /api/v1/talleres/mi-taller/` |
| `404` | El producto no existe **o pertenece a otro taller**: las dos respuestas son idénticas, para no revelar productos ajenos |
| `405` | `PUT` o `DELETE` |

## 7. Fotografía principal: DR-01 bloqueada

RF-001 incluye la fotografía principal, y RNF-005.6 fija que las imágenes se guardan como archivos fuera de las filas de PostgreSQL, conservando en la base solo referencias y metadatos. **No están definidos** los formatos, el tamaño máximo, la cantidad, la resolución, la optimización o compresión, el proveedor de almacenamiento, la URL pública o firmada ni las miniaturas ([auditoría §23, DR-01](../auditorias/auditoria-tecnica-v1-2026-10-12.md#23-decision_required)). La regla anterior (JPG/PNG/WebP, 5 MB, Pillow) no es la línea base y no se importa.

Por eso este contrato **no tiene campo de imagen**: enviarlo responde `400`. No se usó una solución provisional que obligara a romper el contrato después. La integración prevista es **aditiva**:

1. Un subrecurso propio para el archivo, por ejemplo `PUT /api/v1/productos/mios/{id}/fotografia/` con `multipart/form-data`, que no cambia el cuerpo JSON de `POST`/`PATCH`.
2. Un campo de lectura añadido al producto público y propio (por ejemplo `fotografia`: URL o `null`).

**Decisión mínima requerida para cerrar DR-01:**

- formatos admitidos y tamaño máximo;
- procesamiento: redimensionado o compresión, y miniaturas;
- almacenamiento y entrega: proveedor, y URL pública o firmada;
- si **publicar exige fotografía**. RF-001.3 pide validar los obligatorios antes de guardar. Si se exige, `publicar` añadirá esa precondición, y los productos creados antes sin fotografía no podrán volver a publicarse hasta tener una.

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
- el botón *Solicitar pedido* queda deshabilitado;
- el perfil del taller enlazado sigue siendo simulado (dominio talleres);
- no hay fotografías (DR-01).

El inventario simulado (existencias) solo aparece en el formulario del modo simulado y solo con la modalidad `stock`.
