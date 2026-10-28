# Fase operativa del artesano

Base: `8362f58`, rama `feature/frontend-ux-refactor`. Fecha de cierre: 28 de octubre de 2026.

## Antes y después

| Módulo | Antes | Después |
| --- | --- | --- |
| Inicio real | Cuatro accesos con el mismo peso, solicitudes y pedidos apilados, edición de perfil como acción del encabezado | Revisar solicitudes como acción principal; hasta tres tareas recientes y tres pedidos, en paralelo en desktop; productos/inventario como accesos secundarios. No se presentan contadores globales |
| Inicio demo | Indicadores antes de las tareas | Pedidos primero; indicadores conservados dentro de un desplegable identificado como demostración |
| Solicitudes | Resumen sin CTA explícito; detalle con condiciones repetidas antes de productos y rechazo siempre expandido | «Ver solicitud» en lista; comprador/fecha y próximo paso arriba; condiciones desplegables; aceptar por producto visible y rechazo con motivo/confirmación bajo demanda |
| Pedido real del artesano | Pago, resolución, seguimiento, mensajes, productos y entrega se apilaban | Resumen persistente con comprador, fecha, total, estados separados, avisos y próxima acción; seis secciones: Resumen, Productos, Pago, Preparación y entrega, Mensajes, Cambios y cierre |
| Productos propios | Varias acciones por card; sin forma de buscar dentro de la página; diálogo vulnerable a mínimos intrínsecos | Edición visible, publicación cuando procede, opciones secundarias desplegables; búsqueda/publicación limitadas explícitamente a la página cargada; diálogo agrupado, foco en errores y acciones finales accesibles |
| Inventario | Formulario e historial permanentemente abiertos; nombre largo como gran encabezado | Cantidades primero y explicación de físicas/reservadas/disponibles; ajuste e historial desplegables; título estable y nombre del producto como descripción. La existencia inicial se abre directamente |

Las decisiones reducen acciones y bloques simultáneos, sin acreditar mediante pruebas con usuarios reales que la interfaz sea más fácil para personas mayores.

## Contratos y restricciones preservados

- No se modifican adaptadores HTTP, endpoints, cuerpos, reglas, permisos, OpenAPI, backend, mapas ni coordenadas. No se agregan dependencias ni rutas.
- Las solicitudes reales se aceptan/rechazan por renglón. Resolver un renglón no acepta una solicitud completa ni confirma un pedido. La propuesta y decisión del comprador conservan sus flujos existentes.
- Los estados de pedido siguen siendo `confirmado`, `en_cumplimiento`, `entregado`, `vencido_falta_pago`, `cancelado_artesano` y `cerrado_parcial`. El avance por producto sigue en el widget existente de cumplimiento.
- Pago y estado del pedido permanecen separados. Los formularios de pago y resolución conservan sus confirmaciones y plazos; no se refactoriza el módulo de pagos independiente.
- El resumen del detalle usa las mismas claves y adaptadores de pago, cumplimiento y resolución que sus widgets. TanStack Query deduplica las solicitudes. El listado no consulta pago por fila.
- Los widgets deciden las acciones con los datos del servidor. El resumen orienta al usuario; no implementa permisos nuevos.
- Publicar/despublicar, actualización de producto, fotografía, reservas y cálculos de inventario conservan sus mutaciones. Se mantienen claves de idempotencia en las operaciones que ya las exigían.
- Los filtros de productos son locales a la página. Se explica su alcance y se reinician al paginar. No se traen todas las páginas ni se agrega un falso filtro global.
- El dashboard muestra datos de su primera página de solicitudes y pedidos, con enlace al listado completo. No deduce totales de pendientes ni pagos a partir de una muestra.

## Revelado progresivo y preservación de datos

El nuevo `PedidoArtesano` compone los widgets existentes y mantiene los paneles montados con `TabsContent forceMount`, ocultando solo el panel inactivo. Cambiar de sección conserva borradores de mensaje, pago y formularios locales. No se garantiza conservarlos tras recargar o cambiar de pedido.

Avisos de pago observado/no recibido, revisión pendiente, plazo, vencimiento, cancelación, cierre pendiente/objetado, reembolso pendiente y discrepancias se muestran fuera de las pestañas. Si no se pueden comprobar los avisos, aparece un error visible y reintento. Los acuerdos y productos originales siguen consultables.

Los desplegables nativos mantienen sus contenidos montados: rechazo y motivo, opciones de producto, registro de entrega, ajuste e historial de inventario. Se conservan confirmaciones destructivas. La entrega sigue disponible únicamente cuando el widget de cumplimiento lo permite.

El diálogo de producto conserva su flujo sin wizard. Se corrigieron los mínimos de formulario, fieldsets y grid que provocaban overflow a 360 px; no se utiliza ocultación global del desbordamiento. Los errores locales o de API enfocan el campo reconocido; los datos permanecen escritos cuando el servidor rechaza el guardado.

## Archivos modificados

Rutas relativas a `apps/frontend/`:

| Archivo | Responsabilidad |
| --- | --- |
| `src/features/talleres/pages/panel-resumen.tsx` | Inicio real orientado a tareas, muestra reciente acotada y accesos secundarios |
| `src/features/talleres/pages/panel-inicio.tsx` | Reordenamiento de indicadores de demo y acción explícita |
| `src/features/solicitudes/pages/consultas.tsx` | Lista, contexto y condiciones del detalle del artesano; mantiene la presentación del comprador |
| `src/features/solicitudes/components/revision.tsx` | Rechazo desplegable y feedback de aceptación/rechazo por producto |
| `src/features/pedidos/pages/confirmados.tsx` | Inyecta los mismos widgets en la composición del artesano; conserva la composición del comprador |
| `src/features/pedidos/components/pedido-artesano.tsx` (nuevo) | Resumen, avisos y navegación del detalle real del artesano |
| `src/features/pedidos/components/cumplimiento-pedido.tsx` | Formulario de entrega bajo demanda, preservando su condición de disponibilidad |
| `src/features/catalogo/pages/panel-productos.tsx` | Filtros de página, opciones secundarias y diálogo adaptable |
| `src/features/inventario/pages/inventario.tsx` | Cantidades, lenguaje de operaciones, ajuste e historial |
| `scripts/check-artisan-ux.mjs` (nuevo) | Avisos fuera de pestañas, próximo paso, fallo seguro y montaje persistente |
| `package.json` | Agrega la prueba a la suite, sin cambios de versiones |

Este informe es la documentación adicional. No se crean variantes de cards ni un sistema de componentes paralelo. Se reutilizan PageContainer, PageHeader, Section, StatusBadge, estados, paginación, Tabs, Dialog, ConfirmAction y formularios existentes. `PedidoArtesano` se justifica como composición de dominio del detalle, no como abstracción compartida ni nueva lógica de negocio.

## Validación

- `npm run typecheck`: pasa.
- `npm run lint`: pasa, cero errores y las diez advertencias existentes de Fast Refresh.
- `npm run build`: pasa. Se mantienen los avisos ya conocidos de alias de Vite y, según la distribución de chunks, tamaño >500 kB.
- `npm run test`: pasa la suite completa, incluida la nueva regresión de artesano y la regresión de Home.
- Chromium: 360, 390, 768, 1024 y 1440 px. Cuarenta pantallas: dashboard, solicitudes/lista y detalle, pedidos/lista y detalle, productos, inventario/lista y detalle. Sin overflow horizontal. Se inspeccionaron capturas de móvil y desktop y nombres largos.
- Interacciones con respuestas HTTP de prueba: aceptación por renglón con idempotencia, borrador de mensaje conservado al cambiar pestaña, publicación, retiro con confirmación y cancelación de la confirmación, error de guardado conservando nombre, archivo inválido/válido, registro de entrega con feedback e idempotencia, ajuste negativo de inventario con el mismo payload y clave.
- El detalle realiza una lectura por recurso de pago/cumplimiento/resolución; el listado no añade consultas de pago por pedido. Se comprobaron filtros locales y estados loading/empty/error en productos, además de las regresiones existentes por dominio.

La revisión usa el build y adaptadores reales con transporte interceptado: no escribe en Django ni verifica una base de producción. Las capturas usan fuentes alternativas de la pila porque las fuentes externas se bloquean en esa revisión aislada.

El teclado físico/virtual del sistema operativo no se automatizó. Se simuló una reducción de altura a 500 px y se comprobó que los botones finales del diálogo son accesibles por scroll y que este no desborda. Esto no sustituye la prueba en un teléfono real.

Evidencia fuera del repositorio, en la carpeta de visualizaciones de este chat: `ux-artisan-review.cjs`, `ux-artisan-review.json`, `artisan-<pantalla>-<ancho>.png`, capturas de entrega, avisos y diálogo. Los ejemplos contienen datos de prueba.

## Pendientes y coordinación

- Aceptación con artesanos reales, teclado móvil y fuentes externas cargadas; conectividad y datos de Django activo.
- La demo conserva sus modelos y pantallas legacy de pedidos; no se trasplantan métricas ni estados de demo al modo real. Inventario sigue disponible solo en modo real. La nueva guía de resolución de solicitudes no se muestra donde la demo no permite resolverlas.
- Se preservan guardados y confirmaciones existentes; no se incorporan acciones nuevas de negocio ni un módulo de pagos, mensajería o notificaciones independiente.
- Posibles conflictos con geolocalización: `panel-resumen.tsx` si esa rama cambia el estado/datos del taller; el resto del trabajo está concentrado en operaciones privadas. No se tocaron perfiles ni navegación global. Coordinar cualquier cambio coincidente antes de integrar.
- Esta fase termina aquí. Catálogo público, ficha, talleres públicos, Home, perfil privado y geolocalización quedan fuera del trabajo.
