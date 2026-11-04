# Requisitos funcionales y no funcionales

**Proyecto:** ArtesaNic — comercialización de productos artesanales de las PYMEs de Masaya.

**Base de contenido:** especificación del repositorio del 12 de octubre de 2026. **Nombres revisados:** denominaciones del documento RF/RNF.docx compartido por el equipo (actualizado en Google Drive el 22 de octubre de 2026), aplicadas a sus equivalentes funcionales. Los nombres no alteran descripciones, reglas, dependencias ni criterios de aceptación de la especificación del repositorio.

**Alcance V1: 21 RF activos y 15 RNF activos.** Se conservan las 24 fichas históricas RF y las 15 fichas RNF: RF-002 está integrado en RF-001 y RNF-005 y deja de ser RF independiente; RF-012 y RF-024 están postergados fuera de V1. Activo significa incluido en el alcance, no implementado.

Las reglas de negocio se consultan en el [catálogo RN-001 a RN-024](reglas-de-negocio.md). La correspondencia RN → RF/RNF se mantiene allí, fuera de las fichas, para respetar los campos y dependencias suministrados.

**Trazabilidad histórica:** [fichas del 8 de octubre](historico/fichas-2026-10-08.md), [especificación v2.1 y Anexo A](historico/especificacion-v2.1.md) y [revisión documental de esta actualización](../trazabilidad/actualizacion-requisitos-2026-10-12.md). Las versiones, responsabilidades y estados anteriores continúan disponibles en el histórico, pero no se presentan como si hubieran sido ratificados en la especificación vigente.

**Presentación estandarizada:** Todas las fichas usan los mismos once campos: identificador y nombre, versión, autores, fuentes, dependencias, descripción, importancia, urgencia, estado, estabilidad y comentarios. La asignación de autores, la denominación de las fichas incluidas en el documento de referencia y la escala de urgencia (Inmediata, Alta, Media y Baja) responden a indicaciones editoriales del equipo. La urgencia se propone de acuerdo con la prioridad y el alcance V1; no acredita aprobación. Los campos versión y estabilidad se señalan como no especificados cuando la fuente vigente no los define. Los criterios de aceptación, actores, categorías y métodos de verificación se mantienen íntegros en el anexo.

## Índice y alcance V1

| Identificador | Nombre | Alcance V1 |
|---|---|---|
| [RF-001](#rf-001) | Gestionar productos | Activo |
| [RF-002](#rf-002) | Gestión técnica de imágenes | Integrado; sin RF independiente |
| [RF-003](#rf-003) | Consultar catálogo de productos | Activo |
| [RF-004](#rf-004) | Administrar cuentas de usuario | Activo |
| [RF-005](#rf-005) | Gestionar solicitudes de pedido | Activo |
| [RF-006](#rf-006) | Cotizar pedido | Activo |
| [RF-007](#rf-007) | Mostrar equivalencia de precios en dólares | Activo |
| [RF-008](#rf-008) | Administrar perfil público del taller | Activo |
| [RF-009](#rf-009) | Solicitar pedido | Activo |
| [RF-010](#rf-010) | Controlar ciclo de vida del pedido | Activo |
| [RF-011](#rf-011) | Gestionar pagos externos | Activo |
| [RF-012](#rf-012) | Pasarela de pago | Postergado; fuera de V1 |
| [RF-013](#rf-013) | Administrar la plataforma | Activo |
| [RF-014](#rf-014) | Intercambiar mensajes del pedido | Activo |
| [RF-015](#rf-015) | Gestionar incidencias del pedido | Activo |
| [RF-016](#rf-016) | Planificar entrega del pedido | Activo |
| [RF-017](#rf-017) | Configurar modalidades de venta del producto | Activo |
| [RF-018](#rf-018) | Pedido de varios productos de un mismo taller | Activo |
| [RF-019](#rf-019) | Moderar productos publicados | Activo |
| [RF-020](#rf-020) | Notificar eventos del pedido | Activo |
| [RF-021](#rf-021) | Gestionar reembolsos | Activo |
| [RF-022](#rf-022) | Controlar disponibilidad de unidades | Activo |
| [RF-023](#rf-023) | Registrar movimientos de inventario | Activo |
| [RF-024](#rf-024) | Gestionar costos del inventario | Postergado; fuera de V1 |
| [RNF-001](#rnf-001) | Usabilidad | Activo |
| [RNF-002](#rnf-002) | Diseño responsivo | Activo |
| [RNF-003](#rnf-003) | Desempeño | Activo |
| [RNF-004](#rnf-004) | Seguridad y control de acceso | Activo |
| [RNF-005](#rnf-005) | Arquitectura, interoperabilidad y almacenamiento | Activo |
| [RNF-006](#rnf-006) | Disponibilidad | Activo |
| [RNF-007](#rnf-007) | Capacidad y escalabilidad | Activo |
| [RNF-008](#rnf-008) | Trazabilidad | Activo |
| [RNF-009](#rnf-009) | Compatibilidad de navegadores | Activo |
| [RNF-010](#rnf-010) | Actualización de mensajería | Activo |
| [RNF-011](#rnf-011) | Integridad transaccional y concurrencia | Activo |
| [RNF-012](#rnf-012) | Respaldo y recuperación | Activo |
| [RNF-013](#rnf-013) | Privacidad y minimización de datos | Activo |
| [RNF-014](#rnf-014) | Resiliencia ante conectividad inestable | Activo |
| [RNF-015](#rnf-015) | Mantenibilidad y pruebas de reglas de negocio | Activo |

## Requisitos funcionales

## RF-001

| **RF-001** | **GESTIONAR PRODUCTOS** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RNF-001, RNF-003, RNF-005 |
| Descripción | El sistema deberá permitir al artesano aprobado registrar y editar productos indicando fotografía principal, nombre, precio, categoría, descripción y las modalidades de venta disponibles. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El artesano podrá registrar fotografía principal, nombre, precio, categoría y descripción. Consulte los criterios completos en el [anexo de RF-001](#detalle-rf-001). |

## RF-002

| **RF-002** | **GESTIÓN TÉCNICA DE IMÁGENES** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RNF-005 |
| Descripción | Este requisito deja de utilizarse como requisito funcional independiente. La carga de imágenes se integra en RF-001 y las condiciones técnicas de validación, optimización y almacenamiento se trasladan a RNF-005. |
| Importancia | No aplica |
| Urgencia | Baja |
| Estado | Integrado; sin RF independiente |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Integrado en RF-001 y RNF-005; no constituye una función separada en V1. Consulte los criterios completos en el [anexo de RF-002](#detalle-rf-002). |

## RF-003

| **RF-003** | **CONSULTAR CATÁLOGO DE PRODUCTOS** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-008, RNF-003, RNF-007 |
| Descripción | El sistema deberá permitir al comprador consultar el catálogo público de productos pertenecientes a talleres aprobados, realizar búsquedas, aplicar filtros y ordenar los resultados. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Mostrar únicamente productos publicados pertenecientes a talleres aprobados. Consulte los criterios completos en el [anexo de RF-003](#detalle-rf-003). |

## RF-004

| **RF-004** | **ADMINISTRAR CUENTAS DE USUARIO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-013, RNF-004, RNF-013 |
| Descripción | El sistema deberá permitir registrar y autenticar compradores y artesanos mediante teléfono y contraseña, manteniendo un único rol por cuenta. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El usuario podrá registrarse como Comprador o Artesano. Consulte los criterios completos en el [anexo de RF-004](#detalle-rf-004). |

## RF-005

| **RF-005** | **GESTIONAR SOLICITUDES DE PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-006, RF-009, RF-016, RF-017, RF-018, RF-022 |
| Descripción | El sistema deberá permitir al artesano revisar individualmente los renglones de una solicitud, aceptar o rechazar cada uno y presentar al comprador una propuesta final con los renglones aceptados y las condiciones comerciales correspondientes. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El artesano deberá resolver cada renglón como Aceptado o Rechazado. Consulte los criterios completos en el [anexo de RF-005](#detalle-rf-005). |

## RF-006

| **RF-006** | **COTIZAR PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-016, RF-018, RF-021 |
| Descripción | El sistema deberá presentar el desglose económico de la propuesta antes de la confirmación del comprador y conservar los importes acordados una vez confirmada. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Mostrar producto, modalidad, cantidad, precio unitario y subtotal por renglón. Consulte los criterios completos en el [anexo de RF-006](#detalle-rf-006). |

## RF-007

| **RF-007** | **MOSTRAR EQUIVALENCIA DE PRECIOS EN DÓLARES** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-013 |
| Descripción | El sistema deberá mostrar los precios en córdobas y permitir una conversión informativa a dólares mediante una tasa configurada por el administrador. |
| Importancia | Media |
| Urgencia | Media |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Los importes contractuales se conservarán en córdobas. Consulte los criterios completos en el [anexo de RF-007](#detalle-rf-007). |

## RF-008

| **RF-008** | **ADMINISTRAR PERFIL PÚBLICO DEL TALLER** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-004, RF-013, RNF-013 |
| Descripción | El sistema deberá permitir al artesano administrar un perfil público de su taller y al comprador consultarlo desde el catálogo y los pedidos. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Registrar nombre del taller, historia, rubro, dirección completa, horario y contactos o redes públicas. Consulte los criterios completos en el [anexo de RF-008](#detalle-rf-008). |

## RF-009

| **RF-009** | **SOLICITAR PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-004, RF-017, RF-018, RNF-014 |
| Descripción | El sistema deberá permitir al comprador preparar y enviar una solicitud de pedido con uno o varios productos pertenecientes al mismo taller. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El comprador podrá seleccionar producto y cantidad. Consulte los criterios completos en el [anexo de RF-009](#detalle-rf-009). |

## RF-010

| **RF-010** | **CONTROLAR CICLO DE VIDA DEL PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-011, RF-015, RF-017, RF-022 |
| Descripción | El sistema deberá controlar los estados y transiciones del pedido desde la confirmación de la propuesta hasta su entrega, cancelación, vencimiento o cierre parcial. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El servidor será la autoridad sobre los cambios de estado. Consulte los criterios completos en el [anexo de RF-010](#detalle-rf-010). |

## RF-011

| **RF-011** | **GESTIONAR PAGOS EXTERNOS** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-006, RF-015, RF-021, RNF-004 |
| Descripción | El sistema deberá permitir al comprador registrar un pago realizado fuera de la plataforma por el total confirmado del pedido y al artesano verificar manualmente la recepción de los fondos. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El pago se realizará después de que el comprador confirme la propuesta final. Consulte los criterios completos en el [anexo de RF-011](#detalle-rf-011). |

## RF-012

| **RF-012** | **PASARELA DE PAGO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-011 |
| Descripción | La integración de una pasarela que procese pagos electrónicamente queda fuera del alcance de V1. La plataforma únicamente registrará y verificará pagos realizados externamente. |
| Importancia | Postergado |
| Urgencia | Baja |
| Estado | Postergado; fuera de V1 |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | No aplica en V1. Consulte los criterios completos en el [anexo de RF-012](#detalle-rf-012). |

## RF-013

| **RF-013** | **ADMINISTRAR LA PLATAFORMA** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-004, RF-007, RF-019, RNF-004, RNF-013 |
| Descripción | El sistema deberá proporcionar al administrador funciones de aprobación, configuración, moderación y supervisión de la plataforma. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Aprobar o rechazar talleres. Consulte los criterios completos en el [anexo de RF-013](#detalle-rf-013). |

## RF-014

| **RF-014** | **INTERCAMBIAR MENSAJES DEL PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-010, RNF-004, RNF-010 |
| Descripción | El sistema deberá permitir al comprador y al artesano intercambiar mensajes de texto asociados exclusivamente a un pedido confirmado. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Solo las partes del pedido podrán acceder a la conversación. Consulte los criterios completos en el [anexo de RF-014](#detalle-rf-014). |

## RF-015

| **RF-015** | **GESTIONAR INCIDENCIAS DEL PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-010, RF-011, RF-021, RF-022 |
| Descripción | El sistema deberá gestionar la cancelación de solicitudes, el vencimiento por falta de pago y el cierre parcial de pedidos que no puedan completarse. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El comprador podrá cancelar mientras no haya confirmado la propuesta final. Consulte los criterios completos en el [anexo de RF-015](#detalle-rf-015). |

## RF-016

| **RF-016** | **PLANIFICAR ENTREGA DEL PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-006, RF-009, RF-014 |
| Descripción | El sistema deberá permitir al comprador indicar una modalidad preferida de entrega y al artesano establecer el plan y costo de entrega como parte de su propuesta. |
| Importancia | Media |
| Urgencia | Media |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Modalidades mínimas: retiro en taller, punto de encuentro, entrega por el artesano y Otra. Consulte los criterios completos en el [anexo de RF-016](#detalle-rf-016). |

## RF-017

| **RF-017** | **CONFIGURAR MODALIDADES DE VENTA DEL PRODUCTO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-005, RF-009, RF-022 |
| Descripción | El sistema deberá admitir productos vendidos desde stock, producción por cantidad, personalización de producto y pedidos mixtos. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | En stock, el comprador seleccionará una cantidad disponible. Consulte los criterios completos en el [anexo de RF-017](#detalle-rf-017). |

## RF-018

| **RF-018** | **PEDIDO DE VARIOS PRODUCTOS DE UN MISMO TALLER** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-006, RF-009, RF-017 |
| Descripción | El sistema deberá permitir que una solicitud contenga varios renglones de productos pertenecientes a un mismo taller. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Todos los renglones deberán pertenecer al mismo taller. Consulte los criterios completos en el [anexo de RF-018](#detalle-rf-018). |

## RF-019

| **RF-019** | **MODERAR PRODUCTOS PUBLICADOS** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-013, RNF-008 |
| Descripción | El sistema deberá permitir al artesano despublicar sus productos y al administrador moderar publicaciones conservando las referencias históricas. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Un producto despublicado dejará de aparecer para nuevas solicitudes. Consulte los criterios completos en el [anexo de RF-019](#detalle-rf-019). |

## RF-020

| **RF-020** | **NOTIFICAR EVENTOS DEL PEDIDO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-010, RF-011, RF-015, RF-021 |
| Descripción | El sistema deberá generar notificaciones internas persistentes para los eventos relevantes de solicitudes, pedidos, pagos, entregas, cancelaciones, cierres y reembolsos. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Notificar nuevas solicitudes. Consulte los criterios completos en el [anexo de RF-020](#detalle-rf-020). |

## RF-021

| **RF-021** | **GESTIONAR REEMBOLSOS** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-006, RF-011, RF-015 |
| Descripción | El sistema deberá registrar las obligaciones de reembolso originadas por cancelaciones o cierres parciales y permitir al artesano registrar la devolución realizada externamente. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Crear reembolso total cuando un pedido pagado sea cancelado antes de cualquier entrega. Consulte los criterios completos en el [anexo de RF-021](#detalle-rf-021). |

## RF-022

| **RF-022** | **CONTROLAR DISPONIBILIDAD DE UNIDADES** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-010, RF-015, RF-017, RF-023, RNF-011 |
| Descripción | El sistema deberá controlar las existencias físicas, reservas y disponibilidad de productos estándar, manteniendo consistencia entre inventario y pedidos. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Registrar existencia inicial. Consulte los criterios completos en el [anexo de RF-022](#detalle-rf-022). |

## RF-023

| **RF-023** | **REGISTRAR MOVIMIENTOS DE INVENTARIO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-022, RNF-008 |
| Descripción | El sistema deberá permitir al artesano consultar el historial de movimientos que hayan afectado el inventario de sus productos estándar. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Mostrar existencia inicial, entradas, ajustes, reservas, liberaciones, consumos, reincorporaciones y bajas. Consulte los criterios completos en el [anexo de RF-023](#detalle-rf-023). |

## RF-024

| **RF-024** | **GESTIONAR COSTOS DEL INVENTARIO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-022, RF-023 |
| Descripción | El cálculo de costo promedio ponderado, valorización de existencias y márgenes queda fuera del alcance de V1. |
| Importancia | Postergado |
| Urgencia | Baja |
| Estado | Postergado; fuera de V1 |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | No aplica en V1. Cuando se implemente, la información de costos deberá ser privada y no visible para compradores. Consulte los criterios completos en el [anexo de RF-024](#detalle-rf-024). |

## RNF-001

| **RNF-001** | **USABILIDAD** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-003, RF-004, RF-009 |
| Descripción | La plataforma deberá presentar interfaces comprensibles, consistentes y simplificadas que faciliten el uso de las funciones principales por parte de compradores y artesanos. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Los controles táctiles principales deberán tener un área mínima de **44 × 44 px**. Consulte los criterios completos en el [anexo de RNF-001](#detalle-rnf-001). |

## RNF-002

| **RNF-002** | **DISEÑO RESPONSIVO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-003, RF-004, RF-009, RF-010 |
| Descripción | La plataforma deberá adaptar sus interfaces esenciales a dispositivos móviles, tabletas y computadoras sin impedir el acceso a las funciones principales. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Las interfaces deberán ser utilizables desde un ancho mínimo de **360 px**. Consulte los criterios completos en el [anexo de RNF-002](#detalle-rnf-002). |

## RNF-003

| **RNF-003** | **DESEMPEÑO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-003, RF-004, RF-009, RF-010, RF-011, RF-022 |
| Descripción | La plataforma deberá mantener tiempos de respuesta adecuados para las operaciones principales dentro del volumen previsto para la primera versión. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El catálogo deberá estar utilizable en **≤3 segundos en el percentil 95**, utilizando hasta 500 productos y una conexión móvil 3G/4G controlada. Consulte los criterios completos en el [anexo de RNF-003](#detalle-rnf-003). |

## RNF-004

| **RNF-004** | **SEGURIDAD Y CONTROL DE ACCESO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-004, RF-011, RF-013, RF-014 |
| Descripción | La plataforma deberá proteger las credenciales, los datos y las operaciones mediante mecanismos de autenticación, autorización y control de acceso aplicados desde el servidor. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El tráfico deberá utilizar **HTTPS/TLS**. Consulte los criterios completos en el [anexo de RNF-004](#detalle-rnf-004). |

## RNF-005

| **RNF-005** | **ARQUITECTURA, INTEROPERABILIDAD Y ALMACENAMIENTO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-001, RF-010, RF-022 |
| Descripción | La solución deberá mantener una arquitectura desacoplada entre interfaz, lógica de negocio y datos, utilizando contratos de comunicación definidos. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El frontend utilizará React y TypeScript. Consulte los criterios completos en el [anexo de RNF-005](#detalle-rnf-005). |

## RNF-006

| **RNF-006** | **DISPONIBILIDAD** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RNF-012 |
| Descripción | Durante el período formal de evaluación, la plataforma deberá mantener un nivel mínimo de disponibilidad del servicio. |
| Importancia | Media |
| Urgencia | Media |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | La disponibilidad mensual deberá ser de al menos **95 %**. Consulte los criterios completos en el [anexo de RNF-006](#detalle-rnf-006). |

## RNF-007

| **RNF-007** | **CAPACIDAD Y ESCALABILIDAD** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-003, RF-018, RF-022, RNF-003 |
| Descripción | La primera versión deberá soportar el volumen inicial previsto y permitir el crecimiento de la infraestructura sin rediseñar los flujos funcionales principales. |
| Importancia | Media |
| Urgencia | Media |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Soportar al menos **50 talleres activos**. Consulte los criterios completos en el [anexo de RNF-007](#detalle-rnf-007). |

## RNF-008

| **RNF-008** | **TRAZABILIDAD** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-010, RF-011, RF-015, RF-019, RF-021, RF-022, RF-023 |
| Descripción | Las operaciones críticas deberán conservar evidencia suficiente para identificar qué ocurrió, cuándo ocurrió y quién fue responsable. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Registrar usuario responsable cuando corresponda. Consulte los criterios completos en el [anexo de RNF-008](#detalle-rnf-008). |

## RNF-009

| **RNF-009** | **COMPATIBILIDAD DE NAVEGADORES** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RNF-001, RNF-002 |
| Descripción | Los flujos esenciales de la plataforma deberán funcionar correctamente en los navegadores definidos como soportados. |
| Importancia | Media |
| Urgencia | Media |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Compatibilidad con la última y penúltima versión estable disponible de **Google Chrome**. Consulte los criterios completos en el [anexo de RNF-009](#detalle-rnf-009). |

## RNF-010

| **RNF-010** | **ACTUALIZACIÓN DE MENSAJERÍA** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-014, RNF-011 |
| Descripción | Mientras una conversación esté activa, los mensajes nuevos deberán mostrarse sin requerir que el usuario recargue manualmente la página. |
| Importancia | Media |
| Urgencia | Media |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Un mensaje confirmado deberá mostrarse en la otra sesión en un plazo aproximado máximo de **15 segundos**. Consulte los criterios completos en el [anexo de RNF-010](#detalle-rnf-010). |

## RNF-011

| **RNF-011** | **INTEGRIDAD TRANSACCIONAL Y CONCURRENCIA** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-010, RF-011, RF-015, RF-021, RF-022 |
| Descripción | Las operaciones simultáneas sobre pedidos, pagos e inventario deberán conservar la consistencia de la información y evitar efectos duplicados. |
| Importancia | Crítica |
| Urgencia | Inmediata |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Las operaciones críticas deberán utilizar transacciones ACID. Consulte los criterios completos en el [anexo de RNF-011](#detalle-rnf-011). |

## RNF-012

| **RNF-012** | **RESPALDO Y RECUPERACIÓN** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RNF-006 |
| Descripción | La información persistente de la plataforma deberá contar con mecanismos automáticos de respaldo y procedimientos comprobados de restauración. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Realizar un respaldo automático al menos cada **24 horas**. Consulte los criterios completos en el [anexo de RNF-012](#detalle-rnf-012). |

## RNF-013

| **RNF-013** | **PRIVACIDAD Y MINIMIZACIÓN DE DATOS** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-004, RF-008, RF-011, RF-013, RF-014 |
| Descripción | La plataforma deberá recopilar y mostrar únicamente los datos necesarios para cada función y aplicar niveles de visibilidad según la finalidad de la información. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | La dirección completa del taller podrá mostrarse como parte de su perfil público. Consulte los criterios completos en el [anexo de RNF-013](#detalle-rnf-013). |

## RNF-014

| **RNF-014** | **RESILIENCIA ANTE CONECTIVIDAD INESTABLE** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-009, RF-011, RF-021, RF-022, RNF-011 |
| Descripción | La plataforma deberá manejar interrupciones de conectividad y reintentos sin generar operaciones duplicadas ni dejar al usuario sin información sobre el resultado de una acción. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | Mostrar estados de carga, éxito y error durante las operaciones. Consulte los criterios completos en el [anexo de RNF-014](#detalle-rnf-014). |

## RNF-015

| **RNF-015** | **MANTENIBILIDAD Y PRUEBAS DE REGLAS DE NEGOCIO** |
|---|---|
| Versión | No especificada en la fuente vigente |
| Autores | Luis Fernando José Gutiérrez Dávila, Heidi Leana Piña Martínez, Keyling de los Ángeles Rocha Pérez |
| Fuentes | Especificación vigente de ArtesaNic (12 de octubre de 2026) |
| Dependencias | RF-005, RF-006, RF-010, RF-011, RF-015, RF-021, RF-022, RNF-011 |
| Descripción | Las reglas de negocio deberán centralizarse en la capa de dominio o servicios y contar con pruebas automatizadas que permitan validar el comportamiento del sistema y facilitar su mantenimiento. |
| Importancia | Alta |
| Urgencia | Alta |
| Estado | Activo |
| Estabilidad | No especificada en la fuente vigente |
| Comentarios | El frontend no deberá ser la autoridad sobre reglas de negocio críticas. Consulte los criterios completos en el [anexo de RNF-015](#detalle-rnf-015). |


## Anexo: campos complementarios de la especificación vigente

Los criterios de aceptación, actores, categorías y métodos de verificación se reproducen textualmente de la fuente vigente. Su ubicación en este anexo no modifica el alcance ni las reglas de negocio de las fichas.

### Detalle RF-001

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano |
| **Criterios de aceptación** | 1. El artesano podrá registrar fotografía principal, nombre, precio, categoría y descripción. <br>2. Podrá indicar si el producto admite venta desde stock, producción por cantidad, personalización o una combinación de estas modalidades. <br>3. Los campos obligatorios deberán validarse antes de guardar. <br>4. Las modificaciones posteriores del producto no deberán alterar las condiciones ni importes de pedidos previamente confirmados. |

### Detalle RF-002

| Campo original | Contenido |
|---|---|
| **Actores** | No aplica |
| **Criterios de aceptación** | No aplica como requisito funcional independiente. |

### Detalle RF-003

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador |
| **Criterios de aceptación** | 1. Mostrar únicamente productos publicados pertenecientes a talleres aprobados. <br>2. Permitir búsqueda por nombre. <br>3. Permitir filtros por categoría, rango de precio y taller. <br>4. Permitir ordenar por fecha, precio y nombre. <br>5. Presentar los resultados mediante paginación. <br>6. Permitir acceder al perfil público del taller desde el producto. |

### Detalle RF-004

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. El usuario podrá registrarse como Comprador o Artesano. <br>2. Cada cuenta tendrá un único rol. <br>3. El rol Administrador no podrá seleccionarse en el registro público. <br>4. El comprador podrá utilizar su cuenta una vez completado el registro. <br>5. La cuenta del artesano permanecerá bloqueada hasta que el administrador apruebe el taller. <br>6. El artesano no aprobado no podrá acceder a las funciones operativas de la plataforma. <br>7. Los usuarios habilitados podrán iniciar y cerrar sesión. <br>8. Podrán consultar y actualizar sus datos personales permitidos. |

### Detalle RF-005

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Comprador |
| **Criterios de aceptación** | 1. El artesano deberá resolver cada renglón como Aceptado o Rechazado. <br>2. Todo renglón rechazado deberá incluir un motivo. <br>3. En V1 no se permitirán contraofertas de cantidad. <br>4. Los renglones rechazados permanecerán registrados en el historial. <br>5. El sistema generará una propuesta final con los renglones aceptados. <br>6. El comprador podrá aceptar o rechazar la propuesta completa. <br>7. Si la rechaza, no se generará un pedido confirmado. <br>8. Si la acepta, se confirmará el pedido y se aplicarán las reservas y condiciones económicas correspondientes. |

### Detalle RF-006

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Comprador |
| **Criterios de aceptación** | 1. Mostrar producto, modalidad, cantidad, precio unitario y subtotal por renglón. <br>2. Mostrar cargos de personalización, entrega y otros servicios cuando correspondan. <br>3. El artesano deberá registrar manualmente el costo de entrega. <br>4. Los cargos deberán quedar suficientemente desglosados para permitir cálculos de reembolso posteriores. <br>5. El comprador podrá revisar la cotización antes de aceptarla. <br>6. Al confirmar la propuesta, el sistema congelará el total y su desglose. <br>7. Modificaciones posteriores del catálogo no alterarán los importes históricos del pedido. |

### Detalle RF-007

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Administrador |
| **Criterios de aceptación** | 1. Los importes contractuales se conservarán en córdobas. <br>2. El valor en dólares será únicamente informativo. <br>3. El administrador podrá actualizar la tasa de conversión. <br>4. La modificación de la tasa no alterará importes históricos congelados. |

### Detalle RF-008

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Comprador |
| **Criterios de aceptación** | 1. Registrar nombre del taller, historia, rubro, dirección completa, horario y contactos o redes públicas. <br>2. Diferenciar los contactos públicos del teléfono privado utilizado para autenticación. <br>3. El perfil solo será público después de la aprobación del taller. <br>4. El artesano podrá actualizar la información pública de su taller. |

### Detalle RF-009

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador |
| **Criterios de aceptación** | 1. El comprador podrá seleccionar producto y cantidad. <br>2. Para producción por cantidad podrá indicar cantidad requerida y fecha solicitada. <br>3. Para personalización podrá indicar las características solicitadas. <br>4. Podrá agregar varios renglones del mismo taller. <br>5. El sistema impedirá mezclar productos de talleres diferentes. <br>6. La solicitud quedará pendiente de revisión por el artesano. <br>7. Los reintentos de envío no deberán crear solicitudes duplicadas. |

### Detalle RF-010

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. El servidor será la autoridad sobre los cambios de estado. <br>2. La producción, personalización o preparación no podrá comenzar hasta existir Pago confirmado. <br>3. El artesano podrá registrar una o varias entregas indicando fecha y cantidades por renglón. <br>4. El pedido pasará a Entregado únicamente cuando se hayan completado todas las cantidades acordadas. <br>5. El comprador podrá confirmar la recepción o registrar una discrepancia. <br>6. Una discrepancia no revertirá automáticamente la entrega ni el inventario. <br>7. Los pedidos parcialmente entregados podrán cerrarse conforme a RF-015. |

### Detalle RF-011

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. El pago se realizará después de que el comprador confirme la propuesta final. <br>2. El pago corresponderá al 100 % del total congelado. <br>3. El comprador podrá registrar método, referencia y comprobante. <br>4. Los estados serán: Pendiente de pago, Pago registrado, Pago observado, Pago confirmado y Pago no recibido. <br>5. El artesano confirmará manualmente la recepción de los fondos. <br>6. Un comprobante observado deberá registrar el motivo. <br>7. El comprador dispondrá de 48 horas para corregirlo. <br>8. Se conservará el historial de intentos y correcciones. |

### Detalle RF-012

| Campo original | Contenido |
|---|---|
| **Actores** | No aplica en V1 |
| **Criterios de aceptación** | No aplica en V1. |

### Detalle RF-013

| Campo original | Contenido |
|---|---|
| **Actores** | Administrador |
| **Criterios de aceptación** | 1. Aprobar o rechazar talleres. <br>2. Activar o desactivar cuentas autorizadas. <br>3. Moderar o despublicar productos. <br>4. Configurar la tasa de conversión. <br>5. Consultar información general, estados e importes de pedidos en modo de supervisión. <br>6. No podrá modificar acuerdos comerciales. <br>7. No podrá leer chats. <br>8. No podrá acceder a comprobantes de pago. |

### Detalle RF-014

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. Solo las partes del pedido podrán acceder a la conversación. <br>2. No existirá conversación durante la solicitud pendiente. <br>3. La conversación se habilitará desde la confirmación del pedido. <br>4. Al finalizar el pedido, el historial quedará en modo de solo lectura. <br>5. Los mensajes conservarán orden e historial. <br>6. El administrador no podrá acceder al contenido. |

### Detalle RF-015

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano, Sistema |
| **Criterios de aceptación** | 1. El comprador podrá cancelar mientras no haya confirmado la propuesta final. <br>2. Después de confirmarla no podrá cancelar unilateralmente. <br>3. Si transcurren 48 horas sin pago registrado, el sistema marcará el pedido como Vencido por falta de pago. <br>4. Al vencer se liberarán reservas no manipuladas. <br>5. El vencimiento no se ejecutará durante una revisión de pago o plazo de corrección vigente. <br>6. Antes de cualquier entrega, el artesano podrá cancelar por imposibilidad justificada. <br>7. Si existen fondos confirmados, se generará un reembolso. <br>8. Después de una entrega parcial, el cierre será iniciado por el artesano. <br>9. El comprador podrá aceptarlo u objetarlo. |

### Detalle RF-016

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. Modalidades mínimas: retiro en taller, punto de encuentro, entrega por el artesano y Otra. <br>2. Otra permitirá ingresar una descripción. <br>3. El artesano definirá manualmente el costo de entrega. <br>4. Para producción por cantidad, el comprador indicará fecha solicitada y el artesano establecerá fecha comprometida. <br>5. El comprador conocerá estas condiciones antes de confirmar. |

### Detalle RF-017

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Comprador |
| **Criterios de aceptación** | 1. En stock, el comprador seleccionará una cantidad disponible. <br>2. En producción por cantidad, indicará cantidad y fecha solicitada. <br>3. En personalización, podrá indicar atributos o cambios requeridos. <br>4. La personalización podrá fabricarse desde cero o utilizar una unidad estándar como base. <br>5. Un pedido podrá combinar varias modalidades. <br>6. Cada renglón conservará individualmente su modalidad. |

### Detalle RF-018

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. Todos los renglones deberán pertenecer al mismo taller. <br>2. Cada renglón podrá tener su propia modalidad. <br>3. El artesano resolverá individualmente cada renglón. <br>4. La propuesta final podrá excluir renglones rechazados. <br>5. El comprador aceptará o rechazará la propuesta como un conjunto. <br>6. El pago corresponderá al total definitivo. <br>7. Los renglones rechazados quedarán en el historial. |

### Detalle RF-019

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Administrador |
| **Criterios de aceptación** | 1. Un producto despublicado dejará de aparecer para nuevas solicitudes. <br>2. La despublicación no eliminará referencias históricas. <br>3. Los pedidos previos conservarán sus datos históricos. <br>4. La moderación administrativa deberá registrar actor y motivo. |

### Detalle RF-020

| Campo original | Contenido |
|---|---|
| **Actores** | Comprador, Artesano |
| **Criterios de aceptación** | 1. Notificar nuevas solicitudes. <br>2. Notificar propuesta lista para revisión. <br>3. Notificar aceptación o rechazo. <br>4. Notificar eventos de pago. <br>5. Notificar pedidos listos y entregas. <br>6. Notificar discrepancias. <br>7. Notificar cancelaciones, vencimientos y cierres parciales. <br>8. Notificar reembolsos. <br>9. Permitir marcar notificaciones como leídas. <br>10. Evitar duplicados. <br>11. Correo y WhatsApp quedan fuera de V1. |

### Detalle RF-021

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Comprador |
| **Criterios de aceptación** | 1. Crear reembolso total cuando un pedido pagado sea cancelado antes de cualquier entrega. <br>2. Crear reembolso parcial por cantidades no entregadas cuando corresponda. <br>3. Utilizar el desglose económico congelado para calcularlo. <br>4. Evitar obligaciones duplicadas. <br>5. Registrar fecha, importe y referencia de la devolución. <br>6. Manejar estados Pendiente y Realizado. <br>7. Notificar al comprador. |

### Detalle RF-022

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano, Sistema |
| **Criterios de aceptación** | 1. Registrar existencia inicial. <br>2. Registrar entradas posteriores. <br>3. Permitir ajustes positivos y negativos con motivo. <br>4. Impedir ajustes que reduzcan existencias por debajo de unidades comprometidas. <br>5. Calcular disponibilidad. <br>6. Revalidar stock antes de confirmar el pedido. <br>7. Reservar unidades de forma atómica. <br>8. No confirmar parcialmente si no existe cantidad suficiente. <br>9. Reservar no deberá disminuir la existencia física. <br>10. Descontar existencias al registrar entrega normal. <br>11. Consumir una unidad estándar cuando comience su personalización. <br>12. La producción bajo pedido no deberá incorporarse automáticamente a stock. <br>13. Liberar reservas no manipuladas al vencer o cancelar. <br>14. Clasificar como Reutilizable o Baja solo unidades manipuladas o de condición incierta. <br>15. Impedir cantidades negativas. |

### Detalle RF-023

| Campo original | Contenido |
|---|---|
| **Actores** | Artesano |
| **Criterios de aceptación** | 1. Mostrar existencia inicial, entradas, ajustes, reservas, liberaciones, consumos, reincorporaciones y bajas. <br>2. Mostrar fecha/hora, producto, tipo de operación, cantidad y referencia cuando corresponda. <br>3. Los movimientos históricos no podrán editarse directamente. <br>4. Una corrección deberá registrarse como un nuevo movimiento. <br>5. El artesano solo podrá consultar movimientos de su propio taller. |

### Detalle RF-024

| Campo original | Contenido |
|---|---|
| **Actores** | No aplica en V1 |
| **Criterios de aceptación** | No aplica en V1. Cuando se implemente, la información de costos deberá ser privada y no visible para compradores. |

### Detalle RNF-001

| Campo original | Contenido |
|---|---|
| **Categoría** | Usabilidad |
| **Criterios de aceptación** | 1. Los controles táctiles principales deberán tener un área mínima de **44 × 44 px**. <br>2. El registro de un producto deberá poder completarse en un máximo de **cinco pasos principales**. <br>3. Los estados importantes deberán comunicarse mediante texto y no exclusivamente mediante colores o iconos. <br>4. Los mensajes de validación deberán indicar de forma comprensible qué dato debe corregirse. |
| **Método de verificación** | Inspección de interfaces y pruebas funcionales de usabilidad. |

### Detalle RNF-002

| Campo original | Contenido |
|---|---|
| **Categoría** | Usabilidad / Compatibilidad |
| **Criterios de aceptación** | 1. Las interfaces deberán ser utilizables desde un ancho mínimo de **360 px**. <br>2. Los flujos principales no deberán requerir desplazamiento horizontal para ser utilizados. <br>3. Los formularios, tablas, botones y menús deberán adaptarse al tamaño disponible. <br>4. Las acciones principales deberán poder ejecutarse mediante interacción táctil. |
| **Método de verificación** | Pruebas de interfaz en resoluciones representativas de móvil, tableta y escritorio. |

### Detalle RNF-003

| Campo original | Contenido |
|---|---|
| **Categoría** | Eficiencia de desempeño |
| **Criterios de aceptación** | 1. El catálogo deberá estar utilizable en **≤3 segundos en el percentil 95**, utilizando hasta 500 productos y una conexión móvil 3G/4G controlada. <br>2. Inicio de sesión, ficha de producto, listado de pedidos y detalle de pedido deberán responder en **≤2 segundos en P95** con hasta 20 usuarios concurrentes. <br>3. Envío de solicitud, confirmación de propuesta, registro de pago y operaciones de inventario deberán responder en **≤3 segundos en P95**, excluyendo el tiempo de transferencia de archivos. <br>4. Los listados extensos deberán utilizar paginación o carga progresiva cuando corresponda. |
| **Método de verificación** | Pruebas controladas de rendimiento y carga. |

### Detalle RNF-004

| Campo original | Contenido |
|---|---|
| **Categoría** | Seguridad |
| **Criterios de aceptación** | 1. El tráfico deberá utilizar **HTTPS/TLS**. <br>2. Las contraseñas deberán almacenarse mediante un mecanismo de hash seguro. <br>3. Los permisos deberán verificarse según rol y pertenencia al recurso solicitado. <br>4. El sistema deberá aplicar protección contra CSRF cuando corresponda. <br>5. No se almacenarán números completos de tarjeta, CVV ni credenciales bancarias. <br>6. Chats y comprobantes de pago serán accesibles únicamente para comprador y artesano relacionados con el pedido. <br>7. El administrador no podrá acceder al contenido de chats ni comprobantes. |
| **Método de verificación** | Pruebas de autenticación, autorización, permisos y revisión de configuración de seguridad. |

### Detalle RNF-005

| Campo original | Contenido |
|---|---|
| **Categoría** | Restricción técnica / Mantenibilidad |
| **Criterios de aceptación** | 1. El frontend utilizará React y TypeScript. <br>2. El backend utilizará Django y Django REST Framework. <br>3. PostgreSQL será el sistema gestor de base de datos relacional. <br>4. Frontend y backend se comunicarán mediante API REST utilizando JSON. <br>5. El backend será la autoridad sobre permisos, estados, importes e inventario. <br>6. Las imágenes se almacenarán como archivos fuera de las filas de PostgreSQL, conservando en la base únicamente referencias y metadatos. <br>7. La transformación entre `camelCase` y `snake_case` deberá realizarse en la capa de acceso a datos sin trasladar reglas de negocio al frontend. |
| **Método de verificación** | Revisión de arquitectura, repositorios, configuración y código fuente. |

### Detalle RNF-006

| Campo original | Contenido |
|---|---|
| **Categoría** | Disponibilidad |
| **Criterios de aceptación** | 1. La disponibilidad mensual deberá ser de al menos **95 %**. <br>2. El estado del servicio deberá comprobarse automáticamente al menos cada **5 minutos** durante el período de evaluación. <br>3. Los mantenimientos programados comunicados con al menos **24 horas de anticipación** quedarán excluidos del cálculo de disponibilidad. |
| **Método de verificación** | Registros de monitoreo y cálculo mensual de disponibilidad. |

### Detalle RNF-007

| Campo original | Contenido |
|---|---|
| **Categoría** | Escalabilidad |
| **Criterios de aceptación** | 1. Soportar al menos **50 talleres activos**. <br>2. Soportar al menos **500 productos publicados**. <br>3. Los catálogos e historiales deberán utilizar paginación cuando el volumen de datos lo requiera. <br>4. La infraestructura deberá permitir ampliar capacidad de procesamiento, almacenamiento o base de datos sin modificar los contratos funcionales principales. |
| **Método de verificación** | Pruebas de carga y revisión de arquitectura. |

### Detalle RNF-008

| Campo original | Contenido |
|---|---|
| **Categoría** | Auditoría / Integridad |
| **Criterios de aceptación** | 1. Registrar usuario responsable cuando corresponda. <br>2. Registrar fecha y hora. <br>3. Registrar tipo de operación. <br>4. Registrar motivo cuando la operación lo requiera. <br>5. Registrar estado anterior y nuevo en los cambios de estado. <br>6. Registrar cantidades o importes afectados cuando corresponda. <br>7. Los eventos críticos deberán persistirse en la misma transacción que la operación que los origina. <br>8. Los registros históricos no podrán modificarse mediante operaciones ordinarias. |
| **Método de verificación** | Pruebas de auditoría, consultas de historial y validación transaccional. |

### Detalle RNF-009

| Campo original | Contenido |
|---|---|
| **Categoría** | Compatibilidad |
| **Criterios de aceptación** | 1. Compatibilidad con la última y penúltima versión estable disponible de **Google Chrome**. <br>2. Compatibilidad con la última y penúltima versión estable de **Mozilla Firefox**. <br>3. Compatibilidad con la última y penúltima versión estable de **Microsoft Edge**. <br>4. Los flujos móviles deberán validarse en Chrome Mobile y Safari móvil disponibles durante las pruebas. |
| **Método de verificación** | Ejecución de una matriz de pruebas en los navegadores definidos. |

### Detalle RNF-010

| Campo original | Contenido |
|---|---|
| **Categoría** | Rendimiento / Conectividad |
| **Criterios de aceptación** | 1. Un mensaje confirmado deberá mostrarse en la otra sesión en un plazo aproximado máximo de **15 segundos**. <br>2. La actualización deberá recuperar únicamente la información nueva necesaria. <br>3. Ningún mensaje confirmado deberá perderse u omitirse por concurrencia. <br>4. El orden de los mensajes deberá conservarse. |
| **Método de verificación** | Pruebas con dos sesiones concurrentes intercambiando mensajes. |

### Detalle RNF-011

| Campo original | Contenido |
|---|---|
| **Categoría** | Fiabilidad / Integridad |
| **Criterios de aceptación** | 1. Las operaciones críticas deberán utilizar transacciones ACID. <br>2. El stock deberá revalidarse antes de confirmar y reservar unidades. <br>3. No se podrán reservar más unidades de las disponibles. <br>4. Una entrega no podrá consumir dos veces las mismas unidades. <br>5. Una reserva no podrá liberarse más de una vez. <br>6. No se permitirán existencias negativas. <br>7. La confirmación de un pedido y su reserva deberán completarse conjuntamente o no completarse. <br>8. No deberán generarse movimientos de inventario duplicados por reintentos. |
| **Método de verificación** | Pruebas de concurrencia, transacciones y solicitudes simultáneas. |

### Detalle RNF-012

| Campo original | Contenido |
|---|---|
| **Categoría** | Continuidad |
| **Criterios de aceptación** | 1. Realizar un respaldo automático al menos cada **24 horas**. <br>2. Mantener una retención mínima de **14 días**. <br>3. Mantener un **RPO máximo de 24 horas**. <br>4. Mantener un **RTO objetivo de 8 horas**. <br>5. Ejecutar una prueba de restauración antes de la puesta en producción. <br>6. Realizar posteriormente una prueba de restauración al menos **una vez cada tres meses**. |
| **Método de verificación** | Revisión de respaldos almacenados y evidencia documentada de pruebas de restauración. |

### Detalle RNF-013

| Campo original | Contenido |
|---|---|
| **Categoría** | Privacidad |
| **Criterios de aceptación** | 1. La dirección completa del taller podrá mostrarse como parte de su perfil público. <br>2. El teléfono utilizado como credencial de acceso permanecerá privado salvo que el artesano decida utilizarlo también como contacto público. <br>3. Los comprobantes de pago serán privados entre comprador y artesano. <br>4. Los mensajes serán privados entre comprador y artesano correspondientes al pedido. <br>5. Los datos internos de usuarios no deberán exponerse públicamente por defecto. <br>6. El administrador no podrá acceder al contenido privado de chats o comprobantes. |
| **Método de verificación** | Pruebas de permisos, consulta de perfiles y revisión de datos expuestos por la API. |

### Detalle RNF-014

| Campo original | Contenido |
|---|---|
| **Categoría** | Fiabilidad |
| **Criterios de aceptación** | 1. Mostrar estados de carga, éxito y error durante las operaciones. <br>2. Permitir reintentos controlados cuando una operación falle. <br>3. Antes de repetir una operación cuyo resultado sea incierto, comprobar si ya fue registrada. <br>4. La protección contra duplicados deberá aplicarse desde el servidor. <br>5. Los reintentos no deberán duplicar solicitudes, confirmaciones de propuesta, pagos, entregas, ajustes de inventario ni reembolsos. |
| **Método de verificación** | Simulación de desconexiones, reintentos y pérdida temporal de respuesta del servidor. |

### Detalle RNF-015

| Campo original | Contenido |
|---|---|
| **Categoría** | Mantenibilidad |
| **Criterios de aceptación** | 1. El frontend no deberá ser la autoridad sobre reglas de negocio críticas. <br>2. Las reglas de pedidos, pagos, inventario, entregas y reembolsos deberán implementarse en servicios reutilizables del backend. <br>3. Las pruebas automatizadas deberán cubrir transiciones de estado. <br>4. Deberán cubrir permisos y control de acceso. <br>5. Deberán cubrir plazos de pago y corrección. <br>6. Deberán cubrir cálculos económicos relevantes. <br>7. Deberán cubrir idempotencia y concurrencia. <br>8. Los requisitos y sus pruebas deberán conservar identificadores que permitan trazabilidad. <br>9. El código fuente deberá administrarse mediante control de versiones. |
| **Método de verificación** | Revisión de código, servicios de dominio, repositorio y ejecución de la suite automatizada de pruebas. |

