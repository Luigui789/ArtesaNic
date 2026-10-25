# Catálogo de reglas de negocio

**Proyecto:** ArtesaNic. **Revisión:** 12 de octubre de 2026 (America/Managua).

**Fuente:** decisiones definitivas y [fichas RF/RNF suministradas en esta conversación](requisitos.md). Este catálogo organiza esas reglas en RN-001 a RN-024; no agrega requisitos, umbrales, estados ni políticas nuevas. Las fichas conservan su redacción y dependencias exactas; las guías remiten aquí para evitar repetir la lógica extensa.

**Alcance:** 21 RF activos, 15 RNF activos y 24 reglas RN. RF-002 está integrado en RF-001 y RNF-005; RF-012 y RF-024 están postergados fuera de V1. El catálogo describe el comportamiento objetivo y no acredita su implementación.

**Referencia histórica:** la antigua mención `RN-06` sobre privacidad del chat corresponde temáticamente a [RN-006](#rn-006); se conserva la referencia original en los documentos históricos. No existía un catálogo local RN-001 a RN-024 previo a esta actualización.

## Índice

| Identificador | Nombre |
|---|---|
| [RN-001](#rn-001) | Rol único por cuenta |
| [RN-002](#rn-002) | Habilitación del artesano |
| [RN-003](#rn-003) | Publicación y conservación histórica |
| [RN-004](#rn-004) | Modalidades disponibles del producto |
| [RN-005](#rn-005) | Solicitud de un único taller |
| [RN-006](#rn-006) | Privacidad de chats y comprobantes |
| [RN-007](#rn-007) | Modalidad individual por renglón |
| [RN-008](#rn-008) | Revisión individual sin contraofertas |
| [RN-009](#rn-009) | Aceptación final del comprador |
| [RN-010](#rn-010) | Cotización, entrega y moneda contractual |
| [RN-011](#rn-011) | Confirmación, congelación y reserva atómica |
| [RN-012](#rn-012) | Pago externo después de la aceptación |
| [RN-013](#rn-013) | Vencimiento automático por falta de pago |
| [RN-014](#rn-014) | Corrección independiente del comprobante |
| [RN-015](#rn-015) | Trabajo condicionado a Pago confirmado |
| [RN-016](#rn-016) | Cancelación unilateral del comprador |
| [RN-017](#rn-017) | Cancelación justificada del artesano |
| [RN-018](#rn-018) | Registro de entregas y evidencia del comprador |
| [RN-019](#rn-019) | Cierre parcial y reembolso |
| [RN-020](#rn-020) | Notificaciones internas y conversación del pedido |
| [RN-021](#rn-021) | Existencia, disponibilidad e historial |
| [RN-022](#rn-022) | Descuento físico por entrega normal |
| [RN-023](#rn-023) | Consumo de unidad base para personalización |
| [RN-024](#rn-024) | Liberación y clasificación según condición |

## RN-001

| Campo | Contenido |
|---|---|
| **Nombre** | Rol único por cuenta |
| **Regla** | Cada cuenta tiene un único rol. El registro público permite Comprador o Artesano; el rol Administrador no puede seleccionarse en él. |
| **Trazabilidad** | RF-004 |

## RN-002

| Campo | Contenido |
|---|---|
| **Nombre** | Habilitación del artesano |
| **Regla** | La cuenta del artesano permanece bloqueada hasta la aprobación administrativa del taller. El artesano no aprobado no accede a funciones operativas y el perfil del taller solo se hace público después de la aprobación. |
| **Trazabilidad** | RF-001, RF-003, RF-004, RF-008, RF-013 |

## RN-003

| Campo | Contenido |
|---|---|
| **Nombre** | Publicación y conservación histórica |
| **Regla** | El catálogo público muestra únicamente productos publicados de talleres aprobados. Editar o despublicar un producto no altera las condiciones ni importes de pedidos previamente confirmados ni elimina sus referencias históricas. La moderación administrativa registra actor y motivo. |
| **Trazabilidad** | RF-001, RF-003, RF-019, RNF-008 |

## RN-004

| Campo | Contenido |
|---|---|
| **Nombre** | Modalidades disponibles del producto |
| **Regla** | Un producto puede admitir venta desde stock, producción por cantidad, personalización o una combinación. La producción por cantidad recoge cantidad y fecha solicitada; la personalización recoge las características solicitadas y puede hacerse desde cero o a partir de una unidad estándar. |
| **Trazabilidad** | RF-001, RF-009, RF-017 |

## RN-005

| Campo | Contenido |
|---|---|
| **Nombre** | Solicitud de un único taller |
| **Regla** | Una solicitud puede contener uno o varios renglones, siempre de productos del mismo taller. El sistema impide mezclar productos de talleres diferentes y evita solicitudes duplicadas por reintentos. |
| **Trazabilidad** | RF-009, RF-018, RNF-014 |

## RN-006

| Campo | Contenido |
|---|---|
| **Nombre** | Privacidad de chats y comprobantes |
| **Regla** | Chats y comprobantes son privados entre comprador y artesano relacionados con el pedido. El administrador no puede leer chats ni acceder a comprobantes de pago. El teléfono utilizado para autenticación es privado salvo que el artesano decida usarlo también como contacto público. |
| **Trazabilidad** | RF-004, RF-008, RF-011, RF-013, RF-014, RNF-004, RNF-013 |

## RN-007

| Campo | Contenido |
|---|---|
| **Nombre** | Modalidad individual por renglón |
| **Regla** | Cada renglón conserva su modalidad de stock, producción por cantidad o personalización. Un pedido puede combinarlas; la presencia de un renglón personalizado no convierte todos los demás en personalizados. |
| **Trazabilidad** | RF-009, RF-017, RF-018 |

## RN-008

| Campo | Contenido |
|---|---|
| **Nombre** | Revisión individual sin contraofertas |
| **Regla** | El artesano acepta o rechaza cada renglón individualmente. Todo rechazo incluye motivo y se conserva en el historial. En V1 no existen contraofertas de cantidad. La propuesta final contiene los renglones aceptados y puede excluir los rechazados. |
| **Trazabilidad** | RF-005, RF-018 |

## RN-009

| Campo | Contenido |
|---|---|
| **Nombre** | Aceptación final del comprador |
| **Regla** | El comprador acepta o rechaza la propuesta final completa, después de revisar sus condiciones. Rechazarla no genera un pedido confirmado; aceptarla confirma el pedido y aplica las reservas y condiciones económicas correspondientes. |
| **Trazabilidad** | RF-005, RF-006, RF-018 |

## RN-010

| Campo | Contenido |
|---|---|
| **Nombre** | Cotización, entrega y moneda contractual |
| **Regla** | La propuesta muestra producto, modalidad, cantidad, precio unitario y subtotal por renglón, además de cargos de personalización, entrega y otros servicios cuando correspondan. El artesano define manualmente el costo de entrega y el plan que el comprador conoce antes de confirmar. El desglose permite calcular reembolsos. Los importes contractuales se conservan en córdobas; la conversión a dólares es informativa y usa una tasa configurada por el administrador. |
| **Trazabilidad** | RF-006, RF-007, RF-013, RF-016 |

## RN-011

| Campo | Contenido |
|---|---|
| **Nombre** | Confirmación, congelación y reserva atómica |
| **Regla** | Al aceptar el comprador la propuesta final, se congela el total y su desglose, se revalida el stock y se reservan las unidades correspondientes de forma atómica. Confirmación y reserva se completan conjuntamente o no se completan; no se confirma parcialmente si falta stock. Cambios posteriores de productos o de tasa de conversión no alteran los importes congelados. |
| **Trazabilidad** | RF-001, RF-005, RF-006, RF-007, RF-022, RNF-011 |

## RN-012

| Campo | Contenido |
|---|---|
| **Nombre** | Pago externo después de la aceptación |
| **Regla** | El comprador paga externamente después de confirmar la propuesta final, por el 100 % del total congelado, y registra método, referencia y comprobante. El artesano confirma manualmente la recepción de fondos. Se mantienen los estados Pendiente de pago, Pago registrado, Pago observado, Pago confirmado y Pago no recibido, con historial de intentos y correcciones. |
| **Trazabilidad** | RF-005, RF-006, RF-011 |

## RN-013

| Campo | Contenido |
|---|---|
| **Nombre** | Vencimiento automático por falta de pago |
| **Regla** | Si pasan 48 horas sin pago registrado, el sistema marca el pedido como Vencido por falta de pago y libera las reservas no manipuladas. Este vencimiento no se ejecuta durante una revisión de pago ni durante un plazo de corrección vigente. |
| **Trazabilidad** | RF-011, RF-015, RF-022 |

## RN-014

| Campo | Contenido |
|---|---|
| **Nombre** | Corrección independiente del comprobante |
| **Regla** | Un comprobante observado registra el motivo y concede al comprador un plazo independiente de 48 horas para corregirlo. Se conserva el historial de intentos y correcciones; mientras ese plazo esté vigente no se ejecuta el vencimiento por falta de pago. |
| **Trazabilidad** | RF-011, RF-015, RNF-015 |

## RN-015

| Campo | Contenido |
|---|---|
| **Nombre** | Trabajo condicionado a Pago confirmado |
| **Regla** | La producción, personalización y preparación comienzan únicamente después de Pago confirmado. La condición se aplica a cada renglón según su modalidad, también en pedidos mixtos. El servidor es la autoridad sobre los cambios de estado. |
| **Trazabilidad** | RF-010, RF-011, RF-017, RNF-005, RNF-015 |

## RN-016

| Campo | Contenido |
|---|---|
| **Nombre** | Cancelación unilateral del comprador |
| **Regla** | El comprador puede cancelar unilateralmente solo mientras no haya confirmado la propuesta final. Después de confirmarla no puede cancelar unilateralmente. |
| **Trazabilidad** | RF-005, RF-015 |

## RN-017

| Campo | Contenido |
|---|---|
| **Nombre** | Cancelación justificada del artesano |
| **Regla** | Antes de cualquier entrega, el artesano puede cancelar por imposibilidad justificada. Si hay fondos confirmados, se genera un reembolso total. El reembolso usa el desglose congelado, evita obligaciones duplicadas y registra la devolución externa con fecha, importe y referencia, en estado Pendiente o Realizado. |
| **Trazabilidad** | RF-006, RF-011, RF-015, RF-021 |

## RN-018

| Campo | Contenido |
|---|---|
| **Nombre** | Registro de entregas y evidencia del comprador |
| **Regla** | El artesano registra una o varias entregas indicando fecha y cantidades por renglón. El pedido pasa a Entregado únicamente al completar todas las cantidades acordadas. El comprador confirma recepción o registra discrepancia; una discrepancia no revierte automáticamente entrega ni inventario. |
| **Trazabilidad** | RF-010, RF-022 |

## RN-019

| Campo | Contenido |
|---|---|
| **Nombre** | Cierre parcial y reembolso |
| **Regla** | Después de una entrega parcial, el cierre lo inicia el artesano y el comprador lo confirma u objeta. Cuando corresponde, se crea un reembolso parcial por cantidades no entregadas utilizando el desglose económico congelado, sin obligaciones duplicadas; la devolución externa conserva fecha, importe y referencia, estado Pendiente o Realizado y notificación al comprador. |
| **Trazabilidad** | RF-006, RF-010, RF-015, RF-021 |

## RN-020

| Campo | Contenido |
|---|---|
| **Nombre** | Notificaciones internas y conversación del pedido |
| **Regla** | Las notificaciones V1 son internas y persistentes, pueden marcarse como leídas y evitan duplicados. Cubren solicitudes, propuesta lista, aceptación/rechazo, pagos, pedidos listos, entregas, discrepancias, cancelaciones, vencimientos, cierres parciales y reembolsos; correo y WhatsApp quedan fuera de V1. La conversación de texto se habilita exclusivamente desde la confirmación del pedido, solo para sus partes, y al finalizar conserva el historial en modo de solo lectura. |
| **Trazabilidad** | RF-014, RF-020 |

## RN-021

| Campo | Contenido |
|---|---|
| **Nombre** | Existencia, disponibilidad e historial |
| **Regla** | La reserva reduce disponibilidad, no existencia física. Se registran existencia inicial, entradas y ajustes positivos o negativos con motivo, sin reducir existencias por debajo de unidades comprometidas ni permitir cantidades negativas. El artesano consulta solo movimientos de su taller; los históricos no se editan directamente y una corrección crea un nuevo movimiento. |
| **Trazabilidad** | RF-022, RF-023, RNF-008, RNF-011 |

## RN-022

| Campo | Contenido |
|---|---|
| **Nombre** | Descuento físico por entrega normal |
| **Regla** | El stock normal se descuenta físicamente al registrar la entrega. La operación no puede consumir dos veces las mismas unidades ni generar movimientos duplicados por reintentos. |
| **Trazabilidad** | RF-010, RF-022, RF-023, RNF-011, RNF-014 |

## RN-023

| Campo | Contenido |
|---|---|
| **Nombre** | Consumo de unidad base para personalización |
| **Regla** | Una unidad estándar usada como base de personalización se consume del inventario cuando comienza su transformación. La personalización fabricada desde cero no consume una unidad estándar como base. La producción bajo pedido no se incorpora automáticamente a stock; comenzar la transformación exige Pago confirmado. |
| **Trazabilidad** | RF-010, RF-011, RF-017, RF-022 |

## RN-024

| Campo | Contenido |
|---|---|
| **Nombre** | Liberación y clasificación según condición |
| **Regla** | Las unidades reservadas y no manipuladas vuelven directamente a disponibilidad al liberar su reserva, incluido vencimiento o cancelación. Solo unidades manipuladas, devueltas, dañadas o inciertas requieren clasificación como Reutilizable o Baja. Una reserva no se libera más de una vez. |
| **Trazabilidad** | RF-015, RF-022, RF-023, RNF-011 |
