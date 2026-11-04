# Despliegue de ArtesaNic en Render (CD)

## Estado y coste

Este diseño **no es gratuito**: el servicio web usa un plan Starter con disco
persistente, PostgreSQL usa un plan de pago y hay un cron job. Comprobar el
importe en Render antes de crear el Blueprint. Los servicios ya existentes de
la cuenta no se modifican. La rama `main` sigue sin desplegarse mientras no se
configure el Blueprint en el panel.

## Arquitectura

Un mismo contenedor Docker sirve el build de React y Django a través de Nginx,
bajo el mismo origen HTTPS. Se evitan cookies cross-site. La API y el admin
pasan por Gunicorn; los archivos públicos se sirven desde `/var/data/media`,
y **ningún** endpoint público puede leer directamente
`/var/data/private_media`, donde se almacenan comprobantes. Ambas carpetas
comparten un solo disco persistente Render. PostgreSQL es administrado y usa la
red privada de Render. Un cron job separado ejecuta vencimientos cada 5 min.

Docker Compose y sus Dockerfiles de desarrollo no cambian.

## Configuración inicial

1. Fusionar el PR solo después de que el CI termine correctamente.
2. Abrir Render > New > Blueprint y seleccionar este repositorio y `render.yaml`.
3. Revisar expresamente los cargos de servicios, disco y PostgreSQL antes de
   aprobar la creación. No utilizar PostgreSQL gratuito para datos reales.
4. Verificar que el servicio web reciba las referencias a la BD y
   `RENDER_EXTERNAL_HOSTNAME`; confirmar que la URL sea la asignada por Render.
5. Abrir `https://<hostname>/api/v1/salud/`, cargar el catálogo y probar
   registro, inicio, refresco y cierre de sesión, subida de fotos y comprobantes
   privados con perfiles autorizados y no autorizados.
6. Crear una cuenta administrativa mediante el mecanismo seguro de gestión del
   proyecto (no usar contraseñas en la línea de comandos ni guardarlas en Git).
7. Verificar en la consola de Render la migración de esquema en pre-deploy y
   la ejecución del cron cada cinco minutos.
8. Configurar backups regulares de la base de datos Y del disco de archivos.
   Probar periódicamente la restauración de ambos antes de recibir ventas reales.
9. Configurar alertas de errores, crecimiento del disco, uso de BD y caídas.

## CD

El Blueprint establece `autoDeployTrigger: checksPass` para desplegar `main`
solo cuando GitHub complete las verificaciones. Los workflows actuales de
backend, frontend e integración se mantienen. Un PR no despliega producción:
revisar sus checks y fusionar a `main`.

El servicio web tiene disco persistente: los despliegues no son de cero
interrupciones y la instancia no puede escalar horizontalmente con ese disco.
Cuando se requieran múltiples instancias, migrar imágenes públicas y
comprobantes privados a almacenamiento de objetos con controles de acceso
estrictos, antes de retirar el disco.

## Consideraciones de seguridad

- Las cookies JWT/CSRF permanecen en origen único, `Secure` y `SameSite=Lax`.
- La variable `DJANGO_SECRET_KEY` se genera en Render y nunca va al repositorio.
- No exponer directorios privados por Nginx ni acceso externo a PostgreSQL.
- Render utiliza el hostname público de `onrender.com` en sus peticiones
  HTTP de salud y considera sanas las respuestas 2xx y 3xx. Si la sonda llega
  en HTTP, Django puede responder 301 hacia HTTPS y eso **es aceptado** por
  Render. Un Host desconocido sí produce 400: validar el hostname real
  durante el primer despliegue, sobre todo al usar dominios personalizados.
- El endpoint de salud es de disponibilidad del proceso, no verifica conexión
  a la base de datos: monitorizar la BD por separado.
- La configuración valida el dominio automático de Render. Antes de agregar
  dominio propio, extender explícitamente ALLOWED_HOSTS, CORS y CSRF.
- Para que el rate limiting identifique al cliente, Nginx descarta la cadena
  `X-Forwarded-For` entrante y transmite solo `CF-Connecting-IP` (cabecera que
  Cloudflare sobrescribe en Render). El servicio web fija
  `DJANGO_NUM_PROXIES=1`; así DRF usa ese valor en lugar de la IP local de Nginx.
  Si la cabecera falta, Nginx omite XFF y DRF usa `REMOTE_ADDR` como reserva.
  Verificar en Render dos clientes reales con IP distinta y el caso de una
  cabecera XFF falsificada antes de habilitar usuarios.
- Los limitadores de intentos usan caché local; con dos workers Gunicorn
  los contadores NO se comparten entre procesos. Para aplicar límites globales
  debe incorporarse caché compartida (por ejemplo, Render Key Value).

## Validación local de la configuración de producción

Se necesita Docker local y las credenciales de prueba. No probar contra la
base real. Para verificar sintaxis del Blueprint usar Render CLI:
`render blueprints validate render.yaml` (CLI compatible).

El archivo `infra/docker/render.Dockerfile` está separado del
`infra/docker/backend.Dockerfile` de desarrollo.

## Limitaciones pendientes de revisión

- Comprobar que las pruebas de seguridad, almacenamiento y autorización funcionen
  en la URL final antes de abrir acceso a usuarios.
- Verificar en el panel que el cron job use su propio build Docker y no ejecute
  servidores HTTP.
- El ID `0.1c-256mb` figura como plan válido de PostgreSQL en la documentación
  oficial de Render; esto **no sustituye** validar el Blueprint y confirmar
  precio, región y disponibilidad antes de activarlo.
- Validar la configuración de dominios personalizados si se agrega uno.
