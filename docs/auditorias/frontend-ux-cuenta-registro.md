# Fase 7: cuenta, perfil privado del taller y registro

Baseline: `318e6f5`, rama `feature/frontend-ux-refactor`. Worktree limpio al iniciar;
los commits de la fase 6 (`393b538`, `5010687`, `801d284`, `b9aeb9c`) y la corrección
de React Doctor (`318e6f5`) ya estaban en origin antes de editar. Última fase funcional
del refactor; no se inicia el cierre global.

## Revisión previa a cambios

| Formulario | Campos | Validación | Persistencia |
| --- | --- | --- | --- |
| Registro (`/auth?modo=registro`) | Intención; nombre, teléfono, contraseña y confirmación; artesano: nombre, rubro y dirección del taller, ubicación opcional, historia, horario y cinco contactos públicos | Zod (`validacion.ts`) en cliente; el servidor valida contraseña (común, parecida al nombre/teléfono) y teléfono duplicado | Un `POST` a `registro/comprador/` o `registro/artesano/`; el cuerpo nunca lleva `rol` |
| Mi cuenta (`/cuenta`) | Nombre y teléfono de acceso; contraseña actual solo si cambia el teléfono | React Hook Form + `zodResolver` | `PATCH /auth/perfil/` con solo lo cambiado |
| Perfil del taller (`/panel`, `/panel/perfil`) | Nombre, rubro, dirección, historia, horario, teléfono, WhatsApp, Facebook, Instagram, sitio web, foto, portada, ubicación y su publicación | `esquemaTaller` con errores en estado propio | Un `PATCH /talleres/mi-taller/` con texto, imágenes y ubicación |

Datos públicos y privados, verificados en el contrato y no solo en la interfaz:

- `TallerPublicoSerializer` expone `CAMPOS_PERFIL` (incluida la dirección), imágenes y
  `ubicacion_mapa` solo si `ubicacion_publica` es verdadera. No expone propietario,
  estado ni datos de la cuenta.
- El teléfono de acceso solo aparece en serializers de `accounts`. Ningún otro
  serializer lo expone.
- El nombre de la cuenta sí lo ve la contraparte: comprador en solicitudes
  (`CompradorSolicitudSerializer`) y autor de mensajes (`AutorMensajeSerializer`).
  Por eso «Mi cuenta» no lo presenta como totalmente oculto.

Problemas encontrados:

1. El registro mostraba simultáneamente intención, cuatro campos de acceso, datos del
   taller, mapa y once opcionales. Los asteriscos no tenían explicación, la
   intención usaba radios pequeños y un error del servidor no llevaba a su campo.
2. El perfil del taller mezclaba imágenes, identidad, ubicación y contactos en un solo
   bloque. «Cambiar imagen» era un input nativo sin acción clara. Un archivo inválido
   descartaba también la selección válida anterior. Si había un error local de imagen,
   el envío se cancelaba sin mensaje. Cancelar descartaba cambios sin avisar y, tras
   guardar, solo quedaba un toast.
3. En «Mi cuenta», «No hay cambios» se mostraba como error (alerta roja) y el
   aviso de «Mi taller» quedaba al final, después del formulario.
4. `Campo` no reenviaba `ref`, `maxLength` ni `autoComplete` al `textarea`, que fijaba
   3 filas. Tampoco tenía forma textual de marcar «opcional» ni `required`.
5. Ningún formulario con errores en estado propio enfocaba el primer campo inválido.

`FormField` (consumidores: inventario, pagos, cumplimiento, resolución y revisión, todos
fuera de alcance) no se modificó. `Campo` solo lo usan auth y el perfil del taller, así
que se mejoró en su sitio. El reexport `features/auth/components/campo.tsx` se mantiene
porque no hay beneficio claro en migrar sus importaciones.

## Antes / después

| Área | Antes | Después |
| --- | --- | --- |
| Registro | Un formulario largo con todo a la vez | Pasos con «Paso N de M», nombre del paso y barra: comprador 3 (tipo, datos, revisión), artesano 5 (tipo, datos, taller, ubicación, revisión) |
| Rol | Dos radios de 16 px | Tarjetas con icono, descripción, borde, fondo, peso y «Opción elegida»; siguen siendo `radiogroup` de Radix con flechas |
| Aceptación | No existía | Casilla obligatoria desmarcada con enlaces independientes en pestaña nueva; error específico junto a ella |
| Errores de registro | Lista al enviar | Validación por paso con foco al primer campo; un error del servidor lleva al paso de su campo y lo enfoca |
| Perfil del taller | Un bloque | Identidad, Presentación, Fotos, Dirección + Ubicación, Contacto público; pie fijo con «Guardar cambios» |
| Imágenes | Input nativo | Vista previa, «Elegir imagen»/«Elegir otra imagen», «Mantener la imagen actual», motivo junto al campo |
| Tras guardar | Toast y vuelta al resumen | Toast + «Cambios guardados.» en la página y «Ver perfil público» si está aprobado |
| Mi cuenta | Rol, formulario y aviso de taller al final | Rol, «Mi taller» aparte antes del formulario, «Datos personales» con explicación de privacidad y confirmación en la página |

## Registro por pasos

Los pasos dividen la presentación, no el contrato. `FormularioRegistro` conserva los
valores: React Hook Form para cuenta y taller, estado para ubicación y aceptación.
Por eso desmontar un paso no pierde datos y las contraseñas siguen al volver. Enter
avanza; solo la revisión crea la cuenta con el mismo `solicitudDeRegistro` y un único
`POST`. `registro-pasos.ts` (lógica sin React) define los pasos por rol, la validación
por paso (los mismos esquemas, filtrados) y el paso de cada campo para los errores del
servidor. Los componentes de presentación están en `registro-pasos.tsx` y
`registro-revision.tsx`.

Se agrupó en 5 pasos para el artesano (3–4 era lo ideal) porque la ubicación incluye un
mapa y su propia decisión de publicación: mezclarla con el taller rehacía el bloque denso.
Los opcionales del taller siguen en un `details` que se abre solo si tienen datos o
errores. Los obligatorios nunca quedan plegados.

Al cambiar de rol se conservan los datos comunes. Los del taller quedan en memoria pero
el comprador no los envía: el esquema y la transformación existentes no los incluyen.
La revisión no muestra contraseñas. No se usa `localStorage`/`sessionStorage`, ni
rutas, ni historial para los pasos. Recargar reinicia el registro.

«Crear cuenta» sin aceptar queda `aria-disabled` (enfocable). Al pulsarlo no envía
nada, muestra «Debes aceptar los términos y la política de privacidad para crear tu
cuenta.» y enfoca la casilla. Los textos siguen el tuteo del resto de la interfaz.

## Términos, privacidad y consentimiento

No existen rutas ni documentos de Términos o Política de privacidad. No se redactó
texto legal. Los enlaces usan contenido existente (`ENLACES_LEGALES`):
«Términos y condiciones» → `/ayuda` (normas de uso, pagos, cancelaciones y
reembolsos) y «Política de privacidad» → `/ayuda#privacidad`. **Pendiente:** el
contenido legal definitivo y, si se desea, rutas propias.

El contrato de registro rechaza campos desconocidos (`SinCamposDesconocidosMixin`) y
no tiene aceptación, fecha ni versión. Por eso el frontend exige la aceptación pero
**no la persiste ni la envía**. No hay trazabilidad del consentimiento. Si se necesita
evidencia legal, queda como posible requerimiento de backend posterior. No se tocaron
backend ni OpenAPI.

## Cuenta

Comprador: rol y «Datos personales» con nombre («Lo verán las personas con quienes
tengas solicitudes, pedidos o mensajes») y teléfono de acceso («Lo usas para iniciar
sesión y no se muestra a otras personas»). El artesano además ve «Mi taller» antes del
formulario, aclarando que nombre del taller, fotos, ubicación y contactos públicos se
editan allí, con «Editar Mi taller». Se conservan la contraseña actual condicional, el
envío único, `autoComplete`, el foco al primer error de React Hook Form y los errores
del servidor por campo. «No hay cambios que guardar.» pasa a ser un estado neutro, y
«Cambios guardados.» solo aparece tras la respuesta del servidor.

## Perfil privado del taller

Secciones visuales sobre el mismo `PATCH`: Identidad (nombre, rubro), Presentación
(historia con 5 filas y ayuda breve, horario como texto libre con ejemplo), Fotos,
Dirección (dirección + sección de ubicación) y Contacto público. Una nota inicial
explica qué verán los compradores y que la ubicación solo se muestra si se activa. Para
un taller no aprobado agrega «cuando la administración lo apruebe». Los obligatorios se
anuncian una vez y los opcionales llevan «(opcional)».

Imágenes (`campo-imagen-taller.tsx`): «Foto del taller» y «Imagen de portada» con vista
previa de la actual, acción con texto y estado de lo elegido. Un archivo inválido
muestra el motivo, marca el control y no reemplaza la imagen guardada ni una selección
válida anterior. Se conservan formatos, 5 MiB, validación, endpoint y `FormData`. No hay
cropper ni dependencias nuevas.

Cancelar con cambios pendientes pide confirmación (`ConfirmAction`). Al editar un campo
desaparece su error. Ante un error 400 o de red, el formulario sigue montado y conserva
textos, imágenes y pin. Mientras carga se muestra un skeleton y el formulario no se
renderiza vacío. No se agregó bloqueo de navegación: solo «Cancelar» descartaba en
silencio, y ahora confirma.

## Geolocalización dentro de los formularios

No se modificaron búsqueda, GPS, Leaflet ni su carga diferida, redondeo, privacidad,
payload ni textos de la sección. Único cambio: su mensaje de error es enfocable
(`tabIndex=-1`, `data-error-foco`) para recibir el foco al mostrar errores, porque no
tiene control propio. En registro, la ubicación tiene su paso con la dirección escrita
como referencia. En el perfil va junto a la dirección. Mapa medido: 250×286 px a 360,
280×286 a 390, 322–770×382 desde 768. No hay inputs de latitud/longitud.

## Accesibilidad y errores

`Campo` asocia label/`htmlFor`, `required`, `aria-invalid` y `aria-describedby` (error +
ayuda) también en el `textarea`. `useEnfocarPrimerError` enfoca el primer
`[aria-invalid=true]` o `[data-error-foco]` y lo desplaza a la vista, respetando
`prefers-reduced-motion`. Al cambiar de paso, el foco va al título del paso. Las
previews tienen `alt`, los botones «Editar» de la revisión tienen nombre propio y los
enlaces legales anuncian que abren otra pestaña. La casilla y el switch están en filas
táctiles de 44 px.

## Validación con Django + PostgreSQL reales

PostgreSQL 16 local temporal, migraciones existentes, Django en 8000 y Vite en 5173 con
`VITE_AUTH_API=real` y `VITE_CATALOGO_API=real`. Chromium (Playwright) sin interceptar
la API:

- Comprador (390 px): flechas en el radiogroup; paso 2 vacío → errores y foco en
  nombre; contraseñas distintas → foco en confirmación; Atrás conserva valores
  (contraseñas incluidas); abrir «Política de privacidad» no marca la casilla; crear
  sin aceptar → bloqueado, sin `POST`; aceptar → un `POST` y sesión. «Mi cuenta»: nombre
  vacío enfocado, guardar, «Cambios guardados.», recargar y verificar persistencia.
- Error del servidor (360 px): teléfono duplicado enviado desde la revisión → vuelve al
  paso 2 con «Ya existe una cuenta con este teléfono.» enfocado y conserva los datos.
- Artesano (360 px): errores del taller enfocados, teléfono público inválido, pin en el
  mapa y publicación; Atrás hasta el tipo, cambio a comprador y vuelta conservando
  datos, taller y ubicación; un `POST` sin `rol` ni aceptación y con
  `ubicacion_publica: true`. Aprobación con el servicio existente `aprobar_taller`.
- Perfil: errores locales enfocados; PNG válido y luego `.txt` → motivo visible y
  selección conservada; portada; Cancelar con cambios → confirmación; guardar → un
  único `PATCH` y «Cambios guardados.»; recargar conserva los valores. Perfil público
  anónimo con los datos nuevos, sin teléfono de acceso ni nombre de la cuenta.
- Responsive 360, 390, 768, 1024 y 1440: sin scroll horizontal en ningún paso del
  registro, «Mi cuenta» ni el perfil. «Guardar cambios» siempre visible gracias al pie
  fijo. Nombres y direcciones largos hacen salto de línea. El teclado virtual se
  aproximó con viewport de 740 px de alto, sin teclado físico.

Se retiraron las 5 cuentas temporales, sus talleres y archivos subidos. No había usuarios
preexistentes.

## Pruebas

`scripts/check-cuenta-registro-ux.mjs` (16 grupos): `Campo` (label, required, opcional,
ayuda/error, textarea); pasos por rol; validación por paso; aceptación obligatoria
fuera del payload; error del servidor → paso; cambio de rol; radiogroup y progreso;
paso de datos (autocomplete, privacidad, reglas de contraseña); revisión sin contraseña
con casilla desmarcada y enlaces; «Crear cuenta» solo al final y bloqueado; un único
envío sin almacenamiento del navegador; cuenta pública/privada; secciones del perfil;
imagen con error; foco al primer error. Se ajustaron `check-auth-ui`,
`check-geolocalizacion-registro` (renderiza el paso correspondiente con `pasoInicial`)
y `check-taller-propio` a los nuevos textos y pasos, sin rehacer sus suites.

## Performance

Sin dependencias nuevas, consultas adicionales ni refetch al escribir. Se mantienen la
caché y las mutaciones. El mapa sigue diferido y en el registro solo se monta en su
paso. Chunk principal 639,30 → 656,68 kB (181,67 → 186,49 kB gzip, +4,8 kB): el registro
y la cuenta están en el chunk inicial y el Checkbox de Radix entra por primera vez. Se
conserva la advertencia existente de chunks mayores de 500 kB.

## Pendientes

- Contenido legal definitivo de Términos y Privacidad, y persistencia o trazabilidad del
  consentimiento en el backend si se requiere evidencia.
- La variante demo de `/panel/perfil` (`panel-perfil.tsx`) no se modificó.
- Cambiar de pestaña «Ingresar/Crear cuenta» desmonta el registro (comportamiento previo).
- Faltan pruebas con personas usuarias, lectores de pantalla reales y teclado móvil
  físico. No se afirma validación con personas mayores.
