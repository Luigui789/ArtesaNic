/**
 * Servidor simulado completo: la misma superficie que tenía `services/mock-api.ts`.
 * Lo usan `scripts/check-demo.mjs` y las herramientas de la demo del layout.
 * La interfaz consume cada dominio desde `src/features/<dominio>/api.ts`.
 */
export {
  DEMO_ARTISAN_ID,
  DEMO_ARTISAN_RESPONSABLE,
  DEMO_USER_ID,
  getPersistenceStatus,
  resetDemo,
  simularFalloProximaPeticion,
} from "./core";
export type { PersistenceStatus } from "./core";
export {
  countByCategory,
  createOwnProduct,
  createProduct,
  featuredProducts,
  getCatalogProduct,
  getProduct,
  listCatalog,
  listCategories,
  listMyProducts,
  listOwnProducts,
  listProducts,
  processImage,
  publishOwnProduct,
  unpublishOwnProduct,
  updateOwnProduct,
  updateProduct,
} from "./catalogo";
export { listUnitMovements } from "./inventario";
export { featuredArtisans, getArtisan, listArtisans, updateArtisan } from "./talleres";
export {
  artisanSummary,
  changeOrderStatus,
  classifyCancelledUnits,
  createOrderRequest,
  getOrder,
  listOrders,
  setDelivery,
  setDeliveryCoordination,
  setDeliveryQuote,
} from "./pedidos";
export {
  confirmPayment,
  correctPayment,
  getPaymentReceipt,
  registerPayment,
  reviewPayment,
} from "./pagos";
export { listMessages, pollNewMessages, sendMessage } from "./mensajes";
export type { CatalogFilters, Paginated, ProductInput } from "@/features/catalogo/types";
export type { DeliveryCoordinationInput, OrderRequestInput } from "@/features/pedidos/types";
export type { PaymentInput } from "@/features/pagos/types";
