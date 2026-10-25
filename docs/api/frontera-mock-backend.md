# Frontera Mock → Backend — Artesanica

**Estado:** Línea base de implementación. Este documento delimita exactamente qué debe construir Django para sustituir a `src/services/mock-api.ts`, y qué deliberadamente **no** debe cruzar esa frontera.

**Fecha:** 2026-08-15

**Ubicación — 10-oct-2026:** `mock-api.ts` se dividió por dominio en `src/mocks/` y la interfaz lo consume desde `src/features/<dominio>/api.ts`, con las mismas funciones y firmas ([ADR-011](../adr/0011-frontend-por-dominio.md)). Las menciones a `mock-api.ts` de este documento se refieren a ese conjunto.

**Ajuste de entrega — 1-oct-2026:** `setDeliveryQuote(id, costoEntrega, notasCotizacion, usuario)` deriva la modalidad de la solicitud del comprador, sin admitir que el artesano la cambie. `setDeliveryCoordination(id, input, usuario)` guarda `fechaRecogida` para recoger en taller o `detalle` para las otras modalidades. La dirección del taller se consulta con `getArtisan` desde su perfil; no se introduce en las notas ni se altera el total congelado. Simulación autorizada por Luis, pendiente de homologación y contrato real.

**Extensión de demo — 30-sep-2026:** las tablas de agosto se conservan como línea base. El [plan funcional](../planes/2026-09-30-correcciones-funcionales-demo.md) autoriza nuevas simulaciones **sin contrato homologado todavía**. Dependen de homologación y ADR-006; no deben traducirse automáticamente a endpoints ni considerarse implementación Django. Contrato y ADR no se modifican.

| Extensión del mock                                                                                                 | Responsabilidad real pendiente                                                          |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Nuevos campos de `ProductInput` y `OrderRequestInput`                                                              | Modelo de unidades/oferta homologado, validación por servidor e identidad autenticada   |
| Reserva al aceptar, consumo al entregar, `classifyCancelledUnits`, `listUnitMovements`                             | Transacciones, concurrencia, permisos y auditoría del servidor                          |
| `setDeliveryQuote`, `setDeliveryCoordination` y cotización congelada; `setDelivery` queda como alias de cotización | Contrato para cotización pendiente y coordinación posterior; importes inmutables        |
| `registerPayment`, `correctPayment`, `reviewPayment`, `confirmPayment`; intentos y eventos anexados                | Contrato de intentos y revisiones, plazos, permisos de cada acción y archivos validados |
| `getPaymentReceipt(pedidoId, intentoId, comprobanteId, sesion)`                                                    | Sesión validada por servidor y archivos privados; el frontend solo simula el control    |
| Foto y portada en `updateArtisan`                                                                                  | Multipart, procesamiento de imágenes y verificación de propiedad                        |
| `mock-persistence.ts`, `resetDemo` y `getPersistenceStatus`                                                                                | No cruzan la frontera: herramientas locales del prototipo                               |

`getOrder` y listados entregan metadatos, sin imágenes de comprobantes. IndexedDB es accesible al propietario del navegador; no equivale a almacenamiento privado del backend. La serialización protege una instancia y revierte ante error de guardado; no prueba concurrencia distribuida.

**Documento que lo gobierna:** [Contrato de API](contrato-api.md) — 34 endpoints.

**Requisitos que lo respaldan:** [Requisitos funcionales y no funcionales](../requisitos/historico/especificacion-v2.1.md).

---

## 1. Para qué sirve este documento

El prototipo frontend funciona hoy sobre una capa de servicios simulada. Sustituirla por un backend real admite dos formas de trabajo, y solo una es correcta:

```
INCORRECTO                          CORRECTO

mock-api.ts                         REQUISITOS
     │                                   │
     │ "traducir cada función"           ▼
     ▼                              CONTRATO API
   Django                                │
                                 ┌───────┴────────┐
                                 ▼                ▼
                          mock → contrato   contrato → backend
                                 │                │
                                 └───────┬────────┘
                                         ▼
                                      Django
```

Traducir el mock función por función produciría un backend que hereda las decisiones que la maqueta tomó por conveniencia de simulación: latencias artificiales, identidades codificadas, consultas que traen mil productos para resolver un nombre, y funcionalidades que ningún requisito pidió.

Este documento es el resultado de recorrer la frontera **en las dos direcciones** y cruzar ambos recorridos contra el catálogo de requisitos.

> **Regla que gobierna todo el documento:** el backend implementa el contrato y los requisitos. **El mock no define requisitos nuevos.** Un comportamiento de la maqueta sin respaldo en los RF/RNF se retira; no se le fabrica un requisito para justificarlo.

---

## 2. Método

| Paso | Qué se hizo                                                                   | Qué encontró                                                     |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Inventario `mock-api.ts` → contrato: las 27 funciones y constantes exportadas | 2 decisiones bloqueantes, ambas resueltas                        |
| 2    | Inventario contrato → backend: los 34 endpoints                               | 10 huecos del contrato                                           |
| 3    | Cruce de ambos contra los 16 RF y 10 RNF                                      | 3 funcionalidades sin requisito, 3 requisitos sin implementación |
| 4    | Resolución de los huecos H-1 … H-10                                           | 3 campos y 5 endpoints nuevos                                    |
| 5    | Delimitación de lo que no forma parte del sistema                             | Sección 12 del contrato                                          |

Las clasificaciones que usan las dos tablas siguientes:

|     | Significado                                                              |
| --- | ------------------------------------------------------------------------ |
| 🟢  | Directo — el contrato lo define con precisión suficiente                 |
| 🟡  | Traducción — existe, pero cambia de forma, de actor o de responsabilidad |
| 🟣  | Sin equivalente en el mock — Django lo construye desde cero              |
| ⚪  | No cruza la frontera                                                     |

**No queda ningún 🔴 en ninguna de las dos direcciones.** Los doce huecos y decisiones bloqueantes detectados fueron cerrados y aplicados al contrato.

---

## 3. Inventario mock → contrato

Las 27 funciones y constantes exportadas por `src/services/mock-api.ts`.

### 3.1 🟢 Migran directo — 7

| Función del mock              | Endpoint                             |
| ----------------------------- | ------------------------------------ |
| `listCategories()`            | `GET /categorias/`                   |
| `getProduct(id)`              | `GET /productos/{id}/`               |
| `listArtisans()`              | `GET /artesanos/`                    |
| `getArtisan(id)`              | `GET /artesanos/{id}/`               |
| `confirmPayment(id, usuario)` | `POST /pedidos/{id}/pago/confirmar/` |
| `listMessages(pedidoId)`      | `GET /pedidos/{id}/mensajes/`        |
| `sendMessage(pedidoId, …)`    | `POST /pedidos/{id}/mensajes/`       |

«Directo» significa que la forma de la respuesta y la intención coinciden. **Todas pierden igualmente los parámetros de identidad**: el backend deriva quién llama del token autenticado.

### 3.2 🟡 Requieren traducción — 13

| Función del mock                      | Destino                              | Qué cambia                                                                                                           |
| ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `listProducts(filters)`               | `GET /productos/`                    | Envoltorio de paginación de DRF; parámetros en `snake_case`; excluye productos no publicados y talleres no aprobados |
| `listMyProducts(artesanoId)`          | **Se parte en dos**                  | `GET /productos/mios/` (privado, sin parámetro) y `GET /productos/?artesano={id}` (público, paginado)                |
| `createProduct(artesanoId, input)`    | `POST /productos/`                   | `multipart/form-data`; el taller sale del token; la compresión pasa al servidor                                      |
| `updateProduct(id, input)`            | `PATCH /productos/{id}/`             | Verificación de propiedad en el servidor                                                                             |
| `updateArtisan(id, data)`             | `PATCH /artesanos/me/`               | **Pierde el identificador**; cuerpo explícito; `rubro` por código                                                    |
| `listOrders({rol, artesanoId})`       | `GET /pedidos/`                      | **Pierde los dos parámetros**: el backend filtra por identidad y rol                                                 |
| `getOrder(id)`                        | `GET /pedidos/{id}/`                 | Gana `producto` anidado, `pago` con `monto`, `reembolso`; pierde `productoId`                                        |
| `createOrderRequest(input, usuario)`  | `POST /pedidos/`                     | Pierde `usuario`; el precio unitario y el código los fija el servidor                                                |
| `changeOrderStatus(id, estado, …)`    | **Cuatro endpoints**                 | `aceptar/`, `rechazar/`, `cancelar/`, `estado/` — separados por permiso y por cuerpo                                 |
| `registerPayment(id, input, usuario)` | `POST /pedidos/{id}/pago/`           | `multipart`; el `monto` lo calcula el servidor; el comprobante es un archivo real                                    |
| `setDelivery(id, modalidad, …)`       | `PATCH /pedidos/{id}/entrega/`       | Precondiciones separadas: la modalidad y su costo ya no comparten regla                                              |
| `pollNewMessages(pedidoId, desde)`    | `GET /pedidos/{id}/mensajes/?desde=` | **El delta sobrevive; la generación aleatoria de mensajes desaparece**                                               |
| `artisanSummary(artesanoId)`          | `GET /artesanos/me/resumen/`         | El cálculo pasa del cliente al servidor                                                                              |

Las cinco interfaces exportadas (`CatalogFilters`, `Paginated`, `ProductInput`, `OrderRequestInput`, `PaymentInput`) acompañan a estas funciones y se convierten en los tipos de la capa de mapeo del cliente HTTP.

### 3.3 ⚪ No cruzan la frontera — 7

| Elemento                                   | Por qué                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEMO_ARTISAN_ID`, `DEMO_USER_ID`          | Identidades codificadas. Las sustituye `GET /auth/perfil/`                                                                                 |
| `simularFalloProximaPeticion()`            | Instrumento de demostración del estado de error (RNF-006)                                                                                  |
| `featuredProducts()`, `featuredArtisans()` | Ningún requisito respalda el concepto de «destacado»                                                                                       |
| `countByCategory()`                        | Sin ningún consumidor en la interfaz                                                                                                       |
| `processImage(file)`                       | **La responsabilidad cruza de lado**: la compresión pasa al servidor con Pillow (RF-002). La función del cliente desaparece; no se traduce |

Y tres mecanismos internos que tampoco tienen destino: `delay()` (latencia simulada), `structuredClone()` en cada respuesta (aislamiento del almacén en memoria) y el contador de secuencias que asigna identificadores.

---

## 4. Inventario contrato → backend

Los 34 endpoints del contrato.

|                                  | Cantidad |
| -------------------------------- | -------- |
| 🟢 Directo                       | 9        |
| 🟡 Traducción / decisión técnica | 14       |
| 🟣 Sin equivalente en el mock    | 11       |

### 4.1 🟣 Los once que Django construye desde cero

Esta es la lista que el inventario del mock **no podía ver por construcción**, y la razón por la que hicieron falta los dos recorridos.

| Endpoint / capacidad                      | Requisito      | Por qué el mock nunca lo simuló                        |
| ----------------------------------------- | -------------- | ------------------------------------------------------ |
| `POST /auth/registro/`                    | RF-004         | El prototipo no registra a nadie                       |
| `POST /auth/login/`                       | RF-004         | La sesión se elige en un selector, sin credenciales    |
| `POST /auth/refrescar/`                   | ADR-003        | No hay tokens                                          |
| `POST /auth/logout/`                      | ADR-003        | No hay sesión que invalidar                            |
| `GET /auth/perfil/`                       | RF-004         | La identidad es una constante del código               |
| `GET /configuracion/`                     | RF-007         | La tasa es una constante del frontend                  |
| `PATCH /pedidos/{id}/costos/`             | RF-006         | Los costos adicionales valen cero y nada los modifica  |
| `GET /pedidos/{id}/pago/comprobante/`     | RNF-004        | El mock guarda el nombre del archivo, no el archivo    |
| `POST /pedidos/{id}/reembolso/completar/` | RF-015         | El concepto de reembolso no existe                     |
| `GET /notificaciones/`                    | RF-005, RF-015 | Las notificaciones se derivan en memoria del navegador |
| `POST /notificaciones/leer/`              | RF-005, RF-015 | El estado leída/no leída no se persiste                |

> **Los cinco endpoints añadidos durante el análisis son todos 🟣.** No apareció ninguno por reinterpretar la maqueta: cada uno cierra un requisito aprobado que no estaba implementado.

### 4.2 La superficie más grande no es un endpoint

**La autorización a nivel de objeto no tiene equivalente que traducir.** El mock no comprueba pertenencia en ninguna operación: `getOrder(id)` devuelve cualquier pedido a quien lo pida. Todo el trabajo es nuevo, atraviesa los 34 endpoints y no aparece como una fila en ninguna tabla.

Las dos reglas que lo gobiernan están en la sección 1.7 del contrato:

- El cliente **nunca** envía su identidad, su rol ni el identificador de su taller. El backend los deriva de `request.user`.
- Toda operación sobre un recurso identificado por `id` verifica que quien la solicita es parte legítima de él. **El identificador en la URL nunca es prueba de autorización.**

Un recurso ajeno responde **`404`, no `403`**, para no revelar su existencia.

---

## 5. Lista A — Backend implementable ya

**Los 34 endpoints.** Tras el cierre de los diez huecos, ninguno depende de una decisión pendiente.

Los modelos que se deducen del contrato son once:

| Modelo            | Notas                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `Usuario`         | Teléfono como identificador de acceso; `rol`; `is_active` es nativo de Django y cubre RF-013 |
| `Artesano`        | Taller. `estado`: `pendiente` / `aprobado` / `suspendido`                                    |
| `Categoria`       | `codigo` estable + `nombre`                                                                  |
| `Producto`        | `publicado`, que solo modifica el administrador                                              |
| `Pedido`          | Términos económicos congelables                                                              |
| `Pago`            | `monto` calculado por el servidor; comprobante con control de acceso                         |
| `Reembolso`       | Nace de la cancelación de un pedido pagado                                                   |
| `EventoAuditoria` | `tipo`: `pedido` / `pago` / `reembolso` (RNF-008)                                            |
| `Mensaje`         | **Excluido de Django Admin** (RF-013 / RN-06)                                                |
| `Notificacion`    | Dos tipos, enumeración cerrada                                                               |
| `Configuracion`   | Fila única; escritura solo por Django Admin                                                  |

Y cinco reglas de negocio transversales que el backend debe aplicar **con independencia de lo que haga el frontend**:

1. **Precondición de producción** — `aceptado → en_produccion` exige `estado_pago = confirmado` (RF-010, RF-011).
2. **Congelación económica** — al registrarse el pago, los cuatro términos económicos quedan inmutables y `pago.monto` los captura.
3. **Reembolso automático y atómico** — cancelar un pedido con pago confirmado crea el reembolso en la misma transacción.
4. **Ventana del chat** — solo `aceptado`, `en_produccion` y `listo_para_entrega` admiten mensajes nuevos (RF-014).
5. **Publicación** — un taller no aprobado no publica productos; sus productos no aparecen en el catálogo público.

---

## 6. Lista B — Decisiones que deben cerrarse

Tres cuestiones abiertas. **Ninguna bloquea el diseño de los modelos**, y por eso la implementación puede comenzar.

| Cuestión                     | Qué falta                                                                                                | Cuándo estorba                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Detalles de los tokens**   | Caducidad del token de acceso y del de renovación, si la rotación es rotativa, si hay lista de revocados | Al configurar la autenticación, no antes          |
| **Política de imágenes**     | Número máximo por producto, dimensiones tras la compresión, si se generan miniaturas                     | Al implementar RF-002                             |
| **Catálogo de reglas RN-xx** | El RF-013 cita la regla RN-06 pero el catálogo no está en el repositorio                                 | Afecta a la trazabilidad documental, no al código |

---

## 7. Lista C — Funcionalidad del contrato que el mock no representa

Es la sección 4.1 de este documento: los **once endpoints 🟣**, más la autorización a nivel de objeto (4.2) y tres responsabilidades que cambian de lado:

| Responsabilidad                      | En el prototipo                 | En el sistema real                                                                           |
| ------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------- |
| Compresión de imágenes               | Navegador (`processImage`)      | Servidor, con Pillow (RF-002)                                                                |
| Cálculo del resumen del panel        | Cliente, recorriendo el almacén | Servidor (`GET /artesanos/me/resumen/`)                                                      |
| Validación de transiciones de estado | Cliente (`order-state.ts`)      | **Servidor.** El módulo del cliente se conserva solo para habilitar o deshabilitar controles |

---

## 8. Lo que deliberadamente no cruza

Documentado en extenso en la [sección 12 del contrato](contrato-api.md). En resumen:

| Concepto                 | Por qué se retiró                                                                                | Qué ocupa su lugar                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Destacados**           | Ningún RF lo respalda; el criterio del mock era `slice(0, 8)` sobre un orden arbitrario          | La portada usa el listado con orden por recencia      |
| **`Product.disponible`** | Ningún RF lo respalda; duplica el mecanismo del RF-005 en un sistema que declara no ser de stock | El artesano rechaza la solicitud que no puede atender |
| **Imagen de categoría**  | Es presentación del cliente; el contrato no la contempla                                         | Recurso local del frontend, indexado por código       |

Y dos precisiones que evitan reintroducirlos por error:

- **`Producto.publicado` no es `disponible`.** Actor distinto (administrador frente a artesano), motivo distinto (moderación frente a capacidad de producción) y, sobre todo, **respaldo distinto**: RF-013 lo exige explícitamente.
- **`Notificacion` no es un bus de eventos.** Solo los dos hechos que nombran RF-005 y RF-015. Las demás transiciones del pedido no notifican, y los mensajes del chat no crean registros: su consulta incremental ya se resuelve con el parámetro `desde`.

---

## 9. Estado y siguiente paso

```
Requisitos                    16 RF · 10 RNF
      ↓
Contrato API                  34 endpoints · 0 huecos abiertos
      ↓
Frontera (este documento)     A: 34 implementables
                              B:  3 decisiones, ninguna bloqueante
                              C: 11 + autorización de objeto
      ↓
Modelos Django                11 modelos · 5 reglas transversales
      ↓
Serializadores y validadores
      ↓
Permisos y autorización
      ↓
Endpoints
      ↓
Adaptación de src/
```

**`src/` permanece congelado** hasta que el backend exista. La tabla de impacto sobre el frontend vive en la sección 10 del contrato y se ejecutará por fases, con el mismo método que las fases B y C.

**El siguiente paso es el modelo de datos, no los endpoints.** A partir de aquí, el mock deja de ser guía: la única fuente de verdad es el contrato.
