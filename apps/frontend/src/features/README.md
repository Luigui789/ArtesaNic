# Organización del frontend por dominio

Cada carpeta de `src/features/` agrupa lo que pertenece a un dominio del negocio: sus páginas, sus componentes y la API que consume. Así, cada persona trabaja en su dominio sin tocar los archivos de las demás, y cada dominio se conecta a Django por separado. Decisión: [ADR-011](../../../../docs/adr/0011-frontend-por-dominio.md).

```text
src/
├── app/                 App.tsx (rutas y proveedores), error-boundary, not-found
├── features/
│   ├── auth/            Sesión y acceso                       → RF-004
│   ├── talleres/        Perfil del taller y panel del artesano → RF-008
│   ├── catalogo/        Categorías, productos e inventario     → RF-001–003, RF-017, RF-019, RF-022–024
│   ├── pedidos/         Solicitud, ciclo de vida y entrega     → RF-005, RF-006, RF-009, RF-010, RF-015, RF-016, RF-018
│   ├── pagos/           Pagos, comprobantes y reembolsos       → RF-011, RF-021
│   ├── mensajes/        Mensajería del pedido                  → RF-014
│   └── notificaciones/  Avisos de mensajes y cambios           → RF-020
├── mocks/               Servidor simulado (temporal): solo lo usan las api.ts
├── components/          ui/ (shadcn), layout/ y common/: piezas sin dominio
├── hooks/               Hooks compartidos (moneda, metadatos, móvil)
├── lib/                 Reglas y utilidades compartidas (estados, montos, formato)
└── types/               Modelo de dominio en camelCase (ADR-002)
```

Dentro de un dominio:

| Archivo | Contenido |
|---|---|
| `api.ts` | Las funciones de datos del dominio. **Es lo único que la interfaz importa para obtener o cambiar datos.** |
| `types.ts` | Entradas del contrato (`ProductInput`, `OrderRequestInput`, …). Las entidades viven en `@/types`. |
| `pages/` | Componentes de página, uno por ruta, exportados por defecto. |
| `components/` | Componentes que solo tienen sentido en ese dominio. |

## Reglas

1. **Datos solo a través de `api.ts`.** Páginas, componentes y hooks nunca importan `@/mocks`; ESLint lo impide. La única excepción son las herramientas de la demo del layout (restablecer y estado de persistencia), que desaparecen con los mocks.
2. **Un dominio puede usar lo de otro**: páginas de pedidos usan `@/features/pagos/components/payment-receipt` o `@/features/catalogo/api`. No se copia código entre dominios.
3. **Lo compartido va fuera de `features/`** solo cuando de verdad lo usan varios dominios (`components/common`, `lib/`).
4. **No mover `components/ui/`**: `components.json` de shadcn depende de esa ruta.
5. **Las reglas de negocio las decide el servidor.** El mock las simula; la interfaz solo valida por comodidad.

## Rutas

El árbol de rutas se declara explícitamente en [`src/app/App.tsx`](../app/App.tsx) con `<Routes>` y `<Route>` de React Router ([ADR-001](../../../../docs/adr/0001-sistema-de-routing.md)). El nombre del archivo no define la URL.

Para agregar una ruta:

1. Crear la página en el dominio que corresponda y exportarla por defecto:

   ```tsx
   // src/features/pedidos/pages/mi-pagina.tsx
   export default function MiPagina() { ... }
   ```

2. Registrarla en `src/app/App.tsx`:

   ```tsx
   import MiPagina from "@/features/pedidos/pages/mi-pagina";
   // ...
   <Route path="/mi-ruta" element={<MiPagina />} />;
   ```

| Necesidad                       | Cómo se hace                                                       |
| ------------------------------- | ------------------------------------------------------------------ |
| Parámetro dinámico              | `<Route path="/producto/:id" …>` + `useParams<{ id: string }>()`   |
| Parámetros de búsqueda (query)  | `useSearchParams()` — ver `catalogo/pages/catalogo.tsx` y `mensajes/pages/mensajes.tsx` |
| Navegación programática         | `useNavigate()` de `react-router`                                  |
| Enlaces                         | `<Link to="/ruta">`; usar `<NavLink>` si se necesita estado activo |
| Metadatos (`<title>`, `<meta>`) | hook `useDocumentHead` de `@/hooks/use-document-head`              |
| Página 404                      | `src/app/not-found.tsx`, registrada como `<Route path="*">`        |
| Errores de render               | `src/app/error-boundary.tsx`                                       |

## Conectar un dominio a Django

Hoy cada `api.ts` reexporta funciones de `src/mocks/`. Para integrar un dominio:

1. Acordar el endpoint en el contrato (`docs/api/openapi.yaml`) antes de programar.
2. En `features/<dominio>/api.ts`, reemplazar el reexport de cada función por una implementación HTTP **con la misma firma**. Ahí, y solo ahí, se convierte `snake_case` de DRF a `camelCase` (ADR-002).
3. Las páginas no cambian; si una firma tiene que cambiar (por ejemplo, ya no se envía el rol porque lo deriva el token), TypeScript señala cada lugar afectado.
4. Cuando ningún `api.ts` use un archivo de `src/mocks/`, eliminarlo junto con su parte de `scripts/check-demo.mjs`.

**Catálogo (AUD-04):** `catalogo/api.ts` elige entre el servidor simulado y `catalogo/http.ts` con `VITE_CATALOGO_API` (`mock` por defecto, `real`). Sus firmas cambiaron a la forma V1 del contrato (modalidades, publicación, paginación del listado propio); las lecturas `getProduct`/`listProducts` del mock se conservan para los dominios todavía simulados. Ver [catálogo](../../../../docs/api/catalogo.md#10-frontend).

**Solicitudes (AUD-05):** `solicitudes/` define composición multi-renglones, lista y detalle privados de las partes. Sus tipos no usan `Order` ni `OrderOption`. `solicitudes/api.ts` comparte la fuente del catálogo; `http.ts` transforma el contrato y reutiliza el proveedor Bearer sin inventar sesión real. La demo guarda `store.solicitudes`, separado de `store.orders`, sin pagos, reservas ni chat. Las rutas `/pedidos` y `/panel/pedidos` conservan la demo anterior, rotulada como legacy. Ver [contrato de solicitudes](../../../../docs/api/solicitudes.md).

El mock comparte un único almacén entre dominios legacy (aceptar un pedido de esa demo reserva unidades del producto); las nuevas solicitudes no invocan ese ciclo. Mientras un dominio siga simulado, sus datos no conocen los del dominio ya conectado; la integración completa de sesión pertenece a AUD-18.
