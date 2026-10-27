# ArtesaNic

Sistema de comercialización de productos artesanales de las PYMEs de Masaya, Nicaragua. El monorepo reúne el prototipo React y el backend Django/DRF con PostgreSQL.

## Estado y arquitectura

El frontend React opera por defecto en modo real (`VITE_AUTH_API=real`, `VITE_CATALOGO_API=real`) conectado al backend Django/DRF y PostgreSQL (cierre de AUD-18): sesión con token de acceso en memoria, renovación por cookie `HttpOnly` y CSRF, cuenta personal (`/cuenta`), talleres públicos y taller propio (`/panel`, `/panel/perfil`, `/descubrir`), catálogo y moderación, inventario y movimientos, solicitudes multiproducto con propuestas y decisión, pedidos confirmados (`/pedidos`, `/panel/pedidos`), pagos y comprobantes privados, vencimiento automático, cumplimiento y entregas parciales, cancelación, cierre parcial y reembolsos, mensajería privada por pedido (`/mensajes` y detalle del pedido) y notificaciones internas (`/notificaciones`). El modo `mock` permanece aislado únicamente para las pruebas de regresión de la demo. [Arquitectura del frontend](docs/arquitectura/frontend.md) · [Contrato de solicitudes](docs/api/solicitudes.md).

React 19 / React Router 8 / TanStack Query → servicios por dominio → demo o Django REST Framework → PostgreSQL 17. Se conservan Tailwind, shadcn/ui, React Hook Form y Zod. Las solicitudes V1 están separadas de los pedidos monoproducto legacy de la demo.

La especificación V1 acordada el 12 de octubre de 2026 tiene **21 RF activos y 15 RNF activos**, con un catálogo separado de **24 reglas de negocio**. Se conservan RF-001 a RF-024 y RNF-001 a RNF-015: RF-002 queda integrado en RF-001/RNF-005; RF-012 y RF-024 están postergados fuera de V1. Publicar la documentación no acredita implementación. [Documentación e índice](docs/README.md).

## Estructura

```text
apps/frontend/         React, TypeScript, Vite, pnpm
apps/backend/          Django, DRF, pyproject.toml y uv.lock
docs/                  Requisitos, arquitectura, ADR, API, planes y trazabilidad
infra/docker/          Dockerfiles de desarrollo
infra/scripts/         Comandos PowerShell y validadores
.github/workflows/     Frontend, backend e integración
```

## Inicio con Docker Compose

Requisitos: Git y Docker Desktop con Docker Compose en ejecución. Desde la raíz:

```bash
cp .env.example .env
docker compose up --build
```

PowerShell: `Copy-Item .env.example .env`. Las plantillas contienen valores de ejemplo exclusivos de desarrollo. Con una base nueva permiten iniciar sin configuración adicional. Para un volumen existente hay que conservar sus credenciales originales en el `.env` local; cambiar el archivo no cambia la contraseña almacenada en PostgreSQL. Se puede elegir otro volumen con `POSTGRES_VOLUME` sin alterar el anterior.

- Frontend: <http://localhost:5173>
- Backend y Django Admin: <http://localhost:8000/admin/>
- Salud directa: <http://localhost:8000/api/v1/salud/>
- Salud a través del frontend: <http://localhost:5173/api/v1/salud/>
- PostgreSQL: `127.0.0.1:5434`, base `artesanic`.

El backend espera el healthcheck de PostgreSQL y aplica migraciones antes de iniciar. El frontend espera al backend. El volumen predeterminado conserva el nombre `artesanic_postgres_data`. No ejecutar operaciones que eliminen volúmenes como parte de esta migración.

```bash
docker compose exec -T frontend node ../../infra/scripts/check-health.mjs
```

La sonda usa el proxy `/api` de Vite hacia Django y comprueba `{"estado":"ok"}`. Todos los dominios V1 del frontend consumen `/api/v1` en modo real por defecto; el modo `mock` queda aislado para pruebas locales de regresión.

## Desarrollo en el host

Requisitos adicionales: Node.js 22, pnpm 10.30.3, Python 3.13 y uv 0.12.22. No se introducen Nx ni Turborepo.

```bash
pnpm -C apps/frontend install --frozen-lockfile
cd apps/backend
uv sync --locked
```

Desde la raíz, iniciar la base:

```bash
docker compose up -d db --wait
```

En una terminal:

```bash
cd apps/backend
uv run python manage.py migrate
uv run python manage.py runserver
```

En otra:

```bash
cd apps/frontend
pnpm dev
```

Django carga `.env` de la raíz y admite un `.env` específico en `apps/backend`. Las variables exportadas tienen prioridad; las del archivo específico prevalecen sobre las de la raíz. Vite admite `apps/frontend/.env`, con ejemplo propio; `API_PROXY_TARGET` es `http://127.0.0.1:8000` en el host y `http://backend:8000` en Compose. `VITE_API_URL=/api/v1` es configuración pública para la sonda y los clientes HTTP opcionales de catálogo y solicitudes.

Se usan los nombres reales `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_FRONTEND_ORIGINS` y `POSTGRES_*`. La configuración actual no usa `DATABASE_URL`. [Variables y desarrollo del backend](docs/arquitectura/desarrollo-local-backend.md).

Smoke HTTP de AUD-05 en una base PostgreSQL temporal (incluido también en la suite):

```bash
cd apps/backend
uv run python manage.py test apps.solicitudes.tests.test_smoke --noinput
```

Las pruebas manuales de interfaz corresponden al responsable: [checklist AUD-05](docs/planes/pruebas-manuales-aud-05.md).

## Pruebas y calidad

Con PostgreSQL en ejecución:

```bash
pnpm -C apps/frontend lint
pnpm -C apps/frontend typecheck
pnpm -C apps/frontend test
pnpm -C apps/frontend build
cd apps/backend
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py migrate --noinput
uv run python manage.py test
uv run ruff check .
uv run ruff format --check .
```

Desde la raíz:

```bash
python infra/scripts/check-doc-links.py
python infra/scripts/check-secrets.py
```

Las pruebas Django usan una base temporal PostgreSQL; no usan SQLite. El esquema implementado está en [docs/api/openapi.yaml](docs/api/openapi.yaml) y una prueba verifica que coincide con el código. CI ejecuta instalación bloqueada, calidad, pruebas y arranque de Compose; sus workflows filtran por rutas relevantes.

## Comandos desde la raíz

`make install`, `make dev`, `make db`, `make frontend`, `make backend`, `make migrate`, `make lint`, `make test`, `make health`, `make docs` y `make clean`.

En Windows, equivalentes con `./infra/scripts/dev.ps1 -Task Install`, `Dev`, `Db`, `Frontend`, `Backend`, `Migrate`, `Lint`, `Test`, `Health`, `Docs` o `Clean`. `Clean` detiene los contenedores y conserva los volúmenes.

[Contribuir](CONTRIBUTING.md) · [ADR del monorepo](docs/adr/0010-monorepo-y-entorno-de-desarrollo.md) · [Discrepancias documentales](docs/trazabilidad/discrepancias-documentales.md) · [Informe de migración](docs/trazabilidad/informe-monorepo.md).
