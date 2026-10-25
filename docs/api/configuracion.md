# Contrato de API — Configuración pública

**Estado:** implementado en AUD-14.

**Fecha:** 2026-10-25

**Esquema generado:** [`openapi.yaml`](openapi.yaml), etiqueta `Configuración`.

**Requisitos:** RF-007, RF-013.4; RN-010; RNF-004, RNF-008, RNF-013. Decisiones: D-AUD14-05, D-AUD14-06, D-AUD14-08, D-AUD14-09 y D-AUD14-12 ([decisiones V1](../decisiones/v1.md#concreciones-de-aud-14)).

---

## 1. Endpoint

| Método | Ruta | Acceso | Éxito |
|---|---|---|---|
| `GET` | `/api/v1/configuracion/` | Público, sin autenticación | `200` |

No existen `POST`, `PUT`, `PATCH` ni `DELETE` (`405`). La lectura no usa `Idempotency-Key` ([AUD-08](idempotencia.md)) y no depende de un token enviado: un token caducado no la impide.

## 2. Respuesta

Con tasa configurada:

```json
{
  "tasa_cambio": "36.8000",
  "actualizada_en": "2026-10-25T15:30:00-06:00"
}
```

Antes de que la administración configure una tasa:

```json
{
  "tasa_cambio": null,
  "actualizada_en": null
}
```

- `tasa_cambio`: córdobas por un dólar, como texto decimal con cuatro decimales (convención de los importes del contrato), o `null`.
- `actualizada_en`: fecha del servidor de la última actualización, o `null` sin tasa.
- No se exponen el actor ni el historial de cambios: viven en Django Admin.

## 3. Reglas

- **NIO es contractual; USD es informativo (RF-007, RN-010).** Precios, propuestas, pedidos, pagos y reembolsos se guardan y acuerdan en córdobas. Ninguno guarda `total_usd`, `precio_usd` ni la tasa (D-AUD14-08). El dólar se calcula solo al mostrar: `USD = NIO / tasa_cambio`, con dos decimales.
- **Cambiar la tasa no altera nada histórico (RF-007.4).** Solo cambia la conversión que se muestra a partir de ese momento.
- **Sin tasa por defecto (D-AUD14-05/06).** La configuración nace sin tasa. La cifra 36.8 del antiguo mock del frontend no se convirtió en tasa real. Sin tasa, o si la consulta falla, la interfaz real muestra solo córdobas y oculta el botón US$. La demo (`VITE_CATALOGO_API` sin `real`) conserva su propia tasa simulada, `TASA_CAMBIO_DEMO`, que nunca se usa como respaldo del modo real.

## 4. Escritura: Django Admin

La tasa se escribe únicamente en `/admin/configuracion/configuracionplataforma/`. Esa pantalla no forma parte de la API ni del OpenAPI (D-AUD14-12).

- `ConfiguracionPlataforma` es un singleton: CHECK `id = 1` en PostgreSQL y una fila creada por la migración `configuracion.0002`. No se agrega ni se borra.
- El formulario solo edita `tasa_cambio_usd_nio`: decimal mayor que cero, hasta 10 dígitos y 4 decimales, sin redondeo silencioso. `actualizada_por` y `actualizada_en` son de solo lectura.
- `save_model` delega en `services.actualizar_tasa_cambio(actor=request.user, nueva_tasa=…)`. Bajo `SELECT … FOR UPDATE` del singleton, en una sola transacción, crea un `CambioTasaCambio` append-only (tasa anterior, tasa nueva, actor y fecha) y actualiza la proyección. Repetir la tasa vigente no crea evento ni cambia la fecha (D-AUD14-09). Dos administradores simultáneos se serializan y ninguna actualización se pierde.
- Actor: `rol = administrador`, `is_staff`, cuenta activa y permiso `configuracion.change_configuracionplataforma`. No necesita `is_superuser`. El actor sale siempre de la sesión de Django Admin, protegida por CSRF, y nunca de un campo del formulario.

## 5. Frontend

`src/features/configuracion/http.ts` mapea el DTO: convierte `tasa_cambio` a `number` y trata un valor no finito o no positivo como «sin tasa». `CurrencyProvider` lo consulta con TanStack Query: clave pública `["configuracion-publica"]`, `staleTime` de 5 minutos y `refetchOnWindowFocus`; la tasa no se guarda en `localStorage`. Si la consulta falla o no hay tasa, una preferencia por US$ vuelve automáticamente a C$. `formatPrice(cordobas, moneda, tasa)` es una función pura. `CurrencySwitcher` muestra `1 US$ = C$ 36.8000 · Actualizada <fecha del servidor>` o «Conversión a dólares no disponible.».
