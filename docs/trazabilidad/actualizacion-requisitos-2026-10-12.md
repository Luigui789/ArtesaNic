# Revisión documental de requisitos — 12 de octubre de 2026

**Fuente:** especificación RF/RNF y decisiones declaradas definitivas por el usuario en esta conversación. **Zona:** America/Managua. **Alcance de la intervención:** documentación de requisitos y sus índices; sin cambios en código funcional, API, modelos, migraciones, pruebas de negocio ni configuración operativa.

## Archivos actualizados

| Archivo | Cambio |
|---|---|
| [requisitos.md](../requisitos/requisitos.md) | 24 fichas RF y 15 fichas RNF con exactamente los campos solicitados y el texto suministrado; índice de estados V1 |
| [reglas-de-negocio.md](../requisitos/reglas-de-negocio.md) | Catálogo separado RN-001 a RN-024 derivado de las decisiones y fichas suministradas, con trazabilidad RF/RNF |
| [modulos-y-reglas.md](../requisitos/modulos-y-reglas.md) | Módulos V1 y secuencia comercial mediante referencias al catálogo RN |
| [guia-alcance.md](../requisitos/guia-alcance.md) | Conteos, estados, fuentes vigentes y puntos de control; reemplaza las reglas anteriores |
| [Índice documental](../README.md) | Enlaces a fichas, catálogo RN, revisión e históricos; distingue alcance actual de fuentes anteriores |
| [README del proyecto](../../README.md) | Resumen de 21 RF activos y 15 RNF activos y estado de los tres RF excluidos |
| Este informe | Evidencia de verificación e inconsistencias pendientes |

## Preservación histórica

Se conservaron copias de los tres documentos anteriores a esta actualización:

- [Fichas del 8 de octubre](../requisitos/historico/fichas-2026-10-08.md).
- [Módulos del 8 de octubre](../requisitos/historico/modulos-2026-10-08.md).
- [Guía de alcance anterior](../requisitos/historico/guia-alcance-2026-10-08.md).

Las copias se comprobaron contra sus contenidos previos en Git antes de añadir la advertencia de documento histórico y adaptar únicamente sus enlaces relativos. Se conservan autores, versiones, responsables, estados, aprobaciones y decisiones previas. La [especificación v2.1 y Anexo A](../requisitos/historico/especificacion-v2.1.md) y los históricos existentes no se alteraron.

La antigua referencia RN-06 de privacidad del chat tiene correspondencia temática con RN-006 en el nuevo catálogo. Las referencias históricas originales permanecen intactas.

## Comprobaciones documentales

| Control | Resultado |
|---|---|
| Identificadores y formato | RF-001 a RF-024: 24 fichas únicas, cada una con Nombre, Actores, Prioridad, Descripción, Criterios de aceptación y Dependencias. RNF-001 a RNF-015: 15 fichas únicas, con Nombre, Categoría, Prioridad, Descripción, Criterios de aceptación, Método de verificación y Dependencias |
| Dependencias | Comprobadas las 152 referencias de dependencia de las fichas y todas las referencias RF/RNF del catálogo RN: todas existen; se conservan exactamente las dependencias suministradas |
| Conteos V1 | **21 RF activos y 15 RNF activos**; 24 reglas RN separadas, sin sumarlas a los RF |
| Estados especiales | RF-002 integrado en RF-001/RNF-005, sin RF independiente; RF-012 y RF-024 postergados fuera de V1 |
| Revisión de solicitudes | El artesano resuelve cada renglón; el comprador acepta o rechaza la propuesta final completa |
| Falta de pago | Vencimiento automático de 48 horas sin pago registrado, respetando revisión y plazo independiente de corrección |
| Modalidades | Conservadas por renglón; ningún pedido mixto se convierte globalmente en personalizado |
| Inventario | Reserva afecta disponibilidad; entrega normal descuenta físicas; transformación consume unidad base; liberación directa de unidades no manipuladas y clasificación limitada a su condición |
| Reglas sustituidas | No permanecen como reglas vigentes en fichas, catálogo ni guías actualizadas. Se preservan exclusivamente en las fuentes anteriores y en documentos ajenos al alcance de esta actualización |
| Enlaces y alcance del diff | Comprobados 176 enlaces locales de los documentos vigentes modificados, incluidos sus anclajes cuando corresponde; el diff se limita a Markdown documental y `git diff --check` no informa errores |

Las dependencias pueden ser recíprocas (por ejemplo, RNF-006 y RNF-012), tal como en la fuente. Representan relaciones entre requisitos, no un orden de ejecución; no se reescribieron.

## Inconsistencias y detalles no definidos por la fuente

1. **Traslado técnico de imágenes:** RF-002 asigna validación, optimización y almacenamiento a RNF-005. La ficha RNF-005 suministrada explicita arquitectura y almacenamiento, pero no incluye criterios concretos de validación u optimización. Se conserva exactamente la ficha recibida; no se añaden formatos, tamaños, dimensiones, miniaturas ni tecnología de procesamiento.
2. **Plazos de pago y corrección:** la fuente establece dos plazos independientes de 48 horas y prohíbe vencer durante revisión o corrección vigente. No precisa los eventos temporales de referencia, la resolución posterior al agotamiento de la corrección ni el plazo máximo de una revisión pendiente. Esos detalles no se completan con reglas antiguas ni decisiones nuevas.
3. **Propuesta sin renglones aceptados y objeción de cierre parcial:** la fuente exige resolución individual y permite al comprador objetar el cierre; no define el tratamiento de una solicitud con todos los renglones rechazados ni qué ocurre después de la objeción. El catálogo no inventa transiciones ni mecanismos de arbitraje.
4. **Cálculo de reembolsos:** RF-006 y RF-021 exigen desglose congelado y devolución por cantidades no entregadas, pero no fijan una fórmula de distribución de cargos compartidos. Se mantiene esa definición sin introducir fórmulas.
5. **Documentos técnicos e históricos ajenos al cambio:** el [contrato de API propuesto](../api/contrato-api.md), la [frontera mock/backend](../api/frontera-mock-backend.md), la [matriz de main 456f613](alineacion-main-456f613.md), las [discrepancias de la migración](discrepancias-documentales.md), los planes y otras referencias previas conservan menciones a RF-002 independiente, RF-024 activo, aceptación del artesano para todo el pedido, cancelación manual o clasificación global de modalidades. No se modificaron para corregirlos; la fuente vigente está identificada en el índice documental y las guías.
6. **Estado de implementación:** el frontend sigue describiendo flujos simulados y el backend existente no acredita implementación de las nuevas reglas de renglones, propuesta final, vencimiento e inventario. Esta revisión documental no evalúa ni adapta esa implementación.

No se consultó ni modificó el archivo remoto de Drive: el contenido exacto proporcionado por el usuario es la fuente de esta actualización local.
