# ADR-002 — Estrategia de acceso a datos y transformación de contratos

**Estado:** Aceptada (decisión registrada; **no implementada todavía** — pendiente de plan y autorización).

**Fecha:** 2026-08-15

**Decisión previa relacionada:** [ADR-001 — Sistema de routing](0001-sistema-de-routing.md)

> **Sustituciones posteriores.** Este ADR menciona **SQL Server** como motor de persistencia y sitúa el backend «en un repositorio separado» sin nombrarlo. Ambos puntos fueron revisados después:
>
> - El motor de persistencia es **PostgreSQL** desde el [ADR-005](0005-infraestructura-y-persistencia.md).
> - El repositorio del backend es **`Back-Artesanic`**, según el [ADR-004](0004-ubicacion-del-backend.md).
>
> El texto original se conserva sin modificar, porque registra la decisión tal como se tomó. Las menciones a SQL Server que siguen deben leerse como el estado anterior, no como la arquitectura vigente. La decisión central de este ADR —dónde ocurre la transformación de contratos y qué papel juega el mock— **no queda afectada**.

## Contexto

El frontend obtiene hoy todos sus datos de [`src/services/mock-api.ts`](../../apps/frontend/src/mocks/index.ts), un módulo que simula una API REST (latencia artificial, errores provocados, mutaciones) sobre un almacén en memoria construido desde [`src/data/seed.ts`](../../apps/frontend/src/mocks/seed.ts). El sistema final consumirá una API REST provista por Django REST Framework sobre SQL Server, desarrollada en un repositorio separado.

Un análisis del código real arrojó los siguientes hallazgos:

**Lo que ya está bien resuelto.** Todas las funciones públicas de `mock-api.ts` devuelven `Promise<T>`, y el `store` en memoria está encapsulado detrás de ellas. Ningún componente importa datos de `seed.ts` (la única referencia, `CATEGORY_IMAGE` en `src/routes/index.tsx`, es un recurso de imagen, no datos de dominio). El problema, por tanto, **no es la ausencia de una capa de servicios**, sino la forma de los contratos que esa capa expone.

**Los obstáculos reales detectados para sustituir el mock por DRF:**

1. **Firmas que transportan datos que el backend debe derivar de la autenticación.** Por ejemplo `listOrders({ rol, artesanoId })`, `createOrderRequest(input, usuario)` y `changeOrderStatus(id, nuevo, usuario, motivo)` reciben del cliente el rol, la identidad del usuario y el identificador del taller. Con un backend real y autenticación por token, esos valores deben derivarse del token en el servidor; aceptarlos desde el cliente sería un defecto de autorización.
2. **`DEMO_ARTISAN_ID` incrustado en la identidad de sesión.** La constante se exporta desde `mock-api.ts` y la consumen cinco archivos, incluido `src/hooks/use-session.tsx`, que la usa para construir el usuario artesano. La identidad del taller proviene hoy de una constante y no de una sesión autenticada.
3. **Divergencia de nomenclatura.** El modelo del frontend usa camelCase (`precioUnitario`, `estadoPago`, `creadoEn`, `nombreTaller`, `artesanoId`); DRF, con serializadores por defecto, emite snake_case (`precio_unitario`, `estado_pago`, `creado_en`).
4. **Formato de paginación incompatible.** El mock devuelve `Paginated<T>` como `{ items, total, page, pageSize, totalPages }` y `src/routes/catalogo.tsx` consume `data.items` y `data.totalPages` directamente. La paginación estándar de DRF responde `{ count, next, previous, results }`.
5. **Operaciones que hoy no corresponden a un recurso REST.** `artisanSummary()` es una agregación calculada en el cliente recorriendo el almacén completo, y requerirá un endpoint dedicado. `pollNewMessages()` además **genera mensajes falsos de forma aleatoria** (45 % de probabilidad por sondeo) para demostrar el polling; ese comportamiento debe desaparecer.

## Decisión

1. **Los mocks son temporales.** Se eliminarán cuando el backend Django REST Framework esté disponible. No se implementará un sistema permanente de selección entre implementación mock e implementación HTTP (proveedores intercambiables, inyección de dependencias o *feature flags*), salvo que surja un requisito explícito posterior.
2. **El frontend mantiene sus contratos de datos en camelCase.** Los tipos de `src/types/index.ts` son el modelo de dominio del frontend y no se adaptan a la nomenclatura de Django.
3. **Las respuestas HTTP de DRF podrán usar snake_case**, manteniéndose idiomáticas respecto de Python.
4. **La transformación `snake_case → camelCase` ocurrirá exclusivamente en la frontera de comunicación HTTP**, dentro de la capa de API/servicios.
5. **Los componentes React y la lógica de presentación no conocerán los nombres de campo específicos de la API.** La interfaz de usuario nunca debe saber que el backend emite, por ejemplo, `precio_unitario`.
6. **El mock entrega directamente el modelo de dominio en camelCase.** No simulará artificialmente el snake_case de Django para luego transformarlo: el mock existe para simular *el comportamiento* del backend, no *su implementación interna*. En consecuencia, la capa de mapeo solo existirá cuando exista el cliente HTTP real.
7. **TanStack Query continúa siendo la capa de gestión y caché de datos del frontend**, conforme al ADR-001.

### Arquitectura resultante

```text
        AHORA                              FUTURO

     React UI                            React UI
        ↓                                   ↓
   TanStack Query                      TanStack Query
        ↓                                   ↓
     Servicios                           Servicios
        ↓                                   ↓
      Mock API                          Cliente HTTP
        ↓                                   ↓  ← mapeo snake_case → camelCase
    Datos mock                     Django REST Framework
                                            ↓
                                        SQL Server
```

El contrato de la capa de servicios permanece estable en ambos escenarios; lo que se sustituye es su implementación.

## Consecuencias

**Positivas**

- El cambio futuro se concentra en la capa de servicios, sin reescribir componentes ni hooks de presentación.
- El frontend no queda acoplado a la nomenclatura particular de Django; si el backend cambiara de convención, el impacto se limita a la capa de mapeo.
- Se evita mantener dos implementaciones vivas de cada servicio, complejidad que habría que justificar sin un requisito que la respalde.
- Es una arquitectura defendible académicamente: establece un límite arquitectónico explícito sin introducir un sistema de proveedores configurable.

**Negativas y costos asumidos**

- La capa de mapeo es código adicional que debe escribirse y mantenerse por cada entidad del dominio (`Product`, `Artisan`, `Order`, `Message`, `AuditEvent`).
- Al no conservarse una implementación mock, el frontend no podrá ejecutarse de forma autónoma una vez completada la integración: demostrar el sistema requerirá el backend en funcionamiento. Se acepta este costo por simplicidad arquitectónica.
- Mientras el mock entregue camelCase directamente, la capa de mapeo no tendrá ejercicio real hasta que exista el backend, por lo que sus errores solo se detectarán al integrar.

## Cuestiones que este ADR no resuelve

Los siguientes puntos se identificaron durante el análisis pero corresponden a decisiones posteriores y **no** quedan resueltos aquí:

| Cuestión | Dónde corresponde decidirse |
|---|---|
| Cómo se autentica el usuario y cómo el backend deriva rol e identidad (obstáculos 1 y 2) | Decisión sobre autenticación (JWT / sesión) |
| Eliminación de `DEMO_ARTISAN_ID` y reemplazo por identidad de sesión real | Decisión sobre autenticación |
| Formato de paginación acordado entre frontend y DRF (obstáculo 4) | Definición del contrato de API |
| Endpoints de agregación como `artisanSummary` (obstáculo 5) | Definición del contrato de API |
| Estrategia de subida de imágenes y comprobantes (`processImage` devuelve hoy un DataURL en base64) | Definición del contrato de API |
| Rutas, verbos y códigos de estado de cada recurso | Definición del contrato de API |

## Siguiente paso

Elaborar el plan de implementación correspondiente antes de modificar código. No se ejecuta ningún cambio hasta que ese plan sea revisado y autorizado explícitamente.
