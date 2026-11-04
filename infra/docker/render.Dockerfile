# Imagen de producción para Render. Docker Compose sigue usando los Dockerfiles locales.
FROM node:22-bookworm-slim AS frontend
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /build
COPY apps/frontend/package.json apps/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/frontend/ ./
ENV VITE_API_URL=/api/v1 VITE_AUTH_API=real VITE_CATALOGO_API=real
RUN pnpm build

FROM ghcr.io/astral-sh/uv:0.12.22 AS uv
FROM python:3.13-slim
COPY --from=uv /uv /uvx /usr/local/bin/
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    PORT=10000
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace/apps/backend
COPY apps/backend/pyproject.toml apps/backend/uv.lock apps/backend/README.md ./
RUN uv sync --locked --no-managed-python --no-dev \
    && uv pip install --python /opt/venv/bin/python --no-cache "gunicorn==23.0.0"
COPY apps/backend/ ./
COPY docs/ /workspace/docs/
COPY --from=frontend /build/dist/ /usr/share/nginx/html/
COPY infra/render/nginx.conf.template /etc/nginx/templates/artesanic.conf.template
COPY infra/render/start.sh /usr/local/bin/start-artesanic
RUN chmod +x /usr/local/bin/start-artesanic \
    && rm -f /etc/nginx/sites-enabled/default
EXPOSE 10000
CMD ["/usr/local/bin/start-artesanic"]
