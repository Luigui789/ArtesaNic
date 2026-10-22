# Frontend posterior a AUD-07

Base protegida: `839576a32d5ae6955f0dab0ef6849e80a512a5ef`, rama
`feature/frontend-ux-post-aud07`. Backend, contratos y reglas de negocio permanecen intactos.

## Inventario y diagnóstico inicial

| Contexto | Rutas existentes | Fuente inicial |
|---|---|---|
| Público | /, /descubrir, /catalogo, /producto/:id, /artesano/:id, /ayuda | Home informativa; catálogo/taller HTTP o demo explícita |
| Autenticación | /auth, parámetros modo y siguiente | Sesión real o demo explícita; memoria, refresh y CSRF comunes |
| Comprador | /solicitar/:productId, /solicitudes/nueva, /solicitudes, /solicitudes/:id | API solicitudes real o demo; dos entradas válidas al mismo compositor |
| Artesano | /panel, /panel/perfil, /panel/productos, /panel/solicitudes, /panel/solicitudes/:id | Taller/productos/solicitudes reales o demo |
| Pedidos | /pedidos, /pedidos/:id, /panel/pedidos, /panel/pedidos/:id | Solo demo antigua; API AUD-07 sin consumidor frontend |
| Mensajes | /mensajes | Solo demo; sin API de mensajería ni pagos en AUD-07 |
| Internas | fallback 404, error boundary, scroll-to-top | React Router |

Se inspeccionaron rutas, imports, layouts, formularios, modales, tabs, queries/mutations,
componentes y módulos de datos de todos los features. El inventario incluye componentes no primitivos y los componentes Radix/shadcn existentes. No se migra la estructura por estética.

Prioridad inicial:

- Crítica: propuesta/revisión, pedidos e inventario reales no alcanzables desde UI pese a
  existir sus endpoints. No sustituirlos por las reglas de la demo antigua.
- Alta: dos cabeceras y pies con navegación/microcopy diferentes; panel de inicio duplica
  perfil, carece de tareas; falta tratamiento común de conflictos de dominio.
- Alta: confirmar/reintentar exige conservar Idempotency-Key y esperar respuesta del servidor.
  Los importes y nombres históricos deben leerse del snapshot, sin recalcular.
- Media: wrappers/encabezados repetidos, formularios sin agrupación común, ausencia de
  confirmación antes de despublicar, diálogos y tabs con alturas táctiles inconsistentes.
- Media: filtros de catálogo duplican IDs entre desktop y drawer; búsqueda y URL pueden
  divergir al navegar atrás; estados vacíos/carga heterogéneos y paginación repetida.
- Baja: pantalla antigua solicitar.tsx sin ruta, bundles eager y etiquetas técnicas de demo.

## Límites y discrepancias de contratos

Los serializers y OpenAPI implementados gobiernan la integración. Se detectaron diferencias
con ejemplos de la documentación AUD-07: existencia inicial acepta únicamente cantidad
(no motivo); movimientos responden existencia_antes/despues y reservada_antes/despues,
no existencia_posterior; el pedido del artesano incluye taller además de comprador.
Se usa el contrato implementado, sin modificar backend para adaptar ejemplos.

Pagos, entregas operativas, mensajería real, notificaciones reales y edición de perfil
personal carecen de endpoints en esta base. Se preservan y aíslan sus pantallas de demo;
no se simulan datos reales. La consulta pública del producto no ofrece disponibilidad
pública: no se revela el inventario privado del artesano al comprador.

## Dirección visual

Se conserva «Barro y Sombra»: crema, terracota y oliva; Fraunces y Plus Jakarta Sans.
Lucide, Radix, Tailwind y componentes existentes; sin nuevas librerías ni animaciones.
La consulta general de la skill sugirió un marketplace violeta que no corresponde al
producto; se descartó. La búsqueda específica de simplicidad respalda jerarquía tipográfica,
espacio y baja carga visual. Se reutilizan tokens, no se importa una paleta nueva.

## Garantías de implementación y verificación

Ningún cambio backend. Datos HTTP y mapeos en su feature; ningún fetch en páginas.
Operaciones críticas sin optimistic update. Invalidaciones dirigidas y claves por identidad.
RHF/Zod para formularios nuevos y normalización gradual de controles existentes.
Se conservarán las entradas profundas y la separación explícita real/demo.

## Implementación final

- Una cabecera (`AppHeader`) y pie (`PublicFooter`) para todas las rutas. Marca y vocabulario
  coherentes; navegación pública separada del contexto privado. Sidebar por rol en escritorio,
  navegación contextual desplazable y Sheet con foco contenido en móvil. Enlace para saltar al contenido.
- `PageContainer`, `PageHeader`, `Section`, `LoadingState`, `ListPagination`, `StatusBadge`,
  `Campo`, `FormField`, `FormMessage` y `ConfirmAction` compartidos. Los estados de pedidos/pagos
  de demo reutilizan el badge común conservando sus etiquetas e iconos. Botones/inputs/selects
  y pestañas tienen altura táctil base de 44 px; diálogos limitan ancho y altura al viewport.
- Catálogo: IDs distintos para filtros desktop/drawer, sincronización de búsqueda con URL al
  volver, paginación común y texto claro. Producto destaca taller, imagen y solicitud.
- Formularios: RHF/Zod en ingreso, inventario y propuesta; RHF conserva el borrador de producto,
  registro y perfil con los validadores Zod vigentes y payloads existentes. La composición
  multimodal conserva su validador y sus pasos para evitar cambiar reglas. Campos/errores
  accesibles comunes; datos opcionales del taller plegables. Confirmación para despublicar.
- Panel real del artesano: accesos operativos, solicitudes recientes que requieren revisión
  o propuesta y pedidos confirmados recientes. No inventa estadísticas ni estados de pagos.
- Solicitudes: revisión final por renglón, rechazo con motivo y confirmación, propuesta
  comercial con entrega/cargos; comprador consulta, acepta o rechaza la propuesta completa.
- Pedidos reales: listados paginados por rol y detalle desde snapshot con importes decimales
  como cadenas. Ningún nombre/precio se reconstruye desde catálogo ni se calcula el total.
- Inventario real: listado inicializado, enlace desde cada producto, existencia inicial,
  entrada, ajuste con signo presentado como sumar/restar y motivo, historial inmutable paginado.
  Física/reservada/disponible se muestran tal como llegan del servidor.
- `mensajeDominio` centraliza conflictos; el formulario conserva datos al fallar. El intento
  seguro conserva clave/cuerpo en resultados inciertos y bloquea un cuerpo diferente. No hay
  optimistic update; los botones y bloqueos síncronos evitan doble submit.
- Invalidaciones por identidad/recurso para solicitud, propuesta, panel, pedidos, inventario
  y movimientos. Se conservan token en memoria, refresh, CSRF, credentials y errores del HTTP común.
- Mensajería/pagos/entregas operativas de demo permanecen aislados. Notificaciones de demo
  conservan leídas/no leídas, fecha, acceso al pedido y marcado individual/global. Conversación
  conserva lectura solamente cuando está cerrada y región log accesible.
- Pedidos antiguos, mensajes y notificaciones se cargan de forma diferida. Se elimina el
  compositor antiguo sin ruta; /solicitar/:productId y /solicitudes/nueva conservan el compositor V1.

## Regresión comprobada

| Área | Evidencia |
|---|---|
| Base AUD-07 | 562 tests backend OK en PostgreSQL aislado, 91.143 s, incluido smoke de snapshot/reserva/idempotencia. Cero cambios de fuente backend |
| Contratos frontend | 15 grupos nuevos en check-post-aud07.mjs: payloads, claves, errores, snapshots, cantidades servidor, validación e invalidaciones por identidad |
| Comprador real | Registro móvil, solicitud stock, propuesta, aceptar con doble click (un solo POST), pedido confirmado; edición posterior del catálogo conserva nombre/precio del snapshot |
| Conflictos | Propuesta sin stock: 409 y mensaje comprensible, sin navegación/éxito. Ajuste bajo reservado: 409 sin cambiar cifras; ajuste permitido actualiza desde respuesta |
| Artesano real | Login, producto con foto, existencia inicial, entrada, ajuste, historial, revisión y propuesta; perfil PATCH conserva aprobación; logout y registro de taller pendiente |
| Resultado incierto | Playwright deja que el backend guarde una entrada y corta la respuesta. Reintento con idéntica Idempotency-Key: una sola entrada, físicas 5 → 7, sin duplicar |
| Fotos | Alta, reemplazo PNG, F5 con URL persistida. Cancelar despublicación conserva lectura pública del producto |
| Móvil/escritorio | 126 comprobaciones reales sobre público/artesano/comprador a 360/375/390/768/1024/1440, sin scroll horizontal accidental; 20 adicionales de demo a 360/1440 |
| Teclado | Menú contiene foco, Escape cierra y lo devuelve al disparador; auth tabs con flechas; filtros sin IDs duplicados |
| Accesibilidad | Axe WCAG A/AA/2.1 en pantallas representativas claras. Se corrigieron contrastes primary/success de oscuro; 4 auditorías oscuras con texto 125% y reduced motion, sin violaciones ni desbordamiento |
| Demo | Listas y detalle de pedidos/pagos/entregas, panel, productos, mensajes y notificaciones siguen disponibles solo en modo explícito de demostración |

Las pruebas de navegador se ejecutaron con Chromium y axe en el entorno local de evidencias,
sin añadir dependencias al proyecto. No equivalen a certificar WCAG completo ni todos los
navegadores. El smoke automatizado complementa las pruebas de componentes y contratos.

## Deuda conservada y límites

Los endpoints pendientes de pagos, entregas operativas, mensajes/notificaciones reales y
perfil personal permanecen fuera de alcance. No se inventaron llamadas ni estados para
ocultar esa ausencia. El taller rechazado aún no tiene acción backend de volver a solicitar
revisión. El dashboard aclara que sus tareas se basan en solicitudes recientes, porque la API
no ofrece un contador global filtrado. La disponibilidad del catálogo sigue sin endpoint público.

El intento idempotente vive durante la edición actual; ante pérdida de conexión se debe
reintentar desde el formulario conservado. La persistencia/recuperación de intentos entre
cierres del navegador sigue siendo una mejora operativa futura. Los contratos existentes de
consulta de operaciones y el cliente de solicitudes no se alteraron.

Se aplicaron las migraciones ya integradas de AUD-07 y se reinició el backend habitual
para cargar sus endpoints; esto no modificó código, reglas ni datos comerciales existentes.
No se borraron volúmenes. Los datos de prueba se crearon únicamente en el stack aislado.

La validación local se informa con sus resultados efectivos al entregar. La CI remota requiere
publicar la rama y no se declara ejecutada en esta entrega local.


## Resultado de validación local

- pnpm lint: OK, sin errores; se conservan los 9 avisos previos de Fast Refresh.
- pnpm typecheck: OK.
- pnpm test: OK, suite completa más los 15 grupos nuevos AUD-07.
- pnpm build con VITE_AUTH_API=real y VITE_CATALOGO_API=real: OK; entrada principal
  499.42 kB / 148.98 kB gzip, con módulos diferidos. La cifra no incluye todos los chunks
  compartidos y no representa una medición de tiempo de carga.
- Build de demo verificado por separado. No se cambia el modo predeterminado del proyecto.
- check-doc-links y check-secrets: OK; el enlace histórico al compositor eliminado se
  conserva como texto histórico y apunta al compositor V1 vigente.
- Chromium: flujo AUD-07 y formularios reales OK, 126 comprobaciones responsive reales,
  20 de demo, teclado y auditorías axe representativas claras/oscuras OK.
- Backend: fuente sin cambios; 562 tests de la base protegida OK. No se añade migración,
  endpoint ni regla de negocio. La CI remota no se ejecutó; no se abrió PR ni se hizo push.

La conversión informativa de divisas conserva el comportamiento previo de referencia;
no constituye un importe contractual ni una tasa bancaria en tiempo real.
