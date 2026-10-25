// RF-007 con la tasa real (AUD-14): GET /api/v1/configuracion/ (docs/api/configuracion.md),
// conversión pura NIO → USD y CurrencySwitcher renderizado con react-dom/server. Sin tasa o
// con error, solo córdobas: no existe tasa de respaldo en el modo real (D-AUD14-06).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cargarModulos } from "./cargar-modulo.mjs";

const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity, retry: false } } };

const m = await cargarModulos(
  {
    React: "react",
    servidor: "react-dom/server",
    rq: "@tanstack/react-query",
    http: "@/features/configuracion/http",
    api: "@/features/configuracion/api",
    formato: "@/lib/format",
    claves: "@/lib/query-keys",
    moneda: "@/hooks/use-currency",
    pura: "@/features/configuracion/moneda",
    selector: "@/components/common/currency-switcher",
  },
  { VITE_CATALOGO_API: "real" },
);

// ---------- fetch simulado ----------

let peticiones = [];
let respuesta = null;
globalThis.fetch = async (url, init = {}) => {
  peticiones.push({ url: String(url), cabeceras: init.headers ?? {} });
  if (respuesta instanceof Error) throw respuesta;
  const { status = 200, cuerpo } = respuesta;
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

// ---------- HTTP: mapeo string Decimal → number ----------

respuesta = { cuerpo: { tasa_cambio: "36.8500", actualizada_en: "2026-10-25T15:30:00-06:00" } };
peticiones = [];
const configuracion = await m.http.getConfiguracion();
assert.deepEqual(configuracion, {
  tasaCambio: 36.85,
  actualizadaEn: "2026-10-25T15:30:00-06:00",
});
assert.equal(peticiones.length, 1);
assert.match(peticiones[0].url, /\/configuracion\/$/);
assert.equal(peticiones[0].cabeceras["Authorization"], undefined, "lectura pública, sin token");
assert.equal(peticiones[0].cabeceras["Idempotency-Key"], undefined, "GET sin AUD-08");

// Sin tasa o con un valor inválido: configuración no disponible, nunca una tasa inventada.
for (const tasa_cambio of [null, "0", "0.0000", "-1", "abc", "Infinity", ""]) {
  assert.deepEqual(
    m.http.aConfiguracion({ tasa_cambio, actualizada_en: "2026-10-25T15:30:00-06:00" }),
    { tasaCambio: null, actualizadaEn: null },
    String(tasa_cambio),
  );
}
respuesta = { cuerpo: { tasa_cambio: null, actualizada_en: null } };
assert.deepEqual(await m.http.getConfiguracion(), { tasaCambio: null, actualizadaEn: null });

// Modo real: el api reexporta el cliente HTTP, no la tasa de la demo.
assert.equal(m.api.getConfiguracion, m.http.getConfiguracion);
assert.equal(m.api.TASA_CAMBIO_DEMO, 36.8, "la tasa simulada solo vive en la demo");

// ---------- Conversión pura ----------

const { formatPrice } = m.formato;
assert.equal(formatPrice(1000, "USD", 40), "US$ 25.00");
assert.equal(formatPrice(1000, "USD", 50), "US$ 20.00");
assert.equal(formatPrice(1000, "NIO", 40), formatPrice(1000, "NIO", 50), "NIO nunca cambia");
assert.equal(formatPrice(1000, "NIO", null), formatPrice(1000, "NIO", 40));
assert.match(formatPrice(1000, "NIO", 40), /^C\$ 1[.,\s]?000$/);
// Sin tasa, USD no puede convertir: se muestran córdobas.
assert.equal(formatPrice(1000, "USD", null), formatPrice(1000, "NIO", null));
assert.equal(formatPrice(1000, "USD", 0), formatPrice(1000, "NIO", null));
assert.equal(formatPrice(1000, "USD", Number.NaN), formatPrice(1000, "NIO", null));
assert.equal(m.claves.claves.configuracion().join(), "configuracion-publica");

// La constante del mock ya no existe en lib/format (no es autoridad real).
assert.equal(m.formato.TASA_CAMBIO, undefined);
const fuenteFormato = await readFile(new URL("../src/lib/format.ts", import.meta.url), "utf8");
assert.doesNotMatch(fuenteFormato, /36\.8/, "lib/format sin la tasa simulada");
const fuenteHttp = await readFile(
  new URL("../src/features/configuracion/http.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(fuenteHttp, /36\.8/, "el cliente real no tiene tasa de respaldo");

// ---------- CurrencyProvider + CurrencySwitcher ----------

const h = m.React.createElement;

function Precio() {
  const { format, currency, usdDisponible } = m.moneda.useCurrency();
  return h("output", { "data-moneda": currency, "data-usd": String(usdDisponible) }, format(1000));
}

/** Renderiza con la consulta de configuración ya resuelta (o fallida) en la caché. */
async function renderizar(estado) {
  const qc = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  if (estado.error) {
    respuesta = new TypeError("Failed to fetch");
    await qc.prefetchQuery({
      queryKey: m.claves.claves.configuracion(),
      queryFn: m.http.getConfiguracion,
    });
  } else {
    qc.setQueryData(m.claves.claves.configuracion(), estado);
  }
  return m.servidor.renderToString(
    h(
      m.rq.QueryClientProvider,
      { client: qc },
      h(m.moneda.CurrencyProvider, null, h(m.selector.CurrencySwitcher), h(Precio)),
    ),
  );
}

const conTasa = await renderizar({ tasaCambio: 36.8, actualizadaEn: "2026-10-25T15:30:00-06:00" });
assert.match(conTasa, /C\$ Córdobas/);
assert.match(conTasa, /US\$ Dólares/);
assert.match(conTasa, /1 US\$ = C\$ 36\.8000/);
assert.match(conTasa, /Actualizada 25 oct\.? 2026/);
assert.match(conTasa, /aria-pressed="true"/);
assert.doesNotMatch(conTasa, /simulada/i, "sin «Tasa simulada»");
assert.match(conTasa, /data-usd="true"/);

const sinTasa = await renderizar({ tasaCambio: null, actualizadaEn: null });
assert.doesNotMatch(sinTasa, /US\$ Dólares/, "sin tasa no hay botón US$");
assert.match(sinTasa, /Conversión a dólares no disponible/);
assert.match(sinTasa, /data-moneda="NIO"/);
assert.doesNotMatch(sinTasa, /36\.8/, "sin respaldo 36.8 en modo real");

const conError = await renderizar({ error: true });
assert.doesNotMatch(conError, /US\$/, "error HTTP: sin USD");
assert.match(conError, /Conversión a dólares no disponible/);
assert.match(conError, /data-usd="false"/);

// USD elegido y la tasa deja de existir o la consulta falla: vuelve a NIO, sin convertir
// con el valor viejo que pudiera quedar en caché.
const { monedaEfectiva } = m.pura;
const vigente = { tasaCambio: 40, actualizadaEn: "2026-10-25T15:30:00-06:00" };
assert.deepEqual(monedaEfectiva("USD", vigente, false), { currency: "USD", ...vigente });
assert.deepEqual(monedaEfectiva("USD", vigente, true), {
  currency: "NIO",
  tasaCambio: null,
  actualizadaEn: null,
});
assert.deepEqual(monedaEfectiva("USD", { tasaCambio: null, actualizadaEn: null }, false), {
  currency: "NIO",
  tasaCambio: null,
  actualizadaEn: null,
});
assert.equal(monedaEfectiva("USD", undefined, false).currency, "NIO", "mientras carga, solo C$");
assert.equal(monedaEfectiva("NIO", vigente, false).currency, "NIO");
const sinFecha = await renderizar({ tasaCambio: 40, actualizadaEn: null });
assert.match(sinFecha, /1 US\$ = C\$ 40\.0000/);
assert.doesNotMatch(sinFecha, /Actualizada/, "sin fecha del servidor no se inventa una");

console.log("check-configuracion: tasa real, conversión NIO → USD, sin tasa y error HTTP OK");

// react-dom/server deja canales abiertos en el bundle de navegador, como check-auth-ui.
process.exit(0);
