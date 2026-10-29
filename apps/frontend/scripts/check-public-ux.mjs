// Cambios públicos de fase 5. Privacidad/mapas siguen en check-geolocalizacion-publica.
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
    catalogo: "@/features/catalogo/pages/catalogo",
    producto: "@/features/catalogo/pages/producto",
    taller: "@/features/talleres/pages/artesano",
    queries: "@/features/talleres/queries",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);
const cat = { id: 1, codigo: "madera", nombre: "Madera" };
const taller = {
  id: 71,
  nombre: "Taller familiar",
  historia: "Historia conservada. ".repeat(50),
  rubro: "Talla",
  direccion: "Masaya",
  horario: "Lunes",
  telefono: "",
  whatsapp: "",
  facebook: "",
  instagram: "",
  sitioWeb: "",
  ubicacionMapa: null,
};
const pieza = {
  id: 901,
  nombre: "Pieza artesanal",
  descripcion: "Descripción completa. ".repeat(80),
  precio: 450,
  categoria: cat,
  modalidades: ["produccion"],
  taller: { id: 71, nombre: taller.nombre },
};
const h = m.React.createElement;
function client() {
  return new m.rq.QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
}
async function render(qc, ruta, Page, patron = ruta) {
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
            { initialEntries: [ruta] },
            h(m.router.Routes, null, h(m.router.Route, { path: patron, element: h(Page) })),
          ),
        ),
      ),
    ),
  );
}
const qc = client();
qc.setQueryData(["perfil-taller", 71], taller);
qc.setQueryData(["producto", 901], pieza);
for (const [modalidades, disponibleStock, esperado] of [
  [["stock"], 3, /3 unidades disponibles/],
  [["produccion"], undefined, /Pieza estándar elaborada por cantidad/],
  [["personalizacion"], undefined, /Personalizado:/],
  [["stock", "personalizacion"], 0, /Sin unidades disponibles ahora/],
]) {
  qc.setQueryData(["producto", 901], { ...pieza, modalidades, disponibleStock });
  const html = await render(qc, "/producto/901", m.producto.default, "/producto/:id");
  assert.match(html, esperado);
  assert.match(html, /href="\/solicitar\/901"/);
  assert.match(html, /Solicitar producto/);
  assert.match(html, /href="\/artesano\/71"/);
  assert.match(html, /Talla/);
  assert.ok(html.indexOf("Solicitar producto") < html.indexOf('id="descripcion-producto"'));
  assert.ok(html.includes(pieza.descripcion));
  assert.doesNotMatch(html, /role="region"/);
}
qc.setQueryData(["productos-artesano", 71], {
  items: Array.from({ length: 8 }, (_, i) => ({ ...pieza, id: 901 + i })),
  total: 8,
  totalPages: 1,
});
const perfil = await render(qc, "/artesano/71", m.taller.default, "/artesano/:id");
assert.equal((perfil.match(/aria-label="Ver producto:/g) ?? []).length, 4);
assert.match(perfil, /href="\/catalogo\?artesanoId=71"/);
assert.match(perfil, /Ver los 8 productos en el catálogo/);
assert.ok(perfil.indexOf('id="productos-taller"') < perfil.indexOf('id="historia"'));
assert.match(perfil, /<details/);
assert.ok(perfil.includes(taller.historia));
qc.setQueryData(["productos-artesano", 71], { items: [], total: 0, totalPages: 1 });
const vacio = await render(qc, "/artesano/71", m.taller.default, "/artesano/:id");
assert.match(vacio, /aún no tiene productos publicados/);
assert.match(vacio, /Nuestra historia/);
assert.match(vacio, /Información del taller/);

const search = {
  q: "talla",
  categoria: "madera",
  artesanoId: 71,
  precioMin: 100,
  precioMax: 900,
  orden: "recientes",
  page: 1,
};
qc.setQueryData(["categorias"], [cat]);
qc.setQueryData(["talleres-catalogo"], [{ id: 71, nombre: taller.nombre }]);
qc.setQueryData(["catalogo", search], { items: [], total: 0, totalPages: 1 });
const filtros = await render(
  qc,
  "/catalogo?q=talla&categoria=madera&artesanoId=71&precioMin=100&precioMax=900",
  m.catalogo.default,
  "/catalogo",
);
for (const label of [
  "Búsqueda: talla",
  "Categoría: Madera",
  "Taller: Taller familiar",
  "Desde C$ 100",
  "Hasta C$ 900",
])
  assert.ok(filtros.includes(`aria-label="Quitar ${label}"`));
assert.match(filtros, /No encontramos productos/);
assert.match(filtros, /La búsqueda o los filtros no encontraron/);
assert.match(filtros, /Limpiar filtros/);
assert.deepEqual(m.queries.perfilTallerQuery(71).queryKey, ["perfil-taller", 71]);
assert.equal(m.queries.perfilTallerQuery(undefined).enabled, false);
const fallo = client();
await assert.rejects(
  fallo.fetchQuery({
    queryKey: ["producto", 901],
    queryFn: async () => {
      throw new Error("Error interno");
    },
  }),
);
const error = await render(fallo, "/producto/901", m.producto.default, "/producto/:id");
assert.match(error, /No pudimos cargar este producto/);
assert.match(error, /Reintentar/);
assert.doesNotMatch(error, /Solicitar producto/);
console.log(
  "check-public-ux: filtros activos, modalidades/CTA, vínculo producto-taller, productos tempranos, catálogo completo, historia y estados OK",
);
process.exit(0);
