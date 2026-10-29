# Auditoría inicial de UX/UI de Artisan

Fecha: 27 de octubre de 2026. Rama: `feature/frontend-ux-refactor`.
Base: `origin/develop`, commit `45a04da024b596c6fc80f07b33bc26941bbee12b`, tras `git fetch origin`.
Worktree: `C:/Users/yader/ProyectoFinal/artisan-ux`.

## Alcance y evidencia

Primera fase: inspección del código y de los contratos que utiliza la interfaz. Este documento distingue hallazgos verificables en el código de riesgos que requieren comprobarse en navegador. No se ha modificado la aplicación ni se ha validado visualmente en dispositivos. El número de líneas de un archivo indica concentración de responsabilidades, no mide por sí solo el scroll de una pantalla.

Compradores: descubrimiento de productos y conexión con talleres. Artesanos: tareas claras, botones explícitos, facilidad de aprendizaje y prevención de errores. Conservar información existente, contratos, autorizaciones, estados y reglas de negocio. No incorporar mapas ni geolocalización.

## Base existente que se debe reutilizar

- React 19, TypeScript, Vite, Tailwind 4, React Router, TanStack Query, React Hook Form, Zod, Radix/shadcn y Lucide. No hacen falta nuevas librerías para el alcance visual.
- Identidad «Barro y Sombra» en `apps/frontend/src/styles.css`: terracota, crema, oliva, Fraunces y Plus Jakarta Sans. Conservar y ajustar con evidencia, sin sustituir por una paleta genérica.
- `components/common/page.tsx`: `PageContainer`, `PageHeader` y `Section`. Ya existen estados de carga/error/vacío, badges, confirmaciones y paginación.
- `components/ui/`: tabs, dialogs, sheets, acordeones, dropdowns y breadcrumbs disponibles.
- Header público y privado comparten implementación: `public-header.tsx` reexporta `AppHeader`. No hay dos headers independientes que deban reescribirse.
- El catálogo ya tiene búsqueda, orden, resultados, paginación y filtros en Sheet móvil. Los pedidos y solicitudes reales ya separan lista y detalle por rutas.
- Botones base de 44 px, foco visible, enlace para saltar al contenido y soporte de movimiento reducido. La accesibilidad requiere completar y verificar estos patrones, no reconstruirlos.

## Mapa de rutas y layouts

El árbol explícito vive en `apps/frontend/src/app/App.tsx`.

| Área | Rutas | Implementación principal |
| --- | --- | --- |
| Entrada y descubrimiento | `/`, `/descubrir`, `/ayuda` | `routes/`, `catalogo/pages/inicio.tsx`; PublicLayout |
| Catálogo y ficha | `/catalogo`, `/producto/:id` | `catalogo/pages/`; SiteLayout |
| Taller público | `/artesano/:id` | `talleres/pages/artesano.tsx` |
| Acceso y cuenta | `/auth`, `/cuenta` | `auth/pages/` |
| Composición de solicitud | `/solicitar/:productId`, `/solicitudes/nueva` | `solicitudes/pages/preparar.tsx` |
| Solicitudes | `/solicitudes`, `/solicitudes/:id`, `/panel/solicitudes`, `/panel/solicitudes/:id` | `solicitudes/pages/consultas.tsx`, según rol |
| Pedidos | `/pedidos`, `/pedidos/:id`, `/panel/pedidos`, `/panel/pedidos/:id` | `pedidos/pages/confirmados.tsx` en real; páginas legacy en demo |
| Taller privado | `/panel`, `/panel/perfil` | `panel-resumen.tsx`, `panel-taller.tsx` en real; variantes demo |
| Productos e inventario | `/panel/productos`, `/panel/inventario`, `/panel/inventario/:productoId` | `catalogo/pages/panel-productos.tsx`, `inventario/pages/inventario.tsx` |
| Conversaciones y avisos | `/mensajes`, `/notificaciones` | `mensajes/pages/mensajes.tsx`, `notificaciones/pages/` |

`SiteLayout` incorpora sidebar en desktop y una tira horizontal de enlaces privados en móvil. `AppHeader` también ofrece esos enlaces dentro del Sheet móvil. `PublicLayout` añade navegación por anclas. Mantener los guards y la separación real/demo de `App.tsx`. No existe ruta de administración frontend en este árbol: no crear un módulo administrativo nuevo.

## Hallazgos priorizados

| Prioridad | Evidencia | Cambio propuesto |
| --- | --- | --- |
| Alta | Home monta hero, tres categorías estáticas, explicación y sección del artesano; no consulta productos ni talleres publicados | Presentar selección limitada de productos y talleres con las APIs y cards existentes. Mantener contenido explicativo con menor prioridad. Búsqueda directa al catálogo |
| Alta | El descubrimiento comercial con datos ya existe en `/descubrir`, separado de la entrada principal | Reutilizar patrones y claves de consulta; definir función clara de ambas rutas sin borrarlas ni duplicar fetching innecesariamente |
| Alta | Navegación privada móvil: tira horizontal más el mismo menú en Sheet; artesano tiene hasta ocho destinos | Usar el Sheet existente y un contexto compacto de sección. Etiquetas «Inicio», «Productos», «Pedidos», «Mensajes», «Mi taller» cuando correspondan; solicitudes e inventario deben seguir accesibles |
| Alta | `ContenidoPedidoConfirmado` apila pago, resolución, cumplimiento, chat, productos y entrega, además de progreso y resumen | Mantener URL de detalle; introducir subnavegación por tarea y resumen persistente. Conservar datos escritos al cambiar sección y mostrar avisos críticos fuera de paneles ocultos |
| Alta | Listado real de pedidos paginado sin filtros; estado del pago no está en `PedidoConfirmado` | Mejorar resumen y navegación sin inventar estados ni hacer una petición de pago por cada fila. No presentar filtros de página como filtros globales |
| Alta | Dashboard real limita solicitudes recientes, no calcula totales globales ni pagos pendientes; demo tiene otras métricas | Priorizar tareas disponibles. No deducir contadores globales a partir de una página ni copiar métricas demo al modo real |
| Media | Productos propios: creación y edición ya están en Dialog; listado carece de búsqueda/filtro de estado y muestra varias acciones por card | Organizar listado, mantener «Editar producto» visible y acciones secundarias agrupadas. Evaluar ruta de formulario conservando mutaciones y borrador. No agregar un wizard por defecto |
| Media | Taller público presenta historia/contacto antes de hasta doce productos | Mejorar acceso a productos, información y contacto con navegación por secciones. Mantener historia y datos públicos |
| Media | `ArtisanCard` muestra imagen, nombre, rubro y dirección; no una breve presentación | Dar más contexto con datos ya disponibles, sin inventar ubicaciones, valoraciones o destacados |
| Media | Perfil propio: dos imágenes, datos del taller y contactos opcionales en un mismo fieldset | Agrupar identidad, presentación y contacto; preservar un guardado coherente y errores junto al campo |
| Media | Solicitud ya tiene edición y resumen, pero mezcla múltiples renglones, selección de productos y entrega | Reducir decisiones simultáneas conservando validación, idempotencia, selección y resumen antes del envío |
| Media | Chat ya tiene historial scrollable, compositor separado y estado de solo lectura; fechas usan 11 px | Mantener conversación y reglas actuales, mejorar lectura y verificar teclado virtual y altura útil en móvil |
| Media | Notificaciones ya están paginadas y distinguen leídas; carga/error y paginación son implementaciones locales | Reutilizar estados/paginación donde la firma lo permita; agrupación por fecha. Filtros globales solo si el contrato los admite |
| Media | Headers manuales en cuenta, perfil y solicitudes, junto a `PageHeader` en otras pantallas; `px-4` y `sm:px-6` no son uniformes | Unificar espaciado, encabezados y acciones progresivamente con los componentes existentes |
| Media | `FormField` y `Campo` cubren necesidades cercanas; `Campo` de auth es solo reexport | Consolidar únicamente con uso real. `FormField` no conecta automáticamente el control a sus IDs de ayuda/error: revisar consumidores antes de cambiar |

## Restricciones de datos para el diseño

Los estados reales de pedido son `confirmado`, `en_cumplimiento`, `entregado`, `vencido_falta_pago`, `cancelado_artesano` y `cerrado_parcial`. No existe un estado global «listo» o «pendiente de entrega» en este contrato; el cumplimiento también se registra por renglón. El pago es independiente y se consulta en su componente propio.

`listarPedidosConfirmados` recibe rol, página y señal; productos propios y notificaciones también paginan. Antes de prometer búsqueda, filtros o contadores globales, verificar capacidades exactas del contrato. Si no existen, explicar el límite y mantener el endpoint; evitar filtrar una página silenciosamente como si fuera toda la colección.

No existe evidencia de un atributo comercial «destacado» en los productos inspeccionados. Utilizar «Productos recientes» cuando el origen sea orden por fecha. Las categorías deben venir de `listCategories`, con imágenes conocidas como presentación y alternativa neutral para otras categorías.

## Responsive y accesibilidad: riesgos pendientes de prueba visual

- Comprobar 360, 390, 768, 1024 y 1440 px. Ninguna de esas anchuras se considera validada por esta auditoría de código.
- Header con marca, cuenta, notificaciones y menú en móvil; textos largos y nombres reales.
- Detalle de pedido con sidebar y columna auxiliar en `xl`: posible reducción excesiva del área útil.
- Grid de productos propios pasa a tres columnas en `lg` aunque comparte ancho con sidebar.
- Selects, badges y acciones con nombres extensos; Dialog de producto con altura 90vh y teclado abierto.
- Formularios de una columna en móvil, errores asociados al control, contraste medido, foco tras abrir/cerrar overlays y navegación por teclado.
- No ocultar desbordamientos con un `overflow-x-hidden` global: corregir la causa. Las tiras de navegación y logs pueden tener scroll controlado explícito.

La consulta inicial de la habilidad UI/UX devolvió una propuesta genérica con testimonios y otra identidad que no encaja con el producto; no se adopta. La búsqueda específica de jerarquía recomienda encabezados secuenciales y breadcrumbs cuando exista profundidad suficiente. Las demás decisiones se basan en el código actual y los requisitos del usuario.

## Archivos previstos por bloque

Rutas relativas a `apps/frontend/src/`; lista prevista, no autorización para reescrituras indiscriminadas.

1. Layout y navegación: `components/layout/site-layout.tsx`, `app-header.tsx`, `navigation.ts`; `components/common/page.tsx` y `styles.css` solo si hace falta un ajuste compartido.
2. Componentes: `components/common/states.tsx`, `pagination.tsx`, `form-field.tsx`, `campo.tsx` según evidencia de reutilización. Reutilizar primitives de `components/ui`.
3. Home: `routes/home.tsx`, `components/home/hero-section.tsx`, `discover-preview.tsx`, `features/catalogo/pages/inicio.tsx`; cards de producto/taller solo para mejoras compartidas necesarias.
4. Dashboard: `features/talleres/pages/panel-resumen.tsx`; revisar compatibilidad demo con `panel-inicio.tsx` sin mezclar fuentes.
5. Pedidos y solicitudes: `features/pedidos/pages/confirmados.tsx`, `features/solicitudes/pages/consultas.tsx`; componentes de presentación nuevos dentro del dominio si reducen complejidad real.
6. Productos: `features/catalogo/pages/panel-productos.tsx`; `app/App.tsx` únicamente si se incorpora ruta de creación/edición conservando las actuales.
7. Catálogo y talleres: `features/catalogo/pages/catalogo.tsx`, `features/talleres/pages/artesano.tsx`, `features/talleres/components/artisan-card.tsx`.
8. Pagos: `features/pagos/components/pago-pedido.tsx`, únicamente presentación y revelado progresivo; conservar confirmaciones, plazos e idempotencia.
9. Mensajes: `features/mensajes/pages/mensajes.tsx`, `features/mensajes/components/order-chat.tsx` si lo requieren altura/legibilidad.
10. Notificaciones y perfil: `features/notificaciones/pages/notificaciones.tsx`, `features/talleres/components/formulario-perfil-taller.tsx`, `features/talleres/pages/panel-taller.tsx`, `features/auth/pages/cuenta.tsx`.

Mantener orden solicitado: auditoría → layout → navegación → componentes → Home → dashboard → pedidos → productos → catálogo → talleres → pagos → mensajes → notificaciones → perfil → responsive → limpieza → validación. No eliminar componentes antiguos sin comprobar imports y uso en demo.

## Geolocalización y Git

La comparación actual con `feat/geo-taller-backend` contiene únicamente cambios del backend de talleres y `docs/api/openapi.yaml`; no hay diferencias frontend en esa rama en este momento. Esto no garantiza ausencia de futuros conflictos: perfil, cards, Home y navegación pueden coincidir con trabajo posterior.

No tocar backend, contrato OpenAPI, coordenadas, mapas ni geocoding. La dirección actual se presenta como dato existente. Worktree original permanece en `feat/geo-taller-backend`. La rama UX no sigue `origin/develop` como upstream de publicación, para evitar confusión al subirla. No se ha hecho push ni modificado historia publicada.

## Validación

Instalar dependencias en este worktree mediante `pnpm install --frozen-lockfile`, sin actualizar versiones. Registrar baseline de `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm test` antes del primer cambio de aplicación. La validación visual y de API autenticada requiere una instancia accesible y sesiones de prueba; no sustituirla por la compilación.

En cada bloque: explicar alcance, revisar código, cambiar lo mínimo, comprobar rutas y acciones relevantes, ejecutar checks apropiados e informar archivos y riesgos. Commits pequeños; no reescribir historia publicada por la integración con Lovable.

Dependencias instaladas con `pnpm install --frozen-lockfile` (397 paquetes, lockfile sin cambios). Corepack intenta descargar pnpm dentro del sandbox incluso tras la instalación; para ejecutar las comprobaciones se usó `npm run`, que invoca los mismos scripts y binarios locales, sin instalar paquetes ni generar otro lockfile.

| Comprobación inicial | Resultado |
| --- | --- |
| `npm run typecheck` | Pasa |
| `npm run build` | Pasa; advertencias existentes de bundle >500 kB y resolución nativa de alias en Vite |
| `npm run lint` | Pasa: 0 errores y 10 advertencias existentes de Fast Refresh |
| `npm run test` | Pasa: suite completa de scripts, incluidos cierre AUD-18 y comparación de baseline de React Doctor |
| Navegador, API autenticada y tamaños responsive | Pendientes; no se afirman como validados |

Los logs locales están en `apps/frontend/ux-baseline-*.log` y están ignorados por Git. No se ha cambiado código de aplicación. El worktree es estándar de Git: la app no lo pudo adjuntar como worktree administrado; utilizar explícitamente su carpeta al continuar.
