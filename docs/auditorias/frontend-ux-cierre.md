# Fase 8: cierre global del refactor UX

Rama `feature/frontend-ux-cierre`, creada desde `feature/frontend-ux-refactor` en
`0c5abdc` (fases 1–7). Revisión transversal, no rediseño: solo se corrigieron
inconsistencias, regresiones o deuda real del refactor. Sin merge a `develop`.

## Git

- HEAD inicial `0c5abdc`; worktree limpio. Respecto de `origin/develop`: 25 commits
  por delante, 0 por detrás, merge-base `580535e`. `develop` no avanzó, así que no se
  hizo merge.
- Sin rebase, squash ni force push. Backend, migraciones y `docs/api/openapi.yaml` sin
  cambios respecto de `develop`.

## Hallazgos

| Prioridad | Hallazgo | Estado |
| --- | --- | --- |
| P0 | Ninguno | — |
| P1 | Las fases UX introdujeron voseo en unas 60 líneas (Home, catálogo, producto, solicitudes, pedidos, pagos, inventario, panel); el resto de la app, validaciones incluidas, usa tuteo (380 líneas en `develop`). Varias pantallas mezclaban las dos formas | Corregido: tuteo en todo (84 reemplazos, mismo significado) |
| P2 | Guardar el perfil del taller no invalidaba `["talleres-publicos"]` (Home, /descubrir y mapa, con `staleTime` de 60 s introducido por el refactor): podía mostrarse el nombre anterior durante un minuto | Corregido, con regresión en `check-taller-propio` |
| P2 | `/catalogo`: las tarjetas `h3` seguían directamente al `h1` | Corregido con un `h2` visualmente oculto |
| P2 | Breadcrumb de producto con enlaces de 20 px de alto | Corregido: área táctil de 44 px |
| P2 | `resolucion-pedido`: `aria-controls` apuntaba a un formulario que todavía no existe (preexistente) | Corregido |
| P2 | Cinco secciones de Home sin consumidores (ya sin uso en `develop`) | Eliminadas |
| P2 | Con el taller pendiente, `/panel/productos` muestra «Nuevo producto» y un error 403 explicado («revisa la aprobación de tu taller») | Se mantiene: comportamiento previo, mensaje comprensible |
| P2 | Sin uso: `unit-availability.tsx` (citado en trazabilidad histórica), `lib/error-*.ts` y primitivas shadcn no usadas | Se mantienen: biblioteca e historial, sin riesgo |
| P2 | Términos/privacidad enlazan a `/ayuda`; la aceptación no se persiste (contrato sin soporte) | Pendiente documentado en la fase 7 |

## Responsive (navegador real)

Matriz de 125 combinaciones: 25 rutas (anónimo 8, comprador 7, artesano 10) × 360,
390, 768, 1024 y 1440 px. La medición se hizo con `scrollWidth` y con los rectángulos
de cada elemento, no a simple vista: **0** casos de scroll horizontal o elementos
fuera del viewport, **0** respuestas API ≥ 400 inesperadas ni errores JavaScript, y
exactamente un `h1` y un `main` por página.

Rutas: `/`, `/catalogo`, `/producto/:id`, `/artesano/:id`, `/descubrir`, `/auth`,
registro, `/ayuda`, `/solicitudes`, `/solicitar/:id`, `/pedidos`, `/pedidos/:id`,
`/mensajes`, `/notificaciones`, `/cuenta`, `/panel`, `/panel/solicitudes`,
`/panel/productos`, `/panel/inventario`, `/panel/pedidos`, `/panel/pedidos/:id` y
`/panel/perfil`. Además, el registro por pasos y el perfil en los cinco anchos (fase 7)
y el panel con el taller pendiente a 360 px.

Controles por debajo de 40 px en la matriz: el enlace «Saltar al contenido» (oculto
hasta recibir foco), el breadcrumb (corregido) y el switch de ubicación, cuya fila con
`label` asociado mide 44 px.

## Accesibilidad

- Auditoría del DOM renderizado en las 24 rutas (axe no está instalado y no se agregó):
  IDs duplicados, controles sin label o solo con placeholder, botones y enlaces sin
  nombre, imágenes sin `alt`, `aria-describedby`/`labelledby`/`controls` rotos y saltos
  de encabezado. Solo quedaron los dos casos corregidos arriba.
- Teclado en Chromium:
  - el skip link es el primer foco y se ve;
  - el menú móvil se abre con Enter, retiene el foco y Escape lo cierra devolviendo el
    foco al botón;
  - las tabs del pedido se recorren con flechas, Home y End;
  - un borrador en Mensajes se conserva al cambiar de pestaña (`forceMount`);
  - el `alertdialog` de descartar cambios se cierra con Escape, devuelve el foco y
    conserva los datos;
  - el `Dialog` del comprobante se cierra con Escape;
  - en el registro, las tarjetas de rol se eligen con flechas, la casilla con Espacio
    y un error enfoca el primer campo.
- Límites: no hay certificación WCAG, ni validación con lector de pantalla ni con
  teclado físico de un teléfono.

## Django + PostgreSQL reales

Base PostgreSQL 16 local y temporal, migraciones existentes, Django en 8000 y Vite
real en 5173. Los datos de prueba se crearon con los helpers de prueba del backend,
que usan los servicios reales (solicitud → revisión → propuesta → aceptación). No se
interceptó la API desde el navegador.

- **Anónimo:** Home → producto (precio y «Cómo puedes solicitarlo» antes del
  contenido secundario) → taller público con «Cómo llegar» a las coordenadas
  publicadas → /descubrir con mapa diferido y marcador.
- **Comprador:**
  - creó una solicitud desde el producto;
  - registró el pago con comprobante PNG;
  - envió un mensaje y vio «Mensaje enviado»;
  - marcó un aviso como leído y llegó al pedido desde «Ver pedido»;
  - vio el pago confirmado y la respuesta del taller;
  - abrió «Mi cuenta», cerró sesión y volvió a entrar.
- **Artesano:**
  - abrió la solicitud recibida;
  - abrió el comprobante en el `Dialog` (URL `blob:` autenticada) y confirmó el pago
    con confirmación;
  - vio «Iniciar preparación»;
  - leyó y respondió el mensaje;
  - marcó todas las notificaciones como leídas;
  - abrió el diálogo «Nuevo producto» y el inventario;
  - comprobó el panel de un taller pendiente.
- **Registro (repetido por la fase 7):**
  - comprador: tarjetas, Atrás conserva incluso las contraseñas, el intento sin
    aceptar queda bloqueado sin `POST`, se crea la cuenta con un único `POST` e inicia
    sesión;
  - un teléfono duplicado devuelto por el servidor lleva al paso 2 con el foco en el
    campo;
  - artesano: taller, mapa, cambio de rol con los datos conservados y un único `POST`
    con `ubicacion_publica` sin `rol` ni aceptación;
  - tras la aprobación: perfil, imagen, un único `PATCH` y perfil público sin el
    teléfono de acceso;
  - inicio de sesión de ambas cuentas nuevas: ni la contraseña ni los tokens quedan en
    `localStorage` o `sessionStorage`.

No se registraron errores JavaScript ni respuestas 5xx. Al terminar se recreó la base
temporal vacía y se borraron los archivos subidos; no había usuarios previos.

## Checks

| Check | Resultado |
| --- | --- |
| `pnpm run doctor` | Sin avisos nuevos; `develop` 82 avisos → rama 74 (0 regresiones) |
| `pnpm run typecheck` | OK |
| `pnpm run lint` | 0 errores; las 10 advertencias Fast Refresh de base |
| `pnpm run test` | OK (toda la suite) |
| `pnpm run build` | OK; se mantiene la advertencia de chunks > 500 kB |
| `git diff --check` | OK |
| `check-doc-links.py` | OK (1245 enlaces) |
| `check-secrets.py` | OK |
| `check_requirements_coverage.py` | OK |
| Docker / integración | No ejecutado: el contenedor tiene el cliente `docker`, pero no un daemon disponible |

## Performance

| Build | Chunk principal (gzip) | Total JS (gzip) |
| --- | --- | --- |
| `develop` | 611,59 kB (174,77) | 1148,3 kB (342,1) |
| Fin fase 7 (`0c5abdc`) | 529,16 kB (154,38) | 1202,1 kB (360,9) |
| Fin fase 8 | 656,79 kB (186,44) | 1199,1 kB (355,7) |

El reparto entre chunks cambia de un build a otro (Rolldown agrupa distinto), así que la
cifra comparable es el total: +50,8 kB y +13,6 kB gzip (≈4 %) respecto de `develop`.
Leaflet sigue diferido (`leaflet-comun` de 153 kB y mapas de 1–2 kB, solo al abrir un
mapa). No hay dependencias nuevas, ni polling nuevo (mensajes conserva 15 s), ni
consultas duplicadas. Las claves de TanStack Query se conservan, con caché aislada
por usuario.

## Descripción propuesta del PR `feature/frontend-ux-cierre → develop`

**Objetivo.** Refactor UX/UI del frontend en ocho fases, sin cambiar backend,
contratos ni reglas de negocio: tareas más claras, jerarquía visual, responsive
desde 360 px y accesibilidad práctica, con la identidad «Barro y Sombra».

- **Navegación y layout:** cabecera y menú móvil por rol, navegación privada del
  taller, contenedores y encabezados comunes.
- **Home:** hero compacto, productos, categorías, talleres, explicación y CTA, sin
  datos inventados.
- **Operación del artesano:** panel con próximas acciones, solicitudes, productos,
  inventario y detalle de pedido en seis secciones (`forceMount`, alertas críticas
  fuera de las tabs, pago separado del estado del pedido).
- **Geolocalización integrada:** selector del perfil y del registro, mapa público
  diferido y «Cómo llegar» sin cambiar arquitectura ni privacidad.
- **Descubrimiento público:** catálogo con los productos como protagonistas,
  producto con precio, modalidad y solicitud primero, taller con productos tempranos,
  /descubrir con lista o mapa.
- **Pagos, mensajes y notificaciones:**
  - próxima acción por rol;
  - comprobante en `Dialog` con blob autenticado;
  - historial plegable;
  - chat legible con feedback;
  - avisos agrupados por fecha con recurso relacionado.
- **Cuenta, perfil y registro:**
  - «Mi cuenta» separada de «Mi taller»;
  - perfil en secciones con un único `PATCH`;
  - registro en 3 o 5 pasos con aceptación obligatoria (no persistida: el contrato no
    la admite).
- **Cierre:** tuteo unificado, frescura de caché de talleres públicos, ajustes de
  accesibilidad y limpieza de secciones sin uso.
- **Validación:**
  - typecheck, lint, suite completa, build y React Doctor (sin avisos nuevos; 82 → 74);
  - checks de documentación, secretos y requisitos;
  - matriz responsive de 125 combinaciones;
  - recorridos reales con Django y PostgreSQL de anónimo, comprador, artesano y los
    dos registros.
- **Limitaciones:**
  - sin pruebas con personas usuarias, lector de pantalla ni teclado físico móvil;
  - integración Docker no ejecutada en esta sesión;
  - contenido legal y persistencia del consentimiento pendientes;
  - el modo demo de `/panel/perfil` no se rediseñó.
