import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nuevosDiagnosticos, validarInforme } from "./doctor-delta.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doctor = path.join(frontend, "node_modules", "react-doctor", "bin", "react-doctor.js");
const temporal = mkdtempSync(path.join(tmpdir(), "aud17-doctor-"));

function ejecutar(comando, args, opciones = {}) {
  const resultado = spawnSync(comando, args, {
    cwd: frontend,
    maxBuffer: 64 * 1024 * 1024,
    ...opciones,
  });
  if (resultado.error || resultado.status !== 0) {
    throw new Error(
      `${comando} falló: ${resultado.error?.message ?? resultado.stderr?.toString() ?? resultado.status}`,
    );
  }
  return resultado.stdout;
}

function informe(carpeta, salida) {
  const args = [
    doctor,
    carpeta,
    "--json",
    "--json-out",
    salida,
    "--blocking",
    "warning",
    "--no-score",
    "--no-cache",
  ];
  const resultado = spawnSync(process.execPath, args, {
    cwd: frontend,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (resultado.error || resultado.signal || ![0, 1].includes(resultado.status)) {
    throw new Error(
      `React Doctor no pudo analizar ${carpeta}: ${resultado.error?.message ?? resultado.stderr ?? resultado.signal}`,
    );
  }
  let datos;
  try {
    datos = JSON.parse(readFileSync(salida, "utf8"));
  } catch {
    throw new Error(`React Doctor no produjo JSON válido para ${carpeta}.`);
  }
  return validarInforme(datos, resultado.status);
}

function movimientos(base) {
  const salida = ejecutar(
    "git",
    ["diff", "--name-status", "-z", "--find-copies-harder", "-C", base],
    { encoding: "utf8" },
  );
  const campos = salida.split("\0");
  const resultado = [];
  for (let i = 0; i < campos.length && campos[i];) {
    const estado = campos[i++];
    const origen = campos[i++];
    if (estado.startsWith("R") || estado.startsWith("C")) {
      const destino = campos[i++];
      const prefijo = "apps/frontend/";
      if (origen.startsWith(prefijo) && destino.startsWith(prefijo))
        resultado.push([origen.slice(prefijo.length), destino.slice(prefijo.length)]);
    }
  }
  return resultado;
}

try {
  const base = ejecutar("git", ["merge-base", "HEAD", "origin/develop"], {
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40,64}$/.test(base)) throw new Error("Git no devolvió un merge-base válido.");
  console.log(`React Doctor 0.9.18: comparando con merge-base ${base}`);
  const arbol = path.join(temporal, "base");
  mkdirSync(arbol);
  const raiz = ejecutar("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const archivo = ejecutar("git", ["-C", raiz, "archive", "--format=tar", base, "apps/frontend"]);
  ejecutar("tar", ["-xf", "-", "-C", arbol], { input: archivo });
  const anterior = informe(path.join(arbol, "apps", "frontend"), path.join(temporal, "base.json"));
  const actual = informe(frontend, path.join(temporal, "actual.json"));
  if (
    anterior.version !== "0.9.18" ||
    actual.version !== "0.9.18" ||
    anterior.projects[0].sourceFilterConfigHash !== actual.projects[0].sourceFilterConfigHash
  ) {
    throw new Error("La versión o los filtros de los análisis no coinciden.");
  }
  const nuevos = nuevosDiagnosticos(anterior.diagnostics, actual.diagnostics, movimientos(base));
  if (nuevos.length) {
    console.error(`${nuevos.length} aviso(s) nuevo(s):`);
    for (const d of nuevos)
      console.error(`${d.severity}: ${d.plugin}/${d.rule} ${d.filePath}:${d.line}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Sin avisos nuevos; ${anterior.diagnostics.length} hallazgos de la base comparados.`,
    );
  }
} catch (error) {
  console.error(`React Doctor: ${error.message}`);
  process.exitCode = 1;
} finally {
  const raizTemporal = realpathSync(tmpdir());
  const carpetaTemporal = realpathSync(temporal);
  if (
    path.dirname(carpetaTemporal) !== raizTemporal ||
    !path.basename(carpetaTemporal).startsWith("aud17-doctor-")
  ) {
    console.error("No se eliminó un directorio temporal inesperado.");
    process.exitCode = 1;
  } else {
    rmSync(carpetaTemporal, { recursive: true, force: true });
  }
}
