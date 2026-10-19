import type {
  Artisan,
  AuditEvent,
  Category,
  DeliveryMode,
  FrozenQuote,
  Message,
  Order,
  OrderOption,
  OrderStatus,
  PaymentAttempt,
  PaymentAttemptEvent,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentReceipt,
  Product,
  UnitMovement,
  UnitReservation,
  UnitType,
} from "@/types";
import { CATEGORY_IMAGE } from "@/lib/category-images";
import taller from "@/assets/taller.jpg";
import comprobanteDemo from "@/assets/comprobante-demo.svg";

export const TALLER_IMAGE = taller;

/** Imagen de muestra para los comprobantes del escenario (no es un documento real). */
const COMPROBANTE_DEMO = comprobanteDemo;

/** Catálogo de rubros que sirve `GET /categorias/` (contrato §2.3 y §4). */
export function buildCategories(): Category[] {
  return [
    { id: 1, codigo: "cuero_y_calzado", nombre: "Cuero y calzado" },
    { id: 2, codigo: "hamacas", nombre: "Hamacas" },
    { id: 3, codigo: "madera", nombre: "Madera" },
    { id: 4, codigo: "textiles", nombre: "Textiles" },
    { id: 5, codigo: "dulces", nombre: "Dulces" },
    { id: 6, codigo: "otros", nombre: "Otros" },
  ];
}

/** Generador determinista simple (mulberry32) para datos mock reproducibles. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)] as T;

/**
 * Taller cuyo panel se demuestra. Coincide con `DEMO_ARTISAN_ID` de
 * `src/mocks/core.ts`, que lo reexporta: el seed no puede importar del
 * mock porque el mock ya importa este módulo.
 */
export const TALLER_DEMO_ID = 1;

/** Persona responsable del taller demo; es el nombre de la sesión de artesano. */
export const RESPONSABLE_TALLER_DEMO = "Rosa Mendoza";

/** Compradora de la sesión de demostración. */
export const COMPRADORA_DEMO = "Ana Lucía Delgado";

const BARRIOS = [
  "Barrio Monimbó",
  "Barrio San Juan",
  "Barrio Los Sabogales",
  "Centro de Masaya",
  "Comarca La Reforma",
  "Barrio San Jerónimo",
];

const NOMBRES = [
  "María",
  "José",
  "Carmen",
  "Luis",
  "Rosa",
  "Pedro",
  "Marta",
  "Julio",
  "Elena",
  "Douglas",
  "Ana",
  "Silvio",
];
const APELLIDOS = [
  "Mendoza",
  "Gutiérrez",
  "Pavón",
  "Ortega",
  "Membreño",
  "Cárcamo",
  "Sequeira",
  "Rivas",
  "Zamora",
  "Téllez",
];

const TALLER_PREFIX = ["Taller", "Artesanías", "Casa", "Arte", "Manos de"];

/** Indexado por el `codigo` de la categoría. */
const PRODUCTOS_POR_CATEGORIA: Record<string, string[]> = {
  cuero_y_calzado: [
    "Sandalias de cuero natural",
    "Bolso repujado a mano",
    "Cinturón de cuero grabado",
    "Cartera artesanal de cuero",
    "Zapatos de cuero cosidos a mano",
  ],
  hamacas: [
    "Hamaca matrimonial de algodón",
    "Hamaca individual tejida",
    "Hamaca silla colgante",
    "Hamaca de hilo con flecos",
  ],
  madera: [
    "Cuenco tallado de guanacaste",
    "Bandeja de madera de pochote",
    "Figura tallada tradicional",
    "Juego de cucharas de madera",
  ],
  textiles: [
    "Blusa bordada a mano",
    "Mantel bordado tradicional",
    "Camino de mesa tejido",
    "Bolso de tela bordada",
  ],
  dulces: [
    "Cajetas de leche artesanales",
    "Dulce de coco tradicional",
    "Surtido de cajetas de Masaya",
    "Melcochas artesanales",
  ],
  otros: [
    "Jarrón de barro pintado",
    "Cesta tejida de mimbre",
    "Máscara de agüizote",
    "Alcancía de barro decorada",
  ],
};

/** Variantes por rubro, para que los nombres no se repitan y sigan siendo coherentes. */
const VARIANTES_POR_CATEGORIA: Record<string, string[]> = {
  cuero_y_calzado: ["", " color natural", " color café oscuro", " con grabado tradicional"],
  hamacas: ["", " en tonos tierra", " multicolor", " en colores pastel"],
  madera: ["", " con acabado natural", " — tamaño mediano", " — tamaño grande"],
  textiles: ["", " en tonos tierra", " con bordado floral", " en colores vivos"],
  dulces: ["", " (media docena)", " (docena)", " en caja de regalo"],
  otros: ["", " — tamaño mediano", " — tamaño grande", " — edición del taller"],
};

/** Rangos de precio en córdobas por rubro, para que los montos sean verosímiles. */
const PRECIO_POR_CATEGORIA: Record<string, [number, number]> = {
  cuero_y_calzado: [450, 3500],
  hamacas: [1200, 6500],
  madera: [250, 2800],
  textiles: [350, 3200],
  dulces: [60, 450],
  otros: [150, 1800],
};

const DIA = 86_400_000;
const HORA = 3_600_000;

const telefonoDemo = (r: () => number) => {
  const n = String(Math.floor(80_000_000 + r() * 9_999_999));
  return `${n.slice(0, 4)} ${n.slice(4)}`;
};

/** Taller que protagoniza la demostración: datos curados y coherentes con sus pedidos. */
function tallerDemo(rubro: Category): Artisan {
  return {
    id: TALLER_DEMO_ID,
    nombreTaller: "Taller de Cuero Mendoza",
    responsable: RESPONSABLE_TALLER_DEMO,
    historia:
      "Taller familiar fundado en 1987 en el barrio Monimbó. Rosa Mendoza aprendió de su padre a cortar, coser y repujar el cuero, y hoy trabaja junto a sus dos hijos sandalias, bolsos y cinturones con cuero curtido en la zona.",
    descripcion:
      "Calzado y marroquinería de cuero hechos a mano en Monimbó, con acabados tradicionales de Masaya.",
    rubro,
    ubicacion: "Barrio Monimbó, Masaya",
    horario: "Lunes a sábado, 8:00 a. m. – 5:00 p. m.",
    telefono: "8777 9090",
    whatsapp: "8777 9090",
    redes: { facebook: "facebook.com/tallercueromendoza", instagram: "@tallercueromendoza" },
    fotoUrl: CATEGORY_IMAGE[rubro.codigo] as string,
    portadaUrl: TALLER_IMAGE,
  };
}

export function buildArtisans(categorias: Category[]): Artisan[] {
  const r = rng(42);
  const list: Artisan[] = [];
  for (let i = 0; i < 50; i++) {
    const rubro = categorias[i % categorias.length] as Category;
    const nombre = pick(r, NOMBRES);
    const apellido = pick(r, APELLIDOS);
    const taller = `${pick(r, TALLER_PREFIX)} ${apellido}`;
    list.push({
      id: i + 1,
      nombreTaller: taller,
      responsable: `${nombre} ${apellido}`,
      historia: `${taller} nació en ${1970 + Math.floor(r() * 45)} en Masaya. La familia ${apellido} aprendió el oficio de ${rubro.nombre.toLowerCase()} de generación en generación y hoy sigue trabajando cada pieza a mano, con materiales de la zona.`,
      descripcion: `Taller de ${rubro.nombre.toLowerCase()} de Masaya. Cada pieza se trabaja a mano.`,
      rubro,
      ubicacion: `${pick(r, BARRIOS)}, Masaya`,
      horario: "Lunes a sábado, 8:00 a. m. – 5:00 p. m.",
      telefono: telefonoDemo(r),
      whatsapp: telefonoDemo(r),
      redes: {
        facebook: `facebook.com/${taller.toLowerCase().replace(/\s+/g, "")}`,
        instagram: `@${taller.toLowerCase().replace(/\s+/g, "")}`,
      },
      fotoUrl: CATEGORY_IMAGE[rubro.codigo] as string,
      portadaUrl: TALLER_IMAGE,
    });
  }
  list[0] = tallerDemo((list[0] as Artisan).rubro);
  return list;
}

/**
 * Catálogo curado del taller demo: los pedidos de demostración se refieren a
 * estas piezas, en este orden. `existencias` son las unidades físicas actuales,
 * ya descontadas las entregadas.
 */
const CATALOGO_TALLER_DEMO: {
  nombre: string;
  precio: number;
  tipo: UnitType;
  existencias: number;
  personaliza: boolean;
}[] = [
  {
    nombre: "Sandalias de cuero repujado",
    precio: 1250,
    tipo: "existencias",
    existencias: 8,
    personaliza: true,
  },
  {
    nombre: "Bolso de mano de cuero grabado",
    precio: 2850,
    tipo: "pieza_unica",
    existencias: 1,
    personaliza: true,
  },
  {
    nombre: "Billetera de cuero natural",
    precio: 650,
    tipo: "existencias",
    existencias: 15,
    personaliza: false,
  },
  {
    nombre: "Cartera de cuero con grabado floral",
    precio: 1900,
    tipo: "pieza_unica",
    existencias: 1,
    personaliza: true,
  },
  {
    nombre: "Cinturón de cuero con hebilla",
    precio: 780,
    tipo: "existencias",
    existencias: 10,
    personaliza: true,
  },
  {
    nombre: "Monedero de cuero cosido a mano",
    precio: 380,
    tipo: "existencias",
    existencias: 20,
    personaliza: false,
  },
  {
    nombre: "Zapatos de cuero cosidos a mano",
    precio: 2400,
    tipo: "existencias",
    existencias: 5,
    personaliza: true,
  },
  {
    nombre: "Mochila de cuero",
    precio: 3200,
    tipo: "existencias",
    existencias: 4,
    personaliza: true,
  },
  {
    nombre: "Sandalias de cuero trenzado",
    precio: 1100,
    tipo: "existencias",
    existencias: 10,
    personaliza: false,
  },
  {
    nombre: "Portafolio de cuero",
    precio: 3500,
    tipo: "pieza_unica",
    existencias: 1,
    personaliza: false,
  },
];

function descripcionProducto(nombre: string, artesano: Artisan, personaliza: boolean): string {
  const base = `${nombre}. Pieza elaborada a mano en ${artesano.nombreTaller}, ${artesano.ubicacion}.`;
  return personaliza
    ? `${base} El taller puede personalizar la unidad que solicites (talla, color o grabado); revisa tu pedido antes de aceptarlo.`
    : `${base} Se entrega tal como se muestra; el taller revisa tu solicitud antes de aceptarla.`;
}

export function buildProducts(artisans: Artisan[]): Product[] {
  const r = rng(7);
  // Generador aparte para las unidades: así los nombres y precios no cambian.
  const ru = rng(11);
  const list: Product[] = [];
  let piezaDemo = 0;
  for (let i = 0; i < 500; i++) {
    const artesano = artisans[i % artisans.length] as Artisan;
    const categoria = artesano.rubro;
    const base = pick(r, PRODUCTOS_POR_CATEGORIA[categoria.codigo] as string[]);
    const variante = pick(r, VARIANTES_POR_CATEGORIA[categoria.codigo] as string[]);
    const [minimo, maximo] = PRECIO_POR_CATEGORIA[categoria.codigo] as [number, number];
    const unica = ru() < 0.3;
    const generado = {
      nombre: `${base}${variante}`,
      precio: Math.round((minimo + r() * (maximo - minimo)) / 10) * 10,
      tipo: (unica ? "pieza_unica" : "existencias") as UnitType,
      existencias: unica ? 1 : 2 + Math.floor(ru() * 11),
      personaliza: ru() > 0.35,
    };
    const curado = artesano.id === TALLER_DEMO_ID ? CATALOGO_TALLER_DEMO[piezaDemo] : undefined;
    const { nombre, precio, tipo, existencias, personaliza } = curado ?? generado;
    const creadoEn = curado
      ? new Date(Date.now() - (piezaDemo + 30) * DIA).toISOString()
      : new Date(Date.now() - Math.floor(r() * 240) * DIA).toISOString();
    if (curado) piezaDemo++;
    list.push({
      id: i + 1,
      nombre,
      precio,
      categoria,
      descripcion: descripcionProducto(nombre, artesano, personaliza),
      imagenes: [CATEGORY_IMAGE[categoria.codigo] as string, TALLER_IMAGE],
      artesanoId: artesano.id,
      disponible: r() > 0.08,
      creadoEn,
      modalidades: personaliza ? ["stock", "personalizacion"] : ["stock"],
      publicado: true,
      tipoUnidades: tipo,
      admitePersonalizacion: personaliza,
      existenciasFisicas: existencias,
      unidadesReservadas: 0,
      unidadesPorClasificar: 0,
      unidadesDisponibles: existencias,
    });
  }
  return list;
}

/** Medianoche de hoy: las fechas del escenario son siempre de días anteriores. */
const INICIO_DE_HOY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();

/** Fecha ISO de hace `dias` días (≥ 1) a la hora indicada. */
const hace = (dias: number, hora = 10, minuto = 0) =>
  new Date(INICIO_DE_HOY - dias * DIA + hora * HORA + minuto * 60_000).toISOString();

/**
 * Fecha ISO de hace `horas` horas. Solo para la observación de pago del
 * escenario, cuyo plazo de 48 horas debe estar vigente al iniciar la demo.
 */
const haceHoras = (horas: number) => new Date(Date.now() - horas * HORA).toISOString();

/**
 * Identificador del usuario del dataset de demostración. Coincide con
 * `DEMO_USER_ID` de `src/mocks/core.ts`; el seed no puede importarlo
 * desde ahí porque el mock ya importa este módulo.
 */
const USUARIO_DEMO_ID = 4;

/** RF-011: plazo para corregir un pago observado (D21). */
export const PLAZO_CORRECCION_MS = 48 * HORA;

/**
 * Los eventos de auditoría llevan identificador global, como en el contrato
 * (§7, `historial[]`). Se reinicia en cada construcción para que el dataset
 * siga siendo determinista.
 */
let ultimoEventoId = 0;
const nuevoEventoId = () => ++ultimoEventoId;

/** Cambio de estado del pedido en el escenario: [anterior, nuevo, quién, fecha]. */
type Paso = [OrderStatus, OrderStatus, string, string];

/** Evento de un intento de pago: [anterior, nuevo, quién, fecha, motivo]. */
type PasoPago = [PaymentAttemptStatus | null, PaymentAttemptStatus, string, string, string?];

interface IntentoSemilla {
  metodo: PaymentMethod;
  referencia?: string;
  nota?: string;
  /** El comprobante se adjunta con el registro del intento. */
  conComprobante: boolean;
  pasos: PasoPago[];
}

interface Escenario {
  cantidad: number;
  opcion: OrderOption;
  personalizacion: string;
  observaciones: string;
  estado: OrderStatus;
  costosAdicionales: number;
  costoEntrega: number;
  entregaPreferida: Order["entregaPreferida"];
  entrega?: Order["entrega"];
  reserva?: UnitReservation["estado"];
  motivoRechazo?: string;
  motivoCancelacion?: string;
  creadoEn: string;
  pasos: Paso[];
  pagos: IntentoSemilla[];
}

/**
 * Escenarios deterministas de la demostración, todos del taller demo, para que
 * comprador y artesano vean los mismos pedidos. Cubren cada paso del flujo en el
 * orden que fijan RF-010 y RF-011: el pago se confirma antes de la producción
 * (pedido personalizado) o antes de Listo para entrega (pedido estándar).
 */
function escenarios(): Escenario[] {
  const C = COMPRADORA_DEMO;
  const T = RESPONSABLE_TALLER_DEMO;
  const base = { costosAdicionales: 0, costoEntrega: 0, observaciones: "", personalizacion: "" };
  const observadoEn = haceHoras(2);
  return [
    {
      // PM-1001: el artesano debe registrar la modalidad antes de aceptar.
      ...base,
      cantidad: 2,
      opcion: "personalizada",
      personalizacion: "Tallas 38 y 40, color café oscuro.",
      observaciones: "Son para un regalo; si es posible, con empaque sencillo.",
      estado: "pendiente",
      entregaPreferida: { modalidad: "retiro_en_taller" },
      creadoEn: hace(1, 9, 15),
      pasos: [],
      pagos: [],
    },
    {
      // PM-1002: pieza única personalizada; entrega por el artesano sin costo fijado.
      ...base,
      cantidad: 1,
      opcion: "personalizada",
      personalizacion: "Con las iniciales A.L.D. grabadas en la solapa.",
      observaciones: "Lo necesito antes de fin de mes.",
      estado: "pendiente",
      entregaPreferida: { modalidad: "entrega_directa", detalle: "Barrio San Juan, Masaya" },
      creadoEn: hace(2, 16, 40),
      pasos: [],
      pagos: [],
    },
    {
      // PM-1003: estándar, aceptado y reservado; falta el pago.
      ...base,
      cantidad: 1,
      opcion: "estandar",
      estado: "aceptado",
      entregaPreferida: { modalidad: "retiro_en_taller" },
      entrega: { modalidad: "retiro_en_taller", detalle: "En el taller, en horario de atención" },
      reserva: "activa",
      creadoEn: hace(4, 10, 5),
      pasos: [["pendiente", "aceptado", T, hace(3, 11, 20)]],
      pagos: [],
    },
    {
      // PM-1004: pieza única personalizada con pago registrado y comprobante.
      ...base,
      cantidad: 1,
      opcion: "personalizada",
      personalizacion: "Grabado de una flor de sacuanjoche en la solapa.",
      costosAdicionales: 200,
      costoEntrega: 120,
      estado: "aceptado",
      entregaPreferida: { modalidad: "punto_de_encuentro", detalle: "Parque central" },
      entrega: { modalidad: "punto_de_encuentro", detalle: "Parque central de Masaya" },
      reserva: "activa",
      creadoEn: hace(6, 9, 0),
      pasos: [["pendiente", "aceptado", T, hace(5, 14, 0)]],
      pagos: [
        {
          metodo: "transferencia",
          referencia: "TRF-98452",
          nota: "Transferí el total esta mañana.",
          conComprobante: true,
          pasos: [[null, "registrado", C, hace(1, 10, 30)]],
        },
      ],
    },
    {
      // PM-1005: personalizado en producción.
      ...base,
      cantidad: 1,
      opcion: "personalizada",
      personalizacion: "Medida de cintura 34, hebilla de bronce.",
      costosAdicionales: 150,
      estado: "en_produccion",
      entregaPreferida: { modalidad: "retiro_en_taller" },
      entrega: { modalidad: "retiro_en_taller" },
      reserva: "activa",
      creadoEn: hace(12, 10, 0),
      pasos: [
        ["pendiente", "aceptado", T, hace(11, 9, 0)],
        ["aceptado", "en_produccion", T, hace(9, 10, 0)],
      ],
      pagos: [
        {
          metodo: "transferencia",
          referencia: "TRF-77120",
          conComprobante: true,
          pasos: [
            [null, "registrado", C, hace(10, 15, 0)],
            ["registrado", "confirmado", T, hace(9, 9, 30)],
          ],
        },
      ],
    },
    {
      // PM-1006: estándar, listo para entrega sin pasar por producción.
      ...base,
      cantidad: 3,
      opcion: "estandar",
      observaciones: "Si se puede, uno en color natural, uno café y uno negro.",
      costoEntrega: 150,
      estado: "listo_para_entrega",
      entregaPreferida: { modalidad: "entrega_directa", detalle: "Barrio San Jerónimo" },
      entrega: {
        modalidad: "entrega_directa",
        detalle: "Barrio San Jerónimo, Masaya — jueves después de las 3:00 p. m.",
      },
      reserva: "activa",
      creadoEn: hace(16, 11, 0),
      pasos: [
        ["pendiente", "aceptado", T, hace(15, 9, 0)],
        ["aceptado", "listo_para_entrega", T, hace(2, 15, 0)],
      ],
      pagos: [
        {
          metodo: "transferencia",
          referencia: "TRF-66381",
          conComprobante: true,
          pasos: [
            [null, "registrado", C, hace(15, 16, 0)],
            ["registrado", "confirmado", T, hace(14, 9, 0)],
          ],
        },
      ],
    },
    {
      // PM-1007: personalizado y entregado; la unidad ya se descontó.
      ...base,
      cantidad: 1,
      opcion: "personalizada",
      personalizacion: "Talla 41, suela de cuero.",
      estado: "entregado",
      entregaPreferida: { modalidad: "retiro_en_taller" },
      entrega: { modalidad: "retiro_en_taller" },
      reserva: "consumida",
      creadoEn: hace(25, 10, 0),
      pasos: [
        ["pendiente", "aceptado", T, hace(24, 9, 0)],
        ["aceptado", "en_produccion", T, hace(23, 10, 0)],
        ["en_produccion", "listo_para_entrega", T, hace(19, 11, 0)],
        ["listo_para_entrega", "entregado", T, hace(18, 10, 0)],
      ],
      pagos: [
        {
          metodo: "transferencia",
          referencia: "TRF-51007",
          conComprobante: false,
          pasos: [
            [null, "registrado", C, hace(24, 15, 0)],
            ["registrado", "confirmado", T, hace(23, 9, 0)],
          ],
        },
      ],
    },
    {
      // PM-1008: rechazado; nunca reservó unidades.
      ...base,
      cantidad: 1,
      opcion: "personalizada",
      personalizacion: "Color verde oliva.",
      estado: "rechazado",
      entregaPreferida: { modalidad: "punto_de_encuentro", detalle: "Mercado de artesanías" },
      motivoRechazo:
        "Por ahora no tenemos cuero en el color solicitado. Puede volver a solicitarlo en dos semanas.",
      creadoEn: hace(8, 10, 0),
      pasos: [["pendiente", "rechazado", T, hace(7, 9, 0)]],
      pagos: [],
    },
    {
      // PM-1009: cancelado por el comprador; la unidad espera clasificación.
      ...base,
      cantidad: 1,
      opcion: "estandar",
      observaciones: "Talla 39.",
      estado: "cancelado",
      entregaPreferida: { modalidad: "retiro_en_taller" },
      entrega: { modalidad: "retiro_en_taller" },
      reserva: "pendiente_clasificacion",
      motivoCancelacion: "Encontré la pieza en otra talla; ya no la necesito.",
      creadoEn: hace(10, 10, 0),
      pasos: [
        ["pendiente", "aceptado", T, hace(9, 10, 0)],
        ["aceptado", "cancelado", C, hace(8, 15, 0)],
      ],
      pagos: [],
    },
    {
      // PM-1010: pago observado, dentro del plazo de 48 horas para corregir.
      ...base,
      cantidad: 1,
      opcion: "estandar",
      costoEntrega: 100,
      estado: "aceptado",
      entregaPreferida: { modalidad: "punto_de_encuentro", detalle: "Parque central" },
      entrega: { modalidad: "punto_de_encuentro", detalle: "Parque central de Masaya" },
      reserva: "activa",
      creadoEn: hace(3, 8, 30),
      pasos: [["pendiente", "aceptado", T, hace(2, 9, 0)]],
      pagos: [
        {
          metodo: "transferencia",
          referencia: "TRF-40217",
          conComprobante: true,
          pasos: [
            [null, "registrado", C, hace(1, 9, 0)],
            [
              "registrado",
              "observado",
              T,
              observadoEn,
              "En la imagen no se ve el monto transferido; envíe una captura completa.",
            ],
          ],
        },
      ],
    },
  ];
}

/** Comprobantes del escenario: todos usan la misma imagen de muestra. */
export interface ReceiptFile {
  id: number;
  pedidoId: number;
  src: string;
}

export interface DemoOrders {
  orders: Order[];
  receiptFiles: ReceiptFile[];
}

const fechaDe = (pasos: Paso[], nuevo: OrderStatus) => pasos.find((p) => p[1] === nuevo)?.[3];

export function buildOrders(products: Product[]): DemoOrders {
  ultimoEventoId = 0;
  let ultimoIntentoId = 0;
  let ultimoComprobanteId = 0;
  const receiptFiles: ReceiptFile[] = [];
  const catalogo = products.filter((p) => p.artesanoId === TALLER_DEMO_ID);

  const orders = escenarios().map((e, i): Order => {
    const producto = catalogo[i] as Product;
    const id = i + 1;
    const C = COMPRADORA_DEMO;

    const pagos: PaymentAttempt[] = e.pagos.map((intento, n) => {
      const comprobantes: PaymentReceipt[] = [];
      const eventos: PaymentAttemptEvent[] = intento.pasos.map(
        ([anterior, nuevo, usuario, fecha, motivo]) => {
          let comprobanteId: number | undefined;
          if (anterior === null && intento.conComprobante) {
            comprobanteId = ++ultimoComprobanteId;
            comprobantes.push({
              id: comprobanteId,
              nombreArchivo: "comprobante-simulado.svg",
              tipo: "image/svg+xml",
              tamano: 2_048,
              subidoEn: fecha,
              subidoPor: C,
            });
            receiptFiles.push({ id: comprobanteId, pedidoId: id, src: COMPROBANTE_DEMO });
          }
          return {
            estadoAnterior: anterior,
            estadoNuevo: nuevo,
            motivo,
            comprobanteId,
            plazoHasta:
              nuevo === "observado"
                ? new Date(new Date(fecha).getTime() + PLAZO_CORRECCION_MS).toISOString()
                : undefined,
            usuario,
            fecha,
          };
        },
      );
      const ultimo = eventos.at(-1) as PaymentAttemptEvent;
      return {
        id: ++ultimoIntentoId,
        numero: n + 1,
        metodo: intento.metodo,
        referencia: intento.referencia,
        nota: intento.nota,
        estado: ultimo.estadoNuevo,
        registradoEn: (eventos[0] as PaymentAttemptEvent).fecha,
        comprobantes,
        eventos,
      };
    });

    const aceptadoEn = fechaDe(e.pasos, "aceptado");
    const cotizacionCongelada: FrozenQuote | undefined =
      aceptadoEn && e.entrega
        ? {
            precioUnitario: producto.precio,
            cantidad: e.cantidad,
            costosAdicionales: e.costosAdicionales,
            costoEntrega: e.costoEntrega,
            modalidad: e.entrega.modalidad,
            total: producto.precio * e.cantidad + e.costosAdicionales + e.costoEntrega,
            congeladaEn: aceptadoEn,
          }
        : undefined;

    const unidades = e.cantidad === 1 ? "1 unidad" : `${e.cantidad} unidades`;
    const historial: AuditEvent[] = [
      {
        id: 0,
        tipo: "pedido",
        estadoAnterior: "—",
        estadoNuevo: "pendiente",
        usuario: C,
        fecha: e.creadoEn,
      },
      ...e.pasos.map(([anterior, nuevo, usuario, fecha]): AuditEvent => ({
        id: 0,
        tipo: "pedido",
        estadoAnterior: anterior,
        estadoNuevo: nuevo,
        usuario,
        fecha,
      })),
      ...pagos.flatMap((intento, n) =>
        intento.eventos.map((ev): AuditEvent => ({
          id: 0,
          tipo: "pago",
          estadoAnterior: ev.estadoAnterior ?? (n === 0 ? "pendiente" : "no_recibido"),
          estadoNuevo: ev.estadoNuevo,
          usuario: ev.usuario,
          fecha: ev.fecha,
        })),
      ),
    ];
    if (aceptadoEn && e.entrega) {
      const cotizadaEn = new Date(new Date(aceptadoEn).getTime() - 30 * 60_000).toISOString();
      historial.push({
        id: 0,
        tipo: "entrega",
        estadoAnterior: "—",
        estadoNuevo: "—",
        detalle: `Modalidad registrada: ${ENTREGA_ETIQUETA[e.entrega.modalidad]}, costo C$ ${e.costoEntrega}`,
        usuario: RESPONSABLE_TALLER_DEMO,
        fecha: cotizadaEn,
      });
      historial.push({
        id: 0,
        tipo: "unidades",
        estadoAnterior: "—",
        estadoNuevo: "—",
        detalle: `Reserva de ${unidades} al aceptar`,
        usuario: RESPONSABLE_TALLER_DEMO,
        fecha: aceptadoEn,
      });
    }
    const entregadoEn = fechaDe(e.pasos, "entregado");
    if (entregadoEn) {
      historial.push({
        id: 0,
        tipo: "unidades",
        estadoAnterior: "—",
        estadoNuevo: "—",
        detalle: `Entrega: se descuentan ${unidades} de existencias y reservas`,
        usuario: RESPONSABLE_TALLER_DEMO,
        fecha: entregadoEn,
      });
    }
    const canceladoEn = fechaDe(e.pasos, "cancelado");
    if (canceladoEn && e.reserva === "pendiente_clasificacion") {
      historial.push({
        id: 0,
        tipo: "unidades",
        estadoAnterior: "—",
        estadoNuevo: "—",
        detalle: `${unidades} ${e.cantidad === 1 ? "pendiente" : "pendientes"} de clasificación por el taller`,
        usuario: C,
        fecha: canceladoEn,
      });
    }
    historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const evento of historial) evento.id = nuevoEventoId();

    return {
      id,
      codigo: `PM-${1000 + id}`,
      productoId: producto.id,
      artesanoId: producto.artesanoId,
      compradorId: USUARIO_DEMO_ID,
      compradorNombre: C,
      cantidad: e.cantidad,
      opcion: e.opcion,
      personalizacion: e.personalizacion,
      observaciones: e.observaciones,
      estado: e.estado,
      estadoPago: pagos.at(-1)?.estado ?? "pendiente",
      precioUnitario: producto.precio,
      costosAdicionales: e.costosAdicionales,
      costoEntrega: e.costoEntrega,
      entregaPreferida: e.entregaPreferida,
      entrega: e.entrega,
      cotizacionCongelada,
      reserva: e.reserva ? { cantidad: e.cantidad, estado: e.reserva } : undefined,
      pagos,
      motivoRechazo: e.motivoRechazo,
      motivoCancelacion: e.motivoCancelacion,
      creadoEn: e.creadoEn,
      historial,
    };
  });

  return { orders, receiptFiles };
}

/** Etiquetas del seed; el seed no importa la capa de presentación. */
const ENTREGA_ETIQUETA: Record<DeliveryMode, string> = {
  retiro_en_taller: "Recoger en el taller",
  punto_de_encuentro: "Punto de encuentro",
  entrega_directa: "Entrega por el artesano",
  otra: "Otra modalidad",
};

/**
 * RF-022: aplica a los productos del taller demo las reservas del escenario y
 * devuelve sus movimientos de unidades. Las existencias físicas del catálogo
 * curado ya están descontadas de lo entregado, así que el alta las suma.
 */
export function applyScenarioUnits(products: Product[], orders: Order[]): UnitMovement[] {
  const movimientos: Omit<UnitMovement, "id">[] = [];
  const porId = new Map(products.map((p) => [p.id, p]));

  for (const p of products.filter((x) => x.artesanoId === TALLER_DEMO_ID)) {
    const consumidas = orders
      .filter((o) => o.productoId === p.id && o.reserva?.estado === "consumida")
      .reduce((n, o) => n + o.cantidad, 0);
    movimientos.push({
      productoId: p.id,
      tipo: "alta",
      cantidad: p.existenciasFisicas + consumidas,
      existenciasAntes: 0,
      existenciasDespues: p.existenciasFisicas + consumidas,
      usuario: RESPONSABLE_TALLER_DEMO,
      fecha: p.creadoEn,
    });
  }

  for (const o of orders) {
    const p = porId.get(o.productoId);
    if (!p || !o.reserva) continue;
    const aceptadoEn = o.historial.find(
      (h) => h.tipo === "pedido" && h.estadoNuevo === "aceptado",
    )?.fecha;
    const fisicas = p.existenciasFisicas;
    const base = {
      productoId: p.id,
      cantidad: o.cantidad,
      pedidoCodigo: o.codigo,
      usuario: RESPONSABLE_TALLER_DEMO,
    };
    if (o.reserva.estado === "consumida") {
      const entregadoEn = o.historial.find(
        (h) => h.tipo === "pedido" && h.estadoNuevo === "entregado",
      )?.fecha;
      movimientos.push({
        ...base,
        tipo: "reserva",
        existenciasAntes: fisicas + o.cantidad,
        existenciasDespues: fisicas + o.cantidad,
        fecha: aceptadoEn ?? o.creadoEn,
      });
      movimientos.push({
        ...base,
        tipo: "consumo",
        existenciasAntes: fisicas + o.cantidad,
        existenciasDespues: fisicas,
        fecha: entregadoEn ?? o.creadoEn,
      });
      continue;
    }
    movimientos.push({
      ...base,
      tipo: "reserva",
      existenciasAntes: fisicas,
      existenciasDespues: fisicas,
      fecha: aceptadoEn ?? o.creadoEn,
    });
    if (o.reserva.estado === "activa") {
      p.unidadesReservadas += o.cantidad;
    } else if (o.reserva.estado === "pendiente_clasificacion") {
      const canceladoEn = o.historial.find(
        (h) => h.tipo === "pedido" && h.estadoNuevo === "cancelado",
      )?.fecha;
      movimientos.push({
        ...base,
        tipo: "pendiente_clasificacion",
        existenciasAntes: fisicas,
        existenciasDespues: fisicas,
        motivo: "Cancelación del comprador",
        usuario: COMPRADORA_DEMO,
        fecha: canceladoEn ?? o.creadoEn,
      });
      p.unidadesPorClasificar += o.cantidad;
    }
  }

  for (const p of products) {
    p.unidadesDisponibles = Math.max(
      0,
      p.existenciasFisicas - p.unidadesReservadas - p.unidadesPorClasificar,
    );
  }

  return movimientos
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((m, i) => ({ ...m, id: i + 1 }));
}

/** Conversaciones de los pedidos que ya tienen chat (RF-014), coherentes con su historial. */
export function buildMessages(): Message[] {
  const C = COMPRADORA_DEMO;
  const T = RESPONSABLE_TALLER_DEMO;
  const conversacion: [number, Message["autor"], string, string, string][] = [
    [
      3,
      "artesano",
      T,
      "Gracias por su pedido. Cuando registre el pago y lo confirmemos, le aviso para que pase a recoger su billetera.",
      hace(3, 11, 30),
    ],
    [4, "comprador", C, "Buenas tardes, ya registré la transferencia del total.", hace(1, 10, 35)],
    [
      5,
      "artesano",
      T,
      "Buenos días. Ya confirmamos su pago y empezamos la pieza. ¿Confirma la hebilla de bronce?",
      hace(9, 10, 5),
    ],
    [5, "comprador", C, "Sí, la hebilla de bronce está perfecta. Gracias.", hace(9, 12, 0)],
    [
      5,
      "artesano",
      T,
      "Le cuento que ya terminamos el cosido; solo falta el acabado.",
      hace(4, 16, 0),
    ],
    [
      6,
      "artesano",
      T,
      "Su pedido ya está listo. ¿Le parece bien la entrega el jueves por la tarde?",
      hace(2, 15, 10),
    ],
    [6, "comprador", C, "El jueves después de las 3:00 p. m. me queda bien.", hace(2, 18, 0)],
    [7, "artesano", T, "Ya puede pasar a recoger sus zapatos al taller.", hace(19, 11, 10)],
    [7, "comprador", C, "Recibidos, quedaron muy bonitos. ¡Gracias!", hace(18, 10, 30)],
    [
      10,
      "artesano",
      T,
      "Le dejé una observación en el pago: en la imagen no se ve el monto. ¿Me puede enviar la captura completa?",
      haceHoras(1.9),
    ],
  ];
  return conversacion.map(([pedidoId, autor, autorNombre, texto, fecha], i) => ({
    id: i + 1,
    pedidoId,
    autor,
    autorNombre,
    texto,
    fecha,
  }));
}
