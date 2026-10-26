# Arquitectura del frontend — cliente HTTP y sesión

**Estado:** primer tramo de AUD-18 (21 de octubre de 2026). Decisiones: [D-AUD18-01 a D-AUD18-09](../decisiones/v1.md#concreciones-de-aud-18-primer-tramo-cliente-común-y-sesión). Contrato: [autenticación](../api/autenticacion.md) y [talleres](../api/talleres.md).

## Modos

| Variable | Valores | Efecto |
|---|---|---|
| `VITE_AUTH_API` | `mock` (por defecto) · `real` | `real`: la identidad sale solo de Django. `mock`: sesión simulada de la demo con el selector «Vista de demostración». |
| `VITE_CATALOGO_API` | `mock` (por defecto) · `real` | Fuente de catálogo, talleres públicos y solicitudes. `VITE_AUTH_API=real` exige `real`. |

Un valor inválido o `VITE_AUTH_API=real` con `VITE_CATALOGO_API=mock` detiene la aplicación al cargar. Para probar contra Django y PostgreSQL:

```bash
VITE_AUTH_API=real VITE_CATALOGO_API=real pnpm -C apps/frontend dev
```

El proxy de Vite envía `/api` al backend, así que las cookies `csrftoken` y `refresh` son del mismo origen que la SPA.

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

## Mensajería del pedido (AUD-16)

`src/features/mensajes/` es solo real: `http.ts` (Bearer, cuerpo `{texto}`, sin CSRF, respuestas validadas con Zod y traducidas a `camelCase`), `types.ts` (`MensajePedido`, `ConversacionPedido`; no usa el `Message` legacy) y `api.ts` (`fusionar`, `agregarPropio`, `sondearNovedades`, `INTERVALO_SONDEO_MS = 15000`). Un único `OrderChat` se monta en `DetallePedidoConfirmado` para comprador y artesano, con la clave `["mensajes-reales", usuario, pedido]`. La primera lectura trae el historial; después, cada 15 s y solo si `soloLectura` es `false`, pide `despues_de=<cursor>` y mezcla el delta en la caché sin `invalidateQueries`. El autor propio se reconoce por `autor.id`, nunca por nombre o rol. `409 conversacion_cerrada` o `solo_lectura: true` ocultan el compositor y conservan el historial. La demo usa `OrderChatDemo` y `NotificationsProvider`, que importan `@/mocks/mensajes` directamente (excepción explícita en `eslint.config.js`); `/mensajes` sigue siendo demo. Contrato: [mensajes](../api/mensajes.md); pruebas: `scripts/check-mensajes.mjs`.

## Caché de TanStack Query

Al iniciar sesión (con cualquier identidad), registrarse, cerrar sesión o expirar, el controlador cancela las consultas y vacía la caché antes de publicar la identidad nueva. Ninguna pantalla puede mostrar datos de la cuenta anterior.

## Pruebas

`scripts/check-taller-propio.mjs` cubre `GET`/`PATCH` del taller propio y el panel renderizado. `scripts/check-auth.mjs` usa un backend simulado con estado (CSRF, rotación de la cookie de renovación, revocación) y `scripts/check-auth-ui.mjs` renderiza formularios, cabecera y guards con `react-dom/server`. Las tres forman parte de `pnpm test`.
