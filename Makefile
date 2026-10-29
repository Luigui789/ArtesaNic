.PHONY: install dev db test frontend backend migrate lint health docs clean

install:
	pnpm -C apps/frontend install --frozen-lockfile
	cd apps/backend && uv sync --locked

dev:
	docker compose up --build

db:
	docker compose up -d db

frontend:
	pnpm -C apps/frontend dev --host 127.0.0.1

backend:
	cd apps/backend && uv run python manage.py runserver

migrate:
	cd apps/backend && uv run python manage.py migrate

lint:
	pnpm -C apps/frontend lint
	cd apps/backend && uv run ruff check . && uv run ruff format --check .

test:
	pnpm -C apps/frontend typecheck
	pnpm -C apps/frontend test
	cd apps/backend && uv run python manage.py check && uv run python manage.py makemigrations --check --dry-run && uv run python manage.py test
	python infra/scripts/check-doc-links.py
	python infra/scripts/check_requirements_coverage.py

health:
	docker compose exec -T frontend node ../../infra/scripts/check-health.mjs

docs:
	python infra/scripts/check-doc-links.py
	python infra/scripts/check_requirements_coverage.py

clean:
	docker compose stop
