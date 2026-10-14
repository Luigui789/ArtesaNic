# Guía de alcance de ArtesaNic

**Revisión:** 12 de octubre de 2026 (America/Managua). La fuente vigente son las fichas y decisiones definitivas suministradas por el usuario en esta conversación. La actualización es documental y no acredita implementación del código.

## Conteos y estados

| Catálogo | Identificadores conservados | Activos en V1 | Otros estados |
|---|---|---|---|
| RF | RF-001 a RF-024: 24 fichas | **21 RF activos** | RF-002 integrado; RF-012 y RF-024 postergados fuera de V1 |
| RNF | RNF-001 a RNF-015: 15 fichas | **15 RNF activos** | Ninguno postergado |
| RN | RN-001 a RN-024: 24 reglas | Catálogo separado de reglas de negocio | No se contabiliza como RF ni RNF |

RF-002 mantiene su identificador para trazabilidad: la carga de imágenes está en RF-001 y los aspectos técnicos en RNF-005. RF-012 conserva la referencia a pasarela futura y RF-024 la referencia a costos y valorización; ninguno forma parte de V1.

## Fuentes vigentes

| Documento | Función |
|---|---|
| [Fichas RF/RNF](requisitos.md) | Una tabla individual por requisito; seis campos por RF y siete por RNF, con el texto suministrado |
| [Reglas de negocio](reglas-de-negocio.md) | RN-001 a RN-024 y correspondencia con RF/RNF |
| [Módulos y reglas](modulos-y-reglas.md) | Organización del alcance y referencias a las reglas, sin duplicar su lógica extensa |
| [Revisión de esta actualización](../trazabilidad/actualizacion-requisitos-2026-10-12.md) | Verificación documental e inconsistencias que requieren decisiones posteriores |

Las dependencias de las fichas se conservan exactamente. La relación con RN se documenta en el catálogo separado, sin agregar campos a los requisitos ni sustituir sus criterios de aceptación.

## Puntos de control del alcance

| Área | Referencia |
|---|---|
| Una cuenta, un rol; artesano bloqueado hasta aprobación | [RN-001](reglas-de-negocio.md#rn-001), [RN-002](reglas-de-negocio.md#rn-002) |
| Stock, producción por cantidad y personalización por renglón | [RN-004](reglas-de-negocio.md#rn-004), [RN-007](reglas-de-negocio.md#rn-007) |
| Decisión individual del artesano; propuesta final completa aceptada por el comprador | [RN-008](reglas-de-negocio.md#rn-008), [RN-009](reglas-de-negocio.md#rn-009) |
| Entrega cotizada manualmente; total congelado y reservas al confirmar | [RN-010](reglas-de-negocio.md#rn-010), [RN-011](reglas-de-negocio.md#rn-011) |
| Pago externo después de confirmar; revisión manual; dos plazos independientes de 48 horas | [RN-012](reglas-de-negocio.md#rn-012), [RN-013](reglas-de-negocio.md#rn-013), [RN-014](reglas-de-negocio.md#rn-014) |
| Trabajo solo después de Pago confirmado; cancelación unilateral limitada a antes de confirmar | [RN-015](reglas-de-negocio.md#rn-015), [RN-016](reglas-de-negocio.md#rn-016) |
| Entregas por renglón; cierre parcial iniciado por artesano y confirmado u objetado por comprador | [RN-018](reglas-de-negocio.md#rn-018), [RN-019](reglas-de-negocio.md#rn-019) |
| Notificaciones internas y privacidad de chats/comprobantes frente al administrador | [RN-006](reglas-de-negocio.md#rn-006), [RN-020](reglas-de-negocio.md#rn-020) |
| Reserva, entrega, transformación y liberación con efectos distintos en inventario | [RN-021](reglas-de-negocio.md#rn-021), [RN-022](reglas-de-negocio.md#rn-022), [RN-023](reglas-de-negocio.md#rn-023), [RN-024](reglas-de-negocio.md#rn-024) |

## Histórico y estado de implementación

Se preservan las [fichas del 8 de octubre](historico/fichas-2026-10-08.md), los [módulos de esa revisión](historico/modulos-2026-10-08.md), la [guía anterior](historico/guia-alcance-2026-10-08.md) y la [especificación v2.1 con su Anexo A](historico/especificacion-v2.1.md). Sus autores, versiones, responsables, aprobaciones y decisiones se mantienen como evidencia de su época.

La [matriz de main 456f613](../trazabilidad/alineacion-main-456f613.md), los planes y los contratos anteriores no sustituyen la fuente vigente. El [README del proyecto](../../README.md) y la [frontera mock/backend](../api/frontera-mock-backend.md) describen la separación entre simulación y servicios existentes; registrar requisitos no demuestra su cumplimiento.

No se modifica código, API, modelos, migraciones, pruebas funcionales ni configuración operativa como parte de esta actualización. Las políticas no detalladas por la fuente se señalan para revisión y no se completan con reglas nuevas.
