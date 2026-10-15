# Contrato de API — Talleres

**Estado:** implementado en la rama `feat/talleres-aprobacion` (AUD-02). Verificado con la suite de pruebas contra PostgreSQL y con el servidor de desarrollo.

**Fecha:** 2026-10-14

**Esquema generado:** [`openapi.yaml`](openapi.yaml), etiqueta `Talleres`.

**Requisitos:** RF-004, RF-008, RF-013; RN-002, RN-006; RNF-004, RNF-008, RNF-013. Decisiones de la tarea: D-AUD02-01 a D-AUD02-03 (al final).

El registro del artesano, que crea el taller, está descrito en [autenticación](autenticacion.md#post-apiv1authregistrocomprador-y-post-apiv1authregistroartesano). Esta implementación no gobierna aún el acceso del artesano pendiente: ese bloqueo corresponde a AUD-03.

---

## 1. Ciclo de aprobación

| Estado | Significado | Público |
|---|---|---|
| `pendiente` | Recién registrado; espera la revisión administrativa | No |
| `aprobado` | Aprobado por la administración | Sí |
| `rechazado` | Rechazado por la administración; `motivo_rechazo` opcional | No |

Transiciones: `pendiente → aprobado` y `pendiente → rechazado`. Aprobar un taller ya aprobado o rechazar uno ya rechazado no tiene efectos; cualquier otra combinación se rechaza. La decisión registra `revisado_por` y `revisado_en` con la hora del servidor.

**La aprobación no tiene endpoint REST.** Se realiza en Django Admin (`/admin/talleres/taller/`) con las acciones *Aprobar* y *Rechazar*, que exigen el permiso `talleres.revisar_taller`. Desde Django Admin el perfil del taller es de solo lectura.

## 2. Endpoints

| Método | Ruta | Acceso | Éxito |
|---|---|---|---|
| `GET` | `/api/v1/talleres/` | Público | `200` |
| `GET` | `/api/v1/talleres/{taller_id}/` | Público | `200` |
| `GET` | `/api/v1/talleres/mi-taller/` | Bearer, rol artesano | `200` |
| `PATCH` | `/api/v1/talleres/mi-taller/` | Bearer, rol artesano | `200` |

### `GET /api/v1/talleres/` y `GET /api/v1/talleres/{taller_id}/`

Perfiles públicos de los talleres **aprobados**: la colección, ordenada por nombre y sin paginar, y un taller por su identificador. Un taller pendiente, rechazado o inexistente responde `404`. No requieren autenticación y no dependen de un token enviado.

```json
200 {
  "id": 1,
  "nombre": "Cerámica López",
  "historia": "Taller familiar fundado en 1985.",
  "rubro": "Cerámica artesanal",
  "direccion_completa": "Barrio San Juan, de la iglesia 2 c. al sur, Masaya",
  "horario": "Lunes a sábado, 8:00 a 17:00",
  "telefono_publico": "",
  "whatsapp_publico": "87776655",
  "facebook_url": "",
  "instagram_url": "https://instagram.com/ceramicalopez",
  "sitio_web": ""
}
```

La respuesta no incluye propietario, estado, revisión ni datos de la cuenta. **El teléfono de acceso nunca se publica**: los contactos públicos son solo los que el artesano escribe en `telefono_publico` y `whatsapp_publico` (RN-006, RNF-013).

### `GET /api/v1/talleres/mi-taller/`

Taller del artesano autenticado, en cualquier estado. El taller se deriva del token; la petición no lo identifica. Añade al perfil público `estado`, `motivo_rechazo`, `revisado_en`, `creado_en` y `actualizado_en`.

| Error | Causa |
|---|---|
| `401` | Sin token o token no válido |
| `403` | La cuenta no es de artesano |
| `404` | La cuenta de artesano no tiene taller (cuentas creadas antes de AUD-02) |

### `PATCH /api/v1/talleres/mi-taller/`

Modifica solo los campos enviados del perfil. Editar el perfil no cambia el estado de aprobación.

| Campo | Obligatorio en el registro | Reglas |
|---|---|---|
| `nombre` | Sí | No vacío; máximo 120 caracteres |
| `rubro` | Sí | Texto propio del taller, no vacío; máximo 80. No es una categoría de producto |
| `direccion_completa` | Sí | No vacía; máximo 255 |
| `historia` | No | Máximo 2000 |
| `horario` | No | Máximo 200 |
| `telefono_publico`, `whatsapp_publico` | No | Teléfono de Nicaragua, se guarda en 8 dígitos ([autenticación §4](autenticacion.md#4-teléfono)); `""` lo retira |
| `facebook_url`, `instagram_url`, `sitio_web` | No | URL `http` o `https`; `""` la retira |

`estado`, `propietario`, `revisado_por`, `revisado_en`, `motivo_rechazo`, `creado_en`, `id` y cualquier otro campo se rechazan con `400` (`{"estado": ["Campo no permitido."]}`). Mismos errores `401`, `403` y `404` que la consulta.

## 3. Decisiones aplicadas en AUD-02

Pendientes de formalizar en una tarea documental separada; no modifican las fichas RF/RNF.

| Decisión | Contenido |
|---|---|
| D-AUD02-01 | Estados del taller: `pendiente`, `aprobado`, `rechazado`. Transiciones: `pendiente → aprobado` y `pendiente → rechazado`. |
| D-AUD02-02 | El registro del artesano crea la cuenta y el taller pendiente en una única transacción y recibe los datos iniciales del taller. |
| D-AUD02-03 | `rubro` es texto propio del taller; no depende de las categorías (AUD-04). |
