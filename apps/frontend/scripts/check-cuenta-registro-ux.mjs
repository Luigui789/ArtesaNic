// Fase 7 del refactor UX: cuenta, perfil privado del taller, registro por pasos y el
// wrapper de formulario `Campo`. Render con react-dom/server y lógica pura, sin
// navegador: la interacción completa se validó además contra Django real (ver
// docs/auditorias/frontend-ux-cuenta-registro.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cargarModulos } from "./cargar-modulo.mjs";

const SIN_TEMPORIZADORES = { defaultOptions: { queries: { gcTime: Infinity } } };

globalThis.localStorage ??= {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const m = await cargarModulos(
  {
    React: "react",
    servidor: "react-dom/server",
    router: "react-router",
    rq: "@tanstack/react-query",
    sesion: "@/features/auth/sesion",
    sesionReact: "@/features/auth/use-session",
    campo: "@/components/common/campo",
    registro: "@/features/auth/registro",
    pasos: "@/features/auth/registro-pasos",
    validacion: "@/features/auth/validacion",
    formulario: "@/features/auth/components/formulario-registro",
    revision: "@/features/auth/components/registro-revision",
    pasosUi: "@/features/auth/components/registro-pasos",
    cuenta: "@/features/auth/pages/cuenta",
    imagen: "@/features/talleres/components/campo-imagen-taller",
    perfil: "@/features/talleres/components/formulario-perfil-taller",
  },
  { VITE_AUTH_API: "real", VITE_CATALOGO_API: "real" },
);

const h = m.React.createElement;
const noop = () => undefined;
const grupos = [];
async function verificar(nombre, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`FALLO: ${nombre}`);
    throw error;
  }
  grupos.push(nombre);
}
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const etiqueta = (html, id) =>
  html.match(new RegExp(`<(input|textarea|button)[^>]*id="${id}"[^>]*>`))?.[0];
const fuente = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), "utf8");

const ANA = { id: 41, nombre: "Ana Delgado", telefono: "85551234", rol: "comprador" };
const ARTURO = { id: 42, nombre: "Arturo Artesano", telefono: "87779090", rol: "artesano" };

function conSesion(usuario, nodo) {
  const queryClient = new m.rq.QueryClient(SIN_TEMPORIZADORES);
  const ctrl = m.sesion.crearControladorSesion(
    {
      restaurar: async () => usuario,
      iniciarSesion: async () => usuario,
      registrarComprador: async () => usuario,
      registrarArtesano: async () => usuario,
      cerrarSesion: async () => undefined,
      actualizarPerfil: async () => usuario,
      alExpirar: () => () => undefined,
    },
    queryClient,
  );
  return { queryClient, ctrl, nodo };
}

async function renderizar(nodo, usuario = null) {
  const { queryClient, ctrl } = conSesion(usuario, nodo);
  await ctrl.reintentar();
  return m.servidor.renderToStaticMarkup(
    h(
      m.rq.QueryClientProvider,
      { client: queryClient },
      h(
        m.sesionReact.SessionProvider,
        { controlador: ctrl },
        h(m.router.MemoryRouter, { initialEntries: ["/"] }, nodo),
      ),
    ),
  );
}

const CUENTA = {
  nombre: "Rosa Pérez",
  telefono: "8555 1234",
  password: "Barro-Masaya-24",
  confirmacion: "Barro-Masaya-24",
};
const TALLER = {
  ...m.validacion.TALLER_VACIO,
  nombre: "Cerámica Rosa",
  rubro: "Cerámica",
  direccionCompleta: "Monimbó, de la iglesia 2 c. al sur",
};
const SIN_UBICACION = m.registro.UBICACION_REGISTRO_INICIAL;
const datos = (cambios = {}) => ({
  intencion: "artesano",
  cuenta: CUENTA,
  taller: TALLER,
  ubicacion: SIN_UBICACION,
  aceptacion: true,
  ...cambios,
});

// ---------- Campo ----------

await verificar("Campo: label, required, opcional, ayuda y error asociados", () => {
  const html = m.servidor.renderToStaticMarkup(
    h(m.campo.Campo, {
      id: "c-nombre",
      etiqueta: "Nombre",
      requerido: true,
      ayuda: "Ayuda breve.",
      error: "Escribe tu nombre.",
      valor: "",
      onCambio: noop,
    }),
  );
  assert.match(html, /<label[^>]*for="c-nombre"/);
  const control = etiqueta(html, "c-nombre");
  assert.match(control, /required=""/);
  assert.match(control, /aria-invalid="true"/);
  assert.match(control, /aria-describedby="c-nombre-error c-nombre-ayuda"/);
  assert.match(html, /id="c-nombre-error" role="alert"/);
  assert.match(html, /id="c-nombre-ayuda"/);
  const opcional = m.servidor.renderToStaticMarkup(
    h(m.campo.Campo, {
      id: "c-h",
      etiqueta: "Historia",
      opcional: true,
      valor: "",
      onCambio: noop,
    }),
  );
  assert.match(texto(opcional), /Historia \(opcional\)/);
  assert.doesNotMatch(etiqueta(opcional, "c-h"), /aria-invalid="true"|aria-describedby|required/);
});

await verificar("Campo: el área de texto recibe límite, filas y descripción", () => {
  const html = m.servidor.renderToStaticMarkup(
    h(m.campo.Campo, {
      id: "c-historia",
      etiqueta: "Historia",
      multilinea: true,
      filas: 5,
      maxLength: 2000,
      ayuda: "Cuenta brevemente.",
      valor: "",
      onCambio: noop,
    }),
  );
  const control = etiqueta(html, "c-historia");
  assert.match(control, /<textarea/);
  assert.match(control, /maxLength="2000"|maxlength="2000"/);
  assert.match(control, /rows="5"/);
  assert.match(control, /aria-describedby="c-historia-ayuda"/);
});

// ---------- Registro: lógica de pasos ----------

await verificar(
  "pasos por rol: 3 para comprador, 5 para artesano, sin pasos de un solo campo",
  () => {
    const { PASOS_POR_ROL, TITULOS_PASO } = m.pasos;
    assert.deepEqual(PASOS_POR_ROL.comprador, ["tipo", "datos", "revision"]);
    assert.deepEqual(PASOS_POR_ROL.artesano, ["tipo", "datos", "taller", "ubicacion", "revision"]);
    for (const p of PASOS_POR_ROL.artesano) assert.ok(TITULOS_PASO[p], p);
  },
);

await verificar("validación por paso: solo los campos del paso impiden avanzar", () => {
  const vacio = datos({
    cuenta: { nombre: "", telefono: "", password: "", confirmacion: "" },
    taller: m.validacion.TALLER_VACIO,
    aceptacion: false,
  });
  assert.deepEqual(m.pasos.erroresDelPaso("tipo", vacio), {});
  assert.deepEqual(Object.keys(m.pasos.erroresDelPaso("datos", vacio)).sort(), [
    "nombre",
    "password",
    "telefono",
  ]);
  const taller = Object.keys(m.pasos.erroresDelPaso("taller", vacio));
  assert.deepEqual(taller.sort(), ["taller.direccionCompleta", "taller.nombre", "taller.rubro"]);
  // La ubicación es opcional: el paso no bloquea sin marcar el mapa.
  assert.deepEqual(m.pasos.erroresDelPaso("ubicacion", vacio), {});
  assert.deepEqual(Object.keys(m.pasos.erroresDelPaso("revision", vacio)), ["aceptacion"]);
  // Contraseñas distintas: el error queda en la confirmación del paso de datos.
  const distinta = datos({ cuenta: { ...CUENTA, confirmacion: "otra-cosa-9" } });
  assert.deepEqual(Object.keys(m.pasos.erroresDelPaso("datos", distinta)), ["confirmacion"]);
});

await verificar("aceptación obligatoria, con mensaje específico y fuera del payload", () => {
  const sin = m.pasos.erroresDelRegistro(datos({ aceptacion: false }));
  assert.deepEqual(Object.keys(sin), ["aceptacion"]);
  assert.match(sin.aceptacion, /Debes aceptar los términos y la política de privacidad/);
  assert.doesNotMatch(sin.aceptacion, /^Campo requerido/);
  assert.deepEqual(m.pasos.erroresDelRegistro(datos()), {});
  // El contrato rechaza campos desconocidos: la aceptación nunca viaja.
  const s = m.registro.solicitudDeRegistro("artesano", CUENTA, TALLER, SIN_UBICACION);
  assert.ok(s.valida);
  assert.deepEqual(Object.keys(s.entrada).sort(), ["nombre", "password", "taller", "telefono"]);
  assert.ok(!JSON.stringify(s.entrada).includes("acept"));
});

await verificar("error del servidor → paso donde está el campo", () => {
  const { primerPasoConError, pasoDeCampo, PASOS_POR_ROL } = m.pasos;
  const artesano = PASOS_POR_ROL.artesano;
  assert.equal(primerPasoConError(artesano, { telefono: "Ya existe." }), "datos");
  assert.equal(primerPasoConError(artesano, { "taller.rubro": "x" }), "taller");
  assert.equal(primerPasoConError(artesano, { "taller.ubicacion": "x" }), "ubicacion");
  // Varios errores: el primero en el orden de los pasos.
  assert.equal(primerPasoConError(artesano, { "taller.nombre": "x", password: "x" }), "datos");
  assert.equal(primerPasoConError(PASOS_POR_ROL.comprador, { nombre: "x" }), "datos");
  assert.equal(primerPasoConError(artesano, {}), null);
  assert.equal(pasoDeCampo("campo_desconocido"), "revision");
  // Los nombres de la API se traducen antes de ubicar el paso.
  const traducidos = m.validacion.erroresDelServidor({ "taller.direccion_completa": ["x"] });
  assert.equal(primerPasoConError(artesano, traducidos), "taller");
});

await verificar(
  "cambio de rol: se conservan los datos comunes y el comprador no envía taller",
  () => {
    const s = m.registro.solicitudDeRegistro("comprador", CUENTA, TALLER, {
      ubicacion: { latitud: 11.96, longitud: -86.09 },
      publica: true,
    });
    assert.ok(s.valida);
    assert.equal(s.rol, "comprador");
    assert.deepEqual(Object.keys(s.entrada).sort(), ["nombre", "password", "telefono"]);
    // Los errores del taller no bloquean al comprador.
    const sinTaller = datos({ intencion: "comprador", taller: m.validacion.TALLER_VACIO });
    assert.deepEqual(m.pasos.erroresDelRegistro(sinTaller), {});
  },
);

// ---------- Registro: presentación ----------

const registro = (props = {}) =>
  renderizar(h(m.formulario.FormularioRegistro, { onExito: noop, ...props }));

await verificar("paso 1: tarjetas de rol con semántica de radio y progreso con texto", async () => {
  const html = await registro();
  assert.match(texto(html), /Paso 1 de 3 Tipo de cuenta/);
  assert.match(html, /role="radiogroup"[^>]*aria-labelledby="registro-intencion"/);
  const radios = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
  assert.equal(radios.length, 2);
  const comprador = radios.find((r) => r.includes('id="intencion-comprador"'));
  assert.match(comprador, /aria-checked="true"/);
  assert.match(comprador, /aria-labelledby="intencion-comprador-titulo"/);
  assert.match(comprador, /aria-describedby="intencion-comprador-descripcion"/);
  // La tarjeta entera es la etiqueta del radio y la elegida se marca con texto.
  assert.match(html, /<label[^>]*for="intencion-artesano"/);
  assert.match(texto(html), /Opción elegida/);
  assert.equal((texto(html).match(/Opción elegida/g) ?? []).length, 1);
  // Primer paso: sin «Atrás» ni «Crear cuenta»; «Continuar» como acción.
  assert.match(texto(html), /Continuar/);
  assert.doesNotMatch(texto(html), /Atrás|Crear cuenta/);
  const artesano = await registro({ intencionInicial: "artesano" });
  assert.match(texto(artesano), /Paso 1 de 5/);
});

await verificar(
  "paso de datos: obligatorios, autocomplete, teléfono privado y contraseñas",
  async () => {
    const html = await registro({ pasoInicial: "datos" });
    assert.match(texto(html), /Paso 2 de 3 Tus datos de acceso/);
    assert.match(texto(html), /Atrás/);
    assert.match(etiqueta(html, "registro-nombre"), /autoComplete="name"|autocomplete="name"/);
    assert.match(etiqueta(html, "registro-telefono"), /type="tel"/);
    for (const id of ["registro-password", "registro-confirmacion"]) {
      assert.match(etiqueta(html, id), /type="password"/);
      assert.match(etiqueta(html, id), /new-password/);
    }
    for (const id of ["registro-nombre", "registro-telefono", "registro-password"])
      assert.match(etiqueta(html, id), /required=""/);
    assert.match(texto(html), /Es privado: no se publica/);
    // Reglas explicadas antes del error y alineadas con el backend.
    assert.match(
      texto(html),
      /Al menos 8 caracteres\. No puede ser solo números, una contraseña muy común/,
    );
    assert.match(html, /aria-pressed="false"[^>]*>Mostrar contraseñas|Mostrar contraseñas/);
  },
);

await verificar(
  "revisión: resumen sin contraseña, aceptación desmarcada y enlaces legales",
  async () => {
    const html = m.servidor.renderToStaticMarkup(
      h(m.revision.PasoRevision, {
        intencion: "artesano",
        cuenta: CUENTA,
        taller: TALLER,
        ubicacion: SIN_UBICACION,
        aceptacion: false,
        error: undefined,
        onAceptar: noop,
        onEditar: noop,
      }),
    );
    assert.doesNotMatch(html, /Barro-Masaya-24/);
    assert.match(texto(html), /Rosa Pérez/);
    assert.match(texto(html), /Cerámica Rosa/);
    assert.match(texto(html), /Sin marcar en el mapa/);
    // Un botón «Editar» por bloque, con nombre accesible propio.
    for (const bloque of ["tipo de cuenta", "tus datos", "tu taller", "ubicación"])
      assert.match(html, new RegExp(`aria-label="Editar ${bloque}"`));
    const casilla = html.match(/<button[^>]*role="checkbox"[^>]*>/)?.[0];
    assert.ok(casilla, "checkbox");
    assert.match(casilla, /aria-checked="false"/);
    assert.match(casilla, /aria-required="true"/);
    assert.match(html, /<label[^>]*for="registro-aceptacion"/);
    // Dos enlaces independientes que abren aparte: leerlos no marca la casilla ni pierde datos.
    const enlaces = html.match(/<a [^>]*>/g) ?? [];
    assert.equal(enlaces.length, 2);
    for (const a of enlaces) {
      assert.match(a, /target="_blank"/);
      assert.match(a, /rel="noopener noreferrer"/);
    }
    assert.match(html, /href="\/ayuda"[^>]*>Términos y condiciones/);
    assert.match(html, /href="\/ayuda#privacidad"[^>]*>Política de privacidad/);
    assert.match(texto(html), /se abre en una pestaña nueva/);
    const conError = m.servidor.renderToStaticMarkup(
      h(m.revision.PasoRevision, {
        intencion: "comprador",
        cuenta: CUENTA,
        taller: TALLER,
        ubicacion: SIN_UBICACION,
        aceptacion: false,
        error: m.pasos.MENSAJE_ACEPTACION,
        onAceptar: noop,
        onEditar: noop,
      }),
    );
    assert.match(conError, /aria-invalid="true"/);
    assert.match(conError, /aria-describedby="registro-aceptacion-error"/);
    assert.match(conError, /id="registro-aceptacion-error" role="alert"/);
    assert.doesNotMatch(texto(conError), /Tu taller|Cerámica Rosa/);
  },
);

await verificar("«Crear cuenta» solo en el último paso y bloqueado sin aceptar", async () => {
  const html = await registro({ pasoInicial: "revision" });
  assert.match(texto(html), /Paso 3 de 3 Revisar y crear la cuenta/);
  const crear = html.match(/<button[^>]*type="submit"[^>]*>[^<]*Crear cuenta/)?.[0];
  assert.ok(crear, "botón Crear cuenta");
  assert.match(crear, /aria-disabled="true"/);
  assert.doesNotMatch(texto(html), /Continuar/);
});

await verificar("fuente: un formulario, un POST final y nada persistido en el navegador", () => {
  const archivos = [
    "features/auth/components/formulario-registro.tsx",
    "features/auth/components/registro-pasos.tsx",
    "features/auth/components/registro-revision.tsx",
    "features/auth/registro-pasos.ts",
  ].map(fuente);
  for (const f of archivos) {
    assert.doesNotMatch(f, /localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(f, /console\.(log|info|debug)/);
    assert.doesNotMatch(f, /useNavigate|navigate\(|history\.push/);
  }
  const contenedor = archivos[0];
  // Un único envío al final; avanzar no llama al servidor.
  assert.equal((contenedor.match(/registrarArtesano\(|registrarComprador\(/g) ?? []).length, 2);
  assert.match(
    contenedor,
    /if \(paso === "revision"\) void crearCuenta\(\);\s*else continuar\(\);/,
  );
  // Valores fuera de los pasos: desmontar un paso no los pierde.
  assert.match(contenedor, /const cuentaForm = useForm/);
  assert.match(contenedor, /const tallerForm = useForm/);
  assert.match(contenedor, /useState<EstadoUbicacion>/);
  assert.match(contenedor, /const \[aceptacion, setAceptacion\] = useState\(false\)/);
});

// ---------- Cuenta ----------

await verificar(
  "cuenta: datos privados explicados y Mi taller separado antes del formulario",
  async () => {
    const comprador = await renderizar(h(m.cuenta.FormularioCuenta, { usuario: ANA }), ANA);
    assert.match(texto(comprador), /Datos personales/);
    assert.match(texto(comprador), /no aparecen en catálogos ni en perfiles públicos/);
    assert.match(texto(comprador), /Lo usas para iniciar sesión y no se muestra a otras personas/);
    assert.match(texto(comprador), /solicitudes, pedidos o mensajes/);
    assert.doesNotMatch(comprador, /\/panel\/perfil|Mi taller/);
    const artesano = await renderizar(h(m.cuenta.FormularioCuenta, { usuario: ARTURO }), ARTURO);
    assert.ok(artesano.indexOf('href="/panel/perfil"') < artesano.indexOf('id="cuenta-nombre"'));
    assert.match(texto(artesano), /Editar Mi taller/);
    assert.match(texto(artesano), /no modifica los contactos públicos de tu taller/);
    assert.match(etiqueta(artesano, "cuenta-telefono"), /required=""/);
  },
);

// ---------- Perfil del taller ----------

const TALLER_PROPIO = {
  id: 7,
  nombre: "Cerámica López",
  rubro: "Cerámica",
  direccion: "Barrio San Juan, Masaya",
  historia: "",
  horario: "",
  telefono: "87776655",
  whatsapp: "",
  facebook: "",
  instagram: "",
  sitioWeb: "",
  imagenPerfil: "https://media.ejemplo/perfil.png",
  imagenPortada: undefined,
  estado: "aprobado",
  latitud: null,
  longitud: null,
  ubicacionPublica: false,
};

await verificar(
  "perfil: secciones con título, públicos y obligatorios claros, guardado único",
  async () => {
    const html = await renderizar(
      h(m.perfil.FormularioPerfilTaller, { taller: TALLER_PROPIO, onTerminar: noop }),
      ARTURO,
    );
    const titulos = [
      "Identidad del taller",
      "Presentación",
      "Fotos",
      "Dirección",
      "Ubicación del taller",
      "Contacto público",
    ];
    let anterior = -1;
    for (const t of titulos) {
      const i = html.indexOf(`>${t}</h3>`);
      assert.ok(i > anterior, t);
      anterior = i;
    }
    assert.match(texto(html), /se mostrará a los compradores en el perfil público del taller/);
    assert.match(texto(html), /El teléfono con el que inicias sesión no se muestra/);
    for (const id of ["perfil-nombre", "perfil-rubro", "perfil-direccion"])
      assert.match(etiqueta(html, id), /required=""/);
    for (const opcional of ["Historia del taller", "Horario de atención", "Teléfono de contacto"])
      assert.match(texto(html), new RegExp(`${opcional} \\(opcional\\)`));
    assert.match(etiqueta(html, "perfil-historia"), /rows="5"/);
    // Una sola acción principal, fija al pie; sin lat/long como inputs.
    assert.equal((html.match(/type="submit"/g) ?? []).length, 1);
    assert.match(html, /class="sticky bottom-0[^"]*"/);
    assert.match(texto(html), /Guardar cambios/);
    assert.doesNotMatch(html, /id="[^"]*(latitud|longitud)[^"]*"/);
    const pendiente = await renderizar(
      h(m.perfil.FormularioPerfilTaller, {
        taller: { ...TALLER_PROPIO, estado: "pendiente" },
        onTerminar: noop,
      }),
      ARTURO,
    );
    assert.match(texto(pendiente), /cuando la administración lo apruebe/);
  },
);

await verificar(
  "imágenes: foto y portada distintas, vista previa, acción con texto y error",
  () => {
    const html = m.servidor.renderToStaticMarkup(
      h(m.imagen.CampoImagenTaller, {
        id: "perfil-imagen-perfil",
        etiqueta: "Foto del taller",
        ayuda: "Logo o foto cuadrada.",
        forma: "cuadrada",
        actual: "https://media.ejemplo/perfil.png",
        alt: "Foto del taller Cerámica López",
        archivo: undefined,
        onArchivo: noop,
        error: "Usa una imagen JPEG, PNG o WebP.",
        onErrorLocal: noop,
      }),
    );
    assert.match(
      html,
      /<img[^>]*src="https:\/\/media.ejemplo\/perfil.png"[^>]*alt="Foto del taller Cerámica López"|alt="Foto del taller Cerámica López"[^>]*src/,
    );
    assert.match(texto(html), /Elegir otra imagen/);
    assert.match(texto(html), /Imagen actual\./);
    const input = etiqueta(html, "perfil-imagen-perfil");
    assert.match(input, /type="file"/);
    assert.match(input, /accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(input, /aria-invalid="true"/);
    assert.match(input, /aria-describedby="perfil-imagen-perfil-error perfil-imagen-perfil-ayuda"/);
    assert.match(html, /id="perfil-imagen-perfil-error" role="alert"/);
    // Un archivo inválido no reemplaza la imagen guardada ni una selección válida.
    const codigo = fuente("features/talleres/components/campo-imagen-taller.tsx");
    assert.match(codigo, /onErrorLocal\(invalida\);\s*if \(!invalida\) onArchivo\(file\);/);
  },
);

await verificar("errores: foco al primer campo inválido en registro y perfil", () => {
  const hook = fuente("hooks/use-enfocar-primer-error.ts");
  assert.match(hook, /\[aria-invalid="true"\], \[data-error-foco\]/);
  assert.match(hook, /focus\(/);
  for (const ruta of [
    "features/auth/components/formulario-registro.tsx",
    "features/talleres/components/formulario-perfil-taller.tsx",
  ])
    assert.match(fuente(ruta), /useEnfocarPrimerError\(/, ruta);
  // La ubicación no tiene control propio: su mensaje es enfocable.
  assert.match(
    fuente("features/talleres/components/seccion-ubicacion-taller.tsx"),
    /role="alert" tabIndex=\{-1\} data-error-foco/,
  );
});

console.log(`check-cuenta-registro-ux: ${grupos.length} grupos OK`);
for (const g of grupos) console.log(`  ✓ ${g}`);
process.exit(0);
