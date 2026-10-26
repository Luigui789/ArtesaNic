# Contrato de API — Salud, cuentas y sesión

**Estado:** implementado en la rama `feat/backend-foundation-auth` (fase 1). Verificado con la suite de pruebas contra PostgreSQL y con el servidor de desarrollo.

**Fecha:** 2026-10-04

**Esquema generado:** [`openapi.yaml`](openapi.yaml). Se produce desde el código, y una prueba falla si deja de coincidir con las rutas reales o con este archivo versionado ([ADR-009](../adr/0009-fuente-del-contrato-de-api.md)).

**Decisiones:** [ADR-003 — Autenticación y autorización](../adr/0003-autenticacion-y-autorizacion.md) (repositorio del frontend), concretado por el [ADR-007](../adr/0007-concrecion-de-la-autenticacion.md).

**Requisitos:** RF-004, RF-013, RNF-004, RNF-006 y RNF-013 (correspondencia en [trazabilidad.md](../trazabilidad/backend.md)).

Este documento sustituye, para los endpoints que describe, a la sección 3 de `docs/api/contrato-api.md` del frontend. Las diferencias están en la [última sección](#diferencias-con-la-sección-3-del-contrato-del-frontend).

---

## 1. Convenciones

- **Base:** `/api/v1/`. Rutas en español, en plural cuando corresponde y con barra final.
- **Formato:** JSON en `snake_case`. Las peticiones con otro tipo de contenido reciben `415`.
- **Identidad:** el cliente nunca envía su rol ni su identidad; el servidor los deriva de la cuenta autenticada.
- **Cerrado por defecto:** todo endpoint exige autenticación salvo que se declare público.

### Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | Validación fallida | `{"campo": ["mensaje", ...]}` |
| `401` | Sin autenticar, credenciales incorrectas o sesión no válida | `{"detail": "..."}` y cabecera `WWW-Authenticate: Bearer realm="api"` |
| `403` | Token CSRF ausente o inválido, rol sin permiso o cuenta de administración | `{"detail": "..."}` |
| `404` | Ruta inexistente, o recurso ajeno (no se revela que existe) | `{"detail": "No encontrado."}` |
| `415` | Cuerpo que no es JSON | `{"detail": "Tipo de medio \"...\" incompatible en la solicitud."}` |
| `429` | Demasiados intentos | `{"detail": "..."}` y cabecera `Retry-After` |

Las respuestas no incluyen contraseñas, hashes, tokens de renovación, trazas ni nombres de clases internas.

---

## 2. Mecanismo de sesión (ADR-003, ADR-007)

| Elemento | Dónde viaja | Quién lo maneja | Vida |
|---|---|---|---|
| Token de **acceso** | Cuerpo de la respuesta → **memoria** de JavaScript → cabecera `Authorization: Bearer …` | Frontend | 5 minutos |
| Token de **renovación** | Cookie `refresh`: `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/`, `Secure` fuera de local | Backend; el navegador la envía solo | 7 días, rotativo |
| Token **CSRF** | Cuerpo de `GET /auth/csrf/` → memoria → cabecera `X-CSRFToken`; además la cookie `csrftoken` | Frontend lo reenvía; Django lo valida | Mientras exista la cookie |

- Ningún token se guarda en `localStorage` ni en `sessionStorage`.
- El token de renovación **nunca** aparece en un cuerpo JSON.
- Cada renovación entrega una cookie nueva y **revoca** la anterior (lista de revocados en PostgreSQL).
- En cada petición autenticada se vuelve a leer la cuenta: si se desactiva, su siguiente petición recibe `401`, aunque el token no haya caducado.

### Por qué hay CSRF

La API se autentica con la cabecera `Bearer`, que el navegador no adjunta por su cuenta. Los endpoints que **emiten o leen la cookie de renovación** sí dependen de algo que el navegador envía automáticamente, así que exigen CSRF: registro, login, refrescar y logout. Se aplica la validación de Django completa: token de la cabecera contra la cookie `csrftoken` y, si llega la cabecera `Origin`, que sea el propio backend o un origen de `DJANGO_FRONTEND_ORIGINS`.

### Integración desde la SPA

Todas las peticiones a la API deben usar `credentials: "include"`, para que el navegador envíe y guarde las cookies aunque frontend y backend usen puertos distintos.

```js
const API = "http://localhost:8000/api/v1";
let csrfToken = null;   // en memoria
let accessToken = null; // en memoria

async function obtenerCsrf() {
  const r = await fetch(`${API}/auth/csrf/`, { credentials: "include" });
  csrfToken = (await r.json()).csrf_token;
}

async function postDeSesion(ruta, cuerpo) {
  if (!csrfToken) await obtenerCsrf();
  return fetch(`${API}/auth/${ruta}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
}

// Login (igual para registro/comprador/ y registro/artesano/)
const r = await postDeSesion("login/", { telefono: "8555 1234", password: "…" });
const { access, usuario } = await r.json();
accessToken = access;

// Peticiones autenticadas
fetch(`${API}/auth/perfil/`, {
  credentials: "include",
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

| Situación | Qué hace el frontend |
|---|---|
| **Arranque o recarga** | `POST /auth/refrescar/` → si `200`, guarda `access` y llama a `GET /auth/perfil/`; si `401`, sesión anónima. El token de acceso no sobrevive a la recarga, así que el perfil no puede pedirse primero. |
| **Respuesta `401`** en cualquier endpoint | Una sola renovación en curso (las demás peticiones la esperan) y un único reintento. Si la renovación responde `401`, la sesión terminó. |
| **Logout** | `POST /auth/logout/` y descartar `accessToken`. |
| **`403` por CSRF** | Pedir otro token a `GET /auth/csrf/` y reintentar una vez. |

**Implementación en la SPA (AUD-18):** `apps/frontend/src/lib/http/` y `src/features/auth/` siguen esta tabla con `VITE_AUTH_API=real`. El `403` de CSRF se reconoce por el inicio de su detalle («Falta el token CSRF»), porque DRF no envía su código. Ante un `401` de `refrescar` la sesión se da por terminada sin reintentar (ver el aviso siguiente). Detalle en [arquitectura del frontend](../arquitectura/frontend.md).

> Varias pestañas que renuevan a la vez pueden competir por la misma cookie: la primera la rota y la segunda recibe `401`. Ante un `401` de `refrescar`, conviene reintentar una vez antes de dar la sesión por terminada, porque la cookie del navegador ya puede ser la nueva.

---

## 3. Endpoints

| Método | Ruta | Acceso | CSRF | Éxito |
|---|---|---|---|---|
| `GET` | `/api/v1/salud/` | Público | No | `200` |
| `GET` | `/api/v1/auth/csrf/` | Público | No | `200` |
| `POST` | `/api/v1/auth/registro/comprador/` | Público | Sí | `201` |
| `POST` | `/api/v1/auth/registro/artesano/` | Público | Sí | `201` |
| `POST` | `/api/v1/auth/login/` | Público | Sí | `200` |
| `POST` | `/api/v1/auth/refrescar/` | Cookie de renovación | Sí | `200` |
| `POST` | `/api/v1/auth/logout/` | Cookie de renovación (opcional) | Sí | `204` |
| `GET` | `/api/v1/auth/perfil/` | Bearer | No | `200` |
| `PATCH` | `/api/v1/auth/perfil/` | Bearer | No | `200` |

### `GET /api/v1/salud/`

Sonda de disponibilidad del proceso (RNF-006). No consulta la base de datos ni requiere autenticación.

```json
200 {"estado": "ok"}
```

### `GET /api/v1/auth/csrf/`

Fija la cookie `csrftoken` y devuelve el valor para la cabecera `X-CSRFToken`. Respuesta sin caché (`Cache-Control: no-store`).

```json
200 {"csrf_token": "y8Qm…(64 caracteres)"}
```

### `POST /api/v1/auth/registro/comprador/` y `POST /api/v1/auth/registro/artesano/`

Crean la cuenta con el rol que corresponde a la ruta e **inician la sesión**. El registro del artesano crea además, **en la misma transacción**, su taller en estado `pendiente` con los datos iniciales de `taller`: si el taller no es válido no se crea ninguno de los dos. La aprobación es exclusiva de la administración ([talleres](talleres.md)).

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | texto | Sí | Nombre del responsable. No vacío tras recortar espacios; máximo 150 caracteres |
| `telefono` | texto | Sí | Teléfono de acceso, privado ([sección 4](#4-teléfono)) |
| `password` | texto | Sí | Validadores de Django ([sección 5](#5-contraseña)) |
| `taller` | objeto | Solo artesano | Datos iniciales: `nombre`, `rubro` y `direccion_completa` obligatorios; `historia`, `horario` y contactos públicos opcionales ([talleres §2](talleres.md#patch-apiv1talleresmi-taller)) |

**Cualquier otro campo se rechaza** con `400`, incluidos `rol`, `is_staff`, `is_superuser`, `is_active`, `groups` y `user_permissions`; dentro de `taller`, también `estado`, `propietario` y los campos de revisión. El comprador no envía `taller`. No existe registro público de administradores. El teléfono de acceso no se copia nunca como contacto público del taller.

```http
POST /api/v1/auth/registro/artesano/
Content-Type: application/json
X-CSRFToken: y8Qm…

{"nombre": "Ana Lucía Delgado", "telefono": "+505 8555-1234", "password": "Tejido-de-Masaya-2026",
 "taller": {"nombre": "Cerámica López", "rubro": "Cerámica artesanal", "direccion_completa": "Barrio San Juan, Masaya"}}
```

```http
HTTP/1.1 201 Created
Set-Cookie: refresh=eyJ…; HttpOnly; Max-Age=604800; Path=/api/v1/auth/; SameSite=Lax

{"access": "eyJ…", "usuario": {"id": 4, "nombre": "Ana Lucía Delgado", "telefono": "85551234", "rol": "artesano"}}
```

| Error | Cuerpo |
|---|---|
| `400` teléfono ya registrado (tras normalizar) | `{"telefono": ["Ya existe una cuenta con este teléfono."]}` |
| `400` campos obligatorios | `{"nombre": ["Este campo es requerido."], "telefono": [...], "password": [...]}` |
| `400` campo no permitido | `{"rol": ["Campo no permitido."]}` |
| `400` datos del taller (artesano) | `{"taller": {"rubro": ["Este campo es requerido."]}}` |
| `400` contraseña débil | `{"password": ["La contraseña es demasiado corta. Debe contener por lo menos 8 caracteres."]}` |
| `403` CSRF | `{"detail": "Falta el token CSRF o no es válido. Solicita uno en /api/v1/auth/csrf/."}` |
| `429` límite de registros | `{"detail": "Solicitud fue regulada (throttled). Se espera que esté disponible en N segundos."}` |

### `POST /api/v1/auth/login/`

| Campo | Tipo | Obligatorio |
|---|---|---|
| `telefono` | texto | Sí, en cualquier formato admitido |
| `password` | texto | Sí |

El rol **no** se envía: lo determina la cuenta (un campo `rol` se rechaza con `400`). La respuesta es igual a la del registro, con `200`.

| Error | Cuándo | Cuerpo |
|---|---|---|
| `400` | Teléfono con formato inválido o campos ausentes | `{"telefono": ["Ingresa un teléfono de Nicaragua de 8 dígitos."]}` |
| `401` | Contraseña incorrecta, teléfono no registrado **o cuenta inactiva** (mismo mensaje: no revela si el teléfono existe) | `{"detail": "Teléfono o contraseña incorrectos."}` |
| `403` | CSRF, o credenciales correctas de una cuenta de administración | `{"detail": "Las cuentas de administración ingresan por Django Admin, no por esta aplicación."}` |
| `429` | Límite de intentos | Ver [sección 7](#7-limitación-de-intentos) |

### `POST /api/v1/auth/refrescar/`

Sin cuerpo. Usa la cookie `refresh`, la rota y devuelve un token de acceso nuevo.

```json
200 {"access": "eyJ…"}   + Set-Cookie: refresh=<nuevo>
```

`401 {"detail": "La sesión no es válida o expiró. Inicia sesión de nuevo."}` si falta la cookie, caducó, fue revocada (por rotación o logout), fue alterada o su cuenta ya no está activa. Un `401` aquí **no borra** la cookie, para no pisar la que otra pestaña acaba de rotar. `403` si falta CSRF.

### `POST /api/v1/auth/logout/`

Sin cuerpo. Revoca en el servidor el token de renovación de la cookie y responde `204` con la cookie borrada (`Max-Age=0`). **No exige el token de acceso**, para poder cerrar aunque haya caducado, y es idempotente: sin cookie o con una ya revocada también responde `204`. Exige CSRF.

> **Límite asumido (ADR-007):** un token de acceso ya emitido no se revoca; deja de servir al caducar, como máximo 5 minutos después. El frontend lo descarta al cerrar sesión. La sesión, que es lo que permite obtener tokens nuevos, queda invalidada de inmediato.

### `GET /api/v1/auth/perfil/`

Requiere `Authorization: Bearer <access>`. Devuelve solo la identidad, sin caché:

```json
200 {"id": 4, "nombre": "Ana Lucía Delgado", "telefono": "85551234", "rol": "artesano"}
```

- `rol` es `comprador` o `artesano`: la API no autentica cuentas de administración.
- Los campos `artesano_id` y `artesano_estado` del contrato del frontend **todavía no existen**: el taller y su estado se consultan en `GET /api/v1/talleres/mi-taller/` ([talleres](talleres.md)). Se omiten en lugar de enviarse como `null`, porque en el contrato `null` significa «no es artesano».
- `401` sin token (`"Las credenciales de autenticación no se proveyeron."`) o con un token no válido, caducado, de renovación o de una cuenta desactivada (`"La sesión no es válida o expiró. Inicia sesión de nuevo."`).

### `PATCH /api/v1/auth/perfil/`

Actualiza los datos personales de la cuenta autenticada (AUD-15, RF-004). Requiere `Authorization: Bearer <access>` y **no exige CSRF**, igual que el `GET`: no usa cookies. No hay identificador en la ruta: la cuenta es siempre la del token. Actualización parcial con lista cerrada de campos:

| Campo | Regla |
|---|---|
| `nombre` | Opcional. Se recorta; no vacío; máximo 150 caracteres. |
| `telefono` | Opcional. Mismos formatos y normalización que el registro (§4). |
| `password_actual` | Auxiliar y *write-only*. Obligatorio solo si el teléfono **cambia de forma efectiva**. No se guarda, no se registra y no se devuelve. |

```json
PATCH {"nombre": "Ana Lucía López"}
PATCH {"telefono": "8777 1234", "password_actual": "…"}
200   {"id": 4, "nombre": "Ana Lucía López", "telefono": "87771234", "rol": "artesano"}
```

- La respuesta es la misma identidad de `GET /auth/perfil/` (`UsuarioSerializer`), sin caché.
- **Cambio efectivo del teléfono:** el teléfono es el identificador de acceso, así que cambiarlo exige la contraseña actual. Un teléfono que normaliza al actual (`8555-1234` cuando la cuenta tiene `85551234`) no es un cambio y no la pide. La decisión se toma sobre la fila de la cuenta bloqueada (`SELECT … FOR UPDATE`), no sobre datos leídos antes.
- **No es editable aquí:** `id`, `rol`, `is_active`, `is_staff`, `is_superuser`, `groups`, `user_permissions`, `password`, `last_login`, `creado_en` ni cualquier otro campo: responden `400` «Campo no permitido.» y la petición no aplica nada. AUD-15 no implementa cambio ni recuperación de contraseña.
- **Sesión:** no cierra la sesión ni emite tokens. El token de acceso y la cookie de renovación vigentes siguen sirviendo porque identifican la cuenta por su `id`. Tras cambiar el teléfono, el login con el anterior falla y con el nuevo funciona; la contraseña no cambia.
- **Taller:** el teléfono de la cuenta es privado y no se sincroniza con `telefono_publico`, `whatsapp_publico` ni ningún contacto público del taller; tampoco cambia el estado del taller.
- No se conserva historial de los valores anteriores. El registro de la operación solo anota el `id` de la cuenta, el tipo de operación y el resultado.

Errores:

| Código | Cuerpo |
|---|---|
| `400` | `{"telefono": ["Ya existe una cuenta con este teléfono."]}` (también cuando dos cuentas piden el mismo teléfono a la vez: la restricción única decide y nunca hay `500`) |
| `400` | `{"password_actual": ["Confirma tu contraseña actual para cambiar el teléfono."]}` |
| `400` | `{"password_actual": ["La contraseña actual no es correcta."]}` (se comprueba antes que la unicidad: sin la contraseña correcta no se revela si un teléfono está registrado) |
| `400` | `{"rol": ["Campo no permitido."]}`, formatos de teléfono o nombre inválidos |
| `401` | Sin token, token no válido o cuenta desactivada |
| `429` | Límite `reautenticacion` superado (§7) |

---

## 4. Teléfono

El teléfono es el identificador de acceso y se guarda en forma **canónica: 8 dígitos**, sin prefijo ni separadores, igual que lo representa el contrato. Una restricción de PostgreSQL impide guardar otra forma, así que la unicidad no depende del formato.

| Entrada | Resultado |
|---|---|
| `85551234`, `8555 1234`, `8555-1234`, `8555.1234`, `(8555) 1234` | `85551234` |
| `+505 8555 1234`, `+50585551234`, `+(505) 8555-1234` | `85551234` |
| `505 8555 1234`, `50585551234` (prefijo sin `+`, seguido de 8 dígitos exactos) | `85551234` |
| `5051 2345` (8 dígitos que empiezan por 505) | `50512345`: se conserva |
| Dígitos de ancho completo (`８５５５１２３４`) | `85551234` |
| `+506 8555 1234` u otro código de país | `400` «Solo se admiten teléfonos de Nicaragua (+505).» |
| 7 o 9 dígitos, letras, `00505…`, dígitos no ASCII | `400` «Ingresa un teléfono de Nicaragua de 8 dígitos.» |

No se valida el plan de numeración (prefijos de operador o de telefonía fija): el alcance vigente solo exige un número nicaragüense de 8 dígitos, como el formulario del prototipo. Admitir otros países exigiría migrar a formato E.164.

## 5. Contraseña

Se guarda con el hash de Django (PBKDF2 por defecto; RNF-004) y se valida con `AUTH_PASSWORD_VALIDATORS`: mínimo **8** caracteres, no común, no solo numérica y no parecida al nombre ni al teléfono. El prototipo admitía 6 caracteres; esa regla del mock no se trasladó al backend y el formulario del frontend deberá ajustarse.

## 6. Permisos

| Regla | Dónde |
|---|---|
| Todo endpoint exige autenticación salvo declaración expresa | `DEFAULT_PERMISSION_CLASSES` |
| `EsComprador` / `EsArtesano`: `401` si es anónimo, `403` si el rol no corresponde | `apps/accounts/api/permissions.py` |
| `EsPropietario`: el objeto declara `pertenece_a(usuario)`; un objeto ajeno responde `404` | `apps/accounts/api/permissions.py` |
| `EsArtesanoAprobado`: como `EsArtesano`, y además el taller propio debe estar aprobado; `403` si está pendiente, rechazado o no existe (RF-004, RN-002). Exigido por toda función operativa del artesano | `apps/talleres/api/permissions.py` ([talleres §3](talleres.md#3-habilitación-operativa-del-artesano)) |
| El rol se lee de la cuenta en el servidor; parámetros, cuerpo o cabeceras con un rol no conceden nada | Probado en `test_permissions.py` |
| Cuentas de administración: no se autentican en la API | `puede_autenticarse` y `Usuario.puede_usar_api` |

Los permisos de rol y propietario se prueban con vistas de prueba: todavía no hay recursos de negocio que los usen. Las fases siguientes los aplicarán junto con querysets limitados al usuario.

## 7. Limitación de intentos

| Alcance | Clave | Límite | Endpoints |
|---|---|---|---|
| `login` | IP | 10 por minuto | login |
| `login_telefono` | Teléfono normalizado | 20 por hora | login |
| `registro` | IP | 10 por hora (ambos registros juntos) | registro de comprador y de artesano |
| `reautenticacion` | Cuenta autenticada | 10 por hora | `PATCH /auth/perfil/` que envía `password_actual`; editar solo el nombre no cuenta |

Al superarse: `429` con `Retry-After`. Límites conocidos:

- Cuenta **todos** los intentos, también los correctos.
- Los contadores viven en la caché en memoria del proceso: con varios procesos o servidores no se comparten. La configuración de despliegue deberá usar una caché compartida.
- La IP es `REMOTE_ADDR`. Detrás de un proxy hay que declarar `DJANGO_NUM_PROXIES`; sin proxies se ignora `X-Forwarded-For`, que el cliente podría falsificar para eludir el límite.
- Muchos usuarios detrás de la misma IP pública (CGNAT de operadoras móviles) comparten el límite por IP.
- El límite por teléfono permite que un tercero bloquee temporalmente el acceso a una cuenta insistiendo con contraseñas falsas, durante como máximo una hora.

## 8. Cookies por entorno

| Cookie | Atributos | Local (`config.settings.local`) | Desplegado (`config.settings.base`) |
|---|---|---|---|
| `refresh` | `HttpOnly`, `Path=/api/v1/auth/`, `Max-Age` 7 días | `SameSite=Lax`, sin `Secure` | `Secure` y `SameSite` según `DJANGO_COOKIE_SAMESITE` |
| `csrftoken` | Legible por JavaScript, pero el token se toma del cuerpo de `/auth/csrf/` | `SameSite=Lax`, sin `Secure` | `Secure` y `SameSite` según `DJANGO_COOKIE_SAMESITE` |
| `sessionid` | Solo Django Admin | sin `Secure` | `Secure` |

CORS admite únicamente los orígenes exactos de `DJANGO_FRONTEND_ORIGINS`, con credenciales y solo para `/api/`. Nunca se admite cualquier origen.

**Topología de despliegue:** con `SameSite=Lax`, frontend y API deben compartir *sitio* (por ejemplo `app.dominio.ni` y `api.dominio.ni`, o el mismo dominio detrás de un proxy). En sitios distintos haría falta `SameSite=None` con `Secure`, y algunos navegadores bloquean igualmente esas cookies de terceros. La topología se decide en la fase de despliegue.

---

## Diferencias con la sección 3 del contrato del frontend

| Contrato del frontend (agosto) | Implementación | Motivo |
|---|---|---|
| `POST /auth/registro/` con `rol` en el cuerpo | Dos operaciones: `/auth/registro/comprador/` y `/auth/registro/artesano/`; `rol` se rechaza | El servidor decide el rol (contrato §1.7 e instrucciones de la fase); ADR-007 |
| El registro de artesano crea el taller pendiente | Crea cuenta y taller pendiente en una transacción, con los datos iniciales en `taller` (AUD-02) | El administrador revisa el taller con esos datos ([talleres](talleres.md)) |
| `perfil` incluye `artesano_id` y `artesano_estado` | Se omiten; el estado se consulta en `GET /talleres/mi-taller/` | No ampliar el perfil de sesión antes de AUD-03 |
| CSRF solo en `refrescar` y `logout` | También en `registro` y `login`, que fijan la cookie | Evita forzar a un navegador a iniciar sesión en una cuenta ajena |
| Sin endpoint para obtener el token CSRF | `GET /auth/csrf/` | La SPA necesita el token aunque frontend y API estén en subdominios distintos |
| `logout` marcado 🔒 | Exige cookie + CSRF, no el token de acceso; idempotente | Poder cerrar sesión con el acceso caducado |
| Sin especificación de errores de acceso | `401` único para credenciales e inactividad; `403` para cuentas de administración; `429` por límite | Sin enumeración de cuentas ni detalles internos |
| — | `GET /api/v1/salud/` | Endpoint técnico (RNF-006); no forma parte de los 34 del contrato |

La sección 3 del contrato del frontend debe actualizarse para remitir a este documento ([ADR-009](../adr/0009-fuente-del-contrato-de-api.md)); ese cambio es una tarea del repositorio del frontend.
