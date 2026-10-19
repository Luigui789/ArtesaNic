// Compila un módulo de src/ con Vite y lo importa en Node, para las verificaciones sin
// framework de pruebas. `env` fija variables VITE_* durante la compilación (por ejemplo,
// VITE_CATALOGO_API) y las restaura después.
import { build } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function cargarModulo(entry, env = {}) {
  const anteriores = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    const result = await build({
      configFile: false,
      root,
      logLevel: "error",
      resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
      build: { write: false, minify: false, lib: { entry, formats: ["es"] } },
    });
    const output = (Array.isArray(result) ? result[0] : result).output.find(
      (o) => o.type === "chunk",
    );
    return await import(
      `data:text/javascript;base64,${Buffer.from(output.code).toString("base64")}`
    );
  } finally {
    for (const [k, v] of Object.entries(anteriores)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
