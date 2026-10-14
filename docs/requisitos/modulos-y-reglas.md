# Módulos y reglas del alcance V1

**Revisión:** 12 de octubre de 2026 (America/Managua). **Fuente vigente:** [fichas RF/RNF](requisitos.md) y [catálogo de reglas RN](reglas-de-negocio.md), basados exclusivamente en la especificación suministrada en esta conversación.

**Alcance V1: 21 RF activos y 15 RNF activos.** Se conservan RF-001 a RF-024 y RNF-001 a RNF-015. RF-002 deja de ser independiente y se integra en RF-001/RNF-005; RF-012 y RF-024 están postergados fuera de V1.

Esta guía organiza la especificación y remite al catálogo RN sin añadir reglas ni acreditar implementación. La revisión anterior se conserva en [módulos del 8 de octubre](historico/modulos-2026-10-08.md).

## Módulos

| Módulo | Funciones V1 | Trazabilidad |
|---|---|---|
| Usuarios, acceso y taller | Registro con teléfono, rol único, autenticación, bloqueo hasta aprobación y perfil público | RF-004, RF-008, RF-013; RNF-004, RNF-013; RN-001, RN-002, RN-006 |
| Catálogo y publicaciones | Gestión de productos e imágenes, modalidades disponibles, consulta, búsqueda, filtros, orden, paginación, conversión informativa y despublicación | RF-001, RF-003, RF-007, RF-017, RF-019; RNF-001, RNF-003, RNF-005, RNF-007; RN-003, RN-004, RN-010 |
| Solicitudes, propuesta y pedidos | Renglones de un taller, revisión individual del artesano y aceptación final completa por el comprador | RF-005, RF-006, RF-009, RF-010, RF-015, RF-016, RF-018; RN-005, RN-007, RN-008, RN-009, RN-010, RN-011, RN-015, RN-016, RN-017, RN-018, RN-019 |
| Pagos y reembolsos | Registro de pago externo total, confirmación manual, observación, corrección, vencimiento automático y devolución externa | RF-011, RF-015, RF-021; RNF-004, RNF-008, RNF-011; RN-012, RN-013, RN-014, RN-017, RN-019 |
| Inventario | Existencias, disponibilidad, reservas, entradas, ajustes, consumos, liberación, clasificación e historial | RF-017, RF-022, RF-023; RNF-008, RNF-011, RNF-014; RN-011, RN-021, RN-022, RN-023, RN-024 |
| Mensajería y notificaciones | Conversación del pedido confirmado y avisos internos persistentes | RF-014, RF-020; RNF-004, RNF-010, RNF-013; RN-006, RN-020 |
| Administración | Aprobación de talleres, cuentas, moderación, tasa de conversión y supervisión de estados e importes | RF-013, RF-007, RF-019; RNF-004, RNF-013; RN-002, RN-003, RN-006, RN-010 |

Los 15 RNF permanecen activos. Sus criterios completos y métodos de verificación están en las [fichas RNF](requisitos.md#requisitos-no-funcionales), incluidas las obligaciones transversales de responsividad, disponibilidad, compatibilidad, respaldo, resiliencia y mantenibilidad.

## Secuencia comercial

| Momento | Referencia normativa |
|---|---|
| Preparar y enviar una solicitud de un único taller con modalidad por renglón | RF-009, RF-017, RF-018; [RN-004](reglas-de-negocio.md#rn-004), [RN-005](reglas-de-negocio.md#rn-005), [RN-007](reglas-de-negocio.md#rn-007) |
| Resolver cada renglón y presentar la propuesta final, sin contraofertas de cantidad | RF-005, RF-018; [RN-008](reglas-de-negocio.md#rn-008) |
| Revisar cotización y plan; aceptar o rechazar la propuesta completa | RF-005, RF-006, RF-016; [RN-009](reglas-de-negocio.md#rn-009), [RN-010](reglas-de-negocio.md#rn-010) |
| Confirmar, congelar importes y reservar stock conjuntamente | RF-005, RF-006, RF-022; [RN-011](reglas-de-negocio.md#rn-011) |
| Pagar externamente, registrar el pago y esperar confirmación manual | RF-011; [RN-012](reglas-de-negocio.md#rn-012) |
| Gestionar falta de registro o comprobante observado | RF-011, RF-015; [RN-013](reglas-de-negocio.md#rn-013), [RN-014](reglas-de-negocio.md#rn-014) |
| Iniciar producción, personalización o preparación según cada renglón | RF-010, RF-017; [RN-015](reglas-de-negocio.md#rn-015) |
| Registrar entregas por renglón y evidencia de recepción | RF-010, RF-022; [RN-018](reglas-de-negocio.md#rn-018), [RN-022](reglas-de-negocio.md#rn-022) |
| Cancelar, vencer o tramitar cierre parcial y reembolso cuando corresponda | RF-015, RF-021; [RN-013](reglas-de-negocio.md#rn-013), [RN-016](reglas-de-negocio.md#rn-016), [RN-017](reglas-de-negocio.md#rn-017), [RN-019](reglas-de-negocio.md#rn-019), [RN-024](reglas-de-negocio.md#rn-024) |

La resolución del artesano se registra **por renglón**. La aceptación de la **propuesta final completa** corresponde al comprador. El cumplimiento conserva la modalidad individual de cada renglón, incluso si el pedido combina modalidades.

## Inventario y operaciones

| Operación | Referencia normativa |
|---|---|
| Revalidar y reservar al confirmar la propuesta | [RN-011](reglas-de-negocio.md#rn-011) |
| Mantener separadas existencia física y disponibilidad; registrar entradas, ajustes e historial | [RN-021](reglas-de-negocio.md#rn-021) |
| Descontar físicamente stock normal al registrar entrega | [RN-022](reglas-de-negocio.md#rn-022) |
| Consumir una unidad estándar base al comenzar su transformación | [RN-023](reglas-de-negocio.md#rn-023) |
| Liberar directamente unidades no manipuladas; clasificar solo según condición | [RN-024](reglas-de-negocio.md#rn-024) |

## Referencias históricas y límites

RF-002 se conserva como ficha histórica integrada; la carga de imágenes pertenece a RF-001 y las condiciones técnicas a RNF-005. La pasarela RF-012 y los costos, valorización y márgenes RF-024 permanecen fuera de V1.

Los diagramas, planes, contratos propuestos y matrices anteriores son evidencia histórica o propuestas de implementación. Cuando difieran de estas fichas, prevalece la especificación del 12 de octubre. Las inconsistencias pendientes se registran en la [revisión documental](../trazabilidad/actualizacion-requisitos-2026-10-12.md); no se resuelven mediante cambios funcionales en esta actualización.
