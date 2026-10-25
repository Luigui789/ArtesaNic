# Contexto del frontend

Identificador estable: `masaya-artisan-connect`. Repositorio principal: `Luigui789/Front-ArtesaNic`, reorganizado como monorepo; frontend en esta carpeta, backend en `../backend` y documentación central en `../../docs`.

React 19, React Router 8, TanStack Query 5, TypeScript estricto, Vite 8, Tailwind 4, shadcn/Radix, React Hook Form y Zod. Las rutas se declaran en `src/app/App.tsx`; no reintroducir TanStack Start/Router ni SSR por la reorganización. Usar solo pnpm y el lockfile existente. Build y typecheck son comprobaciones independientes.

Código organizado por dominio en `src/features/<dominio>/` (`pages/`, `components/`, `api.ts`, `types.ts`); guía en `src/features/README.md` y decisión en `../../docs/adr/0011-frontend-por-dominio.md`. La interfaz obtiene datos solo de `src/features/<dominio>/api.ts`, que hoy reexporta el servidor simulado de `src/mocks/`; ESLint impide importar `@/mocks` desde páginas y componentes. No mutar el seed desde la interfaz. IndexedDB conserva una instantánea de demo, con protección de datos ilegibles. Mantener esa funcionalidad. El proxy de Vite solo se usa para comprobar la sonda de salud en esta fase.

Fuente actual: `../../docs/requisitos/requisitos.md`. La v2.1 y las definiciones L-1 a L-6 se preservan en `../../docs/requisitos/historico/`, sin trasladar sus aprobaciones a las fichas nuevas. Obsidian es contexto opcional: no escribir notas sin autorización específica.
