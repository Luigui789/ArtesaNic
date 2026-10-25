// RF-019 con moderación administrativa (AUD-14): el producto propio trae `moderacion`
// (docs/api/catalogo.md), el panel la muestra con motivo y fecha, sin el actor, y no ofrece
// Publicar. El backend sigue siendo la autoridad (409 producto_moderado).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cargarModulos } from "./cargar-modulo.mjs";

const m = await cargarModulos(
  {
    React: "react",
    servidor: "react-dom/server",
    http: "@/features/catalogo/http",
    lib: "@/lib/http",
    estado: "@/features/catalogo/components/estado-producto-propio",
    errores: "@/lib/errores-dominio",
  },
  { VITE_CATALOGO_API: "real" },
);

const base = {
  id: 15,
  nombre: "Sandalias",
  descripcion: "Cuero natural.",
  precio: "4890.50",
  categoria: { id: 1, codigo: "cuero_y_calzado", nombre: "Cuero y calzado" },
  modalidades: ["stock"],
  taller: { id: 3, nombre: "Barro y Sombra" },
  creado_en: "2026-10-14T10:30:00-06:00",
  actualizado_en: "2026-10-15T09:00:00-06:00",
  publicado: true,
};
const MOTIVO = "La fotografía no corresponde al producto ofrecido.";

// ---------- DTO → modelo ----------

const libre = m.http.aProductoPropio({ ...base, moderacion: null });
assert.equal(libre.moderacion, null);
assert.equal(libre.publicado, true);

const moderado = m.http.aProductoPropio({
  ...base,
  moderacion: { motivo: MOTIVO, moderado_en: "2026-10-25T15:30:00-06:00" },
});
assert.deepEqual(moderado.moderacion, { motivo: MOTIVO, moderadoEn: "2026-10-25T15:30:00-06:00" });
assert.equal(moderado.publicado, true, "moderar no cambia la decisión del artesano");

// ---------- Estado y aviso ----------

const h = m.React.createElement;
const render = (nodo) => m.servidor.renderToStaticMarkup(nodo);

assert.match(render(h(m.estado.EstadoProductoPropio, { producto: libre })), />Publicado</);
assert.match(
  render(h(m.estado.EstadoProductoPropio, { producto: { ...libre, publicado: false } })),
  />No publicado</,
);
const insignia = render(h(m.estado.EstadoProductoPropio, { producto: moderado }));
assert.match(insignia, /Retirado por moderación/, "texto explícito, no solo color");
assert.doesNotMatch(insignia, />Publicado</, "la moderación se muestra primero");

assert.equal(render(h(m.estado.AvisoModeracion, { producto: libre })), "");
const aviso = render(h(m.estado.AvisoModeracion, { producto: moderado }));
assert.match(aviso, /Retirado por moderación/);
assert.match(aviso, /Motivo:/);
assert.ok(aviso.includes(MOTIVO));
assert.match(aviso, /25 oct\.? 2026/);
assert.match(aviso, /dateTime="2026-10-25T15:30:00-06:00"/);
assert.match(aviso, /break-words/, "un motivo largo no desborda en 360 px");
const largo = render(
  h(m.estado.AvisoModeracion, {
    producto: { ...moderado, moderacion: { ...moderado.moderacion, motivo: "x".repeat(1000) } },
  }),
);
assert.ok(largo.includes("x".repeat(1000)), "motivo completo, sin recortes");

// ---------- Panel: sin Publicar, Editar disponible ----------

const panel = await readFile(
  new URL("../src/features/catalogo/pages/panel-productos.tsx", import.meta.url),
  "utf8",
);
assert.match(panel, /<AvisoModeracion producto=\{p\} \/>/);
assert.match(panel, /<EstadoProductoPropio producto=\{p\} \/>/);
// Moderado y despublicado: explicación en lugar del botón Publicar.
assert.match(panel, /\) : p\.moderacion \? \([\s\S]*?MENSAJE_SIN_REPUBLICAR[\s\S]*?\) : \(/);
// Editar no depende de la moderación.
assert.match(panel, /onClick=\{\(\) => abrir\(p\)\}[\s\S]{0,120}Editar/);
assert.equal(
  m.estado.MENSAJE_SIN_REPUBLICAR,
  "Este producto fue retirado por moderación y no puede volver a publicarse.",
);

// ---------- Error de dominio ----------

const error = new m.lib.ApiError(409, "Conflicto", {}, "producto_moderado");
assert.equal(
  m.errores.mensajeDominio(error),
  "Este producto fue retirado por moderación y no puede publicarse.",
);

console.log("check-moderacion: DTO, insignia, motivo, fecha, sin Publicar y producto_moderado OK");

// react-dom/server deja canales abiertos en el bundle de navegador, como check-auth-ui.
process.exit(0);
