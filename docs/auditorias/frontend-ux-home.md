# Fase Home: descubrimiento público

Rama: `feature/frontend-ux-refactor`. Base: navegación `60635f2`.

## Estrategia y antes/después

Antes: hero amplio, tres rubros estáticos, explicación del proceso e invitación al artesano. Los productos y talleres publicados solo aparecían al visitar `/descubrir`.

Después: hero comercial compacto → cuatro productos recientes → hasta seis categorías de la API → hasta tres talleres públicos → explicación del proceso → invitación al artesano → CTA final. Los productos preceden a las categorías para que la persona vea piezas concretas antes de tomar decisiones de filtro.

Se conservan información explicativa, anclas `como-funciona` y `para-artesanos`, solicitudes/propuestas, pago fuera de plataforma y revisión del taller. El lenguaje no promete compra instantánea ni emplea «destacados», rankings, ratings o garantías inventadas. Se mantiene «Barro y Sombra» y se usan únicamente assets existentes y fotografías devueltas por los adaptadores.

El CTA principal es «Explorar productos». «Conocer talleres» permite saltar a los productores de Home; cada card tiene una interacción explícita «Ver producto» o «Ver taller». Las categorías enlazan al catálogo con el código escapado mediante `URLSearchParams`.

## Datos y componentes reutilizados

| Consulta | Caché existente | Uso |
| --- | --- | --- |
| `listCatalog({ orden: "recientes", pageSize: 8 })` | `["catalogo", "portada"]` | Home presenta cuatro; `/descubrir` mantiene ocho |
| `listCategories()` | `["categorias"]` | Home muestra hasta seis categorías reales; `/descubrir` muestra todas |
| `listPerfilesTalleres(signal)` | `["talleres-publicos"]` | Home presenta hasta tres; `/descubrir` conserva su selección de cuatro |

Opciones de consulta compartidas mediante `queryOptions`, con frescura de un minuto entre Home y `/descubrir`. No se duplican clientes, proveedores, fetching por card ni contratos. La presentación no cuenta elementos de una página como si fueran totales globales.

El contrato público de talleres entrega la colección completa sin paginación; limitar a tres es una decisión de presentación, no una reducción de la respuesta HTTP. No se agrega un parámetro de límite que el backend no reconozca. Si la colección crece mucho, será necesario evaluar paginación en una fase autorizada de API.

Se reutilizan `ProductCard`, `ArtisanCard`, `ProductImage`, `ProductCardSkeleton`, `EmptyState`, `ErrorState`, `Button`, `PublicLayout`, `HowItWorksSection`, `ArtisanSection` y el CTA final existente. Las imágenes de categoría usan `CATEGORY_IMAGE` para códigos conocidos y una alternativa neutral para los nuevos.

Las cards compartidas tienen enlace con nombre accesible, CTA textual, nombre de producto/taller, precio cuando corresponde y fotografía con alt. `ProductImage` mantiene proporción y muestra alternativa tanto si falta URL como si falla la descarga. Se reutiliza también en talleres y categorías de `/descubrir`.

## Función de /descubrir

La ruta permanece. Home orienta y resume; `/descubrir` ofrece todas las categorías y una selección más amplia de productos y talleres. Se incorpora `#categorias` al bloque existente y se conserva `#talleres`. No se duplica el Home completo ni se elimina contenido de la ruta.

## Estados y responsive

- Cada colección tiene loading, vacío y error propios. Un fallo no bloquea el hero ni las otras consultas. Se ofrecen reintentos y sigue disponible el catálogo.
- Sin productos: «Pronto habrá nuevas piezas», sin cuadrícula vacía. Sin talleres: mensaje explícito, sin registros inventados. Sin categorías: mensaje y acceso al catálogo.
- Móvil: hero breve con fotografía horizontal, dos columnas de productos/categorías y talleres en una columna. Tablet: hero en dos columnas desde 768 px. Desktop: cuatro productos y tres talleres por fila.
- Nombres largos pueden partirse; fotos usan proporciones estables y `object-cover`; navegación y CTA no requieren hover. Se conserva movimiento reducido y foco visible.

## Archivos

Rutas relativas a `apps/frontend/`:

| Archivo | Cambio |
| --- | --- |
| `src/routes/home.tsx` | Monta el CTA final existente tras el contenido conservado |
| `src/components/home/hero-section.tsx` | Composición compacta, copy comercial, fotografía editorial y CTA |
| `src/components/home/discover-preview.tsx` | Productos, categorías y talleres reales con estados independientes |
| `src/components/home/final-cta.tsx` | CTA de cierre compacto y texto de exploración coherente |
| `src/features/catalogo/queries.ts` (nuevo) | Opciones de categorías y productos recientes para dos páginas |
| `src/features/talleres/queries.ts` (nuevo) | Opciones de talleres públicos para dos páginas |
| `src/features/catalogo/pages/inicio.tsx` | Reutiliza las consultas, incorpora ancla de categorías y fallback de imagen |
| `src/features/catalogo/components/product-card.tsx` | Alt, enlace explícito, nombres largos e imagen fallida |
| `src/features/talleres/components/artisan-card.tsx` | Fotografía reutilizada, historia breve, enlace explícito y texto adaptable |
| `scripts/check-home.mjs` (nuevo) | Regresión de contratos, enlaces, caché, límites y estados de Home |
| `package.json` | Incluye `check-home.mjs` en la suite; sin cambios de dependencias |

Este informe agrega documentación de cierre. No se modifican backend, OpenAPI, geolocalización, navegación privada, dashboard ni páginas operativas privadas.

## Validación y evidencia

Los comandos usan `npm run` con las dependencias existentes instaladas desde el lockfile de pnpm. No se genera otro lockfile.

| Comprobación | Resultado |
| --- | --- |
| TypeScript y lint | Pasan; cero errores y las mismas diez advertencias Fast Refresh |
| Build | Pasa; aviso existente de alias nativos en Vite |
| Suite completa y nueva regresión Home | Pasan, incluyendo el nuevo script integrado en `npm run test` |
| Chromium: 360, 390, 768, 1024 y 1440 px | Pasan éxito, vacío, error general, error aislado de talleres, nombres largos y carga; sin overflow |

La salida final divide el JavaScript inicial entre nueve archivos (entrada más modulepreloads): 919.731 bytes, frente a unos 915.000 del baseline; 271.243 bytes gzip frente a unos 268.080. El incremento es aproximadamente 0,5 % sin comprimir y 1,2 % comprimido. Se comparó el total inicial, ya que la distribución entre chunks cambió sin modificar rutas ni configuración. No se añadieron dependencias, assets ni peticiones por card.

En la revisión cualitativa, el CTA principal domina sobre el enlace a talleres; las fotos de producto aparecen antes del contenido explicativo; las cards mantienen nombre, precio, taller y acceso al detalle. El ajuste de tablet evita apilar una imagen alta antes de los productos. Los primeros productos comienzan aproximadamente a 680 px en móvil, 588 px a 768, 607 px a 1024 y 555 px a 1440 (viewport de revisión: 900 px de alto). Estas medidas corresponden a los datos y fuentes de prueba, no garantizan el mismo punto con cualquier contenido real.

La prueba de Home intercepta el transporte y usa los adaptadores reales. Verifica tamaño/orden de la consulta, cuatro productos y tres talleres, categorías nuevas, URL codificada, enlace de producto, contenido explicativo conservado, estados pendientes/vacíos/error aislados y reutilización de caché con `/descubrir`.

La revisión Chromium usa el build compilado con respuestas HTTP de prueba y fotografías locales existentes para los ejemplos. No demuestra que esos ejemplos existan en una base de producción. Los recursos externos de tipografía se bloquean en esa revisión aislada; se revisa con las alternativas de la pila tipográfica. No se acredita conectividad con un Django activo.

Capturas anteriores disponibles en la carpeta de visualizaciones de este chat: `anonimo-360.png` y `anonimo-1440.png` de la fase de navegación. Capturas nuevas: `home-after-<ancho>.png`, `home-full-<ancho>.png` y `home-long-<ancho>.png`; script `ux-home-review.cjs` y resultados `ux-home-review.json`. Las capturas finales se toman después de recorrer las secciones y cargar las imágenes diferidas.

## Pendientes y conflictos

- Aceptación con usuarios, datos reales y fuentes externas cargadas. Los talleres sin imagen siguen usando alternativa neutral; no se inventan fotografías.
- Revisar más adelante la función de `/descubrir` si sus colecciones se amplían o cambia el contrato. Hoy aporta más categorías/productos que Home y conserva sus rutas.
- La futura geolocalización podría coincidir en Home, `ArtisanCard`, `/descubrir` y las opciones de talleres. Mantener sus datos geográficos fuera de esta fase y coordinar esos archivos antes de integrar. No se tocaron coordenadas, mapa, adaptador HTTP ni perfil del taller.
- La siguiente fase de dashboard requiere una revisión separada. Este trabajo termina en Home.
