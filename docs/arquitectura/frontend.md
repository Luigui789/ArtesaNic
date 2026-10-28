# Arquitectura del frontend — cliente HTTP, sesión y cierre de AUD-18

**Estado:** AUD-18 cerrado (octubre de 2026). Decisiones: [D-AUD18-01 a D-AUD18-09](../decisiones/v1.md#concreciones-de-aud-18-primer-tramo-cliente-común-y-sesión) y [cierre de AUD-18](../decisiones/v1.md#cierre-de-aud-18-integración-real-del-frontend). Contratos: [autenticación](../api/autenticacion.md), [talleres](../api/talleres.md), [pedidos](../api/pedidos.md), [mensajes](../api/mensajes.md) y [notificaciones](../api/notificaciones.md).

## Modos

| Variable | Valores | Efecto |
|---|---|---|
| `VITE_AUTH_API` | `real` (por defecto) · `mock` | `real`: la identidad sale solo de Django. `mock`: sesión simulada aislada para pruebas de regresión de la demo. |
| `VITE_CATALOGO_API` | `real` (por defecto) · `mock` | Fuente de catálogo, talleres públicos y solicitudes. `VITE_AUTH_API=real` exige `real`. |

Un valor inválido o `VITE_AUTH_API=real` con `VITE_CATALOGO_API=mock` detiene la aplicación al cargar. Por omisión (`pnpm -C apps/frontend dev` o Docker Compose), la aplicación arranca en modo `real`:

```bash
pnpm -C apps/frontend dev
```

El proxy de Vite envía `/api` al backend, así que las cookies `csrftoken` y `refresh` son del mismo origen que la SPA.

## Mapa y geocodificación

El selector de ubicación del taller del panel (FEAT-GEO-02, `src/features/talleres/`) usa Leaflet con React Leaflet y dos servicios externos, cuyas URL solo aparecen en `mapa.ts`:

| Variable | Por defecto | Uso |
|---|---|---|
| `VITE_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Capa base del mapa. Siempre con atribución visible de OpenStreetMap. |
| `VITE_GEOCODING_URL` | En desarrollo, `https://nominatim.openstreetmap.org/search`; en producción, ninguno | Búsqueda de lugares (API `search` compatible con Nominatim). |

Ninguna requiere clave. Los servidores públicos de OSM son un servicio limitado, sin garantía de disponibilidad. Según las [políticas de tiles](https://operations.osmfoundation.org/policies/tiles/) y de [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), `geocoding.ts` solo busca con acción explícita (botón o Enter, sin autocompletado), espacia las peticiones de cada navegador a un máximo de 1 por segundo y guarda en memoria los resultados por consulta; Leaflet pide solo los tiles visibles.

El límite de 1 petición/s del Nominatim público es para toda la aplicación, sumando a todos sus usuarios. El espaciado de `geocoding.ts` es por navegador y no lo garantiza con varios usuarios a la vez, así que el Nominatim público es solo un respaldo de desarrollo (`vite dev`, también con Docker Compose). Un build de producción sin `VITE_GEOCODING_URL` oculta la búsqueda de lugares; el mapa manual y «Usar mi ubicación actual» siguen funcionando. Para producción, `VITE_GEOCODING_URL` debe apuntar a un proveedor propio o administrado, idealmente detrás de un proxy con caché.

La ubicación del dispositivo se pide una vez al pulsar «Usar mi ubicación actual» y requiere HTTPS (o `localhost`).

Leaflet usa `window` al importarse: `mapa-ubicacion-leaflet.tsx` se carga con `lazy` solo en el navegador, y `scripts/check-geolocalizacion-taller.mjs` comprueba que el formulario se renderiza en Node sin él.

## Capas

```text
src/lib/http/          cliente común (sin reglas de negocio)
  transporte.ts        fetch con credentials: "include", errores de red
  csrf.ts              token CSRF en memoria, una petición compartida
  sesion.ts            token de acceso en memoria, época y avisos de expiración
  cliente.ts           solicitar(): Bearer, CSRF, 401 → renovación compartida → 1 reintento
  errores.ts           ApiError (400 por campo, 429 con Retry-After), RespuestaInvalidaError
src/features/auth/
  http.ts              endpoints de cuentas, cuerpos con lista cerrada, esquemas Zod
  modo.ts              VITE_AUTH_API explícito
  api.ts               elige el adaptador real o el simulado (src/mocks/sesion.ts)
  sesion.ts            controlador sin React: estados y limpieza de caché
  use-session.tsx      SessionProvider (useSyncExternalStore)
  components/          formularios, guards (RequiereSesion, SoloDemo)
```

## Sesión

| Estado | Cuándo |
|---|---|
| `cargando` | Arranque, mientras se renueva con la cookie |
| `anonima` | Renovación `401`, logout o expiración |
| `autenticada` | Respuesta de login, registro o perfil validada con Zod |
| `error` | Red o servidor no disponibles al comprobar la sesión; no se fabrica usuario |

El usuario autenticado es exactamente `usuario` del servidor (`id`, `nombre`, `telefono`, `rol`). El login no pide rol; el registro elige endpoint (`registro/comprador/` o `registro/artesano/`) según la intención, sin enviar `rol`. El artesano envía su taller inicial y queda pendiente; `/panel` muestra el estado de `GET /talleres/mi-taller/`.

**Mi taller (RF-008):** `/panel` y `/panel/perfil` permiten editar el perfil público con `PATCH /talleres/mi-taller/` en cualquier estado (pendiente, aprobado o rechazado). Solo viajan los campos de `CAMPOS_PERFIL` modificados; estado, motivo de rechazo y fecha de revisión se muestran como solo lectura. Editar no cambia la aprobación. Tras guardar, la respuesta reemplaza la caché `["mi-taller", usuario]` y se invalidan `["perfil-taller", id]`, el filtro de talleres y el catálogo ([D-AUD18-10](../decisiones/v1.md#concreciones-de-aud-18-primer-tramo-cliente-común-y-sesión)).

## Mensajería del pedido (AUD-16 y cierre AUD-18)

`src/features/mensajes/` es solo real: `http.ts` (Bearer, cuerpo `{texto}`, sin CSRF, respuestas validadas con Zod y traducidas a `camelCase`), `types.ts` (`MensajePedido`, `ConversacionPedido`; no usa el `Message` legacy) y `api.ts` (`fusionar`, `agregarPropio`, `sondearNovedades`, `INTERVALO_SONDEO_MS = 15000`). Un único `OrderChat` se monta tanto en `DetallePedidoConfirmado` (`/pedidos/:id` y `/panel/pedidos/:id`) como en la conversación seleccionada de `/mensajes` (`src/features/mensajes/pages/mensajes.tsx`), con la clave `["mensajes-reales", usuario, pedido]`. `/mensajes` está protegida con `RequiereSesion` para comprador y artesano, pagina los pedidos confirmados con `listarPedidosConfirmados(recibido, page)` y resuelve enlaces directos `/mensajes?pedido=<id>` fuera de la página actual mediante `consultarPedidoConfirmado`, sin iniciar bucles de sondeo para conversaciones no seleccionadas. La primera lectura trae el historial; después, cada 15 s y solo si `soloLectura` es `false`, pide `despues_de=<cursor>` y mezcla el delta en la caché sin `invalidateQueries`. El autor propio se reconoce por `autor.id`, nunca por nombre o rol. `409 conversacion_cerrada` o `solo_lectura: true` ocultan el compositor y conservan el historial. En modo real no se monta `NotificationsProvider` de la demo. Contrato: [mensajes](../api/mensajes.md); pruebas: `scripts/check-mensajes.mjs` y `scripts/check-aud18-cierre.mjs`.

## Caché de TanStack Query

Al iniciar sesión (con cualquier identidad), registrarse, cerrar sesión o expirar, el controlador cancela las consultas y vacía la caché antes de publicar la identidad nueva. Ninguna pantalla puede mostrar datos de la cuenta anterior.

## Pruebas

`scripts/check-taller-propio.mjs` cubre `GET`/`PATCH` del taller propio y el panel renderizado. `scripts/check-auth.mjs` usa un backend simulado con estado (CSRF, rotación de la cookie de renovación, revocación), `scripts/check-auth-ui.mjs` renderiza formularios, cabecera y guards con `react-dom/server` y `scripts/check-aud18-cierre.mjs` verifica `/mensajes` real, `/descubrir` real, el modo real por defecto y la ausencia de fugas demo en rutas reales. Todas forman parte de `pnpm test`.

AUD-17: las notificaciones comerciales persistentes y su bandeja real se describen en [notificaciones](../api/notificaciones.md).
