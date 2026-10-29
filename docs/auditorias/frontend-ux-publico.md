# Fase 5: catálogo, producto, taller y Descubrir

Rama: `feature/frontend-ux-refactor`. Baseline: integración geo + UX `5e9a1e1`.
Fecha de trabajo: 2026-10-28, America/Managua.

## Antes y después

| Experiencia | Antes | Después |
| --- | --- | --- |
| Catálogo | Controles amplios, sin resumen de filtros, una columna móvil | Búsqueda compacta, filtros activos con eliminación individual, dos columnas móviles, sidebar reducido y Sheet conservado |
| Producto | Descripción extensa antes del CTA, «Preparar solicitud», taller real solo con nombre | Precio/modalidades/CTA «Solicitar producto» antes del texto extenso; resumen del productor con datos públicos y acceso «Ver taller» |
| Taller | Portada vacía alta, historia/contacto/mapa antes de productos | Cabecera compacta, acceso por anclas, cuatro productos tempranos, historia desplegable, ubicación y contacto después |
| Descubrir | Categorías y novedades antes de talleres/mapa, similar a Home | Talleres y selector lista/mapa primero; luego novedades y rubros, conservando ambas vistas y las rutas |
| Cards | Categoría y modalidades precedían al precio; dirección podía truncarse | Fotografía → nombre → precio → taller → categoría → CTA; dirección del taller puede ocupar dos líneas |

Se conserva «Barro y Sombra»: crema, terracota, oliva y tipografías existentes.
No se instalaron dependencias ni se introdujeron ratings, descuentos, cercanía,
distancias, métricas comerciales o disponibilidad supuesta.

## Catálogo

Se mantienen búsqueda por envío, URL de filtros, códigos de categoría, taller,
precios al perder foco, ordenamiento y paginación con el mismo contrato. Cada
filtro aplicado tiene texto y botón «Quitar …»; se conserva «Limpiar filtros».
El cambio de un filtro reinicia la página como antes. El contador distingue
búsqueda en curso, error y resultados reales del servidor, incluido singular.

El Sheet conserva Radix y el comportamiento de actualización inmediata. Se
añade «Ver productos» para cerrarlo explícitamente; Escape devuelve el foco
al disparador. Los filtros de escritorio no se convierten en una columna móvil.
Los estados sin resultados distinguen filtros sin coincidencias de un catálogo
todavía vacío. Un fallo de las opciones muestra reintento sin bloquear la búsqueda.

## Producto

El CTA mantiene `/solicitar/:id` y los guards existentes. El precio conserva el
selector de moneda y su advertencia informativa. Las modalidades se explican
sin crear una selección nueva: pieza estándar ya elaborada, elaboración por
cantidad y personalización. Las unidades solo se muestran cuando existe el
valor `disponibleStock` de la API. La lógica de disponibilidad y validación
del paso de solicitud queda intacta; un producto 404 conserva el estado no
encontrado y no ofrece CTA.

La descripción completa permanece consultable después del resumen y mediante
«Leer descripción completa». La fotografía, nombre, precio y productor siguen
visibles sin tener que recorrer todo el texto. La imagen y el resumen quedan
en dos columnas desde tablet; móvil usa una columna.

El bloque del productor utiliza nombre, rubro, fotografía y dirección públicos.
Si falla el perfil adicional, el producto y el enlace al taller siguen disponibles.
No se monta mapa en la ficha. La demo conserva su adaptador explícito y no se
mezcla con los datos reales.

## Taller público y geolocalización

La portada solo se muestra si existe URL. Imagen de portada y perfil reutilizan
`ProductImage`, incluidas ausencias y descargas fallidas. La cabecera conserva
nombre, rubro, dirección y responsable únicamente en demo. Las anclas permiten
ir a productos, historia, ubicación pública y contacto.

Se presentan cuatro productos de la página ya obtenida, antes de historia/mapa.
Cuando hay más de cuatro, «Ver los N productos en el catálogo» abre el catálogo
filtrado por taller con su paginación existente. Se conserva la lectura de 12
elementos y el total del servidor; no se agrega paginación local ni se pierde
el acceso al resto. Un taller sin productos conserva historia y ubicación.

Historias de más de 240 caracteres muestran una introducción y un `details`
nativo «Conocer la historia del taller», con el texto completo dentro. Las
historias breves se leen directamente. Se conserva la información de contacto.

`UbicacionPublicaTaller` mantiene el guard de `ubicacionMapa`, el marcador,
«Cómo llegar», URL y privacidad existentes. Solo cambian composición, dirección
visible y altura: 256 px móvil / 320 px desde sm. Leaflet conserva scroll con
rueda desactivado y su código diferido. No se cambian GPS, geocodificación,
captura privada, precisión, adaptadores, backend u OpenAPI. No se exponen
coordenadas privadas ni valores técnicos como contenido principal.

## Descubrir y relación con Home

La lista continúa como vista inicial. Texto e iconos explican lista y mapa;
un check visible y `aria-pressed` identifican la selección sin depender del color.
El mapa recibe **todos** los talleres devueltos por la API, incluidas posiciones
fuera de las cuatro tarjetas de lista o las tres de Home. Sus popups mantienen
el enlace al perfil. Sin posiciones, se explica la situación y se conserva la
lista; sin talleres, se muestra un estado vacío explícito.

Home sigue siendo resumen comercial, catálogo concentra búsqueda/filtros,
Descubrir profundiza en productores y ubicaciones, y el taller presenta un
productor concreto. Hay solapamiento deliberado en las novedades y rubros de
Home/Descubrir; no se elimina contenido ni rutas. El cambio compartido de cards
alcanza Home sin modificar su estructura o consultas. Los enlaces de categoría
de Descubrir usan `URLSearchParams`, como los de Home.

## Consultas y performance

| Lectura | Caché | Decisión |
| --- | --- | --- |
| Categorías | `["categorias"]` | Catálogo reutiliza `categoriasQuery` de Home/Descubrir |
| Catálogo filtrado | `["catalogo", search]` | Contrato, tamaño 12 y `keepPreviousData` conservados |
| Opciones de taller | `["talleres-catalogo"]` | Lectura existente conservada |
| Talleres públicos | `["talleres-publicos"]` | Colección completa para mapas; no se recorta el transporte |
| Perfil público | `["perfil-taller", id]` | `perfilTallerQuery`, fresco un minuto, compartido por producto y taller |
| Productos del taller | `["productos-artesano", id]` | Lectura existente, presentación de cuatro y enlace al catálogo completo |

La ficha real ahora realiza **una lectura adicional de perfil público** para
mostrar el productor; antes solo la demo obtenía sus datos ampliados. Esta
lectura pertenece al detalle, nunca a las cards. Al pasar producto → taller se
reutiliza la misma caché; se comprobó una sola petición de perfil en ese recorrido.
No hay fetching por tarjeta ni nuevas consultas de inventario.

Comparación de build con la salida de integración `5e9a1e1`: chunk principal JS
628,68 → 639,20 kB (aprox. +10,52 kB, 1,67 %); gzip 178,96 → 181,54 kB
(+2,58 kB, 1,44 %). El chunk compartido principal queda prácticamente igual
(273,89 → 273,90 kB). Leaflet conserva su chunk separado de 153,17 kB y las
entradas de mapas son dinámicas. La revisión de red comprobó que una ficha de
producto no descargue los módulos de Leaflet. Continúa la advertencia de
chunk mayor de 500 kB; no se añaden paquetes.

## Responsive y accesibilidad

Matriz en Chromium a 360, 390, 768, 1024 y 1440 px: catálogo, paginación,
filtros, búsqueda sin resultados, productos estándar/personalizado/mixto,
taller con productos, taller vacío sin posición pública, mapa del taller,
Descubrir lista/mapa, marcador/popup, mapa sin posiciones, colección vacía,
loading/error/404, fotografías rotas y textos/nombres largos.

Se corrigieron dos desbordes reales detectados: breadcrumb de un nombre sin
espacios y etiquetas de categoría/rubro con texto largo. Se ajustan sus tamaños
y puntos de corte; no se oculta el overflow de la página. La matriz final no
presenta desplazamiento horizontal.

Se conservan alt, alternativas de imagen, enlaces sin anidación, headings por
sección y foco visible global. Se verificaron Escape y retorno automático de
foco del Sheet, controles de filtro etiquetados y apertura de popup por Enter
en el marcador. Historia usa revelado nativo accesible. Esta revisión no
equivale a una auditoría formal con lectores de pantalla o teclado móvil físico.

## Django/PostgreSQL reales

Se reutilizó Django del worktree UX en 8000, Vite en 5174 y PostgreSQL local en
5434, con el volumen existente. Se crearon cuentas y contenido temporales
identificados para pruebas, sin modificar usuarios o talleres preexistentes.
Chromium ejecutó estos recorridos **sin interceptar API ni mapas**, a 360 y 1440 px:

1. Home → producto → taller → mapa y enlace «Cómo llegar» con posición pública.
2. Home → categoría → catálogo filtrado → producto.
3. Descubrir → mapa → marcador → taller → producto.
4. Producto → Solicitar producto → ingreso de comprador → Preparar solicitud.

Sin errores JavaScript ni fallos inesperados de API; se recibieron imágenes
reales de OpenStreetMap. No se enviaron solicitudes, pedidos o pagos. Se retiraron
producto, categoría, taller, cuentas temporales y archivo de credenciales al
terminar. Los artefactos/capturas muestran datos de prueba, no datos comerciales.

## Archivos y pruebas

Rutas relativas a `apps/frontend/`:

| Archivo | Responsabilidad |
| --- | --- |
| `src/features/catalogo/pages/catalogo.tsx` | Búsqueda, filtros, estados, grid y Sheet |
| `src/features/catalogo/components/product-card.tsx` | Jerarquía compartida de producto |
| `src/features/catalogo/pages/producto.tsx` | Decisión, CTA y productor |
| `src/features/talleres/queries.ts` | Perfil público compartido |
| `src/features/talleres/pages/artesano.tsx` | Identidad, productos tempranos e historia |
| `src/features/talleres/components/ubicacion-publica-taller.tsx` | Composición pública de ubicación |
| `src/features/talleres/components/artisan-card.tsx` | Dirección legible y rubro largo |
| `src/features/catalogo/pages/inicio.tsx` | Jerarquía y estados de Descubrir |
| `src/features/talleres/components/talleres-descubrir.tsx` | Selección visible y colección vacía |
| `scripts/check-public-ux.mjs` | Comportamientos públicos modificados |
| `scripts/check-geolocalizacion-publica.mjs` | Ajusta únicamente la aserción del orden autorizado de secciones |
| `package.json` | Añade la nueva verificación a la suite |

La prueba nueva protege filtros activos, modalidades/stock informado, CTA,
relación producto-taller, caché de perfil, cuatro productos y acceso al catálogo
completo, historia íntegra y estados vacío/error. No comprueba clases Tailwind
ni duplica las pruebas de privacidad de geo o las de Home.

Comprobaciones de cierre: typecheck, lint, build, suite completa y `git diff --check`.
Lint mantiene las diez advertencias de Fast Refresh conocidas, sin errores ni
advertencias nuevas. Evidencia local: `ux-public-tests-final.log`,
`ux-public-build.log`, `ux-public-lint.log`, `ux-public-review.json` y
`ux-public-live.json` en el directorio de visualizaciones de la sesión.

## Límites y siguiente trabajo

No se modifican módulos privados, backend, OpenAPI ni navegación global. No se
prueban aquí GPS/geocodificación externos, pagos, pedidos o envío de solicitudes.
Las suites previas siguen protegiendo esos límites. Quedan como evaluación
posterior lectores de pantalla reales, teclado físico móvil y pruebas con
usuarios. Esta fase termina aquí: no se continúa con pagos, mensajes o notificaciones
y no se crea el PR final a develop.
