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
│   ├── urls.py                 /admin/, /api/v1/salud/, /api/v1/auth/, /api/v1/talleres/
│   ├── health.py               Sonda de disponibilidad (RNF-006)
│   ├── wsgi.py, asgi.py
│   └── tests/                  Salud, orígenes (CORS y CSRF) y esquema OpenAPI
├── apps/
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
- **Administrador de plataforma**: lo crea un superusuario en Django Admin con rol `administrador`, `is_staff` activado y solo los permisos que necesita (en esta fase, ver y cambiar usuarios, para activar o desactivar cuentas). No puede reasignar roles, otorgar privilegios, cambiar contraseñas ajenas ni ver tokens.
- **Restricción de RF-013 y RNF-004 para las fases siguientes:** la administración no accede al contenido de chats ni de comprobantes. Como un superusuario lo ve todo en Django Admin, esos modelos **no deben registrarse en el admin**, y la supervisión de pedidos será de solo lectura.

## Cómo crece: fase de talleres y catálogo

| Dónde | Qué |
|---|---|
| `apps/talleres/` (AUD-02, implementada) | Perfil del taller (RF-008) vinculado a la cuenta de artesano; aprobación (RF-013) en Django Admin. El alta ocurre en el registro del artesano; estados y rubro según D-AUD02-01 a 03 ([talleres](../api/talleres.md#3-decisiones-aplicadas-en-aud-02)). |
| `apps/catalog/` (nueva) | Categorías (RF-003), productos (RF-001, RF-017), imágenes (RF-002) y unidades estándar (RF-022). Decidir antes la política de imágenes y D14 (retiro frente a moderación). |
| `apps/accounts/api/serializers.py` | Añadir `artesano_id` y `artesano_estado` al perfil cuando exista el taller. |
| `apps/accounts/api/permissions.py` | Un permiso de «taller aprobado» para publicar; los modelos con dueño implementan `pertenece_a(usuario)`. |
| `config/settings/base.py` | Almacenamiento de archivos: imágenes públicas del catálogo separadas de los comprobantes privados, que llegarán con los pagos. |

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
