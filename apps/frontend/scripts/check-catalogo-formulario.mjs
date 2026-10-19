// Verifica que la validación temprana del formulario de producto
// (src/features/catalogo/validacion.ts) acepta todo lo que admite el contrato V1
// (docs/api/catalogo.md §3) y sigue rechazando lo que el servidor rechazaría.
import assert from "node:assert/strict";
import { cargarModulo } from "./cargar-modulo.mjs";

const { esquemaProducto, LIMITES_PRODUCTO } = await cargarModulo(
  "src/features/catalogo/validacion.ts",
);

const valido = {
  nombre: "Jarrón",
  precio: 450,
  categoria: "madera",
  descripcion: "Barro.",
  modalidades: ["produccion"],
};
const acepta = (cambios, motivo) =>
  assert.equal(esquemaProducto.safeParse({ ...valido, ...cambios }).success, true, motivo);
const rechaza = (cambios, campo, motivo) => {
  const r = esquemaProducto.safeParse({ ...valido, ...cambios });
  assert.equal(r.success, false, motivo);
  assert.ok(
    r.error.issues.some((i) => i.path[0] === campo),
    `${motivo}: se esperaba un error en «${campo}»`,
  );
};

assert.deepEqual(
  { ...LIMITES_PRODUCTO },
  { nombre: 120, descripcion: 2000, precioMaximo: 99_999_999.99 },
);

// Límites del contrato V1, no los heredados del mock (3–80, 20–600 y C$ 500 000).
acepta({ nombre: "J" }, "nombre de un carácter");
acepta({ nombre: "N".repeat(81) }, "nombre de 81 caracteres");
acepta({ nombre: "N".repeat(120) }, "nombre de 120 caracteres");
rechaza({ nombre: "N".repeat(121) }, "nombre", "nombre de 121 caracteres");
rechaza({ nombre: "" }, "nombre", "nombre vacío");
rechaza({ nombre: "   " }, "nombre", "nombre solo con espacios");

acepta({ descripcion: "Barro." }, "descripción corta");
acepta({ descripcion: "D".repeat(601) }, "descripción de 601 caracteres");
acepta({ descripcion: "D".repeat(2000) }, "descripción de 2000 caracteres");
rechaza({ descripcion: "D".repeat(2001) }, "descripcion", "descripción de 2001 caracteres");
rechaza({ descripcion: "" }, "descripcion", "descripción vacía");
rechaza({ descripcion: "  \n " }, "descripcion", "descripción solo con espacios");

// Precio compatible con DecimalField(max_digits=10, decimal_places=2).
for (const precio of [0.01, 10.15, 500_001, 99_999_999.99]) acepta({ precio }, `precio ${precio}`);
for (const precio of [0, -1, Number.NaN, 0.001, 100_000_000])
  rechaza({ precio }, "precio", `precio ${precio}`);

rechaza({ categoria: "" }, "categoria", "sin categoría");

// RN-004: combinables, al menos una y ninguna exige existencias.
for (const modalidades of [
  ["stock"],
  ["produccion"],
  ["personalizacion"],
  ["stock", "produccion", "personalizacion"],
])
  acepta({ modalidades }, `modalidades ${modalidades}`);
rechaza({ modalidades: [] }, "modalidades", "sin modalidades");
rechaza({ modalidades: ["pieza_unica"] }, "modalidades", "modalidad desconocida");

console.log("OK: validación del formulario de producto alineada con el contrato V1.");
