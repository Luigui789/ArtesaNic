# Contrato de API — Solicitudes V1 (AUD-05)

**Fecha:** 20 de octubre de 2026 (America/Managua).
**Estado:** creación y lectura persistentes de solicitudes y renglones; creación protegida
contra reintentos por AUD-08 ([contrato idempotente](idempotencia.md)). La revisión,
propuesta y confirmación son fases posteriores.
**Fuentes:** RF-005, RF-009, RF-010, RF-017, RF-018; RN-005, RN-007, RN-008, RN-009.
**Esquema:** [OpenAPI generado](openapi.yaml), etiqueta `Solicitudes`.
**Decisiones vigentes:** [DR-03 y concreciones AUD-05](../decisiones/v1.md).

## Entidades y fronteras

1. **Solicitud:** lo que el comprador pide a un único taller; contiene 1..N renglones.
2. **Propuesta:** selección y condiciones que preparará el artesano después de resolver
   individualmente cada renglón (AUD-06). Aceptar un renglón no confirma un pedido.
3. **Pedido confirmado:** nacerá solo al aceptar el comprador la propuesta completa;
   entonces se congelarán importes y se reservará inventario (AUD-07).

AUD-05 persiste únicamente `Solicitud` y `RenglonSolicitud`. No crea modelos económicos
provisionales, cotización congelada, pagos, chat, reservas ni movimientos. Las referencias
de nombre/categoría del producto se leen del catálogo vigente, incluso si después se
despublica; no son un snapshot contractual. Una despublicación impide nuevas solicitudes,
pero no borra las existentes. Los CHECK de una fila no pueden comprobar relaciones
entre talleres de varias tablas: esa regla se valida en el servicio transaccional y en
la validación del modelo. Escrituras SQL directas deben respetar ese límite.

## Estados

| Entidad | Código | Significado |
|---|---|---|
| Solicitud | `pendiente_revision` | Estado inicial; aún no hay propuesta final |
| Solicitud | `rechazada` | Terminal por DR-03: todos los renglones resueltos y rechazados |
| Renglón | `pendiente` | Resolución inicial |
| Renglón | `aceptado` | Representación preparada para revisión de AUD-06 |
| Renglón | `rechazado` | Representación preparada; requiere motivo no vacío |

No existe transición pública de estado en AUD-05. El cliente no puede escribir
estado, resolución ni motivo. DR-03 conserva los renglones y motivos sin generar
propuesta confirmable, pedido ni reserva. Un renglón aceptado excluye el rechazo total.
El historial efectivo de revisiones se implementará junto con las acciones en AUD-06.

## Endpoints y permisos

Todos exigen `Authorization: Bearer <access>` y responden sin almacenamiento en caché.

| Método | Ruta | Acceso | Éxito |
|---|---|---|---|
| POST | `/api/v1/solicitudes/` | Comprador activo; exige `Idempotency-Key` | 201 |
| GET | `/api/v1/solicitudes/mias/` | Comprador, solo propias | 200 |
| GET | `/api/v1/solicitudes/mias/{solicitud_id}/` | Comprador propietario | 200 |
| GET | `/api/v1/solicitudes/recibidas/` | Artesano con taller aprobado, solo destinadas a su taller | 200 |
| GET | `/api/v1/solicitudes/recibidas/{solicitud_id}/` | Artesano aprobado del taller destinatario | 200 |

Ownership se filtra en PostgreSQL y se comprueba de nuevo por objeto. Una solicitud
ajena responde igual que una inexistente (`404`). No hay acceso comercial especial
para administración. JWT inválido o cuenta desactivada responde `401`; rol incorrecto
o taller pendiente/rechazado/sin taller responde `403`.

No existen endpoints de aceptar, rechazar, resolver, generar propuesta, confirmar o
reservar. Métodos distintos de los implementados responden `405` para un rol autorizado.

## Creación

```json
{
  "renglones": [
    {"producto": 15, "modalidad": "stock", "cantidad": 2},
    {"producto": 16, "modalidad": "produccion", "cantidad": 7, "fecha_solicitada": "2026-12-10"},
    {"producto": 15, "modalidad": "personalizacion", "cantidad": 1,
     "caracteristicas": "Iniciales AM en azul", "origen_personalizacion": "unidad_estandar"}
  ]
}
```

- Único campo superior: `renglones`, lista no vacía de hasta 50 elementos; `caracteristicas` admite hasta 2000 caracteres. No hay modalidad global.
- Cada producto debe estar publicado, pertenecer a taller aprobado y admitir la modalidad.
- Todos los productos deben pertenecer al mismo taller. Se permiten productos repetidos.
- Cantidad entera mayor que cero (hasta `2147483647`); se rechazan booleanos y floats.
- `stock`: solo producto, modalidad y cantidad. AUD-05 no consulta inventario SQL ni mock.
- `produccion`: además exige fecha ISO de calendario, hoy o futura al crear, según Managua.
- `personalizacion`: además exige características no vacías y origen `desde_cero` o
  `unidad_estandar`. Texto libre, sin atributos cerrados; no reserva/consume la base.
- Los campos de otra modalidad y los desconocidos/privilegiados responden `400`, incluso
  comprador, taller, estado, resolución, motivo, posición, timestamps, precios o totales.
- Comprador procede del token; taller, de los productos. El servicio valida todos los
  renglones dentro de una transacción, antes de insertar el agregado; un fallo de inserción
  también revierte todo. No se produce una solicitud parcial.

No se consulta disponibilidad definitiva ni se reserva stock al enviar: AUD-07 lo hará
en la confirmación del comprador.

### Reintentos (AUD-08)

El `POST` exige la cabecera `Idempotency-Key` (16–128 caracteres; UUID recomendado).
Misma clave y mismo cuerpo devuelven la solicitud ya creada (`201`, mismo `id`,
`Idempotency-Replayed: true`); misma clave con otro cuerpo responde
`409 clave_idempotencia_reutilizada`; claves distintas crean solicitudes distintas aunque
el contenido coincida. Una respuesta perdida se resuelve reenviando la misma clave o con
`GET /api/v1/operaciones/crear_solicitud/{clave}/`. Sin clave o con formato inválido:
`400 {"Idempotency-Key": [...]}`. Detalle en [idempotencia](idempotencia.md).
Deshabilitar el botón no es la protección: la autoridad es el servidor.

### Errores

Producto inexistente, despublicado o de taller no aprobado produce el mismo error de
validación `400`, para no revelar productos no públicos. Los errores de cada renglón
se devuelven en orden, con `{}` en las posiciones válidas. Ejemplo de talleres mezclados:

```json
{"renglones": [{}, {"producto": ["Todos los renglones deben pertenecer al mismo taller."]}]}
```

La mezcla no persiste ni `Solicitud` ni `RenglonSolicitud`. La validación de serializers
también usa el formato estándar de DRF (`campo: [mensajes]`, anidado cuando corresponde).

## Lectura

```json
{
  "id": 25,
  "taller": {"id": 3, "nombre": "Barro y Sombra"},
  "estado": "pendiente_revision",
  "creado_en": "2026-10-20T15:00:00-06:00",
  "actualizado_en": "2026-10-20T15:00:00-06:00",
  "renglones": [{
    "id": 70, "posicion": 1,
    "producto": {"id": 15, "nombre": "Sandalias", "categoria": {"id": 1, "codigo": "cuero_y_calzado", "nombre": "Cuero y calzado"}},
    "modalidad": "stock", "cantidad": 2,
    "fecha_solicitada": null, "caracteristicas": "", "origen_personalizacion": "",
    "resolucion": "pendiente", "motivo_rechazo": ""
  }]
}
```

Lectura comprador y respuesta de creación: `SolicitudComprador`. Lectura artesano:
`SolicitudArtesano`, que añade solo `comprador: {id, nombre}`. Nunca teléfono privado,
contraseña, tokens ni datos económicos. `RenglonSolicitud` conserva posición y datos
solicitados; no admite contraoferta de cantidad.

Ambos listados responden páginas DRF `{count, next, previous, results}`, por fecha e ID
descendentes. `page` inicia en 1; `page_size` es 12 por defecto y 48 como máximo.
Página inexistente responde `404`. Cada detalle hace dos consultas de dominio y cada
listado no vacío tres (incluido count), independientemente de los renglones; autenticación
y permiso de taller añaden sus propias consultas constantes. Se usan `select_related`
y `Prefetch`; no se cargan solicitudes ajenas para filtrar en Python.

## Frontend y demo anterior

`features/solicitudes` define tipos propios, composición, lista y detalle. Cada renglón
elige modalidad, cantidad y sus datos específicos. La UI impide agregar otro taller y
el servidor mantiene la autoridad. No existe acción global de aceptar en el flujo nuevo.

Rutas: `/solicitar/{productId}`, `/solicitudes/nueva`, `/solicitudes`, `/solicitudes/{id}`,
`/panel/solicitudes` y `/panel/solicitudes/{id}`. Las consultas incluyen identidad/rol y
fuente en su clave de caché. El cliente convierte camelCase/snake_case y conserva errores
anidados con posición de renglón.

Se comparte `VITE_CATALOGO_API` con catálogo para evitar mezclar IDs: `mock` por defecto;
`real` usa Django y el proveedor Bearer existente. **AUD-18 sigue pendiente:** el selector
de vista demo no autentica, no se guarda un JWT falso y ningún comprador/taller local
se envía como identidad. La API real responde `401` hasta integrar sesión real.

`Order`, su formulario anterior y las rutas `/pedidos`/`/panel/pedidos` se conservan
temporalmente como legacy/demo, rotuladas y aisladas. Pagos, mensajes y entrega antiguos
siguen dependiendo de ellas. Una solicitud V1 nunca se inserta en `orders`, no dispara
esas notificaciones y no navega al detalle de un pedido. La demo V1 guarda un agregado
separado en IndexedDB, versión 4; una instantánea anterior se protege sin sobrescribirla.

## Pendientes explícitos

- **AUD-06:** revisión individual, historial de resoluciones, motivos, propuesta y condiciones
  comerciales; aplicar DR-03 al resolver todos los renglones.
- **AUD-07:** confirmación del comprador, snapshot económico y reservas atómicas; stock real.
- **AUD-09:** flujo React completo de confirmación/cancelación; AUD-18, sesión frontend real.
- Pagos, vencimiento, cumplimiento, entrega, reembolsos, supervisión y chat siguen en sus
  fases. DR-01 fotografías e inventario RF-022 no se implementan aquí.
