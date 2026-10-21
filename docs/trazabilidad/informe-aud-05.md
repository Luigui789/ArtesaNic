# Informe de implementación AUD-05

**Fecha:** 20 de octubre de 2026 (America/Managua).
**Clasificación:** **A. AUD-05 COMPLETO**, dentro del alcance autorizado de creación y
consulta de solicitudes. La prueba manual de la plataforma queda expresamente a cargo
del responsable, por su instrucción durante la implementación; no se declara aprobada.

## 1–4. Rama, base, commits y archivos

- Rama local: `feature/solicitudes-renglones-v1`.
- Base remota verificada: `465c9ae5617f2472f25c2e724fa2c074f17f4565`, `develop`, que
  contiene el merge de PR #8. Se actualizó `origin` antes de crear la rama.
- No se modificaron `main` ni `develop`; no se abrió PR, no hubo merge ni push.
- Commits separados por dominio persistente, API/pruebas, cliente/demo frontend,
  composición/consultas UI y documentación. Sus SHA exactos se consultan con
  `git log --oneline 465c9ae..feature/solicitudes-renglones-v1` y se entregan en el cierre.
- El manifiesto completo al final enumera archivos agregados/modificados. No cambiaron
  dependencias ni archivos lock, RF/RNF/RN ni la auditoría histórica.

## 5–7. Modelos, campos, constraints y migración

| Modelo | Campos persistentes |
|---|---|
| `Solicitud` | id, comprador, taller, estado, creado_en, actualizado_en |
| `RenglonSolicitud` | id, solicitud, producto, posicion, modalidad, cantidad, fecha_solicitada, caracteristicas, origen_personalizacion, resolucion, motivo_rechazo |

`Solicitud` tiene CHECK `solicitud_estado_valido` y dos índices compuestos, por
comprador/fecha/id y taller/fecha/id. `RenglonSolicitud` tiene:

- UNIQUE `renglon_posicion_unica` dentro de cada solicitud;
- CHECK `renglon_posicion_positiva` y `renglon_cantidad_positiva`;
- CHECK `renglon_modalidad_valida` y `renglon_resolucion_valida`;
- CHECK `renglon_rechazo_con_motivo`: motivo no vacío para rechazado, vacío en las demás;
- CHECK `renglon_datos_modalidad`: fecha solo producción, características/origen solo
  personalización, con sus datos requeridos.

Cantidad usa entero positivo de PostgreSQL; API rechaza cero, negativos, fracciones,
booleanos y valores fuera del rango técnico. Las FK usan `PROTECT` para conservar
referencias históricas. No hay API de edición/borrado ni admin comercial de solicitudes.

Migración generada `apps/solicitudes/migrations/0001_initial.py`, aditiva y dependiente de
cuentas, talleres y catálogo. Se aplicó al arrancar Docker; `migrate --noinput` en el host
confirmó que no quedaban migraciones pendientes. No se borraron datos ni volúmenes.

## 8–11. Estados, DR-03, taller y modalidades

- Solicitud: inicial `pendiente_revision`; terminal representable `rechazada`.
- Renglón: inicial `pendiente`; representación preparada `aceptado`/`rechazado`.
- [DR-03](../decisiones/v1.md#dr-03--solicitud-sin-renglones-aceptados) se registra como
  decisión posterior a la auditoría. Todos resueltos y rechazados implica solicitud
  `rechazada`, conservando renglones y motivos, sin propuesta confirmable/pedido/reserva.
  No hay acción ni transición comercial expuesta en AUD-05: se implementará en AUD-06.
- Comprador procede del token y taller de los productos públicos. El servicio carga los
  productos, valida cada modalidad y un único taller, y persiste solicitud/renglones en
  una transacción. Un fallo no deja filas parciales; no se deduplican renglones válidos.
- `stock`: cantidad, sin consultar ni reservar inventario.
- `produccion`: cantidad y fecha solicitada, hoy o futura al crear; conserva fecha como
  calendario. No exige ni inventa fecha comprometida o costo de producción.
- `personalizacion`: cantidad, características en texto libre y origen `desde_cero` o
  `unidad_estandar`; no identifica, reserva ni consume una unidad real.

La regla entre talleres se hace en servicio/modelo, porque no puede expresarse como un
CHECK de una fila sobre otras tablas. La API es la vía autorizada; SQL directo puede
saltarse invariantes entre relaciones y no constituye un flujo comercial soportado.

## 12–14. Endpoints, permisos y DTO

| Método/ruta | Permiso | DTO |
|---|---|---|
| POST `/api/v1/solicitudes/` | Comprador activo | `SolicitudEntrada` → `SolicitudComprador` (201) |
| GET `/api/v1/solicitudes/mias/` | Comprador, ownership SQL | Página de `SolicitudComprador` |
| GET `/api/v1/solicitudes/mias/{solicitud_id}/` | Comprador propietario | `SolicitudComprador` |
| GET `/api/v1/solicitudes/recibidas/` | `EsArtesanoAprobado`, taller propio | Página de `SolicitudArtesano` |
| GET `/api/v1/solicitudes/recibidas/{solicitud_id}/` | Artesano aprobado destinatario | `SolicitudArtesano` |

Sin token/cuenta desactivada: 401; rol o taller no habilitado: 403; detalle ajeno o
inexistente: 404. Los métodos no implementados responden 405 para el rol autorizado.
No hay endpoints de revisión, propuesta, confirmación, reservas o administración.

Entrada explícita: `renglones`, cada uno con producto/modalidad/cantidad y sus datos.
Se rechazan campos desconocidos/privilegiados en ambos niveles. Lectura comprador no
incluye la cuenta; lectura artesano añade solo `{id, nombre}` del comprador. Nunca
teléfono de acceso, contraseña, tokens ni importes. Los renglones leen nombre/categoría
vigentes, sin snapshot económico. Todos los endpoints privados usan `never_cache`.

Listados paginados (12 por defecto, 48 máximo), ordenados por fecha/id; select_related y
Prefetch mantienen constantes las consultas con uno o varios renglones. Pruebas verifican
dos consultas de dominio para detalle y tres para lista, más autenticación/permisos.

## 15–16. Frontend y legado temporal

Nuevo dominio `features/solicitudes`: tipos discriminados por modalidad, validación,
cliente HTTP, composición y listados/detalles de ambas partes. No importa `Order` ni
`OrderOption` como autoridad. La composición conserva renglones distintos, bloquea otro
taller y no ofrece acciones globales de aceptación. Espera al producto inicial antes de
ofrecer edición para no perderlo si el catálogo responde primero.

Rutas: `/solicitar/{productId}`, `/solicitudes/nueva`, `/solicitudes`, `/solicitudes/{id}`,
`/panel/solicitudes`, `/panel/solicitudes/{id}`. La caché distingue fuente, identidad,
rol y taller. Payload usa una allowlist; el transporte conserva errores por posición.

Fuente compartida con catálogo (`VITE_CATALOGO_API`). Modo demo persiste `store.solicitudes`
independiente; modo real usa el proveedor Bearer existente y nunca envía la identidad
demo. No se inventó autenticación ni JWT frontend: AUD-18 sigue pendiente.

`Order`, el formulario anterior no enrutado y `/pedidos`/`/panel/pedidos` permanecen
rotulados como legacy/demo para pagos, mensajes e inventario anteriores. Crear solicitud
V1 no altera esos datos ni navega a un pedido. IndexedDB cambia de versión 3 a 4 y
protege instantáneas incompatibles sin sobrescribirlas; restablecer requiere elección
explícita del usuario en su navegador.

## 17–22. Evidencia automática y validación manual

| Comprobación | Resultado |
|---|---|
| Backend: `uv sync --locked` | OK, sin cambios al lock |
| `uv run ruff check .` / `ruff format --check .` | OK |
| Django check / makemigrations check | OK; sin cambios de modelos pendientes |
| `uv run python manage.py migrate --noinput` | OK; esquema aplicado, sin migraciones pendientes |
| `uv run python manage.py test --noinput` | **358 tests OK**; base anterior 245 + 113 nuevos |
| Nuevos tests backend | Creación40, modelo25, lectura/permisos/performance32, esquema15, smoke1 |
| Frontend: `pnpm install --frozen-lockfile` | OK; dependencias conservadas |
| `pnpm lint` | OK, 0 errores; 9 warnings previos de Fast Refresh |
| `pnpm typecheck` | OK |
| `pnpm test` | OK, seis scripts; los dos nuevos suman 24 grupos de aserciones |
| `pnpm build` | OK; warning de bundle mayor de 500 kB y aviso previo de vite-tsconfig-paths |
| OpenAPI | Generado con spectacular --validate --fail-on-warn; schema válido y coincide con código, incluyendo minItems1 y origen vacío de lectura |
| Documentación y patrones de secretos | Validadores oficiales OK; el escaneo es por patrones, no certificación exhaustiva |
| Docker Compose | Build/up --wait OK; backend/frontend recreados; db/backend/frontend healthy; volumen conservado |
| Sonda existente | Frontend → proxy `/api/v1/salud/` → Django devuelve `{"estado":"ok"}` |
| Smoke funcional independiente | HTTP real sobre LiveServer temporal, CSRF/login/JWT y PostgreSQL de pruebas: OK |
| Prueba manual de plataforma | **Pendiente del responsable**, por instrucción explícita; [pasos/resultados esperados](../planes/pruebas-manuales-aud-05.md) |

Las pruebas nuevas cubren: 1/N renglones, mismo taller y rollback, tres modalidades y
mezcla, cantidades/fechas, campos privilegiados, catálogo no público, ownership,
401/403/404/405, privacidad, constraints por SQL directo, DR-03 estructural, historial
conservado tras despublicación y consultas sin N+1.

Los scripts frontend ejercitan composición/allowlist, permisos y atomicidad de la demo,
guardado/recarga de IndexedDB, aislamiento respecto de pedidos/pagos/reservas/mensajes,
cinco endpoints HTTP, Bearer, DTO/paginación, rechazo DR-03 y errores 400 anidados,
401/403/404 y red. HTTP usa respuestas controladas; no es E2E de sesión frontend.

El smoke se ejecutó además como comando separado antes de la suite completa:
`uv run python manage.py test apps.solicitudes.tests.test_smoke --noinput`. Crea comprador,
otro comprador, talleres A/B aprobados y productos publicados en base temporal. Verifica
solicitud simple y mixta persistida, mezcla de talleres con rollback, acceso A y 404 para
B/otro comprador, y ausencia de efectos comerciales ajenos; DR-03 está representada y
no se simula confirmación. No deja datos de prueba en la base de desarrollo.

## 23–26. Fases siguientes y riesgos conocidos

- **AUD-06:** resolver cada renglón, conservar historial de revisión, motivos y condiciones,
  aplicar DR-03, preparar propuesta; aún no confirmar ni reservar.
- **AUD-07:** confirmación transaccional por comprador, revalidación de stock y reservas
  atómicas, snapshot económico definitivo.
- **AUD-08:** **la protección servidor contra reintentos/lost-response queda para AUD-08**.
  AUD-05 no acredita RF-009.7; repetir POST puede crear otra solicitud deliberada o repetida.
- AUD-09 conserva la UI completa de confirmación/cancelación; AUD-18, sesión frontend real.
  Pagos, vencimiento, cumplimiento/entregas, reembolsos, supervisión y chat no se adelantaron.
- DR-01 fotografía sigue abierta y fuera de esta tarea. No se implementó inventario RF-022.
- No surgió otra decisión humana bloqueante de AUD-05. DR-03 se resolvió con la decisión
  suministrada. Advertencias existentes del frontend se conservan sin ampliar alcance.
- La revisión manual y la posterior decisión de PR/merge pertenecen al responsable.
  No se ejecutó CI remota para estos commits locales ni se afirma validación visual aprobada.

## Manifiesto de archivos

- **A** `apps/backend/apps/solicitudes/__init__.py`
- **A** `apps/backend/apps/solicitudes/api/__init__.py`
- **A** `apps/backend/apps/solicitudes/api/serializers.py`
- **A** `apps/backend/apps/solicitudes/api/urls.py`
- **A** `apps/backend/apps/solicitudes/api/views.py`
- **A** `apps/backend/apps/solicitudes/apps.py`
- **A** `apps/backend/apps/solicitudes/migrations/__init__.py`
- **A** `apps/backend/apps/solicitudes/migrations/0001_initial.py`
- **A** `apps/backend/apps/solicitudes/models.py`
- **A** `apps/backend/apps/solicitudes/selectors.py`
- **A** `apps/backend/apps/solicitudes/services.py`
- **A** `apps/backend/apps/solicitudes/tests/__init__.py`
- **A** `apps/backend/apps/solicitudes/tests/base.py`
- **A** `apps/backend/apps/solicitudes/tests/test_creacion.py`
- **A** `apps/backend/apps/solicitudes/tests/test_esquema.py`
- **A** `apps/backend/apps/solicitudes/tests/test_lectura.py`
- **A** `apps/backend/apps/solicitudes/tests/test_models.py`
- **A** `apps/backend/apps/solicitudes/tests/test_smoke.py`
- **A** `apps/frontend/scripts/check-solicitudes-http.mjs`
- **A** `apps/frontend/scripts/check-solicitudes.mjs`
- **A** `apps/frontend/src/features/solicitudes/api.ts`
- **A** `apps/frontend/src/features/solicitudes/http.ts`
- **A** `apps/frontend/src/features/solicitudes/pages/consultas.tsx`
- **A** `apps/frontend/src/features/solicitudes/pages/preparar.tsx`
- **A** `apps/frontend/src/features/solicitudes/types.ts`
- **A** `apps/frontend/src/features/solicitudes/validacion.ts`
- **A** `apps/frontend/src/mocks/solicitudes.ts`
- **A** `docs/api/solicitudes.md`
- **A** `docs/decisiones/v1.md`
- **A** `docs/planes/pruebas-manuales-aud-05.md`
- **A** `docs/trazabilidad/informe-aud-05.md`
- **M** `apps/backend/config/settings/base.py`
- **M** `apps/backend/config/urls.py`
- **M** `apps/frontend/package.json`
- **M** `apps/frontend/src/app/App.tsx`
- **M** `apps/frontend/src/components/layout/site-layout.tsx`
- **M** `apps/frontend/src/features/catalogo/http.ts`
- **M** `apps/frontend/src/features/catalogo/pages/producto.tsx`
- **M** `apps/frontend/src/features/pedidos/pages/solicitar.tsx`
- **M** `apps/frontend/src/features/pedidos/types.ts`
- **M** `apps/frontend/src/features/README.md`
- **M** `apps/frontend/src/mocks/core.ts`
- **M** `apps/frontend/src/mocks/persistence.ts`
- **M** `apps/frontend/src/types/index.ts`
- **M** `CONTRIBUTING.md`
- **M** `docs/api/catalogo.md`
- **M** `docs/api/openapi.yaml`
- **M** `docs/arquitectura/backend.md`
- **M** `docs/README.md`
- **M** `README.md`
