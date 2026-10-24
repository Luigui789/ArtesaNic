# Desarrollo local del backend

El backend usa Python 3.13, uv 0.12.22 y PostgreSQL 17. Dependencias y versiones se conservan en `apps/backend/pyproject.toml` y `apps/backend/uv.lock`. No usar SQLite para las pruebas ni sustituir uv por requirements paralelos.

## Puesta en marcha

Desde raíz, copiar `.env.example` a `.env` y ejecutar `docker compose up -d db --wait`. Si el volumen ya existe, usar sus credenciales originales locales; no recrearlo para resolver una contraseña incorrecta. El puerto de host es 5434.

Desde `apps/backend`:

```bash
uv sync --locked
uv run python manage.py migrate
uv run python manage.py runserver
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py test
uv run ruff check .
uv run ruff format --check .
```

La suite crea y destruye `test_artesanic` en PostgreSQL. No afecta la base de aplicación. `manage.py test` usa `config.settings.test`; el resto usa `config.settings.local`, salvo configuración explícita.

## Variables reales

| Variable | Uso |
|---|---|
| `DJANGO_SECRET_KEY` | Clave de Django; ejemplo local sin valor de producción |
| `DJANGO_DEBUG` | Depuración local |
| `DJANGO_ALLOWED_HOSTS` | Hosts exactos admitidos |
| `DJANGO_FRONTEND_ORIGINS` | Orígenes de CORS con credenciales y confianza CSRF |
| `DJANGO_SECURE_COOKIES`, `DJANGO_COOKIE_SAMESITE` | Cookies de sesión, CSRF y renovación |
| `DJANGO_NUM_PROXIES` | Proxies de confianza; 0 por defecto |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Identidad de la base |
| `POSTGRES_HOST`, `POSTGRES_PORT` | En host: 127.0.0.1:5434; en Compose: db:5432 |
| `POSTGRES_VOLUME` | Nombre del volumen persistente; lo lee Compose |

No se introduce `DATABASE_URL`: el código usa `POSTGRES_*`. Las variables exportadas prevalecen sobre los archivos `.env`. El archivo específico en `apps/backend/.env` prevalece sobre el de raíz. No versionar ninguno.

## Contrato y disponibilidad

[OpenAPI](../api/openapi.yaml) se genera desde el código y se verifica por pruebas. Desde `apps/backend`:

```bash
uv run python manage.py spectacular --validate --fail-on-warn --file ../../docs/api/openapi.yaml
```

Salud: `GET /api/v1/salud/` responde `{"estado":"ok"}` sin comprobar la base. Verificar PostgreSQL separadamente con una consulta SQL o las migraciones. [Contrato de autenticación](../api/autenticacion.md).

`docker compose stop` detiene sin borrar datos. `make clean` y `dev.ps1 -Task Clean` hacen lo mismo. Para bases existentes, nunca cambiar o borrar el volumen como parte de esta reorganización. El entorno anterior queda documentado en [ADR-008](../adr/0008-entorno-de-desarrollo-local.md); el nuevo, en [ADR-010](../adr/0010-monorepo-y-entorno-de-desarrollo.md).


## Media de productos (DR-01)

Una fotografía principal real por producto: JPEG/PNG/WebP estático, hasta 5 MiB;
[política y límites técnicos](../decisiones/v1.md#concreciones-de-dr-01-fotografía-principal-de-producto).
`MEDIA_ROOT` usa `apps/backend/media` por defecto (ignorado por Git), o `DJANGO_MEDIA_ROOT`.
`MEDIA_URL=/media/`. Compose monta el volumen **backend_media** en `/workspace/media`,
separado de PostgreSQL. `restart` y `down` seguido de `up` conservan archivos;
no usar `down -v` si se pretende conservar los volúmenes.

Django sirve media únicamente con DEBUG, **solo para desarrollo**. Vite reenvía `/media`
al mismo backend de `/api`. Con frontend y API de orígenes distintos, `VITE_API_URL`
absoluto permite resolver la URL respecto del backend. La entrega de producción aún no
está definida. Media local es pública por URL, incluso para borradores: no es storage
privado para comprobantes de pago. El backend no elimina EXIF ni lo usa como dato de negocio.

Pruebas: `config.settings.test` utiliza `TemporaryDirectory` y limpia al terminar el proceso;
las pruebas de archivos añaden su directorio temporal por prueba y limpian en `addCleanup`.
Nunca apuntan a media real. El stack de persistencia debe usar proyecto, puertos y
`POSTGRES_VOLUME` propios. Conservar volumen media y BD conjuntamente al respaldar/restaurar.


Al actualizar este tramo sobre un backend ya iniciado, reconstruir su imagen y aplicar
migraciones antes de usar el nuevo formulario: se añade Pillow y el proceso de desarrollo
usa `--noreload`. Un frontend actualizado contra el proceso anterior responderá `415`
a multipart hasta recrear el backend. `docker compose up -d --build backend` aplica
la migración mediante el comando de arranque y conserva los volúmenes; no requiere
borrar ni recrear la base de datos.

## Vencimientos automáticos (AUD-11)

RN-013 se ejecuta en un proceso propio, no en el servidor HTTP ni en el navegador
([D-AUD11-12/13/14](../decisiones/v1.md#concreciones-de-aud-11)). `docker compose up` arranca
el servicio **vencimientos**: misma imagen, código y base de datos que `backend`, espera a que
`backend` esté sano (migraciones aplicadas), no monta los comprobantes privados y se reinicia
con `restart: unless-stopped`. Cada 60 s (`VENCIMIENTOS_INTERVALO`) recorre los candidatos por
lotes de 100 y procesa cada pedido en su propia transacción. Es seguro tener varias
instancias: solo una realiza cada transición.

Una iteración manual (mantenimiento o tras restaurar una base):

```bash
docker compose run --rm vencimientos python manage.py procesar_vencimientos_pago --once
```

En host, desde `apps/backend`: `uv run python manage.py procesar_vencimientos_pago --once`
(o `--interval 60` para el modo continuo; `--batch-size N` cambia el lote). La salida resume
`vencidos`, `no_elegibles` y `errores`. Logs del contenedor (`docker compose logs vencimientos`):
`INFO pedido_vencido_falta_pago pedido_id=… vencido_en=… reservas_liberadas=…` por vencimiento
y `CRITICAL … pedido_id=… reserva_id=… estado=…` si una reserva no activa impide vencer (el
pedido queda intacto y requiere revisión humana). Sin datos personales.

El plazo comercial es exacto (`ahora >= límite`); la transición física ocurre a más tardar un
intervalo después y `vencido_en` registra ese instante. Si el servicio estuvo detenido, la
siguiente iteración vence todo lo pendiente con las reglas vigentes.
