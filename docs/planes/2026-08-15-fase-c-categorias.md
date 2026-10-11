# Fase C — Categorías como entidad del backend — Plan de migración

> **Para ejecutores agénticos:** este plan **no está autorizado a ejecutarse** a la fecha de escritura. La autorización se otorga por separado, después de revisar este documento, y cubre únicamente este plan. Cualquier dependencia inesperada, diferencia entre el código real y lo aquí descrito, o hallazgo que afecte lógica de negocio **detiene esa parte y se consulta** antes de improvisar.

**Objetivo:** que la categoría deje de ser una unión literal de textos definida en el frontend y pase a ser una entidad servida por el backend, con la representación que cada consumidor necesita.

**Naturaleza del cambio:** migración de **representación y fuente de verdad** de una entidad de dominio y de todos sus consumidores directos. No corrige desviaciones de requisitos ni cambia reglas de negocio.

**Spec:** [`docs/api/contrato-api.md`](../api/contrato-api.md) §2.3 (catálogo de códigos), §4 (`GET /categorias/` y la asimetría lectura/escritura), §5 (producto y filtro), §6 (taller), §10 (tabla de impacto).

**Fase anterior:** [Fase B — Identificadores numéricos](2026-08-15-fase-b-identificadores-numericos.md), cerrada.

---

## Decisiones cerradas antes de escribir este plan

| # | Decisión |
|---|---|
| 1 | **`Category` es un objeto** `{ id: number; codigo: string; nombre: string }`. `Product.categoria` y `Artisan.rubro` lo llevan completo, porque el contrato lo anida en lectura. Los consumidores de lectura usan `.nombre` directamente, **sin helper**. |
| 2 | **Escritura, filtros y URL usan solo el código.** `ProductInput.categoria`, `CatalogFilters.categoria` y `?categoria=` son `string`. El formulario no selecciona un objeto para enviarlo: selecciona una categoría para enviar su código. |
| 3 | **El catálogo no espera a `GET /categorias/` para aceptar el parámetro de URL.** Desaparece la validación contra una constante local. El parámetro viaja tal cual al servicio, y el mock —y después el backend— es la autoridad sobre qué categoría existe. Esto preserva los enlaces profundos y evita acoplar el primer render del catálogo a una segunda consulta. |
| 4 | **El formulario arranca sin categoría seleccionada.** Nada de preseleccionar la primera opción recibida: sería una decisión arbitraria que permite publicar sin haber elegido. La ausencia es un estado explícito, con validación obligatoria. |
| 5 | **`categoryLabel()` se conserva y cambia de responsabilidad**: traduce un **código aislado** a etiqueta, consultando la colección de categorías. No se usa donde ya hay un `Category` completo. No se crea ningún helper nuevo. |
| 6 | **`countByCategory()` se corrige, no se elimina.** Es adaptación forzada —el cambio de tipo invalida su índice—, no limpieza oportunista. |

### El modelo resultante

```text
                    GET /categorias/
                           │
                           ▼
                      Category[]
                           │
              ┌────────────┴────────────┐
           lectura                   opciones
              │                          │
       ┌──────┴──────┐          ┌────────┼─────────┐
       ▼             ▼          ▼        ▼         ▼
   Product        Artisan    Portada  Filtro  Formulario
   .categoria     .rubro
       └──────┬──────┘
              ▼
           .nombre                    codigo → URL / input / filtro
```

---

## Alcance

### Entra

- `Category` pasa a objeto; `Artisan.rubro` y `Product.categoria` lo adoptan.
- `GET /categorias/` en el mock (`listCategories()`), como única fuente de opciones.
- `CATEGORIES` deja de ser fuente de categorías.
- Los tres consumidores de opciones: portada, filtro del catálogo, selector del formulario.
- Los seis sitios que muestran la categoría.
- URL `?categoria=<codigo>`.
- `categoryLabel()` adaptado a códigos.
- `countByCategory()` indexado por `codigo`.
- Seed y mock adaptados al nuevo modelo.
- Estados de carga y error en los consumidores que ahora dependen de una consulta.

### No entra

- La regla implícita "todo producto hereda el rubro de su taller" — deuda propia, sin registrar aún en el catálogo de desviaciones.
- La eliminación de `countByCategory()`.
- Cualquier otra limpieza no forzada por el cambio de tipos.
- Cambios estructurales del pedido (`producto` anidado, `estadoAnterior: null`, `reembolso` D-5, comprobante D-10).
- Autenticación y D-6; D-2; el resto del bloque de identidad y reglas.
- La deuda **T-1** (finales de línea CRLF/LF) y la decisión sobre **T-2** (`.claude/launch.json`), abiertas desde el cierre de B.

---

## Dónde vive `CATEGORY_IMAGE` — decidido

Hoy está en [`seed.ts:10`](../../apps/frontend/src/mocks/seed.ts) y la portada lo importa directamente desde ahí ([`index.tsx:5`](../../apps/frontend/src/features/catalogo/pages/inicio.tsx)), lo que ya contradice la regla del proyecto de que los componentes no dependan de estructuras internas del seed.

El problema de fondo: son *assets* locales de presentación que **el contrato no contempla en ningún punto**, de modo que deben sobrevivir a la desaparición del mock. Si se quedan en `seed.ts`, morirán con él.

**Decisión: se mueve a `src/lib/category-images.ts`, indexado por código.** No pertenece al dominio ni a la API, no debe morir con el seed, la portada deja de importar una estructura interna del mock, y queda explícito que son recursos de presentación locales.

## La frontera con `seed.ts`

El criterio "las categorías se obtienen exclusivamente de `listCategories()`" aplica a **las opciones y a los datos de categoría que consume la interfaz**. `seed.ts` sigue construyendo el dataset simulado, que es su función:

```text
seed.ts        construye los datos simulados del dominio
   ↓
mock-api.ts    los expone mediante listCategories()
   ↓
UI             consume listCategories()
```

Lo que queda prohibido es el atajo:

```text
UI  ──✗──>  seed.ts
```

Eliminar ese atajo es precisamente lo que persiguen la salida de `CATEGORIES` de los componentes y el traslado de `CATEGORY_IMAGE`.

---

## Tabla completa: archivo por archivo

| Archivo | Acción | Qué cambia |
|---|---|---|
| `src/types/index.ts` | Modificar | `interface Category {id, codigo, nombre}`; se retira la constante `CATEGORIES`; `Artisan.rubro: Category`; `Product.categoria: Category` |
| `src/lib/category-images.ts` | **Crear** (Opción A) | `CATEGORY_IMAGE: Record<string, string>` por código + los `import` de los seis *assets* |
| `src/data/seed.ts` | Modificar | `buildCategories()`; `PRODUCTOS_POR_CATEGORIA` por código; el taller recibe el objeto; las dos prosas usan `.nombre.toLowerCase()`; deja de exportar `CATEGORY_IMAGE` |
| `src/services/mock-api.ts` | Modificar | `listCategories()`; `CatalogFilters.categoria?: string`; filtro por `codigo`; `ProductInput.categoria: string`; `createProduct`/`updateProduct` resuelven código → objeto; `countByCategory` por `codigo` |
| `src/lib/labels.ts` | Modificar | `categoryLabel(codigo, categorias)` |
| `src/routes/index.tsx` | Modificar | Portada: consulta, estados de carga/error, imagen por código, enlace por código sin `encodeURIComponent` |
| `src/routes/catalogo.tsx` | Modificar | `categoria?: string`; se retira la validación contra constante; selector poblado por consulta |
| `src/routes/panel.productos.tsx` | Modificar | Estado `string` vacío; selector poblado por consulta con marcador; validación obligatoria; muestra `.nombre` |
| `src/components/catalogo/product-card.tsx` | Modificar | `.nombre` |
| `src/components/catalogo/artisan-card.tsx` | Modificar | `.nombre` |
| `src/routes/producto.$id.tsx` | Modificar | `.nombre` |
| `src/routes/solicitar.$productId.tsx` | Modificar | `.nombre` |
| `src/routes/artesano.$id.tsx` | Modificar | `.nombre` |

12 modificados + 1 nuevo. **No se tocan:** `order-state.ts`, `format.ts`, `route-id.ts`, `use-session.tsx`, `use-notifications.tsx`, `order-chat.tsx`, ninguna ruta de pedidos, `App.tsx`, `package.json`.

---

## Comportamiento exacto de cada consumidor

### Portada — `index.tsx`

Hoy itera la constante y renderiza seis tarjetas sin esperar a nadie. Después:

- Consulta `["categorias"]` → `listCategories()`.
- **Cargando:** seis esqueletos con la misma retícula, para que no salte el diseño.
- **Error:** se oculta la sección completa. Es una sección de descubrimiento en la portada, no contenido crítico; un `ErrorState` con "Reintentar" en medio de la página de inicio pesa más de lo que aporta.
- Imagen: `CATEGORY_IMAGE[c.codigo]`. Etiqueta: `c.nombre`. Enlace: `` `/catalogo?categoria=${c.codigo}` `` — sin `encodeURIComponent`, porque los códigos `snake_case` ya son seguros en una URL.

### Filtro del catálogo — `catalogo.tsx`

- `CatalogSearch.categoria?: string` (código). Lectura: `params.get("categoria") ?? undefined`, **sin validar contra ninguna lista**. Escritura: `params.set("categoria", search.categoria)`.
- Desaparece el centinela `"todas"` del modelo. La separación es estricta:

  ```text
  Dominio          categoria?: string     →  undefined significa "sin filtro"
  Control Radix    "todas"                →  valor técnico del <Select>, nada más
  ```

  El `<SelectItem value="todas">` se conserva porque Radix necesita un valor de texto, y se traduce a `undefined` en `onValueChange`, exactamente como ya se hace con el filtro de taller en Fase B. **`"todas"` no debe llegar nunca a `CatalogFilters` ni al servicio**: ahí solo existe un código o la ausencia de filtro.
- Opciones: consulta `["categorias"]`. Mientras carga, el selector queda deshabilitado mostrando "Todas las categorías"; si falla, se queda deshabilitado. **El catálogo sigue consultando y mostrando productos con normalidad**: es la consecuencia buscada de la decisión 3.
- "Limpiar filtros" pasa de `{ categoria: "todas", … }` a `{ categoria: undefined, … }`.

### Selector del formulario — `panel.productos.tsx`

- Estado: `const [categoria, setCategoria] = useState<string>("")`.
- `abrir(p?)`: `setCategoria(p?.categoria.codigo ?? "")`.
- Opciones: consulta `["categorias"]`; con marcador `"Seleccione una categoría"` y sin preselección.
- **Validación obligatoria**: se añade `categoria: z.string().min(1, "Selecciona un rubro.")` al esquema y el campo entra en el `safeParse`, con su `<p role="alert">` como el resto de campos. Hoy el rubro no se valida porque siempre tenía un valor por defecto; al retirarlo, la validación deja de ser opcional.
- El botón de guardar se deshabilita mientras las categorías no hayan cargado.
- La lista de productos muestra `p.categoria.nombre`.

### Los seis sitios de lectura

`product-card`, `artisan-card`, `producto.$id`, `solicitar.$productId`, `panel.productos` (tarjeta) y `artesano.$id` pasan de imprimir el valor a imprimir `.nombre`. Ninguno usa `categoryLabel()`: ya tienen el objeto.

### `categoryLabel()`

```ts
/**
 * Traduce un código de categoría a su etiqueta. Solo para consumidores que
 * tienen el código aislado —el filtro activo, el valor de la URL, el selector
 * del formulario—. Donde ya hay un `Category` completo se usa `.nombre`.
 */
export function categoryLabel(codigo: string, categorias: Category[]): string {
  return categorias.find((c) => c.codigo === codigo)?.nombre ?? codigo;
}
```

Devolver el código cuando no se encuentra mantiene la interfaz legible ante un código desconocido en la URL, que es justo el caso que la decisión 3 deja pasar.

> **Regla de ejecución — no fabricar un consumidor.** El resto del plan hace que casi nadie tenga un código aislado: el filtro trabaja con códigos pero no los muestra, el formulario recibe las opciones ya como `Category[]`, la portada tiene el objeto y los seis sitios de lectura usan `.nombre`. Durante C5–C9 se **comprueba** si aparece un consumidor real que solo tenga el código y necesite la etiqueta. Si aparece, se adapta la función. Si no aparece, **se documenta que quedó sin consumidor y se decide explícitamente si se retira** — nunca se le inventa un uso para justificar su permanencia.

---

## Orden de implementación

Se espera que el proyecto **no compile entre C1 y C9**; el punto de corte es el final de C9.

| Paso | Contenido |
|---|---|
| **C1** | Tipos: `Category` objeto, retirada de `CATEGORIES`, `rubro` y `categoria` |
| **C2** | `src/lib/category-images.ts` con el mapa por código |
| **C3** | Seed: `buildCategories()`, tablas por código, prosas con `.nombre`, talleres y productos con el objeto |
| **C4** | Mock: `listCategories()`, firmas por código, resolución código → objeto en alta y edición, `countByCategory` |
| **C5** | `categoryLabel()` con su nueva firma |
| **C6** | Los seis sitios de lectura → `.nombre` |
| **C7** | Portada |
| **C8** | Filtro del catálogo y URL |
| **C9** | Formulario de productos y validación; barrido final |

---

## Verificación

### Automática

```
npx tsc --noEmit
pnpm run build
```

`pnpm run lint` seguirá fallando por la deuda T-1 (CRLF/LF), ajena a esta fase. Se comprobará, como en B, que **filtrando la regla `prettier/prettier` los archivos tocados no producen errores nuevos**.

### Manual

| # | Comprobación |
|---|---|
| 1 | Portada: seis rubros con su imagen y su etiqueta; esqueletos mientras carga |
| 2 | Clic en un rubro → `/catalogo?categoria=cuero_y_calzado`, catálogo filtrado |
| 3 | Filtro del catálogo: seleccionar categoría, recargar, la selección persiste |
| 4 | "Limpiar filtros" retira `categoria` de la URL |
| 5 | `?categoria=inexistente` → catálogo vacío, **sin error de navegación ni pantalla rota** |
| 6 | `?categoria=Cuero%20y%20calzado` (formato antiguo) → catálogo vacío; comportamiento aceptado y documentado |
| 7 | Detalle de producto, tarjeta, solicitud y perfil del taller muestran la etiqueta, nunca el código |
| 8 | Formulario: abre **sin categoría seleccionada** y con el marcador visible |
| 9 | Intentar publicar sin categoría → mensaje "Selecciona un rubro.", no se envía |
| 10 | Publicar con categoría → el producto aparece con esa categoría en "Mis productos" y en el catálogo |
| 11 | Editar un producto existente → el selector abre con **su** categoría, no con la primera |
| 12 | Perfil del taller: el rubro se muestra como etiqueta y la historia sigue leyéndose natural |

---

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Los enlaces antiguos con la categoría en texto dejan de filtrar** y devuelven cero resultados en silencio. Consecuencia aceptada de la decisión 3 | Comprobación 6; queda documentado como cambio de formato de URL |
| 2 | `CATEGORY_IMAGE` indexado por código: una clave que no coincida con el catálogo produce `src` indefinido y una imagen rota, sin error | Comprobación 1; las claves se derivan del mismo catálogo del seed |
| 3 | Tres pantallas ganan estados asíncronos que hoy no tienen | Comportamiento especificado arriba para cada una, incluida la decisión de ocultar la sección de la portada ante error |
| 4 | El formulario sin preselección puede parecer un fallo si la validación no acompaña | La validación obligatoria entra en el mismo paso C9, no después |
| 5 | La prosa del seed interpola el nombre en minúsculas; con el objeto mal usado saldría `[object Object]` en la historia de 50 talleres | Comprobación 12 |
| 6 | Alcance accidental hacia la regla "el producto hereda el rubro del taller", que el seed hace explícita en C3 | Está en las exclusiones; el seed conserva el comportamiento actual tal cual |

---

## Cierre de la fase

**Estado: COMPLETADA** (2026-08-15).

La categoría dejó de ser una unión literal de textos del frontend y pasó a ser una entidad servida por el mock (`listCategories()`), con la representación que cada consumidor necesita: objeto completo en lectura, código en escritura, filtro y URL.

`npx tsc --noEmit` y `pnpm run build` pasan. El lint sigue fallando solo por la deuda **T-1**: de 2 636 errores en los archivos tocados, todos son `prettier/prettier` por CRLF, y ninguno es nuevo.

**Alcance real: 12 archivos modificados + 1 nuevo, exactamente los previstos.**

### Barrido final del árbol

| Comprobación | Resultado |
|---|---|
| Ninguna referencia a `CATEGORIES` | ✓ — la constante desapareció por completo |
| Ningún texto de categoría usado como identificador | ✓ — los seis textos solo aparecen como `nombre` dentro del catálogo del seed |
| `Category` es objeto `{id, codigo, nombre}` | ✓ — lo portan `Artisan.rubro` y `Product.categoria` |
| Código en escritura, filtro y URL | ✓ — `ProductInput.categoria: string`, `CatalogFilters.categoria?: string`, `?categoria=<codigo>` |
| Cadena `seed → mock-api → UI` | ✓ — **`mock-api.ts` es el único módulo que importa de `@/data/seed`**; el atajo `UI → seed` quedó eliminado, incluido el que tenía la portada con `CATEGORY_IMAGE` |

### Salvedades de verificación

Once de las doce comprobaciones manuales se observaron en vivo. **Dos ramas quedaron implementadas pero no observadas**, y no deben contarse como pruebas manuales realizadas:

1. Los esqueletos de la sección de rubros de la portada. El mock resuelve en 200 ms y la consulta queda cacheada, de modo que no fue posible capturar ese estado desde el navegador.
2. La rama que **oculta** la sección de rubros cuando `GET /categorias/` falla. No hay forma de forzar el fallo de esa consulta concreta desde la interfaz; `simularFalloProximaPeticion()` no es accesible desde la página.

Ambas son código escrito y revisado, no verificado en ejecución. Si más adelante se introduce una manera de inyectar fallos por endpoint, son las dos primeras candidatas a comprobar.

### Resultados de auditoría (no son deuda técnica)

| Elemento | Resultado |
|---|---|
| **`categoryLabel()`** | Terminó **sin ningún consumidor**, tal como anticipaba la regla de ejecución: el filtro maneja códigos pero muestra el objeto, el formulario recibe `Category[]`, la portada tiene el objeto y los seis sitios de lectura usan `.nombre`. **No se le fabricó un uso.** Queda adaptada a códigos y disponible por si el bloque siguiente —cuando el pedido anide su producto— hace aparecer códigos sueltos. Decisión tomada: **no se retira todavía.** |
| **`resolverCategoria()`** | Helper añadido en `mock-api.ts` fuera del plan, como **adaptación forzada**: `createProduct` y `updateProduct` reciben un código y deben almacenar un `Category`, así que la resolución tiene que ocurrir en alguna parte. Lanza `"La categoría indicada no existe."`, simulando el 400 del backend. Inalcanzable desde la interfaz, porque el selector solo ofrece códigos válidos. **Se queda.** |

### Limitación conocida del prototipo

`CATEGORY_IMAGE` era `Record<Category, string>` y el compilador obligaba a cubrir las seis categorías. Ahora es `Record<string, string>` y **ya no puede ser exhaustivo**, porque el contrato permite que un administrador añada rubros sin desplegar el frontend. Consecuencia: **una categoría nueva servida por el backend no tendría imagen**, y solo se vería en pantalla. Requirió además tres aserciones `as string` en el seed por `noUncheckedIndexedAccess`.

No se convierte en trabajo de C: el contrato no contempla imágenes de categoría en ningún punto. Queda registrada como **limitación conocida del frontend simulado**, a resolver cuando se decida la estrategia de imágenes de categoría junto con el backend.

### Deudas que siguen fuera de fase

**T-1** (finales de línea CRLF/LF) y **T-2** (`.claude/launch.json`, usado de nuevo en esta fase para levantar el servidor de desarrollo) continúan abiertas, sin cambios respecto al cierre de B.

---

## Criterios de aceptación

1. `npx tsc --noEmit` y `pnpm run build` pasan.
2. No queda en `src/` ninguna referencia a la constante `CATEGORIES` ni ningún texto de categoría usado como valor de dominio.
3. `Product.categoria` y `Artisan.rubro` son `Category`; `ProductInput.categoria`, `CatalogFilters.categoria` y el parámetro de URL son el código.
4. La interfaz obtiene las categorías exclusivamente de `listCategories()`; **ningún componente importa datos de categoría desde `seed.ts`**. El seed sigue construyendo el dataset simulado, que es su función.
5. El catálogo renderiza y consulta sin esperar a las categorías.
6. El formulario abre sin selección y no permite publicar sin rubro.
7. `categoryLabel()` conserva su nombre. Se comprueba si existe un consumidor real con el código aislado: si existe, la función queda adaptada; si no existe, **queda documentado que no lo tiene** y se decide por separado si se retira. Un uso fabricado para cumplir este criterio lo incumple.
8. `countByCategory()` sigue existiendo, corregido.
9. Las 12 comprobaciones manuales pasan.
10. Las exclusiones siguen intactas: reglas de negocio, pedido, autenticación, D-2, D-5, D-6, D-10, T-1 y T-2.
