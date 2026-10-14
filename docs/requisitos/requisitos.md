# Requisitos funcionales y no funcionales

**Proyecto:** ArtesaNic — comercialización de productos artesanales de las PYMEs de Masaya.

**Fuente vigente:** especificación y decisiones definitivas suministradas por el usuario en esta conversación el **12 de octubre de 2026** (America/Managua). Las fichas reproducen ese texto; la actualización es exclusivamente documental y no acredita implementación ni modifica aprobaciones históricas del equipo.

**Alcance V1: 21 RF activos y 15 RNF activos.** Se conservan las 24 fichas históricas RF y las 15 fichas RNF: RF-002 está integrado en RF-001 y RNF-005 y deja de ser RF independiente; RF-012 y RF-024 están postergados fuera de V1. Activo significa incluido en el alcance, no implementado.

Las reglas de negocio se consultan en el [catálogo RN-001 a RN-024](reglas-de-negocio.md). La correspondencia RN → RF/RNF se mantiene allí, fuera de las fichas, para respetar los campos y dependencias suministrados.

**Trazabilidad histórica:** [fichas del 8 de octubre](historico/fichas-2026-10-08.md), [especificación v2.1 y Anexo A](historico/especificacion-v2.1.md) y [revisión documental de esta actualización](../trazabilidad/actualizacion-requisitos-2026-10-12.md). Autores, versiones, responsables y estados anteriores se conservan en el histórico; no se trasladan como campos a estas fichas.

## Índice y alcance V1

| Identificador | Nombre | Alcance V1 |
|---|---|---|
| [RF-001](#rf-001) | Gestión de productos | Activo |
| [RF-002](#rf-002) | Gestión técnica de imágenes | Integrado; sin RF independiente |
| [RF-003](#rf-003) | Consulta, búsqueda y filtrado del catálogo | Activo |
| [RF-004](#rf-004) | Registro, autenticación y control de cuenta | Activo |
| [RF-005](#rf-005) | Revisión y propuesta de la solicitud | Activo |
| [RF-006](#rf-006) | Resumen económico y cotización del pedido | Activo |
| [RF-007](#rf-007) | Conversión informativa de divisas | Activo |
| [RF-008](#rf-008) | Perfil público del taller | Activo |
| [RF-009](#rf-009) | Creación y envío de solicitud | Activo |
| [RF-010](#rf-010) | Gestión del ciclo de vida del pedido | Activo |
| [RF-011](#rf-011) | Registro y confirmación de pago externo | Activo |
| [RF-012](#rf-012) | Pasarela de pago | Postergado; fuera de V1 |
| [RF-013](#rf-013) | Administración de la plataforma | Activo |
| [RF-014](#rf-014) | Mensajería asociada al pedido | Activo |
| [RF-015](#rf-015) | Cancelación, vencimiento y cierre parcial | Activo |
| [RF-016](#rf-016) | Modalidad y plan de entrega | Activo |
| [RF-017](#rf-017) | Modalidades de cumplimiento del producto | Activo |
| [RF-018](#rf-018) | Pedido de varios productos de un mismo taller | Activo |
| [RF-019](#rf-019) | Despublicación y moderación de productos | Activo |
| [RF-020](#rf-020) | Notificaciones internas | Activo |
| [RF-021](#rf-021) | Registro y seguimiento de reembolsos externos | Activo |
| [RF-022](#rf-022) | Control de existencias, disponibilidad y reservas | Activo |
| [RF-023](#rf-023) | Consulta del historial de movimientos de inventario | Activo |
| [RF-024](#rf-024) | Costos y valorización del inventario | Postergado; fuera de V1 |
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

| Campo | Contenido |
|---|---|
| **Nombre** | Gestión de productos |
| **Actores** | Artesano |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir al artesano aprobado registrar y editar productos indicando fotografía principal, nombre, precio, categoría, descripción y las modalidades de venta disponibles. |
| **Criterios de aceptación** | 1. El artesano podrá registrar fotografía principal, nombre, precio, categoría y descripción. <br>2. Podrá indicar si el producto admite venta desde stock, producción por cantidad, personalización o una combinación de estas modalidades. <br>3. Los campos obligatorios deberán validarse antes de guardar. <br>4. Las modificaciones posteriores del producto no deberán alterar las condiciones ni importes de pedidos previamente confirmados. |
| **Dependencias** | RNF-001, RNF-003, RNF-005 |

## RF-002

| Campo | Contenido |
|---|---|
| **Nombre** | Gestión técnica de imágenes |
| **Actores** | No aplica |
| **Prioridad** | No aplica |
| **Descripción** | Este requisito deja de utilizarse como requisito funcional independiente. La carga de imágenes se integra en RF-001 y las condiciones técnicas de validación, optimización y almacenamiento se trasladan a RNF-005. |
| **Criterios de aceptación** | No aplica como requisito funcional independiente. |
| **Dependencias** | RF-001, RNF-005 |

## RF-003

| Campo | Contenido |
|---|---|
| **Nombre** | Consulta, búsqueda y filtrado del catálogo |
| **Actores** | Comprador |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir al comprador consultar el catálogo público de productos pertenecientes a talleres aprobados, realizar búsquedas, aplicar filtros y ordenar los resultados. |
| **Criterios de aceptación** | 1. Mostrar únicamente productos publicados pertenecientes a talleres aprobados. <br>2. Permitir búsqueda por nombre. <br>3. Permitir filtros por categoría, rango de precio y taller. <br>4. Permitir ordenar por fecha, precio y nombre. <br>5. Presentar los resultados mediante paginación. <br>6. Permitir acceder al perfil público del taller desde el producto. |
| **Dependencias** | RF-001, RF-008, RNF-003, RNF-007 |

## RF-004

| Campo | Contenido |
|---|---|
| **Nombre** | Registro, autenticación y control de cuenta |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir registrar y autenticar compradores y artesanos mediante teléfono y contraseña, manteniendo un único rol por cuenta. |
| **Criterios de aceptación** | 1. El usuario podrá registrarse como Comprador o Artesano. <br>2. Cada cuenta tendrá un único rol. <br>3. El rol Administrador no podrá seleccionarse en el registro público. <br>4. El comprador podrá utilizar su cuenta una vez completado el registro. <br>5. La cuenta del artesano permanecerá bloqueada hasta que el administrador apruebe el taller. <br>6. El artesano no aprobado no podrá acceder a las funciones operativas de la plataforma. <br>7. Los usuarios habilitados podrán iniciar y cerrar sesión. <br>8. Podrán consultar y actualizar sus datos personales permitidos. |
| **Dependencias** | RF-013, RNF-004, RNF-013 |

## RF-005

| Campo | Contenido |
|---|---|
| **Nombre** | Revisión y propuesta de la solicitud |
| **Actores** | Artesano, Comprador |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá permitir al artesano revisar individualmente los renglones de una solicitud, aceptar o rechazar cada uno y presentar al comprador una propuesta final con los renglones aceptados y las condiciones comerciales correspondientes. |
| **Criterios de aceptación** | 1. El artesano deberá resolver cada renglón como Aceptado o Rechazado. <br>2. Todo renglón rechazado deberá incluir un motivo. <br>3. En V1 no se permitirán contraofertas de cantidad. <br>4. Los renglones rechazados permanecerán registrados en el historial. <br>5. El sistema generará una propuesta final con los renglones aceptados. <br>6. El comprador podrá aceptar o rechazar la propuesta completa. <br>7. Si la rechaza, no se generará un pedido confirmado. <br>8. Si la acepta, se confirmará el pedido y se aplicarán las reservas y condiciones económicas correspondientes. |
| **Dependencias** | RF-006, RF-009, RF-016, RF-017, RF-018, RF-022 |

## RF-006

| Campo | Contenido |
|---|---|
| **Nombre** | Resumen económico y cotización del pedido |
| **Actores** | Artesano, Comprador |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá presentar el desglose económico de la propuesta antes de la confirmación del comprador y conservar los importes acordados una vez confirmada. |
| **Criterios de aceptación** | 1. Mostrar producto, modalidad, cantidad, precio unitario y subtotal por renglón. <br>2. Mostrar cargos de personalización, entrega y otros servicios cuando correspondan. <br>3. El artesano deberá registrar manualmente el costo de entrega. <br>4. Los cargos deberán quedar suficientemente desglosados para permitir cálculos de reembolso posteriores. <br>5. El comprador podrá revisar la cotización antes de aceptarla. <br>6. Al confirmar la propuesta, el sistema congelará el total y su desglose. <br>7. Modificaciones posteriores del catálogo no alterarán los importes históricos del pedido. |
| **Dependencias** | RF-005, RF-016, RF-018, RF-021 |

## RF-007

| Campo | Contenido |
|---|---|
| **Nombre** | Conversión informativa de divisas |
| **Actores** | Comprador, Administrador |
| **Prioridad** | Media |
| **Descripción** | El sistema deberá mostrar los precios en córdobas y permitir una conversión informativa a dólares mediante una tasa configurada por el administrador. |
| **Criterios de aceptación** | 1. Los importes contractuales se conservarán en córdobas. <br>2. El valor en dólares será únicamente informativo. <br>3. El administrador podrá actualizar la tasa de conversión. <br>4. La modificación de la tasa no alterará importes históricos congelados. |
| **Dependencias** | RF-013 |

## RF-008

| Campo | Contenido |
|---|---|
| **Nombre** | Perfil público del taller |
| **Actores** | Artesano, Comprador |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir al artesano administrar un perfil público de su taller y al comprador consultarlo desde el catálogo y los pedidos. |
| **Criterios de aceptación** | 1. Registrar nombre del taller, historia, rubro, dirección completa, horario y contactos o redes públicas. <br>2. Diferenciar los contactos públicos del teléfono privado utilizado para autenticación. <br>3. El perfil solo será público después de la aprobación del taller. <br>4. El artesano podrá actualizar la información pública de su taller. |
| **Dependencias** | RF-004, RF-013, RNF-013 |

## RF-009

| Campo | Contenido |
|---|---|
| **Nombre** | Creación y envío de solicitud |
| **Actores** | Comprador |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá permitir al comprador preparar y enviar una solicitud de pedido con uno o varios productos pertenecientes al mismo taller. |
| **Criterios de aceptación** | 1. El comprador podrá seleccionar producto y cantidad. <br>2. Para producción por cantidad podrá indicar cantidad requerida y fecha solicitada. <br>3. Para personalización podrá indicar las características solicitadas. <br>4. Podrá agregar varios renglones del mismo taller. <br>5. El sistema impedirá mezclar productos de talleres diferentes. <br>6. La solicitud quedará pendiente de revisión por el artesano. <br>7. Los reintentos de envío no deberán crear solicitudes duplicadas. |
| **Dependencias** | RF-001, RF-004, RF-017, RF-018, RNF-014 |

## RF-010

| Campo | Contenido |
|---|---|
| **Nombre** | Gestión del ciclo de vida del pedido |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá controlar los estados y transiciones del pedido desde la confirmación de la propuesta hasta su entrega, cancelación, vencimiento o cierre parcial. |
| **Criterios de aceptación** | 1. El servidor será la autoridad sobre los cambios de estado. <br>2. La producción, personalización o preparación no podrá comenzar hasta existir Pago confirmado. <br>3. El artesano podrá registrar una o varias entregas indicando fecha y cantidades por renglón. <br>4. El pedido pasará a Entregado únicamente cuando se hayan completado todas las cantidades acordadas. <br>5. El comprador podrá confirmar la recepción o registrar una discrepancia. <br>6. Una discrepancia no revertirá automáticamente la entrega ni el inventario. <br>7. Los pedidos parcialmente entregados podrán cerrarse conforme a RF-015. |
| **Dependencias** | RF-005, RF-011, RF-015, RF-017, RF-022 |

## RF-011

| Campo | Contenido |
|---|---|
| **Nombre** | Registro y confirmación de pago externo |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá permitir al comprador registrar un pago realizado fuera de la plataforma por el total confirmado del pedido y al artesano verificar manualmente la recepción de los fondos. |
| **Criterios de aceptación** | 1. El pago se realizará después de que el comprador confirme la propuesta final. <br>2. El pago corresponderá al 100 % del total congelado. <br>3. El comprador podrá registrar método, referencia y comprobante. <br>4. Los estados serán: Pendiente de pago, Pago registrado, Pago observado, Pago confirmado y Pago no recibido. <br>5. El artesano confirmará manualmente la recepción de los fondos. <br>6. Un comprobante observado deberá registrar el motivo. <br>7. El comprador dispondrá de 48 horas para corregirlo. <br>8. Se conservará el historial de intentos y correcciones. |
| **Dependencias** | RF-005, RF-006, RF-015, RF-021, RNF-004 |

## RF-012

| Campo | Contenido |
|---|---|
| **Nombre** | Pasarela de pago |
| **Actores** | No aplica en V1 |
| **Prioridad** | Postergado |
| **Descripción** | La integración de una pasarela que procese pagos electrónicamente queda fuera del alcance de V1. La plataforma únicamente registrará y verificará pagos realizados externamente. |
| **Criterios de aceptación** | No aplica en V1. |
| **Dependencias** | RF-011 |

## RF-013

| Campo | Contenido |
|---|---|
| **Nombre** | Administración de la plataforma |
| **Actores** | Administrador |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá proporcionar al administrador funciones de aprobación, configuración, moderación y supervisión de la plataforma. |
| **Criterios de aceptación** | 1. Aprobar o rechazar talleres. <br>2. Activar o desactivar cuentas autorizadas. <br>3. Moderar o despublicar productos. <br>4. Configurar la tasa de conversión. <br>5. Consultar información general, estados e importes de pedidos en modo de supervisión. <br>6. No podrá modificar acuerdos comerciales. <br>7. No podrá leer chats. <br>8. No podrá acceder a comprobantes de pago. |
| **Dependencias** | RF-004, RF-007, RF-019, RNF-004, RNF-013 |

## RF-014

| Campo | Contenido |
|---|---|
| **Nombre** | Mensajería asociada al pedido |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir al comprador y al artesano intercambiar mensajes de texto asociados exclusivamente a un pedido confirmado. |
| **Criterios de aceptación** | 1. Solo las partes del pedido podrán acceder a la conversación. <br>2. No existirá conversación durante la solicitud pendiente. <br>3. La conversación se habilitará desde la confirmación del pedido. <br>4. Al finalizar el pedido, el historial quedará en modo de solo lectura. <br>5. Los mensajes conservarán orden e historial. <br>6. El administrador no podrá acceder al contenido. |
| **Dependencias** | RF-005, RF-010, RNF-004, RNF-010 |

## RF-015

| Campo | Contenido |
|---|---|
| **Nombre** | Cancelación, vencimiento y cierre parcial |
| **Actores** | Comprador, Artesano, Sistema |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá gestionar la cancelación de solicitudes, el vencimiento por falta de pago y el cierre parcial de pedidos que no puedan completarse. |
| **Criterios de aceptación** | 1. El comprador podrá cancelar mientras no haya confirmado la propuesta final. <br>2. Después de confirmarla no podrá cancelar unilateralmente. <br>3. Si transcurren 48 horas sin pago registrado, el sistema marcará el pedido como Vencido por falta de pago. <br>4. Al vencer se liberarán reservas no manipuladas. <br>5. El vencimiento no se ejecutará durante una revisión de pago o plazo de corrección vigente. <br>6. Antes de cualquier entrega, el artesano podrá cancelar por imposibilidad justificada. <br>7. Si existen fondos confirmados, se generará un reembolso. <br>8. Después de una entrega parcial, el cierre será iniciado por el artesano. <br>9. El comprador podrá aceptarlo u objetarlo. |
| **Dependencias** | RF-010, RF-011, RF-021, RF-022 |

## RF-016

| Campo | Contenido |
|---|---|
| **Nombre** | Modalidad y plan de entrega |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Media |
| **Descripción** | El sistema deberá permitir al comprador indicar una modalidad preferida de entrega y al artesano establecer el plan y costo de entrega como parte de su propuesta. |
| **Criterios de aceptación** | 1. Modalidades mínimas: retiro en taller, punto de encuentro, entrega por el artesano y Otra. <br>2. Otra permitirá ingresar una descripción. <br>3. El artesano definirá manualmente el costo de entrega. <br>4. Para producción por cantidad, el comprador indicará fecha solicitada y el artesano establecerá fecha comprometida. <br>5. El comprador conocerá estas condiciones antes de confirmar. |
| **Dependencias** | RF-005, RF-006, RF-009, RF-014 |

## RF-017

| Campo | Contenido |
|---|---|
| **Nombre** | Modalidades de cumplimiento del producto |
| **Actores** | Artesano, Comprador |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá admitir productos vendidos desde stock, producción por cantidad, personalización de producto y pedidos mixtos. |
| **Criterios de aceptación** | 1. En stock, el comprador seleccionará una cantidad disponible. <br>2. En producción por cantidad, indicará cantidad y fecha solicitada. <br>3. En personalización, podrá indicar atributos o cambios requeridos. <br>4. La personalización podrá fabricarse desde cero o utilizar una unidad estándar como base. <br>5. Un pedido podrá combinar varias modalidades. <br>6. Cada renglón conservará individualmente su modalidad. |
| **Dependencias** | RF-001, RF-005, RF-009, RF-022 |

## RF-018

| Campo | Contenido |
|---|---|
| **Nombre** | Pedido de varios productos de un mismo taller |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá permitir que una solicitud contenga varios renglones de productos pertenecientes a un mismo taller. |
| **Criterios de aceptación** | 1. Todos los renglones deberán pertenecer al mismo taller. <br>2. Cada renglón podrá tener su propia modalidad. <br>3. El artesano resolverá individualmente cada renglón. <br>4. La propuesta final podrá excluir renglones rechazados. <br>5. El comprador aceptará o rechazará la propuesta como un conjunto. <br>6. El pago corresponderá al total definitivo. <br>7. Los renglones rechazados quedarán en el historial. |
| **Dependencias** | RF-005, RF-006, RF-009, RF-017 |

## RF-019

| Campo | Contenido |
|---|---|
| **Nombre** | Despublicación y moderación de productos |
| **Actores** | Artesano, Administrador |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir al artesano despublicar sus productos y al administrador moderar publicaciones conservando las referencias históricas. |
| **Criterios de aceptación** | 1. Un producto despublicado dejará de aparecer para nuevas solicitudes. <br>2. La despublicación no eliminará referencias históricas. <br>3. Los pedidos previos conservarán sus datos históricos. <br>4. La moderación administrativa deberá registrar actor y motivo. |
| **Dependencias** | RF-001, RF-013, RNF-008 |

## RF-020

| Campo | Contenido |
|---|---|
| **Nombre** | Notificaciones internas |
| **Actores** | Comprador, Artesano |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá generar notificaciones internas persistentes para los eventos relevantes de solicitudes, pedidos, pagos, entregas, cancelaciones, cierres y reembolsos. |
| **Criterios de aceptación** | 1. Notificar nuevas solicitudes. <br>2. Notificar propuesta lista para revisión. <br>3. Notificar aceptación o rechazo. <br>4. Notificar eventos de pago. <br>5. Notificar pedidos listos y entregas. <br>6. Notificar discrepancias. <br>7. Notificar cancelaciones, vencimientos y cierres parciales. <br>8. Notificar reembolsos. <br>9. Permitir marcar notificaciones como leídas. <br>10. Evitar duplicados. <br>11. Correo y WhatsApp quedan fuera de V1. |
| **Dependencias** | RF-005, RF-010, RF-011, RF-015, RF-021 |

## RF-021

| Campo | Contenido |
|---|---|
| **Nombre** | Registro y seguimiento de reembolsos externos |
| **Actores** | Artesano, Comprador |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá registrar las obligaciones de reembolso originadas por cancelaciones o cierres parciales y permitir al artesano registrar la devolución realizada externamente. |
| **Criterios de aceptación** | 1. Crear reembolso total cuando un pedido pagado sea cancelado antes de cualquier entrega. <br>2. Crear reembolso parcial por cantidades no entregadas cuando corresponda. <br>3. Utilizar el desglose económico congelado para calcularlo. <br>4. Evitar obligaciones duplicadas. <br>5. Registrar fecha, importe y referencia de la devolución. <br>6. Manejar estados Pendiente y Realizado. <br>7. Notificar al comprador. |
| **Dependencias** | RF-006, RF-011, RF-015 |

## RF-022

| Campo | Contenido |
|---|---|
| **Nombre** | Control de existencias, disponibilidad y reservas |
| **Actores** | Artesano, Sistema |
| **Prioridad** | Crítica |
| **Descripción** | El sistema deberá controlar las existencias físicas, reservas y disponibilidad de productos estándar, manteniendo consistencia entre inventario y pedidos. |
| **Criterios de aceptación** | 1. Registrar existencia inicial. <br>2. Registrar entradas posteriores. <br>3. Permitir ajustes positivos y negativos con motivo. <br>4. Impedir ajustes que reduzcan existencias por debajo de unidades comprometidas. <br>5. Calcular disponibilidad. <br>6. Revalidar stock antes de confirmar el pedido. <br>7. Reservar unidades de forma atómica. <br>8. No confirmar parcialmente si no existe cantidad suficiente. <br>9. Reservar no deberá disminuir la existencia física. <br>10. Descontar existencias al registrar entrega normal. <br>11. Consumir una unidad estándar cuando comience su personalización. <br>12. La producción bajo pedido no deberá incorporarse automáticamente a stock. <br>13. Liberar reservas no manipuladas al vencer o cancelar. <br>14. Clasificar como Reutilizable o Baja solo unidades manipuladas o de condición incierta. <br>15. Impedir cantidades negativas. |
| **Dependencias** | RF-005, RF-010, RF-015, RF-017, RF-023, RNF-011 |

## RF-023

| Campo | Contenido |
|---|---|
| **Nombre** | Consulta del historial de movimientos de inventario |
| **Actores** | Artesano |
| **Prioridad** | Alta |
| **Descripción** | El sistema deberá permitir al artesano consultar el historial de movimientos que hayan afectado el inventario de sus productos estándar. |
| **Criterios de aceptación** | 1. Mostrar existencia inicial, entradas, ajustes, reservas, liberaciones, consumos, reincorporaciones y bajas. <br>2. Mostrar fecha/hora, producto, tipo de operación, cantidad y referencia cuando corresponda. <br>3. Los movimientos históricos no podrán editarse directamente. <br>4. Una corrección deberá registrarse como un nuevo movimiento. <br>5. El artesano solo podrá consultar movimientos de su propio taller. |
| **Dependencias** | RF-022, RNF-008 |

## RF-024

| Campo | Contenido |
|---|---|
| **Nombre** | Costos y valorización del inventario |
| **Actores** | No aplica en V1 |
| **Prioridad** | Postergado |
| **Descripción** | El cálculo de costo promedio ponderado, valorización de existencias y márgenes queda fuera del alcance de V1. |
| **Criterios de aceptación** | No aplica en V1. Cuando se implemente, la información de costos deberá ser privada y no visible para compradores. |
| **Dependencias** | RF-022, RF-023 |

## Requisitos no funcionales

## RNF-001

| Campo | Contenido |
|---|---|
| **Nombre** | Usabilidad |
| **Categoría** | Usabilidad |
| **Prioridad** | Alta |
| **Descripción** | La plataforma deberá presentar interfaces comprensibles, consistentes y simplificadas que faciliten el uso de las funciones principales por parte de compradores y artesanos. |
| **Criterios de aceptación** | 1. Los controles táctiles principales deberán tener un área mínima de **44 × 44 px**. <br>2. El registro de un producto deberá poder completarse en un máximo de **cinco pasos principales**. <br>3. Los estados importantes deberán comunicarse mediante texto y no exclusivamente mediante colores o iconos. <br>4. Los mensajes de validación deberán indicar de forma comprensible qué dato debe corregirse. |
| **Método de verificación** | Inspección de interfaces y pruebas funcionales de usabilidad. |
| **Dependencias** | RF-001, RF-003, RF-004, RF-009 |

## RNF-002

| Campo | Contenido |
|---|---|
| **Nombre** | Diseño responsivo |
| **Categoría** | Usabilidad / Compatibilidad |
| **Prioridad** | Alta |
| **Descripción** | La plataforma deberá adaptar sus interfaces esenciales a dispositivos móviles, tabletas y computadoras sin impedir el acceso a las funciones principales. |
| **Criterios de aceptación** | 1. Las interfaces deberán ser utilizables desde un ancho mínimo de **360 px**. <br>2. Los flujos principales no deberán requerir desplazamiento horizontal para ser utilizados. <br>3. Los formularios, tablas, botones y menús deberán adaptarse al tamaño disponible. <br>4. Las acciones principales deberán poder ejecutarse mediante interacción táctil. |
| **Método de verificación** | Pruebas de interfaz en resoluciones representativas de móvil, tableta y escritorio. |
| **Dependencias** | RF-001, RF-003, RF-004, RF-009, RF-010 |

## RNF-003

| Campo | Contenido |
|---|---|
| **Nombre** | Desempeño |
| **Categoría** | Eficiencia de desempeño |
| **Prioridad** | Alta |
| **Descripción** | La plataforma deberá mantener tiempos de respuesta adecuados para las operaciones principales dentro del volumen previsto para la primera versión. |
| **Criterios de aceptación** | 1. El catálogo deberá estar utilizable en **≤3 segundos en el percentil 95**, utilizando hasta 500 productos y una conexión móvil 3G/4G controlada. <br>2. Inicio de sesión, ficha de producto, listado de pedidos y detalle de pedido deberán responder en **≤2 segundos en P95** con hasta 20 usuarios concurrentes. <br>3. Envío de solicitud, confirmación de propuesta, registro de pago y operaciones de inventario deberán responder en **≤3 segundos en P95**, excluyendo el tiempo de transferencia de archivos. <br>4. Los listados extensos deberán utilizar paginación o carga progresiva cuando corresponda. |
| **Método de verificación** | Pruebas controladas de rendimiento y carga. |
| **Dependencias** | RF-003, RF-004, RF-009, RF-010, RF-011, RF-022 |

## RNF-004

| Campo | Contenido |
|---|---|
| **Nombre** | Seguridad y control de acceso |
| **Categoría** | Seguridad |
| **Prioridad** | Crítica |
| **Descripción** | La plataforma deberá proteger las credenciales, los datos y las operaciones mediante mecanismos de autenticación, autorización y control de acceso aplicados desde el servidor. |
| **Criterios de aceptación** | 1. El tráfico deberá utilizar **HTTPS/TLS**. <br>2. Las contraseñas deberán almacenarse mediante un mecanismo de hash seguro. <br>3. Los permisos deberán verificarse según rol y pertenencia al recurso solicitado. <br>4. El sistema deberá aplicar protección contra CSRF cuando corresponda. <br>5. No se almacenarán números completos de tarjeta, CVV ni credenciales bancarias. <br>6. Chats y comprobantes de pago serán accesibles únicamente para comprador y artesano relacionados con el pedido. <br>7. El administrador no podrá acceder al contenido de chats ni comprobantes. |
| **Método de verificación** | Pruebas de autenticación, autorización, permisos y revisión de configuración de seguridad. |
| **Dependencias** | RF-004, RF-011, RF-013, RF-014 |

## RNF-005

| Campo | Contenido |
|---|---|
| **Nombre** | Arquitectura, interoperabilidad y almacenamiento |
| **Categoría** | Restricción técnica / Mantenibilidad |
| **Prioridad** | Alta |
| **Descripción** | La solución deberá mantener una arquitectura desacoplada entre interfaz, lógica de negocio y datos, utilizando contratos de comunicación definidos. |
| **Criterios de aceptación** | 1. El frontend utilizará React y TypeScript. <br>2. El backend utilizará Django y Django REST Framework. <br>3. PostgreSQL será el sistema gestor de base de datos relacional. <br>4. Frontend y backend se comunicarán mediante API REST utilizando JSON. <br>5. El backend será la autoridad sobre permisos, estados, importes e inventario. <br>6. Las imágenes se almacenarán como archivos fuera de las filas de PostgreSQL, conservando en la base únicamente referencias y metadatos. <br>7. La transformación entre `camelCase` y `snake_case` deberá realizarse en la capa de acceso a datos sin trasladar reglas de negocio al frontend. |
| **Método de verificación** | Revisión de arquitectura, repositorios, configuración y código fuente. |
| **Dependencias** | RF-001, RF-010, RF-022 |

## RNF-006

| Campo | Contenido |
|---|---|
| **Nombre** | Disponibilidad |
| **Categoría** | Disponibilidad |
| **Prioridad** | Media |
| **Descripción** | Durante el período formal de evaluación, la plataforma deberá mantener un nivel mínimo de disponibilidad del servicio. |
| **Criterios de aceptación** | 1. La disponibilidad mensual deberá ser de al menos **95 %**. <br>2. El estado del servicio deberá comprobarse automáticamente al menos cada **5 minutos** durante el período de evaluación. <br>3. Los mantenimientos programados comunicados con al menos **24 horas de anticipación** quedarán excluidos del cálculo de disponibilidad. |
| **Método de verificación** | Registros de monitoreo y cálculo mensual de disponibilidad. |
| **Dependencias** | RNF-012 |

## RNF-007

| Campo | Contenido |
|---|---|
| **Nombre** | Capacidad y escalabilidad |
| **Categoría** | Escalabilidad |
| **Prioridad** | Media |
| **Descripción** | La primera versión deberá soportar el volumen inicial previsto y permitir el crecimiento de la infraestructura sin rediseñar los flujos funcionales principales. |
| **Criterios de aceptación** | 1. Soportar al menos **50 talleres activos**. <br>2. Soportar al menos **500 productos publicados**. <br>3. Los catálogos e historiales deberán utilizar paginación cuando el volumen de datos lo requiera. <br>4. La infraestructura deberá permitir ampliar capacidad de procesamiento, almacenamiento o base de datos sin modificar los contratos funcionales principales. |
| **Método de verificación** | Pruebas de carga y revisión de arquitectura. |
| **Dependencias** | RF-003, RF-018, RF-022, RNF-003 |

## RNF-008

| Campo | Contenido |
|---|---|
| **Nombre** | Trazabilidad |
| **Categoría** | Auditoría / Integridad |
| **Prioridad** | Alta |
| **Descripción** | Las operaciones críticas deberán conservar evidencia suficiente para identificar qué ocurrió, cuándo ocurrió y quién fue responsable. |
| **Criterios de aceptación** | 1. Registrar usuario responsable cuando corresponda. <br>2. Registrar fecha y hora. <br>3. Registrar tipo de operación. <br>4. Registrar motivo cuando la operación lo requiera. <br>5. Registrar estado anterior y nuevo en los cambios de estado. <br>6. Registrar cantidades o importes afectados cuando corresponda. <br>7. Los eventos críticos deberán persistirse en la misma transacción que la operación que los origina. <br>8. Los registros históricos no podrán modificarse mediante operaciones ordinarias. |
| **Método de verificación** | Pruebas de auditoría, consultas de historial y validación transaccional. |
| **Dependencias** | RF-010, RF-011, RF-015, RF-019, RF-021, RF-022, RF-023 |

## RNF-009

| Campo | Contenido |
|---|---|
| **Nombre** | Compatibilidad de navegadores |
| **Categoría** | Compatibilidad |
| **Prioridad** | Media |
| **Descripción** | Los flujos esenciales de la plataforma deberán funcionar correctamente en los navegadores definidos como soportados. |
| **Criterios de aceptación** | 1. Compatibilidad con la última y penúltima versión estable disponible de **Google Chrome**. <br>2. Compatibilidad con la última y penúltima versión estable de **Mozilla Firefox**. <br>3. Compatibilidad con la última y penúltima versión estable de **Microsoft Edge**. <br>4. Los flujos móviles deberán validarse en Chrome Mobile y Safari móvil disponibles durante las pruebas. |
| **Método de verificación** | Ejecución de una matriz de pruebas en los navegadores definidos. |
| **Dependencias** | RNF-001, RNF-002 |

## RNF-010

| Campo | Contenido |
|---|---|
| **Nombre** | Actualización de mensajería |
| **Categoría** | Rendimiento / Conectividad |
| **Prioridad** | Media |
| **Descripción** | Mientras una conversación esté activa, los mensajes nuevos deberán mostrarse sin requerir que el usuario recargue manualmente la página. |
| **Criterios de aceptación** | 1. Un mensaje confirmado deberá mostrarse en la otra sesión en un plazo aproximado máximo de **15 segundos**. <br>2. La actualización deberá recuperar únicamente la información nueva necesaria. <br>3. Ningún mensaje confirmado deberá perderse u omitirse por concurrencia. <br>4. El orden de los mensajes deberá conservarse. |
| **Método de verificación** | Pruebas con dos sesiones concurrentes intercambiando mensajes. |
| **Dependencias** | RF-014, RNF-011 |

## RNF-011

| Campo | Contenido |
|---|---|
| **Nombre** | Integridad transaccional y concurrencia |
| **Categoría** | Fiabilidad / Integridad |
| **Prioridad** | Crítica |
| **Descripción** | Las operaciones simultáneas sobre pedidos, pagos e inventario deberán conservar la consistencia de la información y evitar efectos duplicados. |
| **Criterios de aceptación** | 1. Las operaciones críticas deberán utilizar transacciones ACID. <br>2. El stock deberá revalidarse antes de confirmar y reservar unidades. <br>3. No se podrán reservar más unidades de las disponibles. <br>4. Una entrega no podrá consumir dos veces las mismas unidades. <br>5. Una reserva no podrá liberarse más de una vez. <br>6. No se permitirán existencias negativas. <br>7. La confirmación de un pedido y su reserva deberán completarse conjuntamente o no completarse. <br>8. No deberán generarse movimientos de inventario duplicados por reintentos. |
| **Método de verificación** | Pruebas de concurrencia, transacciones y solicitudes simultáneas. |
| **Dependencias** | RF-005, RF-010, RF-011, RF-015, RF-021, RF-022 |

## RNF-012

| Campo | Contenido |
|---|---|
| **Nombre** | Respaldo y recuperación |
| **Categoría** | Continuidad |
| **Prioridad** | Alta |
| **Descripción** | La información persistente de la plataforma deberá contar con mecanismos automáticos de respaldo y procedimientos comprobados de restauración. |
| **Criterios de aceptación** | 1. Realizar un respaldo automático al menos cada **24 horas**. <br>2. Mantener una retención mínima de **14 días**. <br>3. Mantener un **RPO máximo de 24 horas**. <br>4. Mantener un **RTO objetivo de 8 horas**. <br>5. Ejecutar una prueba de restauración antes de la puesta en producción. <br>6. Realizar posteriormente una prueba de restauración al menos **una vez cada tres meses**. |
| **Método de verificación** | Revisión de respaldos almacenados y evidencia documentada de pruebas de restauración. |
| **Dependencias** | RNF-006 |

## RNF-013

| Campo | Contenido |
|---|---|
| **Nombre** | Privacidad y minimización de datos |
| **Categoría** | Privacidad |
| **Prioridad** | Alta |
| **Descripción** | La plataforma deberá recopilar y mostrar únicamente los datos necesarios para cada función y aplicar niveles de visibilidad según la finalidad de la información. |
| **Criterios de aceptación** | 1. La dirección completa del taller podrá mostrarse como parte de su perfil público. <br>2. El teléfono utilizado como credencial de acceso permanecerá privado salvo que el artesano decida utilizarlo también como contacto público. <br>3. Los comprobantes de pago serán privados entre comprador y artesano. <br>4. Los mensajes serán privados entre comprador y artesano correspondientes al pedido. <br>5. Los datos internos de usuarios no deberán exponerse públicamente por defecto. <br>6. El administrador no podrá acceder al contenido privado de chats o comprobantes. |
| **Método de verificación** | Pruebas de permisos, consulta de perfiles y revisión de datos expuestos por la API. |
| **Dependencias** | RF-004, RF-008, RF-011, RF-013, RF-014 |

## RNF-014

| Campo | Contenido |
|---|---|
| **Nombre** | Resiliencia ante conectividad inestable |
| **Categoría** | Fiabilidad |
| **Prioridad** | Alta |
| **Descripción** | La plataforma deberá manejar interrupciones de conectividad y reintentos sin generar operaciones duplicadas ni dejar al usuario sin información sobre el resultado de una acción. |
| **Criterios de aceptación** | 1. Mostrar estados de carga, éxito y error durante las operaciones. <br>2. Permitir reintentos controlados cuando una operación falle. <br>3. Antes de repetir una operación cuyo resultado sea incierto, comprobar si ya fue registrada. <br>4. La protección contra duplicados deberá aplicarse desde el servidor. <br>5. Los reintentos no deberán duplicar solicitudes, confirmaciones de propuesta, pagos, entregas, ajustes de inventario ni reembolsos. |
| **Método de verificación** | Simulación de desconexiones, reintentos y pérdida temporal de respuesta del servidor. |
| **Dependencias** | RF-005, RF-009, RF-011, RF-021, RF-022, RNF-011 |

## RNF-015

| Campo | Contenido |
|---|---|
| **Nombre** | Mantenibilidad y pruebas de reglas de negocio |
| **Categoría** | Mantenibilidad |
| **Prioridad** | Alta |
| **Descripción** | Las reglas de negocio deberán centralizarse en la capa de dominio o servicios y contar con pruebas automatizadas que permitan validar el comportamiento del sistema y facilitar su mantenimiento. |
| **Criterios de aceptación** | 1. El frontend no deberá ser la autoridad sobre reglas de negocio críticas. <br>2. Las reglas de pedidos, pagos, inventario, entregas y reembolsos deberán implementarse en servicios reutilizables del backend. <br>3. Las pruebas automatizadas deberán cubrir transiciones de estado. <br>4. Deberán cubrir permisos y control de acceso. <br>5. Deberán cubrir plazos de pago y corrección. <br>6. Deberán cubrir cálculos económicos relevantes. <br>7. Deberán cubrir idempotencia y concurrencia. <br>8. Los requisitos y sus pruebas deberán conservar identificadores que permitan trazabilidad. <br>9. El código fuente deberá administrarse mediante control de versiones. |
| **Método de verificación** | Revisión de código, servicios de dominio, repositorio y ejecución de la suite automatizada de pruebas. |
| **Dependencias** | RF-005, RF-006, RF-010, RF-011, RF-015, RF-021, RF-022, RNF-011 |
