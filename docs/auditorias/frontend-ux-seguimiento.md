# Fase 6: pagos, mensajes y notificaciones

Baseline: `d5226eb`, rama `feature/frontend-ux-refactor`. Worktree limpio al iniciar;
los cuatro commits de experiencia pública se subieron a origin antes de editar.

## Revisión previa a cambios

- Pagos: cinco estados reales (`pendiente`, `registrado`, `observado`, `confirmado`,
  `no_recibido`), total del servidor, plazos del servidor, claves por identidad,
  idempotencia, formularios con datos retenidos y confirmaciones ya correctos.
  Se conservan. Falta una lectura rápida de quién actúa; el comprobante actual
  está dentro de un historial completo siempre expandido y las decisiones
  secundarias compiten con confirmar fondos.
- Comprobantes: endpoint autenticado bajo demanda, URL Blob temporal, caché con
  identidad y gcTime 0, PDF separado de imagen. Se conserva todo esto. La vista
  se expande en la página sin una acción clara para cerrarla; conviene un Dialog.
- Mensajes: cronología por ID, historial con scroll independiente, compositor
  separado, polling de 15 s/deltas y cierre por servidor/estado terminal ya buenos.
  Se mantienen. Fechas de 11 px, falta contexto en el widget y feedback de envío;
  el índice de conversaciones ocupa demasiada altura móvil antes del chat.
- Notificaciones: eventos persistentes, destinos por mapping existente, resumen
  aislado del header, paginación y endpoints de lectura individual/global ya buenos.
  Se conservan. Falta agrupación por fecha de la página, contexto del recurso,
  feedback explícito y separación visual del aviso sin leer.
- Reembolsos: el widget ya distingue obligación pendiente de devolución externa
  registrada. Se limita el ajuste a explicar quién debe actuar y cuándo ya quedó
  registrada; sin tocar cancelación/cierre ni sus formularios.

Las tabs de `PedidoArtesano` y su montaje persistente no se modifican. Backend,
OpenAPI, adaptadores, query keys, contratos y transiciones quedan fuera del refactor.
Los plazos de corrección/nuevo registro son 48 horas según `docs/api/pagos.md`;
la fecha límite visible seguirá llegando del servidor, sin calcularla en el cliente.

## Comparación antes/después

| Área | Antes | Después |
| --- | --- | --- |
| Pago | Estado/importe, acciones y todos los registros simultáneos | Estado e importe, orientación de quién actúa, comprobante actual, acción principal e historial plegado |
| Revisión | Confirmar, observar y no recibido compiten con un motivo siempre visible | Confirmación principal; motivo y decisiones alternativas bajo «Hay un problema con el pago» |
| Comprobante | Expansión dentro del pedido sin cierre explícito | Dialog con cierre, foco, carga/error/reintento, abrir/descargar y liberación del binario al cerrar |
| Chat | Fechas de 11 px, poco contexto dentro del widget, envío sin confirmación explícita | Texto de 16 px, fechas de 12 px, pedido/contraparte, etiqueta visible y «Mensaje enviado» |
| Índice de mensajes | Toda la lista precede al chat móvil | Selector de conversación plegable móvil; índice lateral de escritorio conservado |
| Notificaciones | Lista uniforme, botón genérico «Abrir», sin feedback de lectura | Hoy/Ayer/Anteriores de la página actual, recurso identificado, «Ver pedido/solicitud», estado sin leer y feedback |
| Reembolso | Estado, importe y registro ya funcionales | Aclara si falta devolución externa o si el taller ya la registró, sin afirmar procesamiento automático |

## Pagos y comprobantes

Los cinco nombres de estado se conservan exactamente. `siguientePasoPago` solo
produce orientación textual por rol, estado, vencimiento y cierre; no habilita
acciones ni modifica permisos. El estado económico sigue separado del estado del
pedido. El importe procede del servidor y no se envía desde el formulario.

El último comprobante queda accesible junto a método y referencia, antes de la
revisión. «Ver historial de pagos y comprobantes» revela todos los intentos en
su orden original, con origen, fecha, resolución y plazo. Se conserva el contenido
completo, incluso en pedidos cerrados o vencidos. Se elimina el nowrap de la fecha
límite para que pueda leerse a 360 px.

La acción «Confirmar pago recibido» conserva su confirmación definitiva. Las otras
acciones conservan motivo obligatorio, confirmación, estados internos y payloads.
El `details` de acciones secundarias permanece montado: plegarlo no borra lo escrito.
Corrección, nuevo registro, idempotencia, reintentos inciertos y errores por campo
mantienen su implementación. Los plazos visibles siguen siendo fechas de la API;
las confirmaciones explican las 48 horas previstas por el contrato.

El Dialog de comprobante usa Radix existente. El componente que descarga el binario
solo se monta cuando se abre: lectura autenticada, clave con usuario y URL, gcTime 0,
Blob temporal y revocación al desmontar. Cerrarlo libera el observador y la URL;
no se precargan archivos del historial. La imagen conserva altura máxima y el PDF
sigue como tarjeta con abrir/descargar, nunca como imagen. Se mantiene la validación
de rutas protegidas del adaptador. El error del archivo ofrece reintento dentro del
Dialog; no afecta al resto del pedido.

El cambio de reembolso se limita a siete líneas de presentación dentro de
`TarjetaReembolso`: obligación pendiente frente a devolución externa registrada.
No se modifican importes, estados, confirmaciones, formularios de devolución,
cancelación o cierre parcial.

## Mensajes

Se conserva `OrderChat`, sin reconstruirlo. La identidad propia se sigue comparando
por ID de cuenta; «Tú»/nombre, alineación y borde acompañan al color. El widget indica
el número de pedido y la contraparte conocida por el historial; cuando todavía no
hay mensajes de la otra persona usa un contexto genérico, sin consultar perfiles.
La página general mantiene también el nombre real de la contraparte del pedido y
el enlace al detalle, con un resumen compacto del producto.

El historial continúa ordenado por ID y con scroll propio. Su altura se adapta al
viewport; el compositor sigue separado, con etiqueta visible, límite de 500
caracteres y Enviar. Éxito muestra «Mensaje enviado». Un fallo conserva el borrador;
las tabs persistentes de PedidoArtesano también lo conservan. No se alteran los
handlers que cierran la conversación cuando el servidor informa su cierre.
En solo lectura se mantiene el mensaje explicativo y se elimina el compositor.

El índice sigue siendo una lista paginada de pedidos, sin contadores de mensajes,
presencia o última conexión inventados. El selector móvil evita apilar todos los
pedidos antes de la conversación; escritorio conserva la columna lateral. No se
implementa almacenamiento nuevo de borradores entre conversaciones distintas.

## Notificaciones

`agruparAvisos` trabaja solo con `results` de la página obtenida, usando el día
de America/Managua para Hoy/Ayer/Anteriores. No trae otras páginas, no cambia
el orden de los avisos y la pantalla aclara el alcance de la agrupación.
La prueba incluye horas UTC que todavía pertenecen al día anterior en Managua.

Se conservan título/detalle del servidor y el mapping `rutaNotificacion`. El recurso
se identifica como Pedido o Solicitud con su número; la acción se llama «Ver pedido»
o «Ver solicitud». Sin leer se comunica con texto, peso y borde, además del fondo.
No se asigna una prioridad de negocio nueva ni se interpreta un aviso histórico
como prueba de que el pago siga pendiente actualmente.

Lectura individual y global conservan sus endpoints e invalidaciones de lista y
resumen. Ambas muestran feedback explícito. Carga y error reutilizan componentes
comunes; el fallo de la lista no altera el componente del header. No se modifica
el resumen ni su comportamiento de actualización.

## Responsive y accesibilidad

Chromium a 360, 390, 768, 1024 y 1440 px:

- Pagos pendiente, registrado, observado, confirmado y no recibido para ambos roles;
  referencias/motivos/archivos largos, revisión y cancelación de confirmación.
- Comprobante privado abierto bajo demanda, imagen en Dialog, Escape y retorno
  automático del foco, sin overflow dentro del diálogo.
- Borrador conservado entre tabs y tras error, envío con feedback, historial largo
  con texto sin espacios y scroll independiente, solo lectura, error y carga.
- Avisos vacíos, varias fechas, leídos/no leídos, textos largos, lectura individual
  y global, paginación, destinos por rol, error y carga.
- Reembolsos pendientes y registrados, para comprador y artesano.

Se corrigió un overflow real del título de conversación con nombres de producto
sin espacios, sin añadir overflow-x-hidden a la página. El contexto largo se
presenta compacto y su información completa sigue en el índice y detalle del pedido.
Se conservan labels, foco global, confirmaciones, `role=log` y aria-live; se agrega
fecha semántica con `time`, región de historial alcanzable por teclado y feedback
mediante la infraestructura Sonner existente. El estado económico sigue teniendo
texto e icono además de color. El navegador permite comprobar la altura disponible,
pero no demuestra el comportamiento del teclado físico de un teléfono.

## Datos, performance y límites preservados

- Ningún cambio en backend, OpenAPI, adaptadores HTTP, query keys, reglas de negocio
  o payloads. Los cambios se limitan a los módulos autorizados y al texto del widget
  existente de reembolso.
- Chat conserva sus deltas y su sondeo cada 15 segundos; no se introduce polling.
- Notificaciones mantiene listado paginado y resumen existente. No se consultan
  pagos por cada aviso ni por cada conversación.
- La consulta de pago del widget y del resumen de PedidoArtesano sigue compartiendo
  la clave por usuario/rol/pedido; la matriz verifica deduplicación en el detalle.
- No se cambian las tabs ni su `forceMount`, Home, catálogo, geo, dashboard,
  solicitudes, inventario, productos privados o perfil/cuenta.
- No se añaden dependencias.

Comparación de build con la fase pública: suma de todos los chunks JavaScript
1173,82 → 1179,43 kB (+5,61 kB, aproximadamente 0,48 %); suma gzip
348,31 → 350,19 kB (+1,88 kB, aproximadamente 0,54 %). Esta suma incluye chunks
diferidos y no representa la descarga inicial. El chunk principal pasa de
639,20/181,54 kB gzip a 637,26/180,95 kB gzip; el reparto entre chunks cambia.
Mensajes queda en 8,34 kB y notificaciones en 3,95 kB, ambos diferidos. Se conserva
la advertencia existente de chunks mayores de 500 kB.

## Django/PostgreSQL reales

Para esta fase se creó una base PostgreSQL temporal separada con prefijo
`artesanic_ux_follow_`, migraciones existentes y archivos privados separados bajo
los artefactos de la sesión. Django del worktree UX se ejecutó en 8001 y Vite
temporal en 5175. La base local existente no recibió registros financieros.

Las cuentas, taller, stock y pedidos temporales se prepararon con helpers y servicios
ya existentes: solicitud → revisión → propuesta → aceptación real. El navegador,
sin interceptar API, completó:

1. Comprador registra pago externo ficticio y adjunta comprobante PNG.
2. Artesano abre el comprobante autenticado, indica motivo obligatorio y observa
   mediante confirmación.
3. Comprador ve motivo y fecha límite del servidor y envía corrección.
4. Artesano confirma el pago recibido mediante confirmación.
5. Comprador y artesano envían mensajes y consultan la respuesta de la otra parte.
6. Comprador marca un aviso como leído, navega al pedido y marca todos como leídos.

Se comprobaron respuestas exitosas, headers de idempotencia en las cuatro acciones
de pago, feedback, ausencia de errores inesperados de API/JavaScript y ausencia
de overflow en comprador móvil y artesano de escritorio. No se realizaron
movimientos bancarios. La base temporal, credenciales y archivos privados se
retiraron al finalizar; también se detuvieron los servidores temporales.

## Archivos modificados y verificaciones

Rutas relativas a `apps/frontend/`:

| Archivo | Cambio |
| --- | --- |
| `src/features/pagos/labels.ts` | Orientación textual de próxima acción |
| `src/features/pagos/components/pago-pedido.tsx` | Jerarquía, comprobante actual, acciones e historial plegables |
| `src/features/pagos/components/comprobante-archivo.tsx` | Dialog y ciclo de vida del binario privado |
| `src/features/pedidos/components/resolucion-pedido.tsx` | Solo explicación de reembolso pendiente/registrado |
| `src/features/mensajes/components/order-chat.tsx` | Contexto, legibilidad, altura y feedback de envío |
| `src/features/mensajes/pages/mensajes.tsx` | Índice móvil plegable y contexto compacto |
| `src/features/notificaciones/presentacion.ts` | Agrupación de la página por fecha local |
| `src/features/notificaciones/pages/notificaciones.tsx` | Jerarquía, recurso, estados, feedback y paginación flexible |
| `scripts/check-followup-ux.mjs` | Pruebas de presentación modificada |
| `scripts/check-aud18-cierre.mjs` | Contexto del pedido y producto verificados por separado en la cabecera compacta |
| `package.json` | Incluye la nueva verificación en la suite |

La prueba nueva protege siguiente acción por rol/estado, plazo vencido y solo
consulta, comprobante bajo demanda y revelado de acciones, agrupación por día local,
destinos existentes y contexto/error con borrador. Reutiliza las suites previas
para permisos, transiciones, idempotencia, privacidad, PDF y solo lectura; no
duplica esas reglas ni comprueba clases Tailwind.

Validación de cierre: `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run test` y `git diff --check`. Lint conserva las diez advertencias conocidas,
sin errores ni advertencias nuevas. Evidencia de la sesión en los artefactos
`ux-follow-build.log`, `ux-follow-lint.log`, `ux-follow-tests-final.log`,
`ux-follow-review.json` y `ux-follow-live.json`. Las capturas usan datos de prueba.

## Pendientes

Quedan pruebas con usuarios, lectores de pantalla reales y teclado móvil físico.
No se afirma validación con personas mayores. El PDF conserva su comportamiento
protegido y las regresiones existentes; el recorrido Django de esta fase usó PNG.
Esta fase termina aquí: no se continúa con Perfil + Cuenta + formularios ni se
crea el PR final del refactor.
