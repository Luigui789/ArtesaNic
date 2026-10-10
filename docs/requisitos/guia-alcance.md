# ArtesaNic — frontend de demostración

Prototipo para comercializar productos artesanales de las PYMEs de Masaya, Nicaragua. Representa al comprador y al artesano mediante datos y servicios mock.

**Documentación revisada el 8 de octubre de 2026.** El alcance objetivo comprende **24 requisitos funcionales y 15 no funcionales**, tomados de [RF/RNF.docx en Drive](https://docs.google.com/document/d/14I9njtLSWzJdw465-lOoiDgSJeIpJRnb/edit). La fuente conserva el estado **Propuesto para homologación**, salvo RF-012, postergado. El texto adjunto aportado para la revisión orienta la futura adaptación del frontend; sus modelos y nombres de servicios son propuestas técnicas.

Esta línea de integración conserva el commit documental `3bbbb07` y los 17 commits de `feat/presentation-polish`, más los cuatro commits que registran los cambios locales. El frontend utiliza React Router y pnpm. Los flujos siguen siendo simulados: registrar aquí los 24 RF y 15 RNF no acredita su implementación. La especificación v2.1, sus aprobaciones históricas y las definiciones posteriores se conservan en [su documento original](historico/especificacion-v2.1.md); las discrepancias requieren revisión del equipo.

## Documentación del proyecto

| Documento | Contenido |
|---|---|
| [Requisitos](requisitos.md) | Las 39 fichas, sus versiones, autores, responsables, dependencias y estados |
| [Módulos y reglas](modulos-y-reglas.md) | Roles, transiciones, pagos, entregas, cancelaciones, reservas e inventario |
| [Matriz de alineación](../trazabilidad/alineacion-main-456f613.md) | Requisito → archivos afectados → cambio necesario; modelo objetivo, servicios propuestos, fases y escenarios de verificación |
| [Rutas](../../apps/frontend/src/features/README.md) | Rutas existentes y rutas propuestas, con el enrutador realmente usado |

Las fichas de Drive gobiernan el alcance funcional. Las guías derivan sus reglas y señalan las decisiones técnicas pendientes. Las desviaciones del mock se documentan sin cambiar la especificación para acomodarlas. La versión anterior del README se conserva en el historial Git.

## Alcance de esta fase

El trabajo de producto continúa siendo **frontend con mocks**: consultas, latencia, errores y mutaciones simuladas. Las operaciones pasan por una capa de servicios; los componentes no deben modificar directamente los datos de `seed.ts`.

La arquitectura de negocio futura es React/TypeScript → servicios HTTP REST/JSON → Django/DRF → **PostgreSQL**, con archivos fuera de las filas de la base. La autorización, las transacciones, la persistencia y los importes tendrán al servidor como autoridad. El mapeo de snake_case a camelCase corresponde a la capa de servicios.

Esta fase no desarrolla Django, DRF, base de datos, migraciones, API de negocio real, almacenamiento remoto, autenticación real, procesamiento de dinero ni infraestructura de negocio. La aplicación es una SPA de Vite y no contiene un servidor de negocio propio.

La administración corresponde a **Django Admin**, fuera de la interfaz React. No se crea dashboard administrativo React. El administrador podrá consultar pedidos e historial autorizado en solo lectura y no accederá al contenido de chats ni comprobantes.

## Arquitectura verificada en esta línea de integración

| Capa | Tecnología / evidencia |
|---|---|
| Interfaz | React 19, TypeScript estricto |
| Construcción | Vite 8, SPA estática |
| Enrutamiento | React Router 8, árbol explícito en `src/app/App.tsx` |
| Datos y caché | TanStack Query |
| Formularios | React Hook Form + Zod |
| Estilos | Tailwind CSS 4, shadcn/ui, Radix UI |
| Servicios actuales | `src/services/mock-api.ts`, simulación local |
| Persistencia de la demo | IndexedDB; sesión simulada en localStorage |
| Dependencias reproducibles | pnpm 10.30.3 y `pnpm-lock.yaml` |

La persistencia de la demo conserva los cambios de un navegador y protege instantáneas ilegibles. No acredita sincronización entre dispositivos, autorización real ni transacciones del backend. Fuentes: [package.json](../../apps/frontend/package.json), [Vite](../../apps/frontend/vite.config.ts), [rutas](../../apps/frontend/src/features/README.md) y [ADR-001](../adr/0001-sistema-de-routing.md).

## Modelo comercial objetivo

Una ficha puede ofrecer productos **estándar**, **personalizados bajo demanda** o ambas opciones. La opción personalizada no exige existencia estándar previa ni incorpora automáticamente unidades al inventario.

El comprador compone localmente una solicitud con varios renglones de **un único taller**. Antes de enviarla no existe un pedido Pendiente en el servidor. Se impide mezclar talleres; esta composición no introduce un carrito universal ni un checkout.

El artesano cotiza renglones, personalización, entrega y otros servicios justificados mientras el pedido está Pendiente. Todo cargo compartido se distribuye antes de aceptar. La aceptación es integral: verifica y reserva todas las unidades estándar y congela los importes y su distribución, o falla sin reservas parciales.

El pago externo por el **100 % del total en córdobas** debe confirmarse antes de avanzar:

```text
Pedido totalmente estándar:
Pendiente → Aceptado → Listo para entrega → Entregado
                      ↑ requiere Pago confirmado

Pedido personalizado o mixto:
Pendiente → Aceptado → En producción → Listo para entrega → Entregado
                      ↑ requiere Pago confirmado
```

Pedido y pago son estados separados. **Pago confirmado no es un estado del pedido.** Todos los renglones deben estar listos antes de la primera entrega; las entregas efectivas pueden ocurrir en distintas fechas. El registro de cada entrega consume las unidades estándar y conserva su costo histórico. La confirmación o discrepancia del comprador es evidencia separada y no provoca un segundo descuento.

## Requisitos funcionales

Las condiciones completas y los responsables están en las [fichas RF](requisitos.md#requisitos-funcionales).

| ID | Alcance objetivo |
|---|---|
| RF-001 | Publicación en hasta cinco pasos: fotografía, nombre/precio, categoría y descripción; datos de modalidad condicionales |
| RF-002 | Validación y optimización de imágenes; archivos externos y rutas/metadatos en PostgreSQL |
| RF-003 | Catálogo paginado, búsqueda, filtros y ordenamiento; talleres aprobados y publicaciones visibles |
| RF-004 | Teléfono/contraseña; roles, permisos y aprobación del taller controlados por servidor |
| RF-005 | Aceptación/rechazo integral, reserva atómica con movimiento y congelación de cotización |
| RF-006 | Importes por renglón, cargos distribuidos, cotización visible en Pendiente y total congelado en C$ |
| RF-007 | Conversión informativa a US$ mediante tasa administrada; cobro contractual en C$ |
| RF-008 | Perfil público de taller, separando contacto público y credenciales privadas |
| RF-009 | Composición local de solicitud; envío crea el pedido Pendiente |
| RF-010 | Ciclo según modalidad y pago; entregas por cantidades/renglones, recepción y cierre parcial |
| RF-011 | Pago externo total; cinco estados, intentos, correcciones de 48 horas y conciliación tras cancelación |
| RF-012 | Pasarela futura, **postergada y fuera de la aceptación de esta versión** |
| RF-013 | Django Admin: aprobación, moderación, tasa y supervisión autorizada en solo lectura |
| RF-014 | Chat exclusivo de las partes desde Aceptado; historial de solo lectura tras cierre |
| RF-015 | Cancelación según rol/estado y entregas; cierre parcial, reembolsos y clasificación de unidades |
| RF-016 | Preferencia del comprador y plan de una o varias entregas/costos visible antes de aceptar |
| RF-017 | Modalidad estándar, personalizada o ambas; inventario directo para estándar |
| RF-018 | Varios renglones de un taller; aceptación integral, un pago económico total y varias entregas |
| RF-019 | Despublicación/moderación con actor y motivo, conservando pedidos históricos |
| RF-020 | Notificaciones persistentes de eventos y plazos; consulta y marcado como leído |
| RF-021 | Obligación de reembolso Pendiente/Realizado con cálculo congelado y devolución externa |
| RF-022 | Existencias físicas, reservas, clasificación y disponibilidad derivada sin negativos |
| RF-023 | Movimientos transaccionales e históricos sin edición ordinaria |
| RF-024 | Costos de entrada, promedio ponderado, costos históricos y valorización administrativa |

## Requisitos no funcionales

Las métricas son objetivos a verificar; esta revisión no acredita resultados de rendimiento, disponibilidad, seguridad ni concurrencia.

| ID | Criterio objetivo |
|---|---|
| RNF-001 | Lenguaje claro, acciones táctiles ≥44 × 44 px y estados también en texto |
| RNF-002 | Desde 360 px, sin ocultar acciones; móvil, tableta y escritorio |
| RNF-003 | Catálogo utilizable en ≤3 s con perfil 3G/4G controlado y 500 productos |
| RNF-004 | TLS, hash seguro, autorización por objeto/rol/pertenencia y protección de evidencia |
| RNF-005 | Arquitectura REST/JSON interoperable; servidor como autoridad de reglas |
| RNF-006 | Meta de ≥95 % de disponibilidad mensual, con periodo y exclusiones definidos |
| RNF-007 | 50 talleres, 500 productos, paginación y evaluación de última unidad concurrente |
| RNF-008 | Trazabilidad de pedidos, pagos, entregas, reembolsos, unidades y costos históricos |
| RNF-009 | Verificar Chrome, Firefox y Edge de escritorio, además de Chrome móvil |
| RNF-010 | Chat incremental aproximadamente cada 15 s, sin omisiones por concurrencia |
| RNF-011 | Transacciones ACID, restricciones, invariantes e idempotencia en PostgreSQL |
| RNF-012 | Respaldos y restauración probada antes de usar datos reales |
| RNF-013 | Minimización de datos y separación de contactos públicos, credenciales y evidencia |
| RNF-014 | Reintentos sin duplicación; consultar resultado persistido de acciones inciertas |
| RNF-015 | Servicios de dominio y pruebas de reglas con trazabilidad RF/RNF |

RNF-005 corresponde ahora a **Arquitectura e interoperabilidad**; la mantenibilidad se recoge en RNF-015. Las garantías de servidor no se sustituyen ocultando botones ni mediante una simulación en memoria.

## Inventario y Costos

El módulo del artesano deberá mostrar producto, existencia física, reservado, por clasificar, disponible, costo promedio y valor del inventario. La disponibilidad se calcula:

```text
disponibles = existenciasFisicas − reservadas − porClasificar
```

No es un número editable independiente. Las reservas cambian por operaciones de pedido válidas. Registrar una entrada, ajuste o baja genera un movimiento; no se reemplaza libremente la existencia con un campo «nuevo stock». El historial conserva actor, fecha, motivo, referencias y valores anteriores/posteriores.

Las unidades pendientes de clasificación permanecen fuera de venta. Reincorporar unidades reutilizables reduce porClasificar; dar de baja reduce porClasificar y existencia física. Cancelar desde comprador no debe esperar a esa clasificación.

Rutas propuestas: `/panel/inventario` y `/panel/inventario/:productId`. **Todavía no existen en el código de referencia.** El detalle tendrá movimientos, reservas, costos y pendientes de clasificación. Entradas, ajustes, bajas y clasificación se gestionan ahí; el formulario de producto mantiene sus cuatro grupos esenciales y opciones condicionales.

«Mis productos» y la ficha pública mostrarán disponibilidad estándar y oferta personalizada por separado. El panel incluirá acceso a Inventario y pendientes de clasificación. Los costos son información interna del artesano; no se añaden a la ficha pública.

## Estados y acciones

Estados de pedido: **Pendiente, Aceptado, En producción, Listo para entrega, Entregado, Rechazado, Cancelado y Cerrado parcialmente**.

Estados de pago: **Pendiente de pago, Pago registrado, Pago observado, Pago confirmado y Pago no recibido**.

El comprador puede cancelar Pendiente o Aceptado; no cancela unilateralmente En producción ni Listo. El artesano puede cancelar por imposibilidad antes de cualquier entrega; tras entregas parciales procede el cierre parcial conforme a RF-015. La cancelación por falta de pago es manual tras al menos 48 horas desde aceptación, respetando plazos de corrección y resolviendo revisiones de fondos.

Una observación del pago conserva motivo, notificación y 48 horas para corregir. Cancelado impide nuevos intentos/correcciones, pero permite resolver revisiones anteriores. Fondos confirmados después de cancelar generan reembolso sin duplicarlo.

Tras siete días desde Listo sin recoger en taller las cantidades pendientes, se marca recogida atrasada y se avisa. El pedido sigue Listo, pagado y con reservas: no hay cancelación, reventa ni devolución automática. Esta regla no se extiende a otras modalidades.

Consultar las [tablas de transición](modulos-y-reglas.md#transiciones-del-pedido) antes de implementar acciones.

## Interfaz, formularios y diseño

Se conserva la identidad **Barro y Sombra**: fondo crema `#FDFAF5`, superficie `#E8DFD0`, terracota `#B5502F`, oliva `#4A5D3A` y acento mostaza, con texto oscuro legible. Usar tokens semánticos en CSS, fotografía artesanal, espacios claros y animaciones discretas. Tipografía sans-serif para navegación y formularios; una tipografía display solo en títulos destacados.

Categorías de referencia: Cuero y calzado, Hamacas, Madera, Textiles, Dulces y Otros. Mantener buscador, filtros, ordenamiento, paginación, perfil público, galerías y conversión informativa de divisas.

Cada vista de datos contempla carga, vacío, error con reintento y confirmación de éxito. Mantener componentes reutilizables: tarjetas, badges de pedido/pago, timelines, chat, tablas/tarjetas responsive, formularios, diálogos, skeletons y estados vacíos. Estados con texto e iconos, foco visible, teclado, labels, HTML semántico y texto alternativo; el objetivo de accesibilidad de diseño se valida con evidencia.

React Hook Form + Zod cubrirán los formularios actuales y los nuevos de cotización por renglón, intentos/correcciones de pago, plan y registro de entregas, evidencia de recepción, cierre parcial, reembolso, entrada, ajuste, baja y clasificación. Cantidades enteras positivas, costos no negativos y motivos donde corresponda. El servicio verifica además pertenencia, estado, límites y reenvíos.

Diseñar desde móvil: filtros en panel, contenido vertical y acciones visibles. Tablas adaptadas a tarjetas cuando corresponda. Verificar 360 × 800, 390 × 844, 768 × 1024, 1366 × 768 y 1920 × 1080 px. Las vistas públicas conservan título, descripción y metadata básica.

## Límites de producto

No agregar carrito universal, checkout, wishlist, favoritos, reseñas, estrellas, cupones, puntos, suscripciones, recomendaciones comerciales, mapas, GPS, logística propia, seguimiento de transportistas, chat global ni funciones sociales.

No ofrecer pago contra entrega, cuotas, tarjetas ni pasarela en esta versión. Se registra y confirma un pago externo total antes de producción o Listo; la plataforma no ejecuta transferencias ni arbitra disputas.

Inventario y Costos no incluye múltiples almacenes, compras, proveedores, órdenes de compra, materias primas, recetas/BOM, lotes, series, transferencias entre bodegas, contabilidad general, libro diario, cuentas, debe/haber, balances, estados financieros, impuestos ni cuentas por pagar/cobrar.

## Desarrollo local

Usar Bun para respetar el bloqueo y la configuración presentes en este repositorio:

```sh
git clone https://github.com/Luigui789/Front-ArtesaNic.git
cd Front-ArtesaNic
bun install --frozen-lockfile
bun run dev
```

Comprobaciones para futuros cambios de código:

```sh
bunx tsc --noEmit
bun run build
bun run lint
```

Los scripts `build` y `lint` no sustituyen por sí solos las pruebas de negocio de RNF-015. Para un cambio documental, verificar enlaces, cobertura de identificadores, fidelidad de fichas y coherencia entre estado actual y objetivo. Los [escenarios de alineación](../trazabilidad/alineacion-main-456f613.md#escenarios-de-verificación) son criterios propuestos, no pruebas ya ejecutadas o superadas.

## Lovable

Proyecto conectado a [Lovable](https://lovable.dev), con [editor del proyecto](https://lovable.dev/projects/3a7c9366-a4ae-44b6-ae63-acd23100ce9d) y [aplicación de demostración](https://masaya-artisan-connect.lovable.app).

Los commits de la rama conectada se sincronizan con Lovable. Respetar [AGENTS.md](../../AGENTS.md): no reescribir historia publicada ni hacer force push. Este documento describe la revisión del repositorio; no acredita que la aplicación publicada ya incorpore el alcance objetivo.
