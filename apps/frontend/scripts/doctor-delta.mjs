// Match unchanged evidence, including copies or renames identified by Git.
const clave = (d) => JSON.stringify([d.plugin, d.rule, d.severity, d.fingerprint]);
const ruta = (p) => p.replaceAll("\\", "/");

export function nuevosDiagnosticos(base, actual, movimientos) {
  const disponibles = base.map((d) => ({ diagnostico: d, usado: false }));
  const nuevos = actual.map((d) => ({ diagnostico: d, usado: false }));
  const consumir = (destino, origen) => {
    for (const nuevo of nuevos) {
      if (nuevo.usado || ruta(nuevo.diagnostico.filePath) !== destino) continue;
      const previo = disponibles.find(
        (item) =>
          !item.usado &&
          ruta(item.diagnostico.filePath) === origen &&
          clave(item.diagnostico) === clave(nuevo.diagnostico),
      );
      if (previo) {
        previo.usado = true;
        nuevo.usado = true;
      }
    }
  };
  // A copy must consume its original before an unrelated replacement at the old path.
  for (const [origen, destino] of movimientos) consumir(destino, origen);
  for (const nuevo of nuevos)
    consumir(ruta(nuevo.diagnostico.filePath), ruta(nuevo.diagnostico.filePath));
  return nuevos.filter((item) => !item.usado).map((item) => item.diagnostico);
}

export function validarInforme(informe, estado) {
  if (
    !informe ||
    informe.schemaVersion !== 3 ||
    informe.ok !== true ||
    informe.mode !== "full" ||
    !Array.isArray(informe.diagnostics) ||
    !Array.isArray(informe.projects) ||
    informe.projects.length !== 1 ||
    informe.projects.some((p) => !p.complete || p.skippedChecks?.length)
  ) {
    throw new Error("React Doctor no produjo un análisis completo y válido.");
  }
  for (const d of informe.diagnostics) {
    if (
      ![d.filePath, d.plugin, d.rule, d.fingerprint].every(
        (v) => typeof v === "string" && v.length > 0,
      ) ||
      !["warning", "error"].includes(d.severity)
    ) {
      throw new Error("Un diagnóstico carece de identidad o severidad válida.");
    }
  }
  const cantidad = informe.diagnostics.length;
  if (
    informe.summary?.totalDiagnosticCount !== cantidad ||
    (estado !== 0 && estado !== 1) ||
    (estado === 1 && cantidad === 0) ||
    (estado === 0 && cantidad !== 0)
  ) {
    throw new Error("El código de salida no coincide con el informe de React Doctor.");
  }
  return informe;
}
