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
- El endpoint de salud es de disponibilidad del proceso, no verifica conexión
  a la base de datos: monitorizar la BD por separado.
- La configuración valida el dominio automático de Render. Antes de agregar
  dominio propio, extender explícitamente ALLOWED_HOSTS, CORS y CSRF.
- Los limitadores de intentos usan caché local; para múltiples workers o
  instancias se debe incorporar caché compartida para que el control sea global.

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
- Confirmar precio y disponibilidad del plan de disco/Postgres antes de activar.
- Validar la configuración de dominios personalizados si se agrega uno.
