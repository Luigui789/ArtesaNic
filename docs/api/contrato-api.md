# Contrato de API — Artesanica

> **Contrato propuesto anterior.** Para endpoints implementados, consultar [OpenAPI](openapi.yaml) y [autenticación](autenticacion.md). Las demás secciones son diseño pendiente y deben revisarse contra las 39 fichas actuales.
>
> **Nota AUD-14:** la tasa de cambio implementada está en [configuración](configuracion.md) (`GET /api/v1/configuracion/`, sin escritura por la API). La moderación de productos está en [catálogo §5.1](catalogo.md#51-moderación-administrativa-aud-14): se registra aparte de `publicado` y no consiste en ponerlo a `false`. Ambos documentos prevalecen sobre las secciones correspondientes de este borrador.

**Estado:** Borrador para revisión. Define el contrato que expondrá el backend Django REST Framework y que consumirá el frontend React.

**Fecha:** 2026-08-15

**Revisión vigente:** incorpora las decisiones cerradas tras los dos inventarios de frontera.

*Del inventario mock → contrato:* retirada de «destacados» y de la disponibilidad del producto (sección 12), anidado del resumen del producto en las lecturas del pedido (sección 7), separación de `GET /productos/mios/` frente a `GET /productos/?artesano={id}` (sección 5), ampliación del significado de `409` (sección 1.9) y normalización del motivo a `null` (sección 7).

*Del inventario contrato → backend:* congelación económica del pedido y `pago.monto` (sección 7), estado de aprobación del taller (sección 2.7), moderación de productos con `publicado` (sección 5), representación en lectura del objeto `pago` y descarga autenticada del comprobante (secciones 7 y 8), cuerpo explícito de `PATCH /artesanos/me/` (sección 6), precondiciones separadas de la entrega y endpoint propio para los costos adicionales (sección 7), y semántica del pago tras el reembolso (sección 7).

*Cierre de RF-005, RF-007 y RF-015:* la tasa de cambio deja de ser una constante del frontend —el administrador la configura en Django Admin y el frontend la lee en `GET /configuracion/` (sección 4)—, y el deber de notificar se materializa en el recurso `Notificacion` (sección 8), acotado a los dos eventos que los requisitos nombran.

*Cierre del catálogo de errores:* los `409` con `codigo` quedan reducidos a `transicion_invalida` y `pago_no_confirmado` (sección 1.9).

El contrato pasa de 29 a **34 endpoints**.

**Documento derivado:** [Frontera Mock → Backend](frontera-mock-backend.md), línea base de implementación para Django.

**Decisiones que lo gobiernan:** [ADR-002 — Acceso a datos y contratos](../adr/0002-acceso-a-datos-y-contratos.md)

**Requisitos que implementa:** [Requisitos funcionales y no funcionales](../requisitos/historico/especificacion-v2.1.md) — actualizado con RF-010 v2.0, RF-011 v3.0 y RF-015.

Este documento es la **fuente de verdad compartida** entre el frontend (este repositorio) y el backend (repositorio separado). Ninguno de los dos debe asumir nada que no esté aquí.

---

## 1. Convenciones generales

### 1.1 Base y versionado

```
https://<host>/api/v1/
```

Todas las rutas usan **plural, en español y con barra final**, siguiendo la convención de Django (`APPEND_SLASH`). El prefijo de versión permite introducir cambios incompatibles más adelante sin romper clientes existentes.

### 1.2 Identificadores

Todos los recursos se identifican con un **entero** generado por el backend.

```json
{ "id": 15 }
```

> **Regla arquitectónica:** el identificador es un valor **opaco** de tipo `number` para el frontend. Su mecanismo de generación (`AutoField`, `BigAutoField` u otro) pertenece exclusivamente al backend. El frontend nunca construye, deduce ni interpreta identificadores.

### 1.3 Nomenclatura

- **La API responde en `snake_case`** (idiomático en Python/Django).
- **El frontend trabaja en `camelCase`.**
- La conversión ocurre **exclusivamente en la capa de mapeo del cliente HTTP**. Ningún componente de React conoce los nombres de campo de la API.

Ver la tabla completa en la [sección 9](#9-tabla-de-mapeo-de-campos).

### 1.4 Códigos frente a etiquetas

Los estados, categorías y modalidades viajan como **códigos estables** en `snake_case`. Nunca viaja el texto visible.

```json
{ "estado": "en_produccion" }
```

El texto que ve la persona usuaria ("En producción") vive **solo en la capa de presentación del frontend**. Esto permite corregir la redacción de una etiqueta sin migrar datos en la base de datos ni romper el contrato.

Ver el catálogo completo en la [sección 2](#2-catálogos-de-códigos).

### 1.5 Fechas

Formato **ISO 8601 con zona horaria**, tal como las serializa DRF por defecto:

```json
{ "creado_en": "2026-08-15T10:30:00-06:00" }
```

El frontend las conserva como `string` y las formatea con las utilidades de `src/lib/format.ts`.

### 1.6 Importes

Los importes son **números**, en córdobas (NIO), sin separadores de miles ni símbolo de moneda:

```json
{ "precio": 4890 }
```

> **Atención — configuración requerida en el backend:** DRF serializa `DecimalField` como **cadena de texto** por defecto (`"4890.00"`), para no perder precisión. El frontend espera un número. El backend debe establecer `COERCE_DECIMAL_TO_STRING = False` en `REST_FRAMEWORK`, o bien declarar los importes con un tipo entero. Independientemente de ello, **la capa de mapeo del frontend convertirá defensivamente a `number`**, para que una configuración distinta en el backend no rompa la interfaz.

La conversión a dólares es una funcionalidad de presentación del frontend, pero **la tasa la provee el backend**: el administrador la configura desde Django Admin y el frontend la lee en `GET /configuracion/` (sección 4). Esto sustituye la constante `TASA_CAMBIO` de `src/lib/format.ts`, que obligaba a desplegar para cambiar un valor que el RF-007 declara configurable.

### 1.7 Autenticación

El **mecanismo** de autenticación (JWT frente a sesión) es una decisión pendiente y se registrará en un ADR aparte. Este contrato define únicamente **qué endpoints la requieren y qué datos deriva el backend de la identidad autenticada**.

Regla general, sin excepciones:

> **El cliente nunca envía su propia identidad, su rol ni el identificador de su taller.** El backend los deriva siempre de la petición autenticada (`request.user`). Un cuerpo o parámetro que contenga `rol`, `usuario`, `comprador_id` o `artesano_id` propio debe ser **ignorado o rechazado** por el backend.

Y una segunda regla, sobre la autorización a nivel de objeto:

> **Toda operación sobre un recurso identificado por su `id` debe verificar que quien la solicita es parte legítima de ese recurso.** No basta con exigir autenticación: un pedido solo es accesible para su comprador y su artesano; un producto solo es editable por el taller que lo publicó. El identificador en la URL **nunca** es prueba de autorización.
>
> Esta verificación es responsabilidad exclusiva del backend y debe ejecutarse **aunque el frontend ya haya ocultado el control correspondiente**. Las guardas de ruta del cliente son experiencia de usuario, no seguridad (ver [ADR-003](../adr/0003-autenticacion-y-autorizacion.md)).

En cada endpoint se indica:

| Marca | Significado |
|---|---|
| 🔓 | Público, no requiere autenticación |
| 🔒 | Requiere autenticación |
| 🔒👤 | Requiere autenticación con rol **comprador** |
| 🔒🔨 | Requiere autenticación con rol **artesano** |

### 1.8 Paginación

Las colecciones paginadas usan `PageNumberPagination` de DRF:

**Petición**

```
GET /api/v1/productos/?page=2&page_size=12
```

**Respuesta**

```json
{
  "count": 500,
  "next": "https://host/api/v1/productos/?page=3&page_size=12",
  "previous": "https://host/api/v1/productos/?page=1&page_size=12",
  "results": [ ... ]
}
```

El frontend consume el tipo `Paginated<T>` ya existente. **La capa de mapeo reconstruye los campos que DRF no envía**, a partir de los parámetros de la petición:

| Campo del frontend | Origen |
|---|---|
| `items` | `results` |
| `total` | `count` |
| `page` | parámetro `page` de la petición (1 si se omitió) |
| `pageSize` | parámetro `page_size` de la petición (o el valor por defecto del backend) |
| `totalPages` | `Math.ceil(count / pageSize)` |

> El `page_size` por defecto del backend debe ser **12**, que es el valor que usa hoy el catálogo. Si el backend usa otro, el mapeo de `totalPages` será incorrecto salvo que el frontend envíe `page_size` explícitamente; **se recomienda que el frontend lo envíe siempre**.

Las colecciones pequeñas y acotadas (categorías, mensajes de un pedido, pedidos de una persona) **no se paginan**: devuelven un array JSON directo.

### 1.9 Errores

Se usan los códigos de estado y formatos estándar de DRF:

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | Validación fallida | `{"campo": ["mensaje"], ...}` o `{"detail": "..."}` |
| `401` | Sin autenticar | `{"detail": "..."}` |
| `403` | Autenticado pero sin permiso | `{"detail": "..."}` |
| `404` | Recurso inexistente o ajeno | `{"detail": "No encontrado."}` |
| `409` | Conflicto con el estado actual del recurso | `{"detail": "...", "codigo": "transicion_invalida"}` |
| `500` | Error del servidor | `{"detail": "..."}` |

**Reglas del contrato de errores:**

- Un recurso que existe pero **no pertenece** a quien lo solicita devuelve **`404`, no `403`**, para no revelar su existencia.
- Los conflictos con el estado actual del recurso usan **`409 Conflict`** con un campo `codigo` legible por máquina, porque el frontend necesita distinguirlos de un error de validación corriente. No se limitan a las transiciones de la máquina de estados: también cubren casos como intentar registrar un pago sobre un pedido que ya lo tiene. **Todo `409` lleva `codigo`**, en `snake_case` como el resto de los códigos del contrato.

  **Criterio para que exista un `codigo`:** se justifica cuando el cliente debe **tomar una acción distinta**, no cuando solo debe **mostrar un texto distinto**. Para lo segundo ya está `detail`.

  El catálogo completo son dos códigos:

  | `codigo` | Dónde se origina | Por qué el cliente lo necesita |
  |---|---|---|
  | `transicion_invalida` | `POST /pedidos/{id}/estado/` y las acciones de la sección 7 | Su vista está desfasada: debe recargar el pedido |
  | `pago_no_confirmado` | `POST /pedidos/{id}/estado/` con destino `en_produccion` | Explica una precondición que el cliente no podía conocer y lo dirige al pago |

  El resto de los `409` del contrato **no llevan `codigo`**: corresponden a situaciones en que la interfaz ya oculta o deshabilita el control, de modo que llegar a ellas significa que el cliente está desincronizado. Su respuesta correcta es siempre la misma —refrescar el recurso y presentar el `detail`— y un código no le aportaría nada.
- La capa de mapeo del frontend traduce cualquiera de estas respuestas a un objeto de error uniforme con un mensaje presentable. **Los componentes nunca inspeccionan códigos de estado HTTP.**

---

## 2. Catálogos de códigos

Los códigos son la representación en API y base de datos. Las etiquetas son responsabilidad exclusiva del frontend y se incluyen aquí solo como referencia de la redacción vigente.

### 2.1 Estado del pedido (`estado`)

| Código | Etiqueta actual |
|---|---|
| `pendiente` | Pendiente |
| `aceptado` | Aceptado |
| `en_produccion` | En producción |
| `listo_para_entrega` | Listo para entrega |
| `entregado` | Entregado |
| `rechazado` | Rechazado |
| `cancelado` | Cancelado |

### 2.2 Estado del pago (`estado_pago`)

| Código | Etiqueta actual |
|---|---|
| `pendiente` | Pendiente de pago |
| `registrado` | Pago registrado |
| `confirmado` | Pago confirmado |

> El código `pendiente` aparece tanto en el estado del pedido como en el del pago. No hay ambigüedad porque viajan en campos distintos (`estado` y `estado_pago`) y en el frontend son tipos TypeScript diferentes, pero conviene tenerlo presente al escribir consultas y filtros en el backend.

El flujo es único y lineal: `pendiente → registrado → confirmado`. **No existen pagos parciales ni el esquema de pago dividido 50/50** (RF-011 v3.0).

### 2.2.1 Estado del reembolso (`reembolso.estado`)

Aplica únicamente cuando se cancela un pedido que ya tenía el pago confirmado (RF-015).

| Código | Etiqueta actual |
|---|---|
| `pendiente` | Reembolso pendiente |
| `completado` | Reembolso completado |

> **La plataforma no ejecuta transferencias bancarias**: solo registra que el reembolso es necesario y permite marcarlo como completado. No existen reembolsos parciales.

### 2.3 Categorías (`categoria`)

Las categorías son un **recurso propio** del backend, no una lista fija en el código del frontend, para que un administrador pueda añadir rubros sin desplegar el frontend (ver [sección 4](#4-categorías-y-configuración)).

| Código | Etiqueta actual |
|---|---|
| `cuero_y_calzado` | Cuero y calzado |
| `hamacas` | Hamacas |
| `madera` | Madera |
| `textiles` | Textiles |
| `dulces` | Dulces |
| `otros` | Otros |

### 2.4 Modalidad de entrega (`modalidad`)

| Código | Etiqueta actual |
|---|---|
| `retiro_en_taller` | Retiro en taller |
| `punto_de_encuentro` | Punto de encuentro |
| `entrega_directa` | Entrega directa por el artesano |
| `otra` | Otra |

### 2.5 Método de pago (`metodo`)

| Código | Etiqueta actual |
|---|---|
| `transferencia` | Transferencia |
| `otro` | Otro método |

> **El pago contra entrega no existe en el sistema** (RF-011 v3.0). Es incompatible con la precondición de RF-010, que exige el pago confirmado antes de iniciar la producción: un pedido pagado en el momento de la entrega nunca podría entrar en producción. El prototipo aún lo ofrece como opción y debe retirarse (desviación D-3).

### 2.6 Rol (`rol`)

| Código | Etiqueta actual |
|---|---|
| `comprador` | Comprador |
| `artesano` | Artesano |

### 2.7 Estado del taller (`Artesano.estado`)

Implementa la aprobación de talleres que exige el RF-013.

| Código | Etiqueta actual | Significado |
|---|---|---|
| `pendiente` | Pendiente de aprobación | Recién registrado; no aparece en las colecciones públicas ni puede publicar productos |
| `aprobado` | Aprobado | Operativo |
| `suspendido` | Suspendido | Retirado de las colecciones públicas por el administrador |

> Se modela como **enumeración de tres valores y no como booleano** porque la suspensión y la aprobación son el mismo eje: un booleano `aprobado` no podría distinguir un taller que aún no ha sido revisado de uno que fue retirado.
>
> **Solo el administrador cambia este campo**, desde Django Admin. No existe ningún endpoint REST que lo modifique.

### 2.8 Tipo de notificación (`Notificacion.tipo`)

| Código | Cuándo se crea | Destinatario | Requisito |
|---|---|---|---|
| `solicitud_nueva` | `POST /pedidos/` | Artesano del taller | RF-005 |
| `pedido_cancelado` | `POST /pedidos/{id}/cancelar/` | La otra parte del pedido | RF-015 |

**La enumeración es cerrada** y no se amplía sin un requisito que lo pida. Ver la delimitación de alcance en la sección 8.

---

## 3. Autenticación y sesión

> Mecanismo decidido en [ADR-003](../adr/0003-autenticacion-y-autorizacion.md): **token de acceso en memoria del cliente, token de renovación en cookie `HttpOnly`/`Secure`/`SameSite` emitida por el backend.** El frontend nunca lee ni escribe el token de renovación.

### Transporte de credenciales

| Elemento | Dónde vive | Quién lo maneja |
|---|---|---|
| Token de acceso | Memoria de JavaScript | Frontend, en la cabecera `Authorization: Bearer …` |
| Token de renovación | Cookie `HttpOnly`, `Secure`, `SameSite` | Backend; el navegador la envía sola |

Como el token de renovación viaja en cookie, **los endpoints `POST /auth/refrescar/` y `POST /auth/logout/` requieren protección CSRF**. El resto de la API se autentica por cabecera `Bearer`, que el navegador no adjunta automáticamente y por tanto no es susceptible a CSRF.

### `POST /auth/registro/` 🔓

Registra una persona usuaria. RF-004.

**Petición**

```json
{
  "nombre": "Ana Lucía Delgado",
  "telefono": "85551234",
  "password": "…",
  "rol": "comprador"
}
```

El teléfono es el identificador de acceso (8 dígitos, formato nicaragüense). Cuando `rol` es `artesano`, el backend crea también el taller asociado en estado pendiente de aprobación (RF-013).

**Respuesta `201`** — igual que la de `POST /auth/login/`.

**Errores** — `400` si el teléfono ya está registrado o el formato es inválido.

### `POST /auth/login/` 🔓

**Petición**

```json
{ "telefono": "85551234", "password": "…" }
```

`rol` **no** se envía: el backend lo conoce por la cuenta. Esto corrige el comportamiento actual del prototipo, donde el rol se elige en un selector del formulario.

**Respuesta `200`**

```json
{
  "access": "eyJhbGciOi…",
  "usuario": {
    "id": 4,
    "nombre": "Ana Lucía Delgado",
    "telefono": "85551234",
    "rol": "artesano",
    "artesano_id": 1,
    "artesano_estado": "aprobado"
  }
}
```

Además, el backend adjunta la cabecera `Set-Cookie` con el token de renovación:

```
Set-Cookie: refresh=…; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth/
```

> **El token de renovación no aparece en el cuerpo de la respuesta.** Si apareciera, el frontend podría leerlo y guardarlo, que es justo lo que el ADR-003 evita.

**Errores** — `401` con mensaje genérico, sin revelar si el teléfono existe.

### `POST /auth/refrescar/` 🔓 (requiere cookie + CSRF)

Emite un nuevo token de acceso a partir de la cookie de renovación. No lleva cuerpo: el navegador envía la cookie automáticamente.

**Respuesta `200`** — `{ "access": "…" }`, y una nueva cookie si la renovación es rotativa.

**Errores** — `401` si la cookie falta, caducó o fue revocada. El frontend lo interpreta como sesión terminada.

### `POST /auth/logout/` 🔒 (requiere cookie + CSRF)

Invalida la sesión y **borra la cookie de renovación**. El frontend descarta además el token de acceso que tiene en memoria.

**Respuesta `204`.**

### `GET /auth/perfil/` 🔒

Devuelve la identidad autenticada. Se invoca **al arrancar la aplicación** para reconstruir la sesión, ya que el token de acceso no sobrevive a una recarga.

**Sustituye a la constante `DEMO_ARTISAN_ID` y al usuario codificado en `src/hooks/use-session.tsx`.**

**Respuesta `200`**

```json
{
  "id": 4,
  "nombre": "Ana Lucía Delgado",
  "telefono": "85551234",
  "rol": "artesano",
  "artesano_id": 1,
  "artesano_estado": "aprobado"
}
```

`artesano_id` es `null` cuando el rol es `comprador`. **Este campo es la única fuente legítima del identificador del taller en el frontend.**

`artesano_estado` (sección 2.7) es `null` para un comprador. Existe para que la interfaz pueda **explicar** por qué el panel está limitado —un taller pendiente de aprobación no puede publicar— en lugar de mostrar un fallo sin causa aparente. **No es una autorización:** el frontend no debe deducir permisos de este valor, que solo el backend aplica.

> **Ausente no significa «por defecto».** Un `artesano_id` nulo indica que esa persona no es artesana, y el frontend debe deshabilitar las funcionalidades de taller. Nunca sustituirlo por un valor de reserva, que es el defecto actual del prototipo (`usuario?.artesanoId ?? DEMO_ARTISAN_ID`).

### Secuencia completa

```
Inicio de sesión
   POST /auth/login/  →  access (memoria) + cookie de renovación
        │
        ▼
Peticiones a la API
   Authorization: Bearer <access>
        │
        ├── 200 → normal
        └── 401 → POST /auth/refrescar/ → reintentar una vez
                        │
                        └── 401 → sesión terminada, ir a /auth

Recarga de la página
   GET /auth/perfil/  →  identidad reconstruida (o sesión anónima)
```

---

## 4. Categorías y configuración

Ambos son recursos **públicos, pequeños, sin paginar y de solo lectura**, que el frontend consulta al arrancar y cachea con `staleTime` largo. Se agrupan por esa razón, no por afinidad temática.

### `GET /categorias/` 🔓

Colección completa, sin paginar.

**Respuesta `200`**

```json
[
  { "id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado" },
  { "id": 2, "codigo": "hamacas", "nombre": "Hamacas" }
]
```

En los recursos que la referencian, la categoría se **anida en lectura** y se **envía por código en escritura**:

```jsonc
// lectura
"categoria": { "id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado" }

// escritura
"categoria": "cuero_y_calzado"
```

> **Consecuencia para el frontend:** el tipo `Category` deja de ser una unión literal de textos y pasa a ser un objeto (o un código). Los filtros del catálogo y el selector del formulario de productos deben poblarse desde este endpoint en lugar de la constante `CATEGORIES`.

### `GET /configuracion/` 🔓

Valores que el administrador configura y el frontend necesita para presentar la información. Implementa el **RF-007**.

**Respuesta `200`**

```json
{
  "tasa_cambio": 36.80,
  "actualizada_en": "2026-08-15T08:00:00-06:00"
}
```

Es público porque el catálogo muestra precios a visitantes sin sesión.

**La escritura y la lectura viven en mecanismos distintos, deliberadamente:**

| | Quién | Cómo |
|---|---|---|
| Escritura | Administrador | **Django Admin** (RF-013) |
| Lectura | Cualquiera | `GET /configuracion/` |

> **No existe `POST`, `PATCH` ni `PUT /configuracion/`.** El frontend nunca administra la tasa, de modo que un endpoint administrativo REST sería una capacidad que ningún actor del sistema usaría. El RF-007 pide que el administrador pueda configurarla *manualmente*, y el panel de Django ya es ese lugar (RF-013).

`actualizada_en` se incluye porque una tasa fijada a mano envejece, y la interfaz debe poder decir de cuándo es el valor que está aplicando. Sustituye al texto «Tasa simulada» del prototipo.

**Comportamiento ante fallo.** Si esta petición falla, el frontend **oculta la opción de dólares y muestra los precios solo en córdobas**. No existe valor de reserva: convertir con una tasa que nadie configuró produciría un precio fabricado, y el RF-007 exige precisamente que la conversión dependa de un valor configurado y no de una fuente incierta.

> El modelo es de **fila única**. Cualquier valor que se añada a este recurso más adelante necesita su propio requisito que lo respalde, igual que el resto del contrato: la existencia de un endpoint de configuración no autoriza a acumular ajustes en él.

---

## 5. Productos y catálogo

### `GET /productos/` 🔓

Catálogo público, paginado. RF-003.

**Parámetros de consulta**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `q` | string | Búsqueda por nombre |
| `categoria` | string | Código de categoría |
| `precio_min` | number | Precio mínimo |
| `precio_max` | number | Precio máximo |
| `artesano` | number | Identificador del taller |
| `orden` | string | `recientes` (por defecto), `precio_asc`, `precio_desc`, `nombre` |
| `page` | number | Página, desde 1 |
| `page_size` | number | Tamaño de página, por defecto 12 |

**Respuesta `200`** — envoltorio de paginación (sección 1.8) cuyos `results` son objetos producto:

```json
{
  "id": 15,
  "nombre": "Sandalias de cuero natural",
  "precio": 4890,
  "categoria": { "id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado" },
  "descripcion": "…",
  "imagenes": ["https://host/media/productos/15/principal.jpg"],
  "artesano_id": 1,
  "creado_en": "2026-08-15T10:30:00-06:00"
}
```

> `imagenes` contiene **URL absolutas servidas por el backend**, no cadenas base64. Esto sustituye el comportamiento actual, donde `processImage()` devuelve un DataURL incrustado en el objeto.

> **El producto no tiene campo de disponibilidad.** Ver la [sección 12](#12-conceptos-deliberadamente-excluidos).

**Qué excluye esta colección.** `GET /productos/` devuelve únicamente productos que cumplen las dos condiciones:

- su taller tiene `estado = aprobado` (sección 2.7);
- el producto tiene `publicado = true`.

`publicado` es un booleano que **solo el administrador modifica**, desde Django Admin, para dar de baja un producto que incumpla los lineamientos (RF-013). No aparece en la respuesta pública: todo lo que esta colección devuelve lo tiene en `true` por construcción. **Sí aparece en `GET /productos/mios/`**, porque el artesano necesita ver que una pieza suya fue retirada.

> **`publicado` no es el `disponible` que se retiró.** Son conceptos distintos: aquel lo controlaba el artesano según su capacidad de producción y ningún requisito lo respaldaba; este lo controla el administrador por moderación y lo exige el RF-013. Ver la [sección 12.2](#122-disponibilidad-del-producto).

**Uso desde la ficha pública del taller.** El perfil de un taller (RF-008) lista sus productos con `GET /productos/?artesano={id}`, **paginado como cualquier otra consulta del catálogo**. No existe un endpoint sin paginar para este caso: la ficha pública no debe depender del tamaño del catálogo del taller. Esto sustituye la llamada actual `listMyProducts(id)`, que devolvía un array completo.

### `GET /productos/{id}/` 🔓

**Respuesta `200`** — un producto. **`404`** si no existe.

### `GET /productos/mios/` 🔒🔨

Productos del taller autenticado. Array sin paginar. El taller se deriva del token; **no se acepta ningún parámetro de artesano**.

Cada elemento incluye `publicado`, ausente en la colección pública. Un producto con `publicado = false` fue retirado por el administrador (RF-013): el artesano lo ve y puede editarlo, pero no reaparece en el catálogo hasta que el administrador lo restituya.

> Este endpoint y `GET /productos/?artesano={id}` responden a intenciones distintas y **no deben unificarse**: el primero es privado, sin parámetro y para administrar el catálogo propio; el segundo es público, paginado y para mostrar el catálogo de un taller cualquiera. La función `listMyProducts(artesanoId)` del prototipo servía a ambos, y esa ambigüedad es lo que permitía que el identificador del taller llegara desde el cliente.

### `POST /productos/` 🔒🔨

Crea un producto en el taller autenticado. RF-001.

**Petición** — `multipart/form-data`, porque incluye la imagen:

| Campo | Tipo |
|---|---|
| `nombre` | texto |
| `precio` | número |
| `categoria` | código de categoría |
| `descripcion` | texto |
| `imagen` | archivo, opcional |

**Respuesta `201`** — el producto creado, con `publicado = true`.

**Errores** — `400` si la imagen supera el límite o no es una imagen; la validación de tipo y tamaño (máximo 5 MB) es responsabilidad del **backend**, y la compresión se realiza en el servidor con Pillow (RF-002). **`403`** si el taller autenticado no tiene `estado = aprobado` (sección 2.7): un taller pendiente o suspendido no publica.

### `PATCH /productos/{id}/` 🔒🔨

Actualiza un producto propio. Mismos campos, todos opcionales. **`404`** si el producto no pertenece al taller autenticado.

---

## 6. Talleres y perfil

### `GET /artesanos/` 🔓

Colección de talleres **con `estado = aprobado`**. Array sin paginar mientras el volumen lo permita (RNF-007 fija 50 talleres). Los talleres pendientes o suspendidos no aparecen aquí ni en `GET /artesanos/{id}/`, que devuelve **`404`** para ellos.

> **No define un orden.** El taller no tiene fecha de creación en el contrato y **no se le añade una**: hacerlo solo serviría para que la portada pudiera rotular una sección como "nuevos talleres", que es una decisión estética de la maqueta y no un requisito. La portada consume esta colección tal cual, bajo un título que no promete recencia.

### `GET /artesanos/{id}/` 🔓

Perfil público del taller. RF-008.

```json
{
  "id": 1,
  "nombre_taller": "Manos de Membreño",
  "responsable": "…",
  "historia": "…",
  "descripcion": "…",
  "rubro": { "id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado" },
  "ubicacion": "Barrio San Juan, Masaya",
  "horario": "…",
  "telefono": "85551234",
  "whatsapp": "85551234",
  "redes": { "facebook": "…", "instagram": "…" },
  "foto_url": "https://host/media/talleres/1/foto.jpg",
  "portada_url": "https://host/media/talleres/1/portada.jpg"
}
```

### `GET /artesanos/me/` 🔒🔨

Taller de la persona autenticada. **Accesible cualquiera que sea su `estado`**: su dueño debe poder ver su propio taller aunque esté pendiente de aprobación o suspendido.

La respuesta es la del perfil público **más el campo `estado`** (sección 2.7), que no viaja en las lecturas públicas.

### `PATCH /artesanos/me/` 🔒🔨

Actualiza el taller propio. **No recibe identificador**: se deriva del token. Esto sustituye `updateArtisan(DEMO_ARTISAN_ID, …)`.

**Petición** — `multipart/form-data`, porque incluye las dos imágenes. Todos los campos son opcionales; solo se modifican los enviados.

| Campo | Tipo |
|---|---|
| `nombre_taller`, `responsable`, `historia`, `descripcion`, `ubicacion`, `horario`, `telefono`, `whatsapp` | texto |
| `redes` | objeto (`facebook`, `instagram`) |
| `rubro` | **código de categoría** |
| `foto` | archivo, opcional |
| `portada` | archivo, opcional |

Dos precisiones:

- **`rubro` se escribe por código aunque se lea como objeto anidado.** Es la misma asimetría que ya rige `categoria` en el producto (sección 4) y `producto` en el pedido (sección 7). No es una excepción: es la regla general del contrato aplicada por tercera vez.
- **`foto` y `portada` son archivos en escritura**; sus equivalentes de lectura son `foto_url` y `portada_url`, URL absolutas que sirve el backend.

**No es editable por este endpoint** el campo `estado`: pertenece al administrador (sección 2.7). Un cuerpo que lo incluya debe ser ignorado o rechazado, igual que cualquier otro intento del cliente de fijar datos que el backend deriva (sección 1.7).

**Respuesta `200`** — el taller actualizado, con `estado`.

---

## 7. Pedidos

La [máquina de estados del frontend](../../apps/frontend/src/lib/order-state.ts) es la fuente de verdad para el diseño de esta sección, pero **quien la aplica es el backend**. El frontend la conserva únicamente para habilitar o deshabilitar controles; toda transición la valida y ejecuta el servidor.

```
pendiente ──┬──> aceptado ──┬──> en_produccion ──┬──> listo_para_entrega ──> entregado
            │               │        ▲           │
            │               │        │           │
            │               │   ⚠ requiere       │
            │               │   estado_pago =    │
            │               │   confirmado       │
            │               │                    │
            │               └──> cancelado <─────┘
            └──> rechazado
```

`entregado`, `rechazado` y `cancelado` son estados terminales.

### Precondición de pago (RF-010 v2.0 + RF-011 v3.0)

> **La transición `aceptado → en_produccion` exige que `estado_pago` sea `confirmado`.** El backend rechaza el intento con `409` mientras el pago siga pendiente o solo registrado. Ninguna otra transición depende del estado del pago.

Esta es una **precondición de negocio**, no una fusión de las dos máquinas de estado: los flujos de pedido y de pago siguen siendo independientes en su representación, y el resto de las transiciones no consultan el pago.

El orden que impone es:

```
aceptado
   │  el comprador registra el pago        (POST /pedidos/{id}/pago/)
   ▼
aceptado + pago registrado
   │  el artesano confirma la recepción    (POST /pedidos/{id}/pago/confirmar/)
   ▼
aceptado + pago confirmado
   │  ahora sí puede iniciar la producción (POST /pedidos/{id}/estado/)
   ▼
en_produccion
```

### Congelación económica de los términos del pedido

El total del pedido se compone de cuatro campos. **Al registrar el pago, el backend calcula el total vigente y lo almacena en `pago.monto`; desde ese instante los cuatro quedan inmutables.**

```
pago.monto  =  precio_unitario × cantidad  +  costos_adicionales  +  costo_entrega
```

Quién puede fijar cada uno, y hasta cuándo:

| Campo | Quién lo fija | Dónde | Mutable hasta |
|---|---|---|---|
| `precio_unitario` | **Nadie.** Lo copia el backend del producto | `POST /pedidos/` | Ya era inmutable desde la creación |
| `cantidad` | El comprador, al crear la solicitud | `POST /pedidos/` | Ya era inmutable desde la creación |
| `costos_adicionales` | El artesano del pedido | `PATCH /pedidos/{id}/costos/` | `estado_pago = pendiente` |
| `costo_entrega` | El artesano del pedido | `PATCH /pedidos/{id}/entrega/` | `estado_pago = pendiente` |

> **La congelación no concede permisos.** Ningún campo se vuelve modificable por el hecho de que el pago esté pendiente: dos de los cuatro nunca lo fueron y ningún endpoint los expone. La regla determina únicamente **el instante en que dejan de serlo los dos que sí lo eran**, y no sustituye a las comprobaciones de autorización de la sección 1.7: el artesano solo puede tocar los pedidos de su taller.

Intentar modificar un término económico con el pago ya registrado devuelve **`409`**.

**Por qué existe esta regla.** Sin ella, `costo_entrega` podría fijarse después de que el comprador pagara, y el importe realmente pagado dejaría de coincidir con el total del pedido. El reembolso del RF-015 —«por el monto pagado»— quedaría entonces sin forma de calcularse: el backend solo podría recomputar el total *actual*, que ya no sería el pagado.

**Consecuencia para el reembolso:** `reembolso.monto` **copia `pago.monto`**. Nunca se recalcula a partir del pedido.

### `GET /pedidos/` 🔒

Pedidos de la persona autenticada. **El backend filtra por identidad y rol**: un comprador recibe los suyos; un artesano, los de su taller. Esto sustituye la firma actual `listOrders({ rol, artesanoId })`, que recibía ambos datos del cliente.

**Parámetros** — `estado` (código; se omite para todos).

**Respuesta `200`** — array sin paginar. **Cada elemento anida el resumen del producto**, igual que el detalle:

```json
[
  {
    "id": 81,
    "codigo": "PM-1009",
    "producto": {
      "id": 15,
      "nombre": "Sandalias de cuero natural",
      "imagen": "https://host/media/productos/15/principal.jpg"
    },
    "artesano_id": 1,
    "comprador_id": 4,
    "comprador_nombre": "Ana Lucía Delgado",
    "cantidad": 2,
    "estado": "aceptado",
    "estado_pago": "pendiente",
    "precio_unitario": 4890,
    "costos_adicionales": 0,
    "costo_entrega": 0,
    "creado_en": "2026-08-15T10:30:00-06:00"
  }
]
```

El elemento de la colección es el detalle **sin** `historial`, `entrega`, `pago`, `reembolso`, `personalizacion`, `observaciones` ni los motivos. Esos campos solo viajan en `GET /pedidos/{id}/`.

> **Esta precisión es la que elimina seis consultas.** Sin `producto` anidado aquí, las cuatro pantallas que listan pedidos (`panel.index`, `panel.pedidos.index`, `pedidos.index`, `mensajes`) tendrían que seguir pidiendo el catálogo entero solo para resolver un nombre — que es exactamente lo que hoy hacen con `listProducts({ pageSize: 1000 })` — y las dos pantallas de detalle seguirían encadenando un `GET /productos/{id}/`. **Ninguna de las seis debe sobrevivir a la migración.**

### `GET /pedidos/{id}/` 🔒

Detalle, incluido el historial de auditoría. **`404`** si el pedido no pertenece a la persona autenticada.

```json
{
  "id": 81,
  "codigo": "PM-1009",
  "producto": { "id": 15, "nombre": "Sandalias de cuero natural", "imagen": "https://…" },
  "artesano_id": 1,
  "comprador_id": 4,
  "comprador_nombre": "Ana Lucía Delgado",
  "cantidad": 2,
  "personalizacion": "…",
  "observaciones": "…",
  "estado": "aceptado",
  "estado_pago": "pendiente",
  "precio_unitario": 4890,
  "costos_adicionales": 0,
  "costo_entrega": 0,
  "entrega": { "modalidad": "retiro_en_taller", "detalle": "…" },
  "pago": null,
  "reembolso": null,
  "motivo_cancelacion": null,
  "motivo_rechazo": null,
  "creado_en": "2026-08-15T10:30:00-06:00",
  "historial": [
    {
      "id": 1,
      "tipo": "pedido",
      "estado_anterior": null,
      "estado_nuevo": "pendiente",
      "usuario": "Ana Lucía Delgado",
      "fecha": "2026-08-15T10:30:00-06:00"
    }
  ]
}
```

> **Nota sobre `producto`:** se anida un resumen del producto en lugar de `producto_id`, que **no existe en ninguna lectura del pedido**. Hoy el frontend hace una segunda petición para mostrar el nombre en cada listado; anidarlo elimina esa consulta en cascada.
>
> El resumen es un **tipo propio**, no un `Product` recortado, y conviene declararlo así también en TypeScript:
>
> ```ts
> interface OrderProductSummary {
>   id: number;
>   nombre: string;
>   imagen: string;   // una sola URL, no el array `imagenes` del producto
> }
> ```
>
> La diferencia importa: `Product` tiene `imagenes: string[]` y el resumen tiene `imagen: string`. Si se tipa como `Product` parcial, el primer campo que falte provocará que alguien vuelva a pedir el producto completo, deshaciendo la mejora.
>
> **Lectura y escritura son asimétricas**, igual que en `categoria` (sección 4): se lee el objeto anidado y se escribe el identificador desnudo (`{"producto": 15}` en `POST /pedidos/`). No es una inconsistencia del contrato, es la misma regla aplicada a otra entidad.

> **Nota sobre `estado_anterior`:** es `null` en el evento inicial. El prototipo usaba la cadena `"—"`, que es un carácter de presentación y no debe viajar por la API.

#### El objeto `pago` en lectura

Es `null` mientras `estado_pago` sea `pendiente`. Una vez registrado:

```json
"pago": {
  "metodo": "transferencia",
  "referencia": "TRF-99381",
  "nota": "…",
  "monto": 9780,
  "tiene_comprobante": true,
  "registrado_en": "2026-08-15T11:00:00-06:00"
}
```

`monto` es el total congelado en el momento del registro (ver más arriba); lo calcula el backend y **el cliente nunca lo envía**.

> **No existe ningún campo con la URL del comprobante.** Es deliberado: el RNF-004 prohíbe URL descargables sin autenticación. La respuesta solo declara **si hay comprobante**, mediante el booleano `tiene_comprobante`, y el archivo se obtiene por un endpoint autenticado propio (sección 8). Se descartó la alternativa de URL firmadas con caducidad por complejidad desproporcionada para el volumen del sistema (RNF-007).

#### Tipos de evento del historial

`historial[].tipo` admite tres valores:

| `tipo` | Qué registra |
|---|---|
| `pedido` | Cambios de `estado` |
| `pago` | Cambios de `estado_pago` |
| `reembolso` | Nacimiento y finalización del reembolso |

El tercero existe porque el RNF-008 exige trazabilidad del reembolso y plegarlo dentro de `pago` haría ambiguo el historial: un mismo `tipo` describiría el cobro y su devolución.

> Registrar la modalidad de entrega **no genera evento de auditoría**: el RNF-008 acota la trazabilidad a los cambios de estado del pedido, del pago y a la mensajería.

### `POST /pedidos/` 🔒👤

Crea una solicitud. RF-009.

**Petición**

```json
{
  "producto": 15,
  "cantidad": 2,
  "personalizacion": "…",
  "observaciones": "…"
}
```

El comprador, el taller, el precio unitario, el código y el estado inicial los determina el **backend**. Esto sustituye `createOrderRequest(input, usuario)`, que recibía el nombre de la persona desde el cliente.

**Respuesta `201`** — el pedido creado.

### Acciones sobre el pedido

Las transiciones con reglas o datos propios son **acciones explícitas**, no un `PATCH` genérico: cada una tiene permisos distintos y cuerpo distinto, y el registro de auditoría queda inequívoco.

| Endpoint | Rol | Desde | Hasta | Cuerpo |
|---|---|---|---|---|
| `POST /pedidos/{id}/aceptar/` 🔒🔨 | artesano | `pendiente` | `aceptado` | — |
| `POST /pedidos/{id}/rechazar/` 🔒🔨 | artesano | `pendiente` | `rechazado` | `{"motivo": "…"}` (obligatorio, mínimo 5 caracteres) |
| `POST /pedidos/{id}/cancelar/` 🔒 | **ambos** | `aceptado`, `en_produccion` | `cancelado` | `{"motivo": "…"}` (opcional) |
| `POST /pedidos/{id}/estado/` 🔒🔨 | artesano | avance lineal | siguiente | `{"estado": "en_produccion"}` |

> **Normalización del motivo.** Un motivo ausente se **omite del cuerpo o viaja como `null`**. Nunca como cadena vacía ni como texto de relleno (`""`, `"—"`, `"Sin motivo"`). El backend normaliza a `null` cualquier cadena vacía o compuesta solo de espacios que reciba, **independientemente de lo que envíe el cliente**, y almacena el campo como nulo. Esto corrige el comportamiento actual del prototipo, que envía `motivo.trim()` y por tanto `""` cuando la persona no escribe nada, y es la misma regla que ya se aplica a `estado_anterior`: un valor de presentación no viaja por la API.

`POST /pedidos/{id}/estado/` cubre el avance lineal (`aceptado → en_produccion → listo_para_entrega → entregado`), donde no hay datos adicionales. El backend valida la transición contra la máquina de estados y responde **`409`** si es inválida.

**Caso especial — inicio de producción.** Si el destino es `en_produccion` y el pago no está confirmado, la respuesta es `409` con un código distinguible, para que la interfaz explique la causa real en lugar de un error genérico:

```json
{
  "detail": "No se puede iniciar la producción sin el pago confirmado.",
  "codigo": "pago_no_confirmado"
}
```

Todas devuelven **`200`** con el pedido actualizado, de modo que el frontend refresque su caché con la respuesta.

> **Corrección respecto del prototipo:** hoy la interfaz del artesano oculta la cancelación (`panel.pedidos.$id.tsx` filtra `"Cancelado"`), pese a que el RF-015 permite cancelar a ambas partes. El contrato la habilita para los dos roles; la interfaz deberá reflejarlo.

### Reembolso al cancelar un pedido pagado (RF-015)

Cuando se cancela un pedido cuyo `estado_pago` es `confirmado`, el backend **registra automáticamente la necesidad de un reembolso** como parte de la misma operación de cancelación. El comprador no lo solicita y el artesano no lo crea: es una consecuencia del estado.

La respuesta de `POST /pedidos/{id}/cancelar/` incluye entonces el objeto `reembolso`:

```json
{
  "id": 81,
  "estado": "cancelado",
  "estado_pago": "confirmado",
  "reembolso": {
    "estado": "pendiente",
    "monto": 9780,
    "registrado_en": "2026-08-15T11:00:00-06:00",
    "completado_en": null
  }
}
```

`reembolso` es `null` en cualquier pedido que no haya sido cancelado tras un pago confirmado. **`reembolso.monto` copia `pago.monto`** —el total congelado al registrarse el pago— y no se recalcula nunca a partir de los campos del pedido. No existen reembolsos parciales.

**La cancelación y el nacimiento del reembolso son una sola transacción.** El backend cambia el estado, escribe el evento de auditoría y crea el reembolso de forma atómica: no puede quedar un pedido cancelado sin su reembolso, ni al revés.

#### Qué le ocurre al pago

**`estado_pago` no cambia: permanece en `confirmado`**, también después de que el reembolso se complete.

No es un descuido. El RF-011 v3.0 fija exactamente tres estados de pago y está congelado; añadir un cuarto (`reembolsado`) modificaría el requisito. Y el contrato ya declara ambas máquinas independientes (sección 8): que el pago se cobró y se confirmó es un hecho histórico que sigue siendo cierto: el reembolso es un hecho **distinto**, con su propio estado. El par es inequívoco:

```
estado_pago = confirmado   +   reembolso.estado = completado
        →   se pagó, y se devolvió
```

> **Nota para la interfaz, no para el contrato:** un pedido reembolsado nunca debe mostrarse solo como «Pago confirmado». Las dos señales se leen juntas.

#### `POST /pedidos/{id}/reembolso/completar/` 🔒🔨

El artesano declara que ya realizó la devolución por fuera de la plataforma. `reembolso.estado`: `pendiente` → `completado`.

**Respuesta `200`** — el pedido actualizado. **`409`** si el pedido no tiene reembolso pendiente.

> **La plataforma no ejecuta transferencias bancarias.** Este endpoint únicamente registra una declaración del artesano, que queda en el historial de auditoría con `tipo = "reembolso"` (RNF-008). Es la traducción literal de "registrará el estado del reembolso" del RF-015.
>
> **Confirmado.** El modelado del reembolso como objeto anidado en el pedido, y que sea el artesano quien lo marque como completado, se derivan del RF-015 sin estar dictados literalmente por él. Ambas decisiones quedaron validadas junto con la semántica del pago posterior al reembolso.

### `PATCH /pedidos/{id}/entrega/` 🔒🔨

Registra la modalidad de entrega. RF-016.

```json
{
  "modalidad": "punto_de_encuentro",
  "detalle": "Parque central de Masaya, sábado 10:00 a. m.",
  "costo_entrega": 150
}
```

**Los tres campos no comparten precondición**, porque solo uno de ellos es económico:

| Campo | Estados del pedido en que se admite | Condición adicional |
|---|---|---|
| `modalidad`, `detalle` | `aceptado`, `en_produccion`, `listo_para_entrega` | — |
| `costo_entrega` | Los mismos | **`estado_pago = pendiente`** (congelación económica) |

El RF-016 sitúa el registro de la entrega en un pedido «Aceptado», pero delega la coordinación concreta —fecha, hora, lugar— en el chat del RF-014, cuya ventana abarca también `en_produccion` y `listo_para_entrega`. Restringir la modalidad al estado `aceptado` contradiría esa delegación, de modo que el contrato la admite en los tres estados en que el chat está activo. El componente económico sí queda sujeto a la congelación.

**Errores** — `409` si el pedido está en un estado que no admite la operación, o si se intenta modificar `costo_entrega` con el pago ya registrado. **`404`** si el pedido no pertenece al taller autenticado.

### `PATCH /pedidos/{id}/costos/` 🔒🔨

Registra los costos adicionales del pedido: materiales especiales, recargo por personalización u otros conceptos que el artesano determina tras evaluar la solicitud. Implementa la parte de **RF-006** que el resto del contrato no cubría.

```json
{ "costos_adicionales": 350 }
```

**Precondición** — `estado_pago = pendiente`, por la congelación económica. El estado del pedido debe ser `aceptado`, `en_produccion` o `listo_para_entrega`.

**Respuesta `200`** — el pedido actualizado.

**Errores** — `409` si el pago ya está registrado o el estado no lo admite. **`404`** si el pedido no pertenece al taller autenticado.

> **Por qué un endpoint propio y no una ampliación de `entrega/`.** Son responsabilidades de requisitos distintos —RF-006 frente a RF-016— y el contrato ya fijó el criterio de que las acciones con reglas propias tienen endpoint propio (ver el desglose de las transiciones más arriba). Que `costo_entrega` viaje en `entrega/` es una concesión al hecho de que la modalidad y su costo se deciden juntos; no es motivo para acumular ahí todos los términos económicos.

---

## 8. Pagos, mensajería y notificaciones

El pago y el pedido son **máquinas de estado separadas**: registrar o confirmar un pago no modifica `estado`. Existe una única dependencia entre ellas, en un solo sentido — la precondición de RF-010: **no se puede iniciar la producción sin el pago confirmado** (ver [sección 7](#7-pedidos)).

### `POST /pedidos/{id}/pago/` 🔒👤

El comprador registra su pago. `estado_pago`: `pendiente` → `registrado`.

**Estado requerido del pedido:** `aceptado` (RF-011 v3.0). El backend responde `409` si el pedido está en cualquier otro estado.

**Petición** — `multipart/form-data` cuando se adjunta comprobante:

| Campo | Tipo |
|---|---|
| `metodo` | código de método de pago |
| `referencia` | texto, opcional |
| `nota` | texto, opcional |
| `comprobante` | archivo, opcional |

> **El cuerpo no lleva `monto`.** Lo calcula el backend al procesar esta petición, a partir de los términos económicos vigentes, y lo almacena en `pago.monto` (ver la congelación económica en la sección 7). Un `monto` enviado por el cliente debe ser ignorado o rechazado, conforme a la regla general de la sección 1.7.

> **Cambio respecto del prototipo:** hoy solo se guarda `comprobanteNombre`, una cadena con el nombre del archivo. El contrato contempla el **archivo real**. Su almacenamiento y control de acceso son responsabilidad del backend (RNF-004): el comprobante solo debe ser accesible para el comprador y el artesano del pedido.

**Errores** — `409` en dos situaciones: cuando el pago **ya se encuentra registrado** y cuando el pedido **no está en estado `aceptado`**.

> **Ambas comparten respuesta y no llevan códigos diferenciados.** Las dos son conflictos con el estado actual del recurso, y bajo el criterio de la sección 1.9 ninguna exige una acción distinta del cliente: en los dos casos debe refrescar el pedido y presentar el `detail` recibido. Distinguirlas mediante códigos sería crear una diferencia que el frontend no usaría.

> **Resuelto:** el prototipo solo permite registrar el pago en `listo_para_entrega`; el RF-011 v3.0 fija `aceptado`. Prevalece el requisito (desviación D-1).

### `POST /pedidos/{id}/pago/confirmar/` 🔒🔨

El artesano confirma la recepción. `estado_pago`: `registrado` → `confirmado`. **`409`** si no hay pago registrado.

Confirmar el pago **no avanza el pedido automáticamente**: solo habilita que el artesano pueda hacerlo. El paso a `en_produccion` sigue siendo una acción explícita suya.

### `GET /pedidos/{id}/pago/comprobante/` 🔒

Devuelve el archivo del comprobante. Implementa el control de acceso que exige el **RNF-004**.

**Autorización** — únicamente el comprador y el artesano de ese pedido. Cualquier otra persona autenticada recibe **`404`**, no `403`, conforme a la regla de la sección 1.9: un recurso ajeno no revela su existencia.

**Respuesta `200`** — el archivo, con su `Content-Type` real y `Content-Disposition: attachment`. **`404`** si el pedido no tiene comprobante.

> **Este endpoint es la razón por la que el objeto `pago` no expone ninguna URL.** El archivo nunca es accesible por una dirección adivinable ni sin autenticación: cada descarga atraviesa la misma comprobación de pertenencia que el resto de los recursos del pedido. En Django se resuelve con una vista que sirve el archivo tras validar el permiso, sin exponer la ruta de almacenamiento.

### `GET /pedidos/{id}/mensajes/` 🔒

Mensajes del pedido, en orden cronológico. Array sin paginar. RF-014.

**Parámetros** — `desde` (fecha ISO): devuelve **solo los mensajes posteriores**, para que el sondeo no reenvíe la conversación completa (RNF-010).

```json
[
  {
    "id": 42,
    "pedido_id": 81,
    "autor": "artesano",
    "autor_nombre": "Manos de Membreño",
    "texto": "…",
    "fecha": "2026-08-15T10:31:00-06:00"
  }
]
```

El frontend sondea cada 15 segundos el chat y cada 20 las notificaciones (RNF-010).

> **Desaparece por completo** la generación aleatoria de mensajes del artesano que hoy hace `pollNewMessages()` con un 45 % de probabilidad por sondeo.

### `POST /pedidos/{id}/mensajes/` 🔒

Envía un mensaje. `{"texto": "…"}`. El autor se deriva de la identidad autenticada.

El backend **rechaza con `409`** los mensajes en pedidos cuyo estado no admite conversación: `pendiente` (aún no habilitada), `rechazado` (nunca se habilita), `entregado` y `cancelado` (solo lectura).

> **Restricción de acceso (RF-013 / RN-06):** los mensajes de un pedido son accesibles **únicamente** para su comprador y su artesano. El rol administrador **no puede leerlos**, ni por la API ni desde Django Admin. El modelo de mensajes debe quedar excluido del registro en el panel de administración.

### Notificaciones

Implementan el deber de notificar que establecen el **RF-005** (solicitudes nuevas al artesano) y el **RF-015** (cancelación a la otra parte). Son un **recurso persistente**: el backend crea el registro dentro de la misma transacción del evento que lo origina, de modo que el estado leída/no leída sobrevive a la recarga y el cliente no necesita descargar la colección de pedidos para deducir que algo ocurrió.

> **Delimitación de alcance.** Las notificaciones representan únicamente los eventos expresamente establecidos por RF-005 y RF-015. Las demás transiciones del pedido —`aceptado`, `rechazado`, `en_produccion`, `listo_para_entrega`, `entregado`— **no generan notificaciones**. Los mensajes del chat **no generan registros en `Notificacion`**, ya que su consulta incremental se realiza mediante el endpoint de mensajes con el parámetro `desde`. La notificación es persistente y se consulta mediante sondeo; **no implica mecanismos push, correo, SMS ni WhatsApp**.

Esta delimitación evita que `Notificacion` se convierta en un bus de eventos genérico. Ampliarla —por ejemplo, para avisar al comprador de que su solicitud fue aceptada, que es una funcionalidad razonable pero que ningún requisito pide— exige modificar el RF correspondiente, no el contrato.

### `GET /notificaciones/` 🔒

Notificaciones **no leídas** de la persona autenticada, más recientes primero. Array sin paginar. El destinatario se deriva del token; no se acepta ningún parámetro de usuario.

```json
[
  {
    "id": 12,
    "tipo": "solicitud_nueva",
    "pedido_id": 81,
    "pedido_codigo": "PM-1009",
    "creada_en": "2026-08-15T10:30:00-06:00"
  }
]
```

> **Devuelve solo las no leídas, y por eso no se pagina.** Es la colección que el frontend sondea, y marcarlas como leídas la vacía, de modo que está acotada por construcción — la condición que la sección 1.8 exige para no paginar. El historial completo de notificaciones no lo consume ninguna pantalla y no se expone.

No lleva `leida` en la respuesta: todo lo que devuelve está sin leer.

El texto que ve la persona usuaria se compone **en el frontend** a partir de `tipo` y `pedido_codigo`, siguiendo la regla de la sección 1.4: por la API viajan códigos, nunca la redacción visible.

### `POST /notificaciones/leer/` 🔒

Marca notificaciones como leídas.

```jsonc
{ "pedido": 81 }   // solo las de ese pedido
{ }                // todas las del usuario
```

Solo afecta a las notificaciones de quien hace la petición. **Respuesta `204`.**

> Las dos formas del cuerpo corresponden a las dos acciones que ya existen en la interfaz: marcar leída al abrir un pedido, y vaciar el panel completo.

### Quién no recibe notificación

Al cancelar, el destinatario es **la otra parte**: quien ejecuta la cancelación no se notifica a sí mismo. El backend lo determina comparando la identidad autenticada con el comprador y el artesano del pedido; el cliente no indica destinatario.

### `GET /artesanos/me/resumen/` 🔒🔨

Indicadores del panel. Sustituye `artisanSummary()`, que hoy se calcula en el cliente recorriendo todo el almacén.

```json
{
  "solicitudes_pendientes": 1,
  "activos": 0,
  "pagos_por_confirmar": 0,
  "productos": 10,
  "por_estado": { "pendiente": 1, "aceptado": 0 }
}
```

---

## 9. Tabla de mapeo de campos

Conversión que aplica la capa de mapeo del cliente HTTP. Solo se listan los campos cuyo nombre cambia; el resto (`id`, `nombre`, `precio`, `cantidad`, `estado`, `texto`, `fecha`…) es idéntico en ambos lados.

| API (`snake_case`) | Frontend (`camelCase`) |
|---|---|
| `artesano_estado` | `artesanoEstado` |
| `artesano_id` | `artesanoId` |
| `autor_nombre` | `autorNombre` |
| `comprador_id` | `compradorId` |
| `comprador_nombre` | `compradorNombre` |
| `costo_entrega` | `costoEntrega` |
| `costos_adicionales` | `costosAdicionales` |
| `creada_en` | `creadaEn` |
| `creado_en` | `creadoEn` |
| `estado_anterior` | `estadoAnterior` |
| `estado_nuevo` | `estadoNuevo` |
| `estado_pago` | `estadoPago` |
| `foto_url` | `fotoUrl` |
| `motivo_cancelacion` | `motivoCancelacion` |
| `motivo_rechazo` | `motivoRechazo` |
| `nombre_taller` | `nombreTaller` |
| `pedido_codigo` | `pedidoCodigo` |
| `pedido_id` | `pedidoId` |
| `portada_url` | `portadaUrl` |
| `precio_unitario` | `precioUnitario` |
| `registrado_en` | `registradoEn` |
| `tiene_comprobante` | `tieneComprobante` |
| Envoltorio de paginación | ver sección 1.8 |

> Los campos nuevos `monto`, `publicado` y `estado` no cambian de nombre y por eso no figuran en la tabla.

---

## 10. Impacto sobre el frontend actual

Cambios que este contrato implica en el código existente. **No se ejecuta ninguno hasta que el contrato sea aprobado y exista un plan.**

| Área | Cambio | Alcance |
|---|---|---|
| `src/types/index.ts` | `id: string` → `id: number` en `User`, `Artisan`, `Product`, `Order`, `Message`, `AuditEvent` | Alto — TypeScript señalará cada punto afectado |
| `src/types/index.ts` | `OrderStatus`, `PaymentStatus`, `DeliveryMode`, `PaymentMethod` pasan a códigos | Alto |
| `src/types/index.ts` | `Category` deja de ser unión literal y pasa a objeto poblado desde la API | Medio |
| Nuevo: diccionarios de etiquetas | Traducción código → texto visible para cada enum | Nuevo |
| `src/lib/order-state.ts` | Opera sobre códigos en lugar de etiquetas | Medio — lógica intacta, cambian los literales |
| `src/components/pedidos/status-badges.tsx`, `timelines.tsx` | Muestran la etiqueta traducida, no el valor | Medio |
| `src/routes/catalogo.tsx` | `?categoria=` viaja como código; el selector se puebla desde `/categorias/` | Medio |
| `src/hooks/use-session.tsx` | Se elimina `DEMO_ARTISAN_ID`; la identidad viene de `GET /auth/perfil/` | Alto |
| `src/routes/auth.tsx` | El rol deja de elegirse en el formulario de ingreso; las credenciales se envían de verdad | Medio |
| Panel del artesano (4 archivos) | Se elimina el patrón `usuario?.artesanoId ?? DEMO_ARTISAN_ID` | Alto — es una escalada de privilegios |
| Nuevo: guardas de ruta | `/panel/*` exige sesión con rol artesano (solo experiencia de usuario) | Nuevo |
| Nuevo: cliente HTTP | Token de acceso en memoria, cabecera `Bearer`, renovación ante `401` sin disparar peticiones duplicadas | Nuevo |
| `src/routes/panel.pedidos.$id.tsx` | Se habilita la cancelación para el artesano (RF-015) | Bajo |
| `src/components/productos/image-uploader.tsx` | Envía archivo al backend en vez de producir un DataURL | Medio |
| `src/services/mock-api.ts` | Se sustituye por servicios de dominio sobre un cliente HTTP | Alto |
| `src/data/seed.ts` | Desaparece como fuente de datos | Alto |
| `src/routes/pedidos.$id.tsx` | `puedePagar` pasa de exigir "Listo para entrega" a "Aceptado" (D-1) | Bajo |
| `src/lib/order-state.ts` + `mock-api.ts` | `canTransition` / `changeOrderStatus` incorporan la precondición de pago confirmado para entrar en producción (D-2) | Medio |
| `src/types/index.ts` | Se retira `"Pago contra entrega"` de `PaymentMethod` (D-3) | Bajo |
| `src/types/index.ts` + UI de pedido | Se añade el objeto `reembolso` al pedido y su visualización (D-5) | Medio — funcionalidad nueva |
| `src/types/index.ts` | `Order.productoId: number` → `Order.producto: OrderProductSummary` | Medio — 8 sitios de uso |
| `panel.index.tsx`, `panel.pedidos.index.tsx`, `pedidos.index.tsx`, `mensajes.tsx` | Desaparecen las cuatro consultas `listProducts({ pageSize: 1000 })` y el helper `nombreProducto()`; se lee `o.producto.nombre` | Medio |
| `pedidos.$id.tsx`, `panel.pedidos.$id.tsx` | Desaparecen las dos consultas en cascada `getProduct(o.productoId)`; se lee `o.producto.nombre` e `o.producto.imagen` | Bajo |
| `src/routes/artesano.$id.tsx` | `listMyProducts(id)` → `GET /productos/?artesano={id}` paginado; se reutiliza `components/ui/pagination.tsx` | Medio |
| `src/routes/panel.productos.tsx` | `listMyProducts(artesanoId)` → `GET /productos/mios/`, sin parámetro | Bajo — pero cierra una vía de escalada |
| `src/routes/index.tsx` | La portada deja de pedir destacados: productos por `listProducts({orden:"recientes", pageSize:8})` y talleres por la colección; cambian ambos títulos | Bajo |
| `src/types/index.ts`, `seed.ts`, `mock-api.ts`, `product-card.tsx`, `producto.$id.tsx` | Se elimina `Product.disponible` y sus dos indicadores visuales | Medio — atraviesa modelo, datos y UI |
| `src/types/index.ts` | `Order.pago` gana `monto` y `tieneComprobante`; desaparece `comprobanteNombre` | Bajo |
| `src/types/index.ts` | `User` gana `artesanoEstado`; `AuditEvent.tipo` admite `reembolso` | Bajo |
| `src/types/index.ts` | `Product` gana `publicado`, presente solo en la respuesta de «mis productos» | Bajo |
| Panel del artesano | Controles nuevos para costos adicionales (`PATCH …/costos/`) y aviso de taller pendiente de aprobación | Medio — funcionalidad nueva |
| UI de pedido | Los términos económicos dejan de ser editables cuando el pago está registrado | Bajo |
| UI de pedido | Descarga del comprobante contra endpoint autenticado, no por URL directa | Bajo |
| `src/lib/format.ts` | Desaparece la constante `TASA_CAMBIO`; `formatPrice()` recibe la tasa en lugar de tomarla del ámbito del módulo | Medio — es una función pura usada en todo el catálogo |
| `src/hooks/use-currency.tsx` | `CurrencyProvider` obtiene la tasa de `GET /configuracion/` y la inyecta en `format()`; oculta la opción USD si falla | Medio |
| `producto.$id.tsx`, `currency-switcher.tsx` | El texto «Tasa simulada» pasa a mostrar la tasa real y su fecha de actualización | Bajo |
| `src/hooks/use-notifications.tsx` | Se reescribe contra `GET /notificaciones/`: desaparece el sondeo de todos los pedidos y el de mensajes por pedido para construir avisos; el estado leída/no leída deja de vivir en memoria de React | Alto — cambia el mecanismo, no solo la fuente |
| `src/hooks/use-notifications.tsx` | Empieza a notificar solicitudes nuevas y cancelaciones (RF-005, RF-015), que hoy no notifica | Nuevo |

> **Observación sobre el orden de trabajo:** los cambios de tipos (identificadores y códigos de enumeración) afectan al mock tanto como al futuro cliente HTTP. Conviene aplicarlos **antes** de sustituir la capa de servicios, para que el mock siga siendo utilizable durante la transición y el compilador de TypeScript actúe como red de seguridad en un cambio a la vez.

---

## 11. Cuestiones abiertas

Deben resolverse antes o durante la implementación del backend:

1. **Detalles de los tokens.** Caducidad del token de acceso y del de renovación, si la renovación es rotativa, y si el cierre de sesión mantiene una lista de revocados. El mecanismo general ya está resuelto en el [ADR-003](../adr/0003-autenticacion-y-autorizacion.md).
2. **Política de imágenes.** Número máximo por producto, dimensiones de salida tras la compresión con Pillow y si se generan miniaturas.
3. **Catálogo de reglas de negocio.** El RF-013 cita la regla **RN-06** (el administrador no puede leer los mensajes del chat), pero el catálogo de reglas RN-xx no está incorporado al repositorio. Sin él, la trazabilidad queda incompleta y hay restricciones que la API no puede verificar.

### Cuestiones cerradas en esta revisión

| Cuestión | Cómo quedó |
|---|---|
| Aprobación de talleres | `Artesano.estado` con tres valores (sección 2.7); efectos definidos en las secciones 3, 5 y 6 |
| Modelado del reembolso | Confirmado: objeto anidado, completado por el artesano, `monto` copiado del pago, `estado_pago` sin cambio |
| Acceso a los comprobantes | Endpoint autenticado `GET /pedidos/{id}/pago/comprobante/`; se descartaron las URL firmadas |
| Tasa de cambio (RF-007) | Escritura por Django Admin, lectura por `GET /configuracion/` (sección 4). Sin endpoint administrativo REST; el RF-007 no se modifica |
| Notificaciones (RF-005 / RF-015) | Recurso persistente `Notificacion` con dos endpoints (sección 8), acotado a los dos eventos que los requisitos nombran. Sin push, correo, SMS ni WhatsApp |

---

## 12. Conceptos deliberadamente excluidos

Esta sección existe porque **una ausencia no se defiende sola**. El prototipo contenía tres conceptos que una lectura mecánica habría trasladado al backend. Ninguno estaba respaldado por un requisito, y los tres se retiraron por la misma razón, no por conveniencia técnica.

> **Principio aplicado:** el backend implementa el contrato y los requisitos. El mock no define requisitos nuevos. Un comportamiento de la maqueta sin respaldo en los RF/RNF se retira; no se le fabrica un requisito para justificarlo.

### 12.1 Productos y talleres «destacados»

**Retirado.** No existe `GET /productos/destacados/` ni `GET /artesanos/destacados/`.

La palabra «destacado» no aparece en ningún RF ni RNF. En el prototipo el criterio era `store.products.slice(0, 8)` y `store.artisans.slice(0, 4)`, es decir, los primeros elementos de un arreglo cuyo orden lo fijó el generador de datos de forma arbitraria: no era una selección, era una coincidencia.

Se consideró darle respaldo real mediante un campo `destacado` curado por el administrador desde Django Admin, apoyándose en el RF-013. Se descartó: para sostener una sección que la herramienta de generación del prototipo puso en la portada y que ningún requisito pidió, habría hecho falta un RF nuevo o modificado, un campo en dos modelos, una regla de administración, su exposición en el panel, un endpoint, la lógica de selección y su documentación y pruebas.

**Qué ocupa su lugar:** la portada usa lo que el contrato ya ofrece — `GET /productos/?orden=recientes&page_size=8` y `GET /artesanos/`. Los títulos de ambas secciones dejan de prometer una selección.

### 12.2 Disponibilidad del producto

**Retirado.** El producto no tiene campo `disponible`, no hay filtro por disponibilidad, y `POST /pedidos/` no la valida.

Ningún RF ni RNF menciona disponibilidad de producto, agotado, stock ni inventario. El RNF-006, pese a llamarse «Disponibilidad», se refiere al *uptime* del sistema (95 % mensual) y no guarda relación.

La razón de fondo es que el concepto **duplica un mecanismo que el sistema ya tiene**. El comentario del propio RF-005 lo dice: *no es e-commerce de stock, es gestión de pedidos bajo demanda*. La decisión de si una pieza puede producirse la toma el artesano al evaluar cada solicitud:

```
Producto publicado
       │
       ▼
El comprador solicita el pedido
       │
       ▼
El artesano evalúa   (RF-005)
   ┌───┴────┐
   ▼        ▼
ACEPTA    RECHAZA
```

Un estado previo de «disponible / no disponible» sería una segunda capa de disponibilidad sin requisito que la respalde, y arrastraría la semántica de inventario que el modelo excluye explícitamente.

Se consideró conservar el campo y darle respaldo con un requisito nuevo del tipo «el artesano puede pausar la publicación de un producto sin eliminarlo». Se descartó por la misma razón que en 12.1: sería añadir un requisito para justificar algo que solo existía porque la maqueta lo traía.

**Qué ocupa su lugar:** RF-005. El artesano rechaza la solicitud que no puede atender, indicando el motivo.

> **Consecuencia sobre el prototipo:** hoy `Product.disponible` se muestra en dos sitios (la insignia de la tarjeta del catálogo y el rótulo de la ficha) pero no filtra nada, y el botón «Solicitar pedido» se renderiza sin condición — de modo que una pieza rotulada «Temporalmente no disponible» puede pedirse igual. El defecto desaparece al retirar el campo.

**Lo que esta exclusión no cubre.** Retirar `disponible` no elimina la capacidad de **moderación** que el RF-013 concede al administrador para dar de baja un producto que incumpla los lineamientos. Esa necesidad sí tiene requisito y se implementa con el campo `publicado` de la [sección 5](#5-productos-y-catálogo). Los dos conceptos no deben confundirse:

| | `disponible` (retirado) | `publicado` (vigente) |
|---|---|---|
| Actor | El artesano | El administrador |
| Motivo | Capacidad de producción | Moderación de lineamientos |
| Requisito | Ninguno | RF-013, explícito |
| Vía | Habría sido un endpoint del taller | Django Admin, sin endpoint REST |

### 12.3 Imagen de la categoría

**Excluido del contrato, conservado en el frontend.** La categoría expone `{id, codigo, nombre}` y nada más.

La imagen que la portada muestra para cada rubro es un recurso de presentación: vive en `src/lib/category-images.ts`, indexada por el código de la categoría, y debe sobrevivir a la desaparición del mock. Añadir un campo `imagen` a `/categorias/` convertiría un asunto de diseño del cliente en un campo del modelo de dominio y obligaría al backend a almacenar y servir un archivo que solo el frontend interpreta.

**Deuda que esto deja en el frontend, no en el contrato:** el mapa está declarado como `Record<string, string>`, un tipo que promete una imagen para cualquier código y solo tiene seis. Falta decidir el recurso de reserva para una categoría que el administrador cree más adelante. Es un problema del cliente y se resuelve en su propio ámbito.
