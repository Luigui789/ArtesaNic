# ADR-011 — Organización del frontend por dominio

**Estado:** Aceptada por el responsable del proyecto el 10 de octubre de 2026, con implementación en `refactor/frontend-por-dominio` y revisión del equipo en su PR hacia `develop`.

**Concreta:** la capa de servicios del [ADR-002](0002-acceso-a-datos-y-contratos.md), sin cambiar su decisión: los mocks son temporales y no se crea un mecanismo permanente para alternar entre mock y HTTP. Mantiene el enrutamiento explícito del [ADR-001](0001-sistema-de-routing.md).

## Contexto

Tres personas empezarán a trabajar en paralelo: una en el frontend y dos en dominios del backend que después se conectarán a la interfaz. El frontend estaba organizado por tipo de archivo:

- 14 páginas en `src/routes/`, con nombres heredados de TanStack Start (`panel.pedidos.$id.tsx`).
- Componentes repartidos entre `src/components/catalogo`, `pedidos` y `productos`.
- Un único `src/services/mock-api.ts` (994 líneas) con categorías, productos, talleres, pedidos, pagos, mensajes y la persistencia de la demo; 20 archivos lo importaban directamente.

Con esa forma, cualquier cambio de un dominio tocaba el mismo archivo de servicios, lo que provoca conflictos de merge, y no había forma de conectar un dominio a Django sin tocar las páginas de los demás.

## Decisión

1. **Carpetas por dominio** en `src/features/`: `auth`, `talleres`, `catalogo`, `pedidos`, `pagos`, `mensajes` y `notificaciones`. Cada una contiene sus `pages/`, sus `components/`, un `api.ts` y, cuando hace falta, un `types.ts` con las entradas del contrato.
2. **`api.ts` es la capa de servicios del ADR-002.** La interfaz solo obtiene y cambia datos a través de él. Hoy reexporta las funciones del servidor simulado; al integrar Django, cada función se reemplaza por su llamada HTTP con la misma firma, y el mapeo `snake_case → camelCase` ocurre ahí.
3. **El servidor simulado vive en `src/mocks/`**, dividido por dominio (`catalogo`, `talleres`, `pedidos`, `pagos`, `mensajes`, `inventario`) sobre un núcleo común (`core.ts`) con un único almacén, la cola de operaciones y la persistencia en IndexedDB. Se conserva un solo almacén porque las operaciones cruzan dominios (aceptar un pedido reserva unidades), como en el backend. `src/mocks/index.ts` expone la misma superficie que el antiguo `mock-api.ts`, que es la que verifica `scripts/check-demo.mjs`.
4. **ESLint impide importar `@/mocks`** fuera de los `api.ts`. La única excepción son las herramientas de la demo del layout (restablecer y estado de persistencia), que desaparecen con los mocks.
5. **Lo que no pertenece a un dominio no se mueve**: `components/ui` (lo requiere `components.json` de shadcn), `components/layout`, `components/common`, `hooks/` compartidos, `lib/` y `types/`.
6. **Sin cambios de comportamiento.** Las funciones se trasladan sin modificar su código; las rutas y URLs son las mismas.

| Antes | Después |
|---|---|
| `src/routes/*.tsx` | `src/features/<dominio>/pages/*.tsx` |
| `src/routes/README.md` | `src/features/README.md` |
| `src/components/{catalogo,pedidos,productos}/` | `src/features/<dominio>/components/` |
| `src/hooks/use-session.tsx` | `src/features/auth/use-session.tsx` |
| `src/hooks/use-notifications.tsx` | `src/features/notificaciones/use-notifications.tsx` |
| `src/services/mock-api.ts` | `src/mocks/*.ts` y `src/features/<dominio>/api.ts` |
| `src/services/mock-persistence.ts` | `src/mocks/persistence.ts` |
| `src/data/seed.ts` | `src/mocks/seed.ts` |

## Consecuencias

**Positivas**

- Cada persona trabaja en su carpeta, sin compartir un archivo de servicios.
- Un dominio se conecta a Django sin tocar las páginas: el cambio se limita a su `api.ts`.
- La regla de ESLint evita que una página siga usando el mock después de conectar su dominio.
- Para eliminar los mocks basta con borrar `src/mocks/` cuando ningún `api.ts` lo use.

**Negativas y costos asumidos**

- Mientras unos dominios estén conectados y otros simulados, sus datos no se conocen entre sí; conviene conectar en el orden de dependencia: auth, talleres, catálogo, pedidos, y después pagos y mensajes.
- Los documentos históricos citan las rutas anteriores en su texto. Se actualizaron los destinos de sus enlaces, no su redacción; la tabla anterior sirve de equivalencia.
- La conexión Lovable no se ha probado con la nueva estructura; hay que comprobarla en el editor antes de usarla.

## Verificación

Antes y después del cambio: `pnpm lint` (0 errores, mismas 9 advertencias), `pnpm typecheck`, `pnpm test` (reglas de la demo) y `pnpm build`. El módulo del servidor simulado exporta los mismos 37 nombres que `mock-api.ts`. Las 14 rutas se recorrieron en el navegador, en las vistas de comprador y de artesano, sin errores en la consola.
