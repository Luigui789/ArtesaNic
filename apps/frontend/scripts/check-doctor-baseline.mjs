import assert from "node:assert/strict";
import { nuevosDiagnosticos, validarInforme } from "./doctor-delta.mjs";

const hallazgo = (filePath, fingerprint, rule = "regla", severity = "warning") => ({
  filePath,
  fingerprint,
  rule,
  severity,
  plugin: "react-doctor",
});
const anterior = [
  hallazgo("pagina.tsx", "demo"),
  hallazgo("otro.tsx", "index"),
  hallazgo("repetido.tsx", "igual"),
  hallazgo("repetido.tsx", "igual"),
];
const actual = [
  hallazgo("pagina-demo.tsx", "demo"),
  hallazgo("otro.tsx", "index"),
  hallazgo("repetido.tsx", "igual"),
  hallazgo("repetido.tsx", "igual"),
];
const movimientos = [["pagina.tsx", "pagina-demo.tsx"]];
assert.deepEqual(nuevosDiagnosticos(anterior, actual, movimientos), []);
const indiceNuevo = hallazgo("pagina.tsx", "index");
assert.deepEqual(nuevosDiagnosticos(anterior, [...actual, indiceNuevo], movimientos), [
  indiceNuevo,
]);
const transicion = hallazgo("pagina.tsx", "transicion", "no-transition-all");
assert.deepEqual(nuevosDiagnosticos(anterior, [...actual, transicion], movimientos), [transicion]);
const empeorado = hallazgo("otro.tsx", "index", "regla", "error");
assert.deepEqual(
  nuevosDiagnosticos(anterior, [...actual.slice(0, 1), empeorado, ...actual.slice(2)], movimientos),
  [empeorado],
);
const repetidoNuevo = hallazgo("repetido.tsx", "igual");
assert.deepEqual(nuevosDiagnosticos(anterior, [...actual, repetidoNuevo], movimientos), [
  repetidoNuevo,
]);
const informe = {
  schemaVersion: 3,
  ok: true,
  mode: "full",
  diagnostics: anterior,
  projects: [{ complete: true, skippedChecks: [] }],
  summary: { totalDiagnosticCount: anterior.length },
};
assert.equal(validarInforme(informe, 1), informe);
assert.throws(() => validarInforme({ ...informe, projects: [{ complete: false }] }, 1));
assert.throws(() => validarInforme({ ...informe, diagnostics: [hallazgo("x", "")] }, 1));
assert.throws(() => validarInforme(informe, 2));
console.log("React Doctor: comparación de fingerprints, traslados y fallos incompletos OK");
