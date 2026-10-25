# Frontend de ArtesaNic

SPA de React 19, React Router 8, TypeScript, Vite 8, Tailwind/shadcn, TanStack Query, React Hook Form y Zod. Conserva los flujos con mocks e IndexedDB. No contiene integración funcional con Django.

Desde esta carpeta:

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

pnpm 10.30.3 es el gestor; conservar `pnpm-lock.yaml`. El build no sustituye al typecheck. `test` ejecuta las verificaciones existentes de la demo, sin introducir un framework.

Configuración opcional: copiar [.env.example](.env.example) a `.env`. El proxy `/api` apunta a Django; con los dos servicios iniciados, `pnpm check:health` verifica únicamente `/api/v1/salud/`. [Inicio conjunto](../../README.md), [organización por dominio y rutas](src/features/README.md), [requisitos actuales](../../docs/requisitos/requisitos.md) y [ADR-001](../../docs/adr/0001-sistema-de-routing.md).
