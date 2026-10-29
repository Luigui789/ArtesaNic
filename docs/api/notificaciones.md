# Notificaciones internas persistentes (AUD-17)

La bandeja pertenece a la cuenta pública autenticada. Cada aviso conserva tipo, destinatario, una referencia a solicitud o pedido, clave interna de deduplicación y lectura; no contiene motivos, referencias bancarias ni mensajes. No se generan avisos retroactivos al aplicar la migración. El chat conserva su propio sondeo y no produce notificaciones persistentes.

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/v1/notificaciones/` | Página de 20 avisos, orden descendente; `page` y `page_size` (máximo 100). |
| `GET /api/v1/notificaciones/resumen/` | `{ "no_leidas": N }` de la cuenta. |
| `POST /api/v1/notificaciones/{id}/leer/` | Marca el aviso propio una sola vez; uno ajeno o inexistente responde 404. |
| `POST /api/v1/notificaciones/leer-todas/` | Marca las existentes sin leer; devuelve `actualizadas` y `no_leidas`. |

La autenticación es Bearer, las respuestas no se almacenan en caché y las operaciones de lectura son idempotentes sin `Idempotency-Key`. Un aviso creado después del UPDATE de lectura masiva puede quedar sin leer. No existe creación, edición ni borrado públicos; tampoco se registra el modelo en Django Admin. Cuentas de artesanos pueden consultar su historial aunque su taller ya no esté aprobado.

Los servicios comerciales emiten avisos dentro de su misma transacción, y `(destinatario, clave_evento)` garantiza deduplicación. Una colisión incompatible aborta la operación y registra un error crítico sin datos privados. Se notifican solicitud, propuesta, pago, cumplimiento, entrega, recepción, vencimiento, cancelación, cierre parcial y reembolso. El vencimiento se avisa a ambas partes; los demás eventos se dirigen a la contraparte salvo el reembolso, que se avisa al comprador.

No se reintroduce el estado legado `listo_para_entrega`: se usan `pedido_en_cumplimiento`, `entrega_registrada` y `pedido_entregado`. Correo, SMS, WhatsApp y push quedan fuera. La campana consulta únicamente el resumen cada 30 segundos y la bandeja completa se carga al abrirla.
