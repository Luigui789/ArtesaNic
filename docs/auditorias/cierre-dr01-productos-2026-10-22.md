# Cierre técnico DR-01 — fotografía principal de productos

Fecha de verificación: **22 de octubre de 2026**, America/Managua.

**A. DR-01 PRODUCTOS CERRADA / IMAGEN REAL LISTA**, en el entorno de desarrollo definido.
La fotografía sobrevivió tanto al reinicio de backend/frontend como a `down` + `up`
sin eliminar volúmenes. La entrega de producción sigue sin definición.

| N.º | Punto solicitado | Resultado |
|---|---|---|
| 1 | Rama | `feature/imagenes-producto-v1`, creada exclusivamente desde `origin/develop` después de `git fetch origin`. Sin upstream hacia develop. |
| 2 | Base exacta | `62b9437d21f4fb76e26751472802062f141ff024`, HEAD actualizado con AUD-18 y home integrados. `develop` y `origin/develop` conservan ese SHA al cierre. |
| 3 | HEAD final | El SHA definitivo se informa en el mensaje de entrega; este informe forma parte del último commit local. |
| 4 | Commits | `d88e7fa` documentación; `d9de9c4` backend/storage/API/tests; `812082d` frontend/multipart/tests; commit posterior de este informe. Sin squash, push, merge ni PR. |
| 5 | Decisión | [D-DR01-01 a D-DR01-07](../decisiones/v1.md#concreciones-de-dr-01-fotografía-principal-de-producto). Cierre limitado a foto principal de productos, sin cerrar AUD-10. |
| 6 | Formatos | JPEG, PNG y WebP estáticos. GIF/SVG/BMP/TIFF/PDF/ejecutables excluidos. |
| 7 | Límite | 5 MiB = 5 242 880 bytes inclusivos. Protección adicional de recursos: 25 millones de píxeles, sin resolución mínima comercial. Son decisiones V1, no texto original del RF. |
| 8 | Validación real | Pillow 12.3.0 bloqueado en uv.lock: formato por bytes, verify y load completos, rechazo de animaciones y decompression bombs. Puntero restaurado en finally. No confía en extensión o MIME. |
| 9 | Modelo | Producto.fotografia_principal, ImageField nullable/blank, validación compartida por modelo y serializer. PostgreSQL guarda referencia, no bytes/base64/DataURL. |
| 10 | Migración | catalogo/0002_producto_fotografia_principal.py, aditiva, sin inventar fotos para históricos. Aplicada en ambos backends locales al cierre. |
| 11 | Media | MEDIA_ROOT por defecto BASE_DIR/media; variable DJANGO_MEDIA_ROOT. MEDIA_URL=/media/. En Compose: /workspace/media. Django sirve media solo con DEBUG, únicamente para desarrollo. |
| 12 | Volumen | backend_media, separado de PostgreSQL. Prueba aislada: dr01-images_backend_media; base aislada: dr01_images_postgres. No se borraron volúmenes. |
| 13 | URL pública | fotografia_url relativa al origen API; ejemplo real probado: /media/productos/059b8687d33d4737bdcc895f541a4c29/principal/b95572eb9c4e4f2e87c0fb0a2dd205f3.webp. Vite proxy /media; con VITE_API_URL absoluto el cliente resuelve el origen backend. No expone filesystem local. |
| 14 | Nombre físico | productos/{uuid}/principal/{uuid}.{extensión canónica del formato validado}. No usa nombre original ni necesita PK. |
| 15 | Reemplazo | Validar nueva, guardar archivo y fila con bloqueo/transacción, eliminar anterior en on_commit. Fallo de validación o SQL inmediato conserva anterior; SQL fallido limpia nuevo. Test verifica A existe antes del commit y después queda solo B. |
| 16 | Sin imagen | Alta como borrador permitida. Históricos publicados sin foto siguen legibles con fotografia_url=null y placeholder neutral. Omitir campo en PATCH conserva foto; null JSON retira solo en borrador. |
| 17 | Publicar | Exige referencia y archivo existente; 409 con codigo=producto_sin_fotografia. Se valida también al repetir publicación de histórico sin foto. Retirar foto de un publicado: 400 de campo. Despublicar conserva archivo. |
| 18 | Endpoints | POST /api/v1/productos/mios/, PATCH /api/v1/productos/mios/{id}/ y acción publicar. Lecturas públicas/propias añaden fotografia_url. Sin rutas nuevas ni DELETE. |
| 19 | Multipart | JSONParser + MultiPartParser en gestión. Archivo binario fotografia_principal. Modalidades repetidas por valor en multipart; se conserva lista de códigos vigente y traducción a permite_*. Taller/propietario/publicado/rutas arbitrarias siguen rechazados. |
| 20 | HTTP común | transporte detecta FormData, conserva el cuerpo y quita Content-Type manual; navegador fija boundary. JSON sigue serializándose igual. Reutiliza Bearer en memoria, refresh/retry, cookies include y CSRF donde corresponde. Test verifica mismo FormData tras renovación. |
| 21 | Frontend | Input accesible, accept JPEG/PNG/WebP, validación temprana de tamaño/MIME, preview blob URL con revoke al cambiar/desmontar, foto actual al editar y errores backend en el campo. File original se envía; no usa mock ni DataURL como autoridad real. |
| 22 | Placeholder | Eliminado mensaje de política no definida; catálogo, detalle, panel, home y perfil consumen imagen desde el mapeo común. Sin rediseño de home. Placeholder visual se conserva solo para productos sin foto. |
| 23 | Tests backend | **529 tests OK**, PostgreSQL aislado, 118.127 s, settings de pruebas explícitos. Nueva suite de 9 métodos con formatos, storage, nombres, límites, reemplazo, rollback SQL, lectura histórica, publicación, retiro y permisos. Todas las imágenes generadas en memoria, media temporal y cleanup. |
| 24 | Tests frontend | pnpm test completo OK, incluye check-imagenes.mjs: tipos, tamaño, FormData, precio/modalidades, JSON sin reemplazo, auth/CSRF, renovación, error de campo, input, tarjeta y placeholder. Prueba real de navegador complementa preview y persistencia. |
| 25 | SVG/GIF/no imagen | Backend rechaza GIF/SVG/BMP/TIFF/PDF/ejecutable/texto renombrado/corruptos. Chromium verifica GIF/SVG en UX y JPG falso rechazado por backend, error visible en campo. |
| 26 | Más de 5 MiB | Backend 400 con mensaje de campo; límite exacto de 5 MiB aceptado. Chromium verifica error UX para 5 MiB + 1 byte. |
| 27 | Reemplazo | Backend verifica eliminación después de commit, conservación sin reemplazo, protección de publicado y rechazo ajeno/comprador/admin según política vigente (admin: 401). Chromium reemplaza JPEG por PNG y luego WebP; URL previa responde 404. |
| 28 | F5 | Chromium contra API real: login artesano aprobado, alta JPEG, preview local, guardar, F5 conserva; edición sin nueva conserva; reemplazos PNG/WebP, F5 conserva; publicación, catálogo y detalle muestran imagen real decodificable. Prueba automatizada en navegador, no declaración de prueba manual humana. |
| 29 | Restart Docker | dr01-images: restart backend frontend y después down/up -d --wait sin -v. Después de cada ciclo: misma fila/URL, detalle visible y GET media 200 image/webp decodificable de 640 px. |
| 30 | Checks | Ruff check y format OK, manage.py check OK, makemigrations --check --dry-run sin cambios; pnpm lint sin errores (9 warnings previos Fast Refresh), typecheck OK, tests OK, build real y mock OK. Build avisa chunk grande y plugin tsconfig-paths existente. |
| 31 | OpenAPI | Regenerado con manage.py spectacular --validate. POST/PATCH muestran multipart/form-data y fotografia_principal string/binary; lecturas fotografia_url nullable. Test de esquema versionado incluido en los 529 OK. |
| 32 | Links docs | check-doc-links.py OK; se vuelve a ejecutar con este informe antes del commit final. |
| 33 | Secrets | check-secrets.py OK para archivos e historial; se vuelve a ejecutar con este informe antes del commit final. Revisión por patrones, no certificación exhaustiva. |
| 34 | Git status | Limpio después de confirmar el informe. develop/main no modificados. No push ni PR. |
| 35 | Riesgos/deuda | Producción no definida; fotos públicas por URL incluso en borrador/despublicado; EXIF se conserva sin uso de negocio; filesystem/BD sin transacción distribuida, caída del proceso/rollback externo/fallo de limpieza pueden dejar huérfanos. Se requiere respaldo conjunto BD+media y futura reconciliación operativa. No se implementan pagos ni inventario AUD-07. |
| 36 | Clasificación | **A para fotografía principal de productos en desarrollo**, sustentada por persistencia real y pruebas de reinicio completo. No implica cierre de política privada de comprobantes ni de infraestructura productiva. |

## Incidencia observada durante la validación del usuario

El frontend del puerto 5173 enviaba multipart al backend habitual del puerto 8000,
que todavía ejecutaba el proceso anterior con --noreload y no tenía Pillow instalado.
Se confirmó que su configuración de BD/clave coincidía antes de actualizarlo. Se
reconstruyó y recreó **solo ese backend**, sin recrear DB ni borrar volúmenes. Quedó
saludable, con Pillow 12.3.0, JSONParser/MultiPartParser en POST/PATCH y migración aplicada.
La operación de arranque para una actualización se documentó en la
[configuración local](../arquitectura/desarrollo-local-backend.md#media-de-productos-dr-01).

El campo de cantidad de stock continúa limitado a la demo, como estaba definido.
Venta desde stock es una modalidad declarativa en la API real. Inventario es AUD-07,
fuera de este cierre; el usuario confirmó conservar ese alcance.

## Comandos de validación

Desde el backend, dentro del stack aislado:

```bash
uv run ruff check .
uv run ruff format --check .
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py test --settings=config.settings.test --noinput
uv run python manage.py spectacular --file /tmp/dr01-openapi.yaml --validate
```

El --settings explícito evita heredar config.settings.local de Compose. El esquema se
copió al repositorio después de generarlo, porque docs está montado de solo lectura.
Desde frontend: pnpm lint, pnpm typecheck, pnpm test, pnpm build; build con ambas variables
real y otra compilación con ambas mock. Desde la raíz: python infra/scripts/check-doc-links.py
y python infra/scripts/check-secrets.py. Docker build y up --wait completados saludables.
