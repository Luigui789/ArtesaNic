# Arquitectura del backend

Monolito modular con Django 5.2 LTS, Django REST Framework y PostgreSQL. El código se organiza **por dominio**: cada aplicación de `apps/` es dueña de sus modelos, reglas, API y pruebas. La única superficie de acoplamiento con el frontend es el contrato HTTP/JSON (ADR-004, [ADR-009](../adr/0009-fuente-del-contrato-de-api.md)).

## Estructura y responsabilidades

```text
Back-Artesanic/
├── config/                     Configuración, composición de rutas y puntos de entrada. Sin reglas de negocio.
│   ├── settings/
│   │   ├── base.py             Común, con valores por defecto seguros; todo lo variable sale del entorno
│   │   ├── local.py            Desarrollo: DEBUG, orígenes de Vite y cookies sin Secure
│   │   └── test.py             Pruebas: hash de contraseñas rápido
│   ├── urls.py                 /admin/, /api/v1/salud/, /api/v1/auth/, /api/v1/talleres/,
│   │                           /api/v1/categorias/, /api/v1/productos/, /api/v1/inventario/,
│   │                           /api/v1/solicitudes/ (solicitudes, propuestas y decisión),
│   │                           /api/v1/pedidos/, /api/v1/operaciones/, /api/v1/configuracion/
│   ├── health.py               Sonda de disponibilidad (RNF-006)
│   ├── wsgi.py, asgi.py
│   └── tests/                  Salud, orígenes (CORS y CSRF) y esquema OpenAPI
├── apps/
│   ├── operaciones/            Idempotencia de mutaciones comerciales (AUD-08), sin reglas de negocio
│   │   ├── services.py         ejecutar_idempotente: huella, registro y árbitro UNIQUE en la transacción
│   │   └── api/               Contrato Idempotency-Key reutilizable y consulta de resultado propia
│   ├── inventario/             Existencia física, reservada, reservas y bitácora append-only (AUD-07)
│   │   ├── models.py           InventarioProducto, ReservaInventario y MovimientoInventario;
│   │   │                       ObligacionClasificacionInventario y ClasificacionInventario (AUD-13)
│   │   ├── services.py         Existencia inicial, entradas, ajustes, reservas atómicas con FOR UPDATE,
│   │   │                       liberación (AUD-11), consumo parcial de reservas (AUD-12, uso interno),
│   │   │                       liberación de remanentes, reincorporación y baja clasificada (AUD-13)
│   │   ├── selectors.py        Inventario y movimientos propios del taller
│   │   ├── api/               Gestión de inventario del artesano y conflictos 409
│   │   └── tests/             Reglas por modalidad, ajustes bajo comprometido y carreras en PostgreSQL
│   ├── pedidos/                Pedido confirmado, snapshot inmutable (AUD-07), estado operativo (AUD-11),
│   │                           cumplimiento por renglón con entregas (AUD-12) y resolución (AUD-13)
│   │   ├── models.py           Pedido, LineaPedido y CargoPedido (snapshot); EstadoOperativoPedido y
│   │   │                       EventoEstadoPedido (proyección mutable e historial append-only);
│   │   │                       CumplimientoLineaPedido, EntregaPedido, LineaEntrega y RecepcionEntrega;
│   │   │                       DistribucionEconomicaLineaPedido, CancelacionPedido, CierreParcialPedido,
│   │   │                       LineaCierreParcial, DecisionCierreParcial, ReembolsoPedido y
│   │   │                       DevolucionReembolso (AUD-13, append-only)
│   │   ├── services.py         Creación transaccional desde la propuesta aceptada (+ estado, cumplimiento
│   │   │                       y copia de la distribución económica)
│   │   ├── cumplimiento.py     Iniciar renglón, registrar entrega y recepción: Pago confirmado, locks,
│   │   │                       consumo de reservas, transiciones y puntos de integración AUD-20
│   │   ├── resolucion.py       Cancelación del taller, propuesta y respuesta de cierre parcial (AUD-13)
│   │   ├── reembolsos.py       Base reembolsable, reembolso total/parcial y devolución externa (AUD-13)
│   │   ├── clasificacion.py    Clasificación reutilizable/baja de unidades manipuladas (AUD-13)
│   │   ├── errores.py          Códigos 409 de la resolución (AUD-13)
│   │   ├── vencimiento.py      Vencimiento por falta de pago: candidatos por lote, lock y revalidación
│   │   ├── management/commands/procesar_vencimientos_pago.py
│   │   │                       Proceso automático (--once / --interval), servicio Compose «vencimientos»
│   │   ├── selectors.py        Lectura en tres consultas sin JOIN al catálogo vivo; cumplimiento en cuatro
│   │   ├── api/               Lecturas de comprador (/pedidos/mios/) y taller (/pedidos/recibidos/),
│   │   │                       cumplimiento, inicio de renglón, entregas y recepción (AUD-12),
│   │   │                       resolución, cancelación, cierres, devolución y clasificación (AUD-13)
│   │   └── tests/             Snapshot, permisos, idempotencia, plazos, liberación, carreras y smoke
│   ├── solicitudes/            Solicitud, RenglonSolicitud (AUD-05) y su revisión (AUD-06)
│   │   ├── models.py           Modalidad por renglón, estados, preferencia de entrega e historial
│   │   ├── services.py         Creación y resolución transaccionales; lock de la solicitud; DR-03
│   │   ├── selectors.py        Ownership en SQL y carga relacionada sin N+1
│   │   ├── api/               Creación, lecturas, resolución de renglón y conflictos 409
│   │   └── tests/             Modalidades, revisión, DR-03, constraints, permisos, schema y consultas
│   ├── propuestas/             Propuesta final del artesano (AUD-06) y decisión del comprador (AUD-07)
│   │   ├── models.py           Propuesta, LineaPropuesta, CargoPropuesta, DecisionPropuesta y
│   │   │                       DistribucionEconomicaLineaPropuesta (AUD-13) inmutables
│   │   ├── distribucion.py     Reparto determinista de cargos globales y entrega (mayor residuo, AUD-13)
│   │   ├── services.py         Emisión única y decisión transaccional (aceptar con pedido + reserva / rechazar)
│   │   ├── selectors.py        Lectura por parte en tres consultas
│   │   ├── api/               Emisión, lectura y decisión bajo /api/v1/solicitudes/{mias,recibidas}/{id}/propuesta/
│   │   └── tests/             Cotización, decisión, permisos, idempotencia, concurrencia real y smoke HTTP
│   ├── mensajes/               Conversación privada del pedido confirmado (RF-014, RNF-010; AUD-16)
│   │   ├── models.py           MensajePedido append-only (texto ≤ 500, índice (pedido, id))
│   │   ├── services.py         enviar_mensaje: lock del Pedido, estado no terminal, autor = actor
│   │   ├── selectors.py        Ownership en SQL, historial o delta por cursor de id
│   │   ├── api/                GET/POST /api/v1/pedidos/{id}/mensajes/ (docs/api/mensajes.md)
│   │   └── tests/              Modelo, API, privacidad y carreras reales en PostgreSQL
│   ├── configuracion/          Tasa de cambio informativa administrada (RF-007, RF-013.4; AUD-14)
│   │   ├── models.py           ConfiguracionPlataforma (singleton id=1) y CambioTasaCambio append-only
│   │   ├── services.py         actualizar_tasa_cambio: lock del singleton, proyección + historial
│   │   ├── admin.py            Edición de la tasa en Django Admin vía el servicio, sin add/delete
│   │   ├── api/                GET público /api/v1/configuracion/ (docs/api/configuracion.md)
│   │   └── tests/
│   ├── catalogo/               Categorías y productos con modalidades V1 (RF-001, RF-003, RF-017, RF-019; AUD-04)
│   │   ├── models.py           Categoria, Producto, Modalidad, ModeracionProducto (AUD-14) y restricciones
│   │   ├── services.py         Alta, edición, publicar y despublicar; exige taller aprobado; moderar_producto
│   │   ├── admin.py            Categorías (código estable) y productos de solo lectura con acción de moderación
│   │   ├── fixtures/           Categorías de desarrollo, no normativas
│   │   ├── api/                Catálogo público y productos propios (docs/api/catalogo.md)
│   │   └── tests/
│   ├── talleres/               Taller del artesano y su aprobación (RF-008, RF-013; AUD-02)
│   │   ├── models.py           Taller, EstadoTaller y restricciones de sus datos
│   │   ├── services.py         Alta pendiente, perfil, aprobar y rechazar
│   │   ├── admin.py            Revisión en Django Admin (permiso revisar_taller)
│   │   ├── api/                Perfil público y taller propio (docs/api/talleres.md)
│   │   └── tests/
│   └── accounts/               Identidad, cuentas y sesión (RF-004, RF-013)
│       ├── models.py           Usuario, Rol y restricciones de sus datos
│       ├── managers.py         Creación de usuarios y superusuarios
│       ├── phone.py            Normalización del teléfono de acceso
│       ├── services.py         Registro por rol y verificación de credenciales
│       ├── admin.py            Gestión de cuentas en Django Admin
│       ├── migrations/
│       ├── api/
│       │   ├── urls.py, views.py       Endpoints: delegan las reglas en services.py
│       │   ├── serializers.py          Validación y representación de entrada y salida
│       │   ├── permissions.py          Autorización por rol y propietario
│       │   ├── authentication.py       Token de acceso Bearer y regla de acceso a la API
│       │   ├── tokens.py               Emisión, rotación, revocación y cookie de renovación
│       │   ├── csrf.py                 CSRF de los endpoints que usan la cookie
│       │   └── throttles.py            Límite de intentos por teléfono
│       └── tests/              Una prueba por comportamiento, más base.py con el apoyo común
├── docs/                       Documentación técnica del backend (requisitos: en el frontend)
├── compose.yaml                PostgreSQL local (ADR-008); no es despliegue
├── pyproject.toml, uv.lock     Dependencias y versiones exactas
└── manage.py
```

## Recorrido de una petición

```text
CorsMiddleware ── origen admitido y credenciales (solo /api/)
      │
URL (config/urls.py → apps/<app>/api/urls.py)
      │
Vista DRF
  1. autenticación  ── Bearer: JWTAuthentication (vuelve a leer la cuenta)
  2. permisos       ── IsAuthenticated por defecto · EsComprador · EsArtesano · CSRFRequerido
  3. limitación     ── por IP y por teléfono en login y registro
  4. serializer     ── valida y normaliza la entrada; rechaza campos no declarados
  5. servicio       ── reglas del negocio y transacciones
  6. modelo         ── restricciones de PostgreSQL como última garantía
  7. serializer     ── representación de salida, sin datos sensibles
```

Las reglas tienen un único lugar: la normalización del teléfono está en `phone.py` y la usan el serializer, el manager, el servicio y la limitación de intentos; la asignación de rol está en `services.py`; la regla «quién puede usar la API» está en `Usuario.puede_usar_api`. El frontend solo hace validaciones de comodidad.

## Decisiones transversales

| Tema | Decisión | Referencia |
|---|---|---|
| Autenticación | Acceso Bearer en memoria del cliente, renovación en cookie `HttpOnly`, CSRF en los endpoints de la cookie | ADR-003, [ADR-007](../adr/0007-concrecion-de-la-autenticacion.md) |
| Permisos | Cerrado por defecto (`IsAuthenticated`); cada vista pública lo declara | `config/settings/base.py` |
| Formato | Solo JSON; los futuros endpoints con archivos declararán su propio parser | `DEFAULT_PARSER_CLASSES` |
| Objetos ajenos | `404`, no `403` (contrato §1.9): `EsPropietario` y querysets limitados al usuario | `permissions.py` |
| Errores | Formato estándar de DRF; mensajes en español; sin detalles internos | `docs/api/autenticacion.md` |
| Entorno local | PostgreSQL en Compose, Django en el host con `uv` | [ADR-008](../adr/0008-entorno-de-desarrollo-local.md) |
| Contrato | OpenAPI generado y comprobado por pruebas | [ADR-009](../adr/0009-fuente-del-contrato-de-api.md) |

## Roles y administración

- **Rol de negocio** (`Usuario.rol`): `comprador`, `artesano` o `administrador`.
- **Privilegios internos de Django** (`is_staff`, `is_superuser`, grupos y permisos): independientes del rol. PostgreSQL impide que una cuenta de comprador o artesano los tenga, y tener rol administrador no los concede.
- **Superusuario** (`createsuperuser`): cuenta técnica de mantenimiento, con todos los permisos. No es la forma de dar de alta a la administración de la plataforma.
- **Administrador de plataforma**: lo crea un superusuario en Django Admin con rol `administrador`, `is_staff` activado y solo los permisos que necesita. No puede reasignar roles, otorgar privilegios, cambiar contraseñas ajenas ni ver tokens. Los servicios administrativos vuelven a comprobar rol, `is_staff`, cuenta activa y el permiso concreto: no confían solo en que la petición llegó por `/admin/`.
- **Superficie administrativa tras AUD-14** (Django Admin, fuera de `/api/v1/` y del OpenAPI; sesión y CSRF propios de Django, sin JWT ni CORS para administradores, D-AUD14-12):

  | Ruta | Capacidad | Permisos |
  |---|---|---|
  | `/admin/accounts/usuario/` | Activar y desactivar cuentas ajenas | `view_usuario`, `change_usuario` |
  | `/admin/talleres/taller/` | Aprobar y rechazar talleres; perfil de solo lectura | `view_taller`, `revisar_taller` |
  | `/admin/catalogo/categoria/` | Crear y renombrar categorías (código estable) | permisos de `categoria` |
  | `/admin/catalogo/producto/` | Consultar productos y retirarlos por moderación con motivo; sin edición | `view_producto`, `moderar_producto` |
  | `/admin/configuracion/configuracionplataforma/` | Actualizar la tasa de cambio (con historial) | `view_`/`change_configuracionplataforma` |
  | `/admin/pedidos/pedido/` | Supervisar estado, importes y líneas de pedidos; solo lectura, sin acciones | `view_pedido` |

- **Privacidad administrativa (RF-013.6 a 8, RN-006, RNF-013; D-AUD14-11):** el administrador no modifica acuerdos comerciales ni accede a chats ni comprobantes. Como un superusuario lo ve todo en Django Admin, `apps.pagos` (`Pago`, `IntentoPago`, `RevisionIntentoPago`, comprobantes) **no se registra en el admin**. `apps.mensajes` (`MensajePedido`, AUD-16) tampoco se registra: `/admin/mensajes/` responde `404` incluso al superusuario (D-AUD16-09). `PedidoAdmin` no muestra referencias, archivos, rutas privadas ni el teléfono del comprador. Una prueba fija la lista exacta de modelos registrados (`apps/pedidos/tests/test_admin.py`): ampliarla exige revisar estas reglas.

## Cómo crece: fase de talleres y catálogo

| Dónde | Qué |
|---|---|
| `apps/talleres/` (AUD-02, implementada) | Perfil del taller (RF-008) vinculado a la cuenta de artesano; aprobación (RF-013) en Django Admin. El alta ocurre en el registro del artesano; estados y rubro según D-AUD02-01 a 03 ([talleres](../api/talleres.md#4-decisiones-aplicadas-en-aud-02)). |
| `apps/catalogo/` (AUD-04, DR-01, AUD-14) | Categorías, productos con modalidades combinables, fotografía principal, publicación y catálogo público paginado ([catálogo](../api/catalogo.md)). La moderación administrativa (`ModeracionProducto`, con actor y motivo) es independiente de `publicado` y saca el producto del catálogo y de nuevas solicitudes sin tocar compromisos previos (D-AUD14-02/03). |
| `apps/configuracion/` (AUD-14) | [Configuración pública](../api/configuracion.md): tasa de cambio informativa en un singleton con historial append-only; escritura solo en Django Admin. |
| `apps/pedidos/admin.py` (AUD-14) | Supervisión de pedidos de solo lectura (`view_pedido`): estado operativo, importes congelados y líneas, sin acciones ni edición (D-AUD14-10). |
| `apps/solicitudes/` (AUD-05/06) | [Solicitudes y renglones](../api/solicitudes.md), creación atómica y lectura de las partes. Revisión individual con historial y [DR-03](../decisiones/v1.md#dr-03--solicitud-sin-renglones-aceptados) aplicada (AUD-06). Mutaciones protegidas por AUD-08. |
| `apps/propuestas/` (AUD-06/07) | [Propuesta final y decisión del comprador](../api/propuestas.md): cotización con precio del servidor, cargos, plan y costo de entrega, total y `DecisionPropuesta` (`aceptada`/`rechazada`). |
| `apps/pedidos/` (AUD-07) | [Pedido confirmado](../api/pedidos.md): snapshot contractual inmutable (`Pedido`, `LineaPedido`, `CargoPedido`) creado al aceptar la propuesta, independiente de cambios posteriores del catálogo. |
| `apps/inventario/` (AUD-07) | [Inventario y reservas](../api/inventario.md): existencia física, reservada y disponible (`InventarioProducto`), reservas activas por línea (`ReservaInventario`) y bitácora append-only (`MovimientoInventario`). |
| `apps/pagos/` (AUD-10) | [Pago externo](../api/pagos.md): `Pago` (uno por pedido), `IntentoPago` y `RevisionIntentoPago` append-only, comprobantes privados validados por contenido en `PRIVATE_MEDIA_ROOT` y descarga autenticada. |
| `apps/operaciones/` (AUD-08) | [Idempotencia](../api/idempotencia.md): las mutaciones comerciales envuelven su servicio con `ejecutar_idempotente` y añaden su `TipoOperacion`. |
| `apps/accounts/api/serializers.py` | Añadir `artesano_id` y `artesano_estado` al perfil cuando exista el taller. |
| `apps/talleres/api/permissions.py` | `EsArtesanoAprobado` (implementado): toda función operativa del artesano lo exige; los modelos con dueño implementan `pertenece_a(usuario)`. |
| `config/settings/base.py` | Almacenamiento de archivos: imágenes públicas del catálogo en `MEDIA_ROOT`; comprobantes de pago privados en `PRIVATE_MEDIA_ROOT`, sin URL (D-AUD10-05). |

Las aplicaciones se crean cuando su fase empieza. La lista prevista (`workshops`, `catalog`, `orders`, `payments`, `messaging`, `notifications`, `audit`) es orientativa: no tiene que coincidir con los ocho módulos de la especificación, y la administración es una capacidad de cada dominio, no una aplicación aparte.

## Reglas de organización

1. Organizar por dominio; no hay carpetas globales de modelos, vistas o servicios.
2. Dividir un archivo cuando maneja flujos distintos, no por número de líneas.
3. Sin `utils.py` general: cada función vive junto a su dominio con un nombre concreto (`phone.py`, `tokens.py`).
4. Elementos compartidos solo cuando haya reutilización real.
5. Cada regla de negocio en un único lugar; ni vistas ni frontend la duplican.
6. Las transacciones, junto a la operación que necesita consistencia (`services.py`).
7. Sin repositorios, eventos ni interfaces abstractas sin una necesidad comprobada.
8. Las pruebas, junto al módulo que verifican.
