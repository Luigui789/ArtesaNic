// DR-01: contrato de archivo real, transporte común y render accesible.
import assert from "node:assert/strict";
import { cargarModulos } from "./cargar-modulo.mjs";

const { http, comun, reglas, React, servidor, formulario, tarjeta, router, moneda } =
  await cargarModulos({
    http: "@/features/catalogo/http",
    comun: "@/lib/http",
    reglas: "@/features/catalogo/imagenes",
    React: "react",
    servidor: "react-dom/server",
    formulario: "@/features/catalogo/components/fotografia-principal",
    tarjeta: "@/features/catalogo/components/product-card",
    router: "react-router",
    moneda: "@/hooks/use-currency",
  });

const archivo = new File(["imagen-prueba"], "foto.webp", { type: "image/webp" });
assert.equal(reglas.errorFotografia(archivo), undefined);
for (const tipo of ["image/jpeg", "image/png", "image/webp"])
  assert.equal(reglas.errorFotografia(new File(["x"], "x", { type: tipo })), undefined);
for (const tipo of ["image/gif", "image/svg+xml", "application/pdf", ""])
  assert.match(reglas.errorFotografia(new File(["x"], "x.jpg", { type: tipo })), /JPEG/);
assert.match(
  reglas.errorFotografia(
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }),
  ),
  /5 MiB/,
);
assert.equal(
  reglas.errorFotografia(
    new File([new Uint8Array(5 * 1024 * 1024)], "x.png", { type: "image/png" }),
  ),
  undefined,
);

const entrada = {
  nombre: "Jarrón",
  descripcion: "Barro",
  precio: 123.45,
  categoria: "barro",
  modalidades: ["stock", "personalizacion"],
};
const dto = {
  id: 1,
  ...entrada,
  precio: "123.45",
  categoria: { id: 1, codigo: "barro", nombre: "Barro" },
  taller: { id: 3, nombre: "Taller" },
  creado_en: "2026-10-21",
  actualizado_en: "2026-10-21",
  publicado: false,
  fotografia_url: "/media/productos/uuid/principal/uuid.webp",
};
const peticiones = [];
let responder = () => new Response(JSON.stringify(dto), { status: 201 });
globalThis.fetch = async (url, init) => {
  peticiones.push({ url, ...init });
  return responder(url, init);
};
comun.establecerTokenDeAcceso("access-en-memoria");
const creado = await http.createOwnProduct({
  ...entrada,
  fotografiaPrincipal: archivo,
  imagen: "data:image/png;base64,no-enviar",
});
let ultima = peticiones.at(-1);
assert.equal(ultima.method, "POST");
assert.ok(ultima.body instanceof FormData);
assert.equal(ultima.body.get("fotografia_principal"), archivo);
assert.deepEqual(ultima.body.getAll("modalidades"), entrada.modalidades);
assert.equal(ultima.body.get("precio"), "123.45");
assert.equal(ultima.body.has("imagen"), false);
assert.equal(ultima.headers["Content-Type"], undefined);
assert.equal(ultima.headers.Authorization, "Bearer access-en-memoria");
assert.equal(ultima.credentials, "include");
assert.equal(creado.imagen, dto.fotografia_url);

await http.updateOwnProduct(1, entrada);
ultima = peticiones.at(-1);
assert.equal(ultima.method, "PATCH");
assert.equal(ultima.headers["Content-Type"], "application/json");
assert.equal(JSON.parse(ultima.body).fotografia_principal, undefined);
await http.updateOwnProduct(1, { ...entrada, fotografiaPrincipal: archivo });
assert.ok(peticiones.at(-1).body instanceof FormData);

// La misma instancia FormData y la sesión renovada se reutilizan al reintentar.
let intentos = 0;
responder = (url) => {
  if (url.endsWith("/auth/csrf/"))
    return new Response(JSON.stringify({ csrf_token: "csrf-prueba" }));
  if (url.endsWith("/auth/refrescar/"))
    return new Response(JSON.stringify({ access: "access-renovado" }));
  return ++intentos === 1 ? new Response("{}", { status: 401 }) : new Response(JSON.stringify(dto));
};
await http.updateOwnProduct(1, { ...entrada, fotografiaPrincipal: archivo });
const uploads = peticiones.filter((p) => p.body instanceof FormData).slice(-2);
assert.equal(uploads[0].body, uploads[1].body);
assert.equal(uploads[1].headers.Authorization, "Bearer access-renovado");

// CSRF sigue disponible en el transporte multipart genérico cuando el contrato lo pide.
responder = () => new Response(JSON.stringify(dto));
await comun.solicitar("/prueba/", {
  metodo: "POST",
  cuerpo: http.cuerpoProducto({ ...entrada, fotografiaPrincipal: archivo }),
  csrf: true,
  autenticada: true,
  cabeceras: { "content-type": "incorrecto" },
});
ultima = peticiones.at(-1);
assert.equal(ultima.headers["X-CSRFToken"], "csrf-prueba");
assert.equal(ultima.headers["content-type"], undefined);
assert.equal(ultima.headers["Content-Type"], undefined);
responder = () =>
  new Response(JSON.stringify({ fotografia_principal: ["El archivo no es una imagen válida."] }), {
    status: 400,
  });
await assert.rejects(http.updateOwnProduct(1, { ...entrada, fotografiaPrincipal: archivo }), (e) =>
  e.campos.fotografia_principal[0].includes("válida"),
);

const h = React.createElement;
const html = servidor.renderToStaticMarkup(
  h(formulario.FotografiaPrincipal, {
    actual: dto.fotografia_url,
    onChange: () => {},
    error: "Imagen inválida",
  }),
);
assert.match(html, /type="file"/);
assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(html, /src="\/media\/productos/);
assert.match(html, /role="alert"/);
assert.match(html, /Imagen inválida/);
const card = servidor.renderToStaticMarkup(
  h(
    moneda.CurrencyProvider,
    null,
    h(router.MemoryRouter, null, h(tarjeta.ProductCard, { product: creado })),
  ),
);
assert.match(card, /src="\/media\/productos/);
const historico = servidor.renderToStaticMarkup(h(tarjeta.ProductImage, {}));
assert.match(historico, /Sin fotografía/);
assert.doesNotMatch(historico, /<img/);
console.log("OK: DR-01 multipart, sesión/CSRF, reemplazo, errores, tipos y render.");

// react-dom/server deja canales abiertos en el bundle de navegador, como check-auth-ui.
process.exit(0);
