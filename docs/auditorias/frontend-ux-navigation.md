# Fase de layout y navegación

Rama: `feature/frontend-ux-refactor`. Base de esta fase: auditoría `19176cd`.

## Resultado

Se reutiliza el layout actual y se elimina la tira horizontal privada en móvil. El mismo componente de navegación alimenta el sidebar de desktop y el Sheet existente. Las rutas, guards, consultas y modos real/demo conservan su comportamiento.

- Destinos principales del artesano: Inicio, Productos, Pedidos, Mensajes y Mi taller.
- Solicitudes, Inventario y Notificaciones siguen visibles en «Otras consultas», sin submenús ni pasos adicionales. Inventario conserva su disponibilidad exclusiva del modo real; los pedidos de demo mantienen esa identificación.
- Estado activo mediante borde, fondo, peso tipográfico, marca de selección y `aria-current`. Inicio solo se activa en `/panel`; los detalles de pedidos, solicitudes e inventario mantienen seleccionado su destino padre.
- Se mantienen `PageContainer`, `PageHeader`, enlaces de regreso, estilos, anchura máxima y contenido de las páginas actuales. No se añaden breadcrumbs decorativos ni abstracciones de layout nuevas.
- Se conserva «Barro y Sombra», los targets de al menos 44 px, el foco visible y el enlace para saltar al contenido. No se añade ocultación global del overflow.

## Desktop y móvil

Desde 1024 px: sidebar estable con dos grupos visibles y scroll vertical propio si falta altura; área operativa conserva `minmax(0,1fr)` y `max-w-7xl`. Header público mantiene sus destinos y acciones de cuenta.

Por debajo de 1024 px: un solo menú principal, abierto con botón «Menú». Una línea de contexto muestra la sección privada actual sin repetir sus enlaces. El Sheet prioriza destinos privados, luego exploración y cuenta; su cabecera «Cerrar» permanece visible al desplazarse. Cierra al elegir destino o pasar a desktop. Radix conserva el foco modal y su restauración al cerrar.

En el header estrecho se mantiene la marca escrita, notificaciones y acceso a cuenta, con nombres fuera del header hasta pantallas amplias. El nombre completo se permite en varias líneas dentro del Sheet. La salida de sesión pasa al menú en móvil, con texto explícito; en desktop sigue visible. Visitantes disponen de «Ingresar a mi cuenta» dentro del menú además del acceso del header.

## Archivos modificados

Rutas relativas a `apps/frontend/`:

| Archivo | Motivo |
| --- | --- |
| `src/components/layout/navigation.ts` | Etiquetas, iconos de apoyo y grupo secundario, conservando todos los destinos |
| `src/components/layout/private-navigation.tsx` (nuevo) | Dos usos reales: sidebar y Sheet; evita divergencias de labels y estados activos |
| `src/components/layout/site-layout.tsx` | Sidebar solo desktop, contexto móvil y espaciado del aviso demo |
| `src/components/layout/app-header.tsx` | Sheet, cierre visible, jerarquía y header estrecho |
| `src/components/layout/menu-sesion.tsx` | Reutiliza la misma salida de sesión en header y Sheet, sin cambiar su lógica; acceso compacto |
| `scripts/check-auth-ui.mjs` | Sustituye texto antiguo por comprobación de destinos y añade estado activo único en rutas profundas |
| `scripts/check-aud18-cierre.mjs` | Verifica preservación de destinos sin imponer el orden antiguo; mantiene separación real/demo |

Este informe es el único archivo adicional de documentación. No se modifican Home, dashboard, páginas de pedidos/productos, backend, OpenAPI, estilos globales ni dependencias.

## Comprobaciones

Se usaron los scripts existentes mediante `npm run`, con las dependencias fijadas por el lockfile previamente instalado. No se generó lockfile de npm.

| Comprobación | Resultado final |
| --- | --- |
| TypeScript | Pasa |
| Lint | Pasa: cero errores, las mismas diez advertencias de Fast Refresh |
| Build | Pasa; conserva aviso existente de bundle >500 kB y resolución nativa de alias |
| Suite completa de regresión | Pasa, incluidos AUD-18 y comparación del baseline de React Doctor |
| Chromium, 360 / 390 / 768 / 1024 / 1440 px | Pasan quince combinaciones de ancho y rol: artesano, comprador y visitante; sin overflow |

Se inspeccionaron capturas de los cinco anchos, incluidos menú abierto, sección activa, cierre fijo, visitantes y nombre largo de cuenta. Las capturas finales esperan a que termine la animación del Sheet; no se consideran válidas imágenes tomadas durante su desplazamiento de entrada.

La revisión de navegador utiliza el build real y respuestas HTTP de prueba interceptadas en Playwright: nombres largos, 125 notificaciones, listados vacíos y sesión por rol. Los archivos del build se sirven al navegador directamente durante la revisión, evitando restricciones de red local. No valida conectividad con Django ni una sesión real del servidor; las fuentes externas no se cargan en esta revisión aislada.

Se comprueban overflow de página y Sheet, disponibilidad de destinos, selección activa, cierre por navegación, trampa de foco con Tab, Escape y regreso al botón, cierre explícito, permanencia del cierre al hacer scroll y cierre al pasar a desktop. Capturas y script de revisión se guardan fuera del repositorio en la carpeta de visualizaciones de este chat (`ux-navigation-review.cjs`, `ux-navigation-review.json` y PNG por ancho/rol).

## Pendientes y posibles conflictos

- Revisión de aceptación con usuarios y datos reales; esta fase no acredita usabilidad con personas mayores mediante investigación de usuarios.
- Comprobación de integración con backend activo y tipografías externas cargadas. Los contratos no se alteraron y las regresiones existentes verifican sus adaptadores.
- Advertencias preexistentes de Fast Refresh y tamaño de bundle se conservan fuera del alcance de esta fase.
- Una futura rama de geolocalización podría tocar `app-header.tsx`, `site-layout.tsx` o `navigation.ts` si incorpora nuevos destinos. Coordinar esos tres archivos al integrarla. Esta fase no incorpora mapas ni modifica perfiles, cards o contratos de talleres.
- El rediseño de Home y los siguientes módulos queda para otra fase.
