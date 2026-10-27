# Contribuir a ArtesaNic

## Ramas

- `develop` es la rama de integración. Cada trabajo sale de `develop` en una rama `feature/*`, `fix/*`, `refactor/*` o `docs/*`, y vuelve a `develop` mediante un PR revisado por otra persona del equipo.
- `main` contiene solo versiones estables: se actualiza con un PR de `develop` a `main` cuando el equipo da por estable una versión.
- No hacer commits directos en `develop` ni en `main`. Antes de abrir un PR, traer los últimos cambios de `develop` a la rama de trabajo.
- No borrar ramas ni archivar repositorios sin confirmación del responsable.

En el frontend, cada dominio tiene su carpeta en `apps/frontend/src/features/`; trabajar dentro del dominio propio reduce los conflictos. [Organización del frontend](apps/frontend/src/features/README.md).

## Dependencias y alcance

Frontend: pnpm y `apps/frontend/pnpm-lock.yaml`. Backend: uv, `apps/backend/pyproject.toml` y `apps/backend/uv.lock`. Instalar con `--frozen-lockfile` y `--locked`; no generar locks paralelos ni actualizar versiones mayores por reorganizar carpetas.

La sesión y los dominios del frontend operan en modo real por defecto (`VITE_AUTH_API=real` y `VITE_CATALOGO_API=real`, cierre de AUD-18) contra Django/DRF y PostgreSQL. El modo `mock` queda aislado para las pruebas de regresión de la demo; las pantallas legacy no se exponen en modo real. Ver [arquitectura del frontend](docs/arquitectura/frontend.md), [solicitudes](docs/api/solicitudes.md) y [fronteras de fase](docs/decisiones/v1.md).

## Validación de un cambio

Ejecutar lint, typecheck, pruebas del mock y build del frontend. Para backend: ruff, checks de Django, migraciones pendientes y pruebas con PostgreSQL. [Comandos](README.md#pruebas-y-calidad).

Tras cambiar endpoints implementados, desde `apps/backend` regenerar:

```bash
uv run python manage.py spectacular --validate --fail-on-warn --file ../../docs/api/openapi.yaml
```

Comprobar enlaces con `python infra/scripts/check-doc-links.py` y patrones de credenciales con `python infra/scripts/check-secrets.py`. No registrar `.env`, entornos virtuales, cachés ni archivos de usuarios. Las plantillas contienen exclusivamente valores de ejemplo.

## Documentación y decisiones

[docs/requisitos/requisitos.md](docs/requisitos/requisitos.md) contiene las 39 fichas actuales; conservar identificadores, estados, autores y aprobaciones. Las versiones anteriores permanecen en [docs/requisitos/historico/](docs/requisitos/historico/). Resolver discrepancias explícitamente, sin alterar requisitos para adaptarlos al mock.

Los ADR conservan una numeración única. El 006 permanece reservado. Una decisión nueva sustituye la anterior indicando su alcance; no reescribir decisiones históricas ni historial publicado. La conexión Lovable conserva su identificación y requiere comprobar en el editor su soporte para `apps/frontend` antes de volver a usarlo para desarrollo.
