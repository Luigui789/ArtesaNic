// Home usa los adaptadores públicos reales; el transporte se simula, sin backend.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const m = await cargarModulos(
  {
    React: "react",
    ssr: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    sesion: "@/features/auth/sesion",
    session: "@/features/auth/use-session",
    moneda: "@/hooks/use-currency",
    home: "@/routes/home",
    descubrir: "@/features/catalogo/pages/inicio",
    catalogo: "@/features/catalogo/queries",
    talleres: "@/features/talleres/queries",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
const requests = [];
const categoria = {
  id: 99,
  codigo: "nueva & categoria",
  nombre: "Categoría nueva desde el servidor",
};
const productos = Array.from({ length: 8 }, (_, i) => ({
  id: 900 + i,
  nombre: `Pieza del servidor ${i}`,
  descripcion: "Hecha a mano",
  precio: "725.50",
  categoria,
  modalidades: ["produccion"],
  taller: { id: 71, nombre: "Taller del servidor" },
  creado_en: "2026-10-27T12:00:00Z",
  fotografia_url: i ? null : "/media/pieza.jpg",
}));
const talleres = Array.from({ length: 5 }, (_, i) => ({
  id: 71 + i,
  nombre: `Productor del servidor ${i}`,
  historia: "Historia del taller",
  rubro: "Madera",
  direccion_completa: "Masaya",
  horario: "",
  telefono_publico: "",
  whatsapp_publico: "",
  facebook_url: "",
  instagram_url: "",
  sitio_web: "",
}));
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const path = new URL(url, "http://test").pathname;
  const data = path.endsWith("/categorias/")
    ? [categoria]
    : path.endsWith("/productos/")
      ? { count: 8, next: null, previous: null, results: productos }
      : path.endsWith("/talleres/")
        ? talleres
        : { tasa_cambio: null, actualizada_en: null };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
function client() {
  return new m.rq.QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, retryOnMount: false } },
  });
}
async function render(qc, page = m.home.default) {
  const h = m.React.createElement;
  const ctrl = m.sesion.crearControladorSesion(
    { restaurar: async () => null, alExpirar: () => () => {} },
    qc,
  );
  await ctrl.reintentar();
  return m.ssr.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(
        m.session.SessionProvider,
        { controlador: ctrl },
        h(
          m.moneda.CurrencyProvider,
          null,
          h(
            m.router.MemoryRouter,
            { initialEntries: [page === m.home.default ? "/" : "/descubrir"] },
            h(page),
          ),
        ),
      ),
    ),
  );
}
const qc = client();
await Promise.all([
  qc.fetchQuery(m.catalogo.categoriasQuery),
  qc.fetchQuery(m.catalogo.productosRecientesQuery),
  qc.fetchQuery(m.talleres.talleresPublicosQuery),
]);
assert.equal(requests.length, 3);
const productUrl = new URL(
  requests.find((x) => x.includes("/productos/")),
  "http://test",
);
assert.equal(productUrl.searchParams.get("page_size"), "8");
assert.equal(productUrl.searchParams.get("orden"), "recientes");
const html = await render(qc);
assert.equal((html.match(/aria-label="Ver producto:/g) ?? []).length, 4);
assert.equal((html.match(/aria-label="Ver taller:/g) ?? []).length, 3);
assert.match(html, /Pieza del servidor 0/);
assert.match(html, /alt="Pieza del servidor 0"/);
assert.match(html, /725/);
assert.match(html, /href="\/producto\/900"/);
assert.match(html, /href="\/artesano\/71"/);
assert.match(html, /Categoría nueva desde el servidor/);
assert.ok(html.includes('href="/catalogo?categoria=nueva+%26+categoria"'));
assert.match(html, /href="\/catalogo"[^>]*>Explorar productos/);
assert.ok(html.indexOf('id="home-recientes"') < html.indexOf('id="como-funciona"'));
assert.match(html, /id="para-artesanos"/);
assert.doesNotMatch(html, /destacados|más popular|ranking/i);
// Volver a pedir las opciones de /descubrir usa la caché, sin otra petición.
await qc.fetchQuery(m.catalogo.productosRecientesQuery);
await qc.fetchQuery(m.catalogo.categoriasQuery);
await qc.fetchQuery(m.talleres.talleresPublicosQuery);
assert.equal(requests.length, 3);
assert.match(await render(qc, m.descubrir.default), /Pieza del servidor 7/);

const empty = client();
empty.setQueryData(m.catalogo.productosRecientesQuery.queryKey, {
  items: [],
  total: 0,
  totalPages: 1,
});
empty.setQueryData(m.catalogo.categoriasQuery.queryKey, []);
empty.setQueryData(m.talleres.talleresPublicosQuery.queryKey, []);
const emptyHtml = await render(empty);
assert.match(emptyHtml, /Pronto habrá nuevas piezas/);
assert.match(emptyHtml, /Nuevos talleres por conocer/);
assert.match(emptyHtml, /Ver todos los productos/);

const pending = await render(client());
assert.match(pending, /Cargando productos recientes/);
assert.match(pending, /Cargando categorías/);
assert.match(pending, /Cargando talleres/);

// El fallo de una sección no suprime las otras ni la navegación pública.
for (const options of [
  m.catalogo.productosRecientesQuery,
  m.catalogo.categoriasQuery,
  m.talleres.talleresPublicosQuery,
]) {
  const previous = qc.getQueryData(options.queryKey);
  qc.removeQueries({ queryKey: options.queryKey, exact: true });
  await assert.rejects(
    qc.fetchQuery({
      ...options,
      queryFn: async () => {
        throw new Error("Sin conexión");
      },
    }),
  );
  const errorHtml = await render(qc);
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /Reintentar/);
  assert.match(errorHtml, /Explorar productos/);
  assert.match(errorHtml, /id="como-funciona"/);
  qc.setQueryData(options.queryKey, previous);
}
console.log(
  "check-home: contratos públicos, límites, enlaces, categorías nuevas, caché compartida, loading/empty/error y contenido conservado OK",
);
process.exit(0);
