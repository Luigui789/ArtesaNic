# Integración de geolocalización y refactor UX

Fecha: 2026-10-28 (America/Managua).

## Alcance

Se incorpora `origin/develop` (`580535e`, incluye geolocalización) mediante merge
en `feature/frontend-ux-refactor`, sobre `21a54fc`. No se inicia la fase de
Catálogo + Producto + Taller público y no se integra la rama UX a `develop`.

## Resolución de conflictos

- `apps/frontend/package.json`: se conservan las tres verificaciones de
  geolocalización, Home y operaciones del artesano dentro de la suite completa.
  Leaflet, React Leaflet, sus tipos y el lockfile proceden de develop.
- `apps/frontend/src/features/catalogo/pages/inicio.tsx`: se conserva
  `TalleresDescubrir` con selector lista/mapa y todos los talleres de la respuesta
  disponibles para el mapa; se mantienen las consultas compartidas con Home y
  `ProductImage`, incluida su alternativa para imágenes fallidas.
- No se eligió una versión completa de archivos compartidos con ours/theirs.

El perfil público, los formularios de registro y de taller, sus adaptadores y
las reglas de privacidad geográfica quedan iguales a develop. `ArtisanCard`
conserva la dirección textual existente junto con el diseño UX y «Ver taller».
La navegación conserva `/descubrir`, `/artesano/:id` y `/panel/perfil`.
El dashboard UX continúa usando el taller real y su estado del servidor.

## Comprobaciones

- `npm run typecheck`: pasa.
- `npm run lint`: pasa, 0 errores y las 10 advertencias conocidas de Fast Refresh.
- `npm run build`: pasa; advertencia existente de tamaño de chunk.
  Leaflet sigue en un chunk diferido.
- `npm run test`: pasa la suite completa, incluidas geolocalización del taller
  (23 grupos), registro (22), mapas públicos (20), Home y operaciones UX.
- `git diff --check` y comprobación del índice: sin errores.

## Django y navegador reales

Se inició PostgreSQL mediante el proyecto y volumen locales existentes, sin
recrear ni eliminar volúmenes. Django se ejecutó desde el backend del worktree UX
usando el entorno Python y las variables locales existentes. `migrate --plan`
indicó que no había migraciones pendientes; `/api/v1/salud/` respondió correctamente.
Frontend real en `http://127.0.0.1:5174`, con proxy hacia Django en el puerto 8000.

Playwright/Chromium ejecutó peticiones reales, sin interceptar API ni mapas:

- Público: Home → producto → taller → mapa y «Cómo llegar».
- Público: Descubrir → Ver mapa → marcador → Ver taller.
- Artesano: ingreso real → dashboard → Mi taller (`/panel/perfil`) → seleccionar
  otro punto en el mapa → Guardar cambios → respuesta PATCH 200 → perfil público.
  Se comprobó que el enlace de indicaciones usara la coordenada devuelta por Django.
- Comprador autenticado: Home → producto → taller → ubicación.
- Flujos públicos y de artesano repetidos a 360, 390, 768, 1024 y 1440 px:
  sin overflow horizontal, errores de JavaScript ni fallos inesperados de API.
- Se recibieron imágenes reales de OpenStreetMap en los cinco anchos.

Se usaron cuentas, categoría, producto y taller temporales en la base local para
no modificar los perfiles preexistentes. Se retiraron al finalizar junto con sus
credenciales locales de prueba. El navegador no creó pedidos ni pagos.

Evidencia local de esta sesión: `ux-geo-tests.log`, `ux-geo-live.cjs` y
`ux-geo-live.json` en el directorio de visualizaciones de la sesión. Las capturas
representan datos temporales, no contenido comercial existente. El selector GPS,
la búsqueda externa de direcciones y el teclado móvil físico no se comprobaron
en esta pasada de navegador; sus regresiones automatizadas siguen incluidas.

## Siguiente etapa

La rama UX queda actualizada sobre geolocalización. La fase siguiente permanece
pendiente de una instrucción posterior. No se crea todavía el PR final a develop.
