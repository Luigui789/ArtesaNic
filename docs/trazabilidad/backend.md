# Trazabilidad con requisitos y módulos

> **Trazabilidad heredada de la fase 1.** Para la matriz vigente y verificada automáticamente tras AUD-01…AUD-19 (21 RF activos, 15 RNF activos, 24 RN activas y 3 RF no activos en V1), consultar [cobertura-v1.md](cobertura-v1.md) y [cobertura-v1.json](cobertura-v1.json). Las referencias históricas siguientes corresponden a la fase 1 y deben contrastarse con las [39 fichas de requisitos](../requisitos/requisitos.md).

## Fuente de los requisitos

RF, RNF y módulos tienen **una sola fuente editable**: el repositorio del frontend ([Front-ArtesaNic](https://github.com/Luigui789/Front-ArtesaNic)). Este repositorio los cita por identificador y no los copia ni los renumera ([ADR-009](../adr/0009-fuente-del-contrato-de-api.md)).

| Documento | Ruta en el frontend | Versión consultada |
|---|---|---|
| Requisitos | `docs/requisitos/requisitos.md` | Especificación consolidada **v2.1** (30-sep-2026), incorporada el 4-oct-2026 |
| Módulos | `docs/requisitos/modulos-funcionalidades.md` | Sección 4.4 de la v2.1 |
| Contrato de API | `docs/api/contrato-api.md` | Borrador del 15-ago-2026 (34 endpoints, anterior a la v2.1) |
| Frontera mock → backend | `docs/api/frontera-mock-backend.md` | Línea base del 15-ago-2026, con ajustes de demo del 30-sep y 1-oct |

> **Estado de esas fuentes al 4-oct-2026.** La v2.1 de `requisitos.md` y `modulos-funcionalidades.md` existe en la copia de trabajo de la rama `feat/presentation-polish` del frontend, **sin commit todavía**; la copia de Descargas es la v2.0 y no se usó. Todas las fichas v2.1 están «Propuesto para homologación»: **no acreditan aprobación del equipo**. Las definiciones L-1 a L-6 son de Luis y están pendientes de homologación, como las decisiones D01–D19 de la hoja de ratificación del 29-sep-2026.

## Implementado en la fase 1

Escala: **Implementado** (código y pruebas en esta rama), **Parcial** (cubre una parte, que se indica) y **Pendiente**.

| Requisito | Qué exige (resumen) | Estado | Evidencia |
|---|---|---|---|
| **RF-004** v2.0 Autenticación simplificada | Registro e inicio de sesión de comprador y artesano con teléfono y contraseña; roles, estado de cuenta y permisos asignados por el servidor; consultar y editar datos propios; cerrar sesión; aprobación del taller antes de publicar | **Parcial** | Registro, login, logout, perfil, roles por servidor, cuentas inactivas: `apps/accounts`, `test_registration.py`, `test_authentication.py`. Editar datos propios (AUD-15): `PATCH /auth/perfil/`, `test_datos_personales.py`. Pendiente: **aprobación del taller** (fase de talleres) y **recuperación de contraseña** (sin definición, como indica la ficha) |
| **RF-013** v3.0 Panel de administración (Django Admin) | Aprobar talleres, activar y desactivar cuentas, moderar productos, configurar la tasa, consultar pedidos en solo lectura; sin acceso a chats ni comprobantes | **Parcial** | Activar y desactivar cuentas; la administración de plataforma no reasigna roles, privilegios ni contraseñas y no ve tokens: `admin.py`, `test_admin.py`. El resto llega con cada dominio |
| **RF-014** Mensajería asociada al pedido | Texto entre las partes de un pedido confirmado; sin chat de solicitud; solo lectura al finalizar; orden e historial; sin acceso del administrador | **Implementado** (AUD-16) | `apps/mensajes`: `MensajePedido` append-only, `GET`/`POST /api/v1/pedidos/{id}/mensajes/`, ownership en SQL (ajeno `404`), `409 conversacion_cerrada` en estados terminales, sin registro en Django Admin. `test_model.py`, `test_api.py`, `test_privacidad.py`, `apps/pedidos/tests/test_admin.py`; chat en el detalle real (`check-mensajes.mjs`). [Contrato](../api/mensajes.md), D-AUD16-01 a 10 |
| **RNF-004** v4.1 Seguridad de pagos y datos sensibles | TLS, hash seguro, autorización en servidor por rol, objeto y pertenencia, CSRF cuando corresponda, chats y comprobantes solo para las partes | **Parcial** | Hash de Django; permisos por rol y propietario (`permissions.py`, `test_permissions.py`); CSRF (`csrf.py`, pruebas de registro, login, refrescar, logout y orígenes). Pendiente: TLS (despliegue); chats y comprobantes (sus fases) |
| **RNF-010** Actualización de mensajería | Mensaje visible en la otra sesión en ≤ 15 s, solo información nueva, sin omisiones por concurrencia, orden conservado | **Implementado** (AUD-16); verificación manual con dos sesiones pendiente | Cursor por `id` (`despues_de`), envíos serializados por el lock del `Pedido`; carreras reales en `apps/mensajes/tests/test_concurrencia.py`. Polling de 15 s con fusión incremental en `src/features/mensajes` (`check-mensajes.mjs`). D-AUD16-06 a 08 |
| **RNF-005** v2.1 Arquitectura e interoperabilidad | API REST/JSON con contratos definidos, `snake_case`, servidor como autoridad | **Implementado** en lo que abarca la fase | `docs/api/openapi.yaml` comprobado por `config/tests/test_openapi.py` |
| **RNF-006** v2.0 Disponibilidad | Comprobaciones periódicas de salud | **Parcial** | `GET /api/v1/salud/` (`test_health.py`). La medición, el periodo y las exclusiones siguen sin definir |
| **RNF-011** v1.1 Integridad transaccional | Transacciones y restricciones de PostgreSQL | **Parcial** | Unicidad y forma canónica del teléfono, rol válido, privilegios solo con rol administrador (`test_account_model.py`); registro simultáneo del mismo teléfono resuelto por la restricción única. Las operaciones de pedidos, pagos y unidades llegarán en sus fases |
| **RNF-013** v1.1 Minimización y acceso a datos personales | Solo los datos necesarios; teléfono privado de acceso separado de los contactos públicos del taller | **Parcial** | La cuenta guarda nombre y teléfono; el teléfono solo se devuelve a su titular (`perfil`) y cambiarlo no modifica los contactos públicos del taller (AUD-15, D-AUD15-05). Los contactos públicos del taller llegarán con RF-008 |
| **RNF-014** v1.1 Resiliencia ante conectividad inestable | Reintentos sin duplicar efectos | **Parcial** | Reenviar un registro no duplica la cuenta (restricción única); `logout` es idempotente |
| **RNF-015** v1.1 Mantenibilidad y pruebas | Reglas en servicios de dominio, pruebas, trazabilidad por identificadores | **Parcial** | `services.py`; 77 pruebas por comportamiento contra PostgreSQL; este documento |

RF-008 (perfil del taller) y RNF-008 (trazabilidad de operaciones de negocio) no tienen implementación en esta fase: la cuenta autenticada que necesitará la auditoría ya existe, pero todavía no hay operaciones de negocio que registrar.

### Módulo 4.4.1 — Usuarios, perfiles y acceso

| Opción del módulo | Estado |
|---|---|
| Registrar comprador, registrar artesano | Implementado (`/auth/registro/comprador/`, `/auth/registro/artesano/`) |
| Iniciar sesión con teléfono y contraseña, cerrar sesión | Implementado |
| Asignar roles desde el servidor | Implementado; un rol enviado por el cliente se rechaza |
| Verificar pertenencia al pedido, limitar acciones y datos | Base implementada (`EsPropietario`, permisos por rol); los pedidos llegarán en su fase |
| Activar y desactivar cuentas según permisos | Implementado en Django Admin |
| Consultar datos personales propios | Implementado (`/auth/perfil/`) |
| Editar datos personales propios | Implementado (AUD-15): `PATCH /auth/perfil/`, solo `nombre` y `telefono`; el cambio efectivo de teléfono exige la contraseña actual. `test_datos_personales.py`, `test_concurrencia_datos_personales.py`; página `/cuenta` (`check-cuenta.mjs`) |
| Perfil público del taller; solicitar y resolver la aprobación | **Pendiente**: fase de talleres |

### Desviaciones del prototipo que esta fase resuelve en el servidor

| Desviación (`requisitos.md` §5.2) | Estado en el backend |
|---|---|
| V-8: sesión simulada con selector de vista | El servidor autentica y asigna el rol. Falta conectar el frontend |
| V-12: sin rol de administración ni Django Admin | Rol `administrador` y gestión de cuentas en Django Admin; el resto de RF-013 sigue pendiente |

## Limitaciones del mock que no pasan a ser reglas

| En el prototipo | En el backend |
|---|---|
| Contraseña de al menos 6 caracteres | Validadores de Django: mínimo 8, no común, no numérica, no parecida al nombre ni al teléfono |
| Teléfono `NNNN NNNN` o `NNNN-NNNN` | Además acepta `+505`/`505` y otros separadores; se guarda en 8 dígitos |
| Selector comprador/artesano en el acceso y en la cabecera | El rol pertenece a la cuenta; ninguna petición puede elegirlo |
| `DEMO_ARTISAN_ID` y usuarios codificados en `use-session.tsx` | Identidad desde `GET /auth/perfil/` |
| Sesión en `localStorage` | Token de acceso en memoria y renovación en cookie `HttpOnly` |

## Diferencias que deben resolverse antes de sus fases

Ninguna se resuelve aquí. Se registran para no convertir el comportamiento del prototipo en regla ni dar por homologada una decisión pendiente.

| # | Tema | Qué dice cada fuente | Antes de |
|---|---|---|---|
| 1 | **Cancelación del comprador en Pendiente frente a Aceptado** | RF-015 v2.1 y la tabla de transiciones del módulo 4.4.3 permiten cancelar una solicitud Pendiente. L-6 (Luis, 1-oct) dice «el comprador solo cancela desde Aceptado»; `requisitos.md` la anota como coincidente con RF-015, lo que vale para En producción y Listo, pero no para Pendiente. El prototipo no permite cancelar en Pendiente (V-2). La hoja recomienda D05-A1 (retiro como Pendiente → Cancelado), pendiente del equipo | Pedidos |
| 2 | **Corrección del comprobante después de las 48 horas** | El prototipo bloquea la corrección al vencer el plazo; la v2.1 solo la condiciona a que el pedido siga Aceptado, y Pago no recibido «no acorta un plazo de corrección vigente». Marcada «Pendiente de decisión» (V-4) | Pagos |
| 3 | **Modalidad de entrega: propuesta del comprador y validación del artesano** | RF-016 v2.1: el artesano registra antes de aceptar el plan de entregas y sus costos. L-4 (V-9): el comprador elige la modalidad y el artesano solo cotiza costo y notas. Difieren; requiere homologación o ajuste de la ficha | Pedidos y entregas |
| 4 | **Personalización sobre unidades existentes frente a fabricación bajo demanda** | L-2: personalizar modifica una unidad existente y consume la misma reserva. RF-017: personalización bajo demanda, que puede pedirse sin unidades disponibles. L-2 no sustituye a RF-017; el prototipo solo simula L-2 (V-6) | Catálogo y pedidos |
| 5 | **Pedidos de varios renglones de un mismo taller** | RF-018 (composición confirmada por el equipo) frente al prototipo, con un producto por solicitud (V-1), y al contrato de agosto, escrito para un producto por pedido | Pedidos |
| 6 | **Contrato de API anterior a la v2.1** | 34 endpoints derivados de 16 RF; la v2.1 tiene 22 RF (intentos de pago, entregas parciales, cierre parcial, reembolsos, unidades). La revisión depende del ADR-006 (D18), pendiente de D01–D10 | Pedidos, pagos y entregas |
| 7 | **Taller rechazado** (D13) y alta del taller en el registro (ADR-003, cuestión 5) | El contrato tiene `pendiente/aprobado/suspendido`; la hoja recomienda añadir `rechazado` | Talleres |
| 8 | **Retiro del artesano frente a moderación del administrador** (D14) | El contrato tiene un solo `publicado`; la hoja recomienda dos causas distinguibles | Catálogo |
| 9 | **Acceso administrativo a chats y comprobantes** (D11) | RF-013, RNF-004 y RNF-013 lo prohíben sin excepciones; la elección A de Luis espera al equipo. El backend no convierte a la administración de plataforma en superusuario, y esos modelos no deberán registrarse en Django Admin | Mensajería y pagos |
| 10 | **Política de imágenes** (RF-002) | Cantidad, dimensiones y miniaturas sin definir; almacenamiento público del catálogo separado de los comprobantes privados | Catálogo |


AUD-17: las notificaciones comerciales persistentes y su bandeja real se describen en [notificaciones](../api/notificaciones.md). La demo de mensajes conserva su estado separado.
