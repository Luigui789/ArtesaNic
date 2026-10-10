# ADR-003 — Autenticación y autorización

**Estado:** Aceptada (decisión registrada; **no implementada** — el repositorio permanece congelado en código).

**Fecha:** 2026-08-16

**Decisiones previas relacionadas:** [ADR-001 — Routing](0001-sistema-de-routing.md) · [ADR-002 — Acceso a datos y contratos](0002-acceso-a-datos-y-contratos.md)

**Requisitos que implementa:** RF-004 (autenticación simplificada), RNF-004 (seguridad de datos sensibles), RF-013 (roles y panel de administración).

## Contexto

### Lo que hay hoy

El prototipo **no tiene autenticación**: tiene la apariencia de tenerla.

- [`src/hooks/use-session.tsx`](../../apps/frontend/src/features/auth/use-session.tsx) define dos objetos constantes (`COMPRADOR` y `ARTESANO`) y los guarda en `localStorage`. No hay token, ni expiración, ni credenciales.
- [`src/routes/auth.tsx`](../../apps/frontend/src/features/auth/pages/acceso.tsx) valida con Zod el formato del teléfono y la contraseña, y a continuación **descarta ambos**: la llamada efectiva es `ingresar(rol, nombre)`. Cualquier teléfono de 8 dígitos con cualquier contraseña de 6 caracteres inicia sesión, y **el rol lo elige quien se autentica** desde un selector del formulario.
- No existe ninguna guarda de ruta. Todas las pantallas de `/panel/*` se renderizan para cualquier visitante.
- `DEMO_ARTISAN_ID` (la constante `"art-1"` exportada desde `mock-api.ts`) aparece en **ocho archivos** y es la fuente real de la identidad del taller.

### Los dos defectos concretos que esto produce

**1. Escalada de privilegios por el valor de reserva.** Las cuatro pantallas del panel repiten este patrón:

```ts
const artesanoId = usuario?.artesanoId ?? DEMO_ARTISAN_ID;
```

Una persona con rol comprador tiene `artesanoId === undefined`, de modo que el valor de reserva la sitúa en `art-1`. Al entrar a `/panel/productos` no encuentra una pantalla vacía: ve el taller ajeno y **puede crear y editar sus productos**. Lo que se escribió como comodidad para la demostración funciona como una escalada de privilegios.

**2. Referencia directa a objetos sin control de acceso (IDOR).** `getOrder(id)` resuelve `store.orders.find((x) => x.id === id)` sin comprobar a quién pertenece el pedido. Visitar `/pedidos/{id}` con un identificador ajeno muestra personalización, montos, datos de pago y la conversación completa de otras personas. Lo mismo ocurre con `changeOrderStatus`, `registerPayment` y `confirmPayment`, que no verifican quién los invoca.

### Tres niveles que no deben confundirse

| Nivel | Pregunta que responde | Responsable |
|---|---|---|
| Autenticación | ¿Quién sos? | Backend (emisión y validación del token) |
| Autorización | ¿Qué te está permitido hacer? | Backend — **única autoridad** |
| Guardas de ruta | ¿Qué pantalla te muestro? | Frontend — **solo experiencia de usuario** |

Las guardas del frontend **no son un mecanismo de seguridad**. Evitan que alguien llegue a una pantalla que no le sirve; nada más. Quien edite el JavaScript en su navegador puede saltárselas. La protección real es que el backend responda con un error ante un recurso ajeno, aunque el frontend haya permitido la navegación.

## Decisión

### 1. Almacenamiento de credenciales en el cliente

- El **token de acceso** se mantiene **exclusivamente en memoria** de JavaScript (una variable del módulo del cliente HTTP). **Nunca** en `localStorage` ni en `sessionStorage`.
- El **token de renovación** viaja en una **cookie `HttpOnly`, `Secure` y `SameSite`**, emitida y gestionada por el backend. El frontend **no lo lee, no lo escribe y no lo conoce**.

El motivo es directo: sustituir `localStorage.setItem("usuario", …)` por `localStorage.setItem("accessToken", …)` no sería una mejora de seguridad. Ante una vulnerabilidad de XSS, cualquier script podría leer ese token y suplantar la sesión. Con el token de renovación en una cookie `HttpOnly`, JavaScript no tiene acceso a él en ningún caso.

### 2. Recuperación de la sesión

Al iniciar la aplicación, el frontend **no intenta leer ningún token persistido**. Solicita la identidad al backend mediante un endpoint autenticado de sesión:

```
Arranque de la aplicación
        │
        ▼
   GET /auth/perfil/
        │
        ├── sesión válida  → reconstruye el contexto de usuario
        └── sesión inválida → sesión anónima
```

El token de acceso desaparece al recargar la página, pero eso **no obliga a iniciar sesión de nuevo**: la cookie de renovación permite reconstruir la sesión de forma transparente.

### 3. La identidad proviene siempre del backend

```
Backend (token + /auth/perfil/)
        ↓
   identidad real
        ↓
   SessionContext
        ↓
    componentes
```

El frontend **no construye, deduce ni completa** identificadores de identidad. En particular:

> **`artesanoId === undefined` significa «esta persona no es artesana».** No significa «usar `art-1`». El frontend debe deshabilitar las funcionalidades de taller, nunca sustituir el valor ausente por uno de reserva.

En consecuencia, `DEMO_ARTISAN_ID` **se elimina del proyecto**, junto con las ocho referencias que lo consumen.

### 4. El cliente nunca envía su propia identidad

Ninguna petición transporta `rol`, `usuario`, `comprador_id` ni el `artesano_id` propio. El backend los deriva de la petición autenticada, y **rechaza o ignora** esos campos si llegan en el cuerpo. Esto elimina las firmas actuales `listOrders({ rol, artesanoId })`, `createOrderRequest(input, usuario)` y `changeOrderStatus(id, estado, usuario, motivo)`.

### 5. Guardas de ruta en el frontend (solo experiencia de usuario)

```
/panel/*
   ├── sin sesión              → redirección a /auth
   ├── sesión de comprador     → mensaje de acceso no disponible
   └── sesión de artesano      → panel
```

Se implementan por conveniencia, **no como control de acceso**. El backend vuelve a verificar identidad, permiso y propiedad del recurso en cada petición, con independencia de lo que el frontend haya permitido.

### 6. Protección contra CSRF

Como el token de renovación viaja en una cookie, **los endpoints que dependen de esa cookie necesitan protección CSRF**: renovación de token y cierre de sesión. El resto de la API se autentica con la cabecera `Authorization: Bearer …`, que el navegador no envía de forma automática y que por tanto **no es susceptible a CSRF**.

> **Precisión importante:** `djangorestframework-simplejwt` **no** implementa por sí solo este esquema. Por defecto entrega ambos tokens en el cuerpo de la respuesta JSON y deja al cliente la decisión de dónde guardarlos. Emitir el token de renovación como cookie `HttpOnly` y proteger los endpoints correspondientes frente a CSRF es **trabajo explícito del backend**, y no debe documentarse como si la biblioteca lo resolviera automáticamente.

## Reparto de responsabilidades

| Responsabilidad | Backend (Django/DRF) | Frontend (este repositorio) |
|---|---|---|
| Validar credenciales y emitir tokens | Sí | No |
| Emitir la cookie de renovación (`HttpOnly`, `Secure`, `SameSite`) | Sí | No |
| Protección CSRF de renovación y cierre de sesión | Sí | No |
| Determinar el rol y el taller de cada persona | Sí | No |
| Autorizar cada operación y verificar la propiedad del recurso | Sí — **autoridad única** | No |
| Conservar el token de acceso en memoria y adjuntarlo a cada petición | No | Sí |
| Renovar el token de forma transparente ante un `401` | No | Sí |
| Reconstruir la sesión al arrancar (`GET /auth/perfil/`) | Sirve el endpoint | Lo consume |
| Guardas de ruta y visibilidad de controles | No | Sí — solo experiencia de usuario |

## Consecuencias

**Positivas**

- El robo de sesión mediante XSS deja de ser viable: el token de renovación es inaccesible desde JavaScript y el de acceso no se persiste.
- La identidad no puede falsificarse editando el almacenamiento del navegador, porque proviene siempre del servidor.
- Desaparecen la escalada de privilegios por valor de reserva y las firmas que aceptaban identidad desde el cliente.
- La separación entre autorización (backend) y guardas (frontend) queda explícita y es defendible ante un tribunal.

**Negativas y costos asumidos**

- El backend debe implementar el transporte por cookie y la protección CSRF; no lo resuelve la biblioteca.
- Cada arranque de la aplicación cuesta una petición adicional (`GET /auth/perfil/`) antes de poder renderizar contenido dependiente de la sesión.
- En desarrollo local, con frontend y backend en puertos distintos, las cookies exigen configurar CORS con credenciales y ajustar `SameSite`; es una fuente habitual de fricción.
- El frontend necesita lógica de renovación ante respuestas `401`, con control de peticiones concurrentes para no disparar varias renovaciones simultáneas.

## Cuestiones abiertas

1. **Caducidad de los tokens.** Duración del token de acceso y del de renovación, y si la renovación es rotativa (cada uso emite uno nuevo e invalida el anterior).
2. **Cierre de sesión.** Si el backend mantiene una lista de tokens revocados o basta con eliminar la cookie.
3. **Aprobación de talleres (RF-013).** Qué recibe al iniciar sesión una persona artesana cuyo taller aún no ha sido aprobado por el administrador.
4. **Rol de administrador.** El tipo `Role` solo contempla `comprador` y `artesano`. Está pendiente decidir si el administrador existe únicamente en Django Admin —fuera de esta API— o si necesita representación en el contrato.
5. **Registro de personas artesanas.** Si `POST /auth/registro/` crea el taller directamente o si el alta del taller es un paso posterior.
