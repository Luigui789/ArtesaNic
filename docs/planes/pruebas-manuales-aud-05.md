# Pruebas manuales de AUD-05

La validación manual de la plataforma la realizará el responsable del proyecto.
Este checklist no registra resultados ejecutados ni acredita una sesión frontend real.
Se complementa con las pruebas automáticas y el [contrato implementado](../api/solicitudes.md).

## Preparación

- Rama `feature/solicitudes-renglones-v1`.
- `docker compose up --build --wait --wait-timeout 180` desde la raíz. Conserva los
  volúmenes; el backend aplica migraciones al arrancar. Comprobar servicios healthy.
- Abrir el [frontend local](http://localhost:5173). Para probar UI, usar el modo por
  defecto `VITE_CATALOGO_API=mock`. El selector **Demo** permite alternar vistas.
- La versión de IndexedDB pasó de 3 a 4. Si aparece el aviso de datos de otra versión,
  solo elegir **Restablecer datos de demostración** si se desea reemplazar los datos
  guardados de ese navegador. No se sobrescriben automáticamente.
- En modo real, preparar categorías, talleres aprobados y productos publicados desde
  la API/Admin. La sesión real del frontend es AUD-18: usar un cliente API con Bearer
  para las pruebas autenticadas; el selector Demo no es un login de Django.

## Interfaz en modo demo

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Vista Comprador → catálogo → producto → Preparar solicitud | Abre composición V1 con un renglón, sin navegar a un pedido |
| 2 | Cambiar cantidad a 0, negativa o fraccionaria y enviar | Error comprensible; no se crea solicitud |
| 3 | Agregar otro producto del mismo taller | Conserva ambos renglones y sus cantidades |
| 4 | Intentar agregar un producto de otro taller | Botón bloqueado y explicación visible; no mezcla talleres |
| 5 | Agregar otra vez el mismo producto | Conserva un renglón independiente; no deduplica |
| 6 | Elegir stock | Solo exige cantidad; no exige fecha/características ni reserva stock |
| 7 | Elegir producción en un producto que la admita | Exige cantidad y fecha; rechaza fecha vacía/pasada/inválida |
| 8 | Elegir personalización | Exige características y origen desde cero/unidad estándar |
| 9 | Cambiar modalidad después de escribir datos específicos | Limpia datos incompatibles y envía solo los correspondientes |
| 10 | Enviar varios renglones válidos | Botón muestra envío en curso; abre `/solicitudes/{id}`, estado Pendiente de revisión |
| 11 | Consultar detalle | Muestra todos los renglones, modalidad/cantidad y datos propios; sin total congelado ni aceptar/pagar/chat |
| 12 | Volver a Mis solicitudes y recargar | Conserva la solicitud en el navegador y no la duplica por leer/recargar |
| 13 | Vista Artesano del taller destinatario → Solicitudes | Muestra la recibida; detalle de solo lectura, sin aceptación global |
| 14 | Crear solicitud de otro taller y consultar con el artesano demo | No aparece entre recibidas de su taller |
| 15 | Revisar Pedidos (demo), pagos y mensajes anteriores | Conservan sus flujos separados; aviso indica demo anterior |
| 16 | Revisar a 360 px y con teclado | Campos y botones utilizables, textos completos y sin desplazamiento horizontal obligatorio |
| 17 | Abrir lista vacía y URL de solicitud inexistente | Estado vacío comprensible o página no encontrada, según corresponda |
| 18 | Desconectar/forzar fallo del servicio | Error y reintento visibles; no se presenta éxito ni pedido confirmado ficticio |

La demo sembrada puede no tener productos con todas las modalidades. Para preparar
los pasos 7–9, en **Mis productos** registrar/publicar un producto del taller demo que
admita stock, producción y personalización. No hace falta inventario real para AUD-05.

## API real y permisos

Usar CSRF para registro/login y Bearer para solicitudes según el contrato de
[autenticación](../api/autenticacion.md). Crear comprador A/B y talleres A/B aprobados.

| Acción | Resultado esperado |
|---|---|
| POST solicitud simple o mixta con productos de A | 201; comprador del token, taller A derivado, renglones en orden y estado pendiente |
| POST sin Bearer o con cuenta desactivada | 401 |
| POST con artesano | 403 |
| POST lista vacía, cantidad inválida, modalidad no admitida o datos requeridos ausentes | 400; ninguna fila parcial |
| POST combinando productos de A y B | 400; no crea solicitud ni renglones |
| POST comprador/taller/estado/resolución/precio/campo desconocido | 400 |
| POST producto despublicado o de taller pendiente/rechazado | 400 con el mismo mensaje que producto inexistente |
| GET mías con comprador A/B | Solo solicitudes de cada identidad; detalle ajeno 404 |
| GET recibidas con artesano A/B | Solo solicitudes del taller propio; detalle ajeno 404 |
| GET recibidas con artesano pendiente/rechazado/sin taller | 403 |
| Despublicar después de crear y volver a leer | La solicitud y sus renglones permanecen consultables por sus partes |
| Paginar con más de 12 solicitudes | Orden estable, count/next/previous/results y páginas correctas |
| PUT/PATCH/DELETE o acciones futuras sobre solicitudes | No hay API de mutación: 405 en rutas existentes o 404 en rutas no creadas |
| Activar modo real sin sesión frontend integrada | Catálogo público funciona; creación/lista autenticada devuelve 401 visible, sin usar identidad demo |

## Lo que no se debe esperar todavía

- Resolver, aceptar/rechazar renglones o generar propuesta: AUD-06.
- Confirmar pedido, congelar importes, reservar/revalidar stock: AUD-07.
- Reenviar una operación tras perder la respuesta sin duplicarla: AUD-08. No probar
  el doble envío como si ya existiera esa garantía.
- DR-03 está representada como `rechazada`; su transición automática llega con la
  revisión de AUD-06. No existe botón para ejecutarla en AUD-05.
- Pagos, entrega, chat, fotografías DR-01 y login frontend real siguen fuera de esta fase.
