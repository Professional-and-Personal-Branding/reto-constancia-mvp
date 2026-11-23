# Runbook: desplegar Reto de Constancia en Seenode (variante de un servicio)

**Destino:** un Web Service Basic de Seenode (API NestJS y web Next.js en el mismo contenedor) + PostgreSQL Basic administrado + Cloudinary. Costo: **8 USD por mes** (4 + 4), más Cloudinary gratuito.

**Estado al 2026-11-16:** sin desplegar. Este documento **no reemplaza** a [`../runbook-despliegue.md`](../runbook-despliegue.md) (operación, prueba de humo, incidentes, variables) ni a [`../deploy-seenode.md`](../deploy-seenode.md) (pantallas de Seenode): agrega la **validación previa en el período de prueba** y las diferencias de la variante de un servicio. La decisión está en [DECISION-DESPLIEGUE.md](DECISION-DESPLIEGUE.md). Todo cambio de código de abajo es un cambio OpenSpec que el owner aprueba antes (spec primero).

| Símbolo    | Quién lo hace                                                                 |
| ---------- | ----------------------------------------------------------------------------- |
| **Vos**    | El owner: cuentas, inicios de sesión, medios de pago, secretos y consolas web |
| **Claude** | Un agente, cuando se lo pidas, con tu confirmación antes de cada despliegue   |

## Reglas de corte

Parate y no sigas si pasa algo de esto:

1. **Seenode no ofrece PostgreSQL 16.** Se pasa al plan B (VPS con Docker Compose) y se reabre la decisión.
2. **No hay acceso externo a la base con control de origen** (lista de IP o, al menos, SSL obligatorio), o `node scripts/db-backup.mjs` desde tu máquina no termina en `OK`. Sin respaldo verificado no se migra ni se cargan datos reales.
3. **Las pruebas de la fase 1 pasan del tope de 10 USD:** el plan Basic no alcanza (RAM, CPU, 750 MB de disco o memoria del build) y hace falta Standard (11 USD en total).
4. **Hay que cargar tarjeta antes de terminar la fase 1**, o el panel pide un plan que no estaba previsto.
5. **Aparece un secreto o un dato real** en un archivo versionado, en un comando guardado en el historial o en un chat.
6. **Una verificación de seguridad de la fase 5 da otro resultado** (por ejemplo, Swagger accesible o cabeceras ausentes).

No cargues datos reales hasta terminar la fase 7 con datos ficticios.

## Valores que vas a necesitar

| Valor                                                                  | Forma                                                                              | Dónde vive                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| URL de la aplicación                                                   | `https://<servicio>.seenode.app`                                                   | Seenode                             |
| `DATABASE_URL`                                                         | privada para la aplicación, con `?schema=public&connection_limit=5`; pública solo para respaldos | Panel de Seenode (secreto) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`                                     | cadenas aleatorias distintas                                                       | Panel de Seenode (secreto)          |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | los da Cloudinary                                                                  | Panel de Seenode (secreto)          |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                              | del primer administrador; rotar tras el primer ingreso                             | Panel de Seenode (secreto)          |
| `TRUST_PROXY`                                                          | saltos de proxy de confianza delante de la API: `1` (el borde de Seenode; Next no añade el suyo) por omisión del supervisor; **pendiente de medir en la fase 1** | Panel de Seenode (opcional)         |
| `PORT`                                                                 | no lo inyecta Seenode: el puerto se fija en el panel (3000)                        | Panel de Seenode                    |
| `NODE_ENV`                                                             | `production`                                                                       | Panel de Seenode                    |
| `CORS_ORIGIN`                                                          | la URL de la aplicación (mismo origen en esta variante)                            | Panel de Seenode                    |
| `NEXT_PUBLIC_API_URL`                                                  | `/api` (entra al navegador en el build; no es secreta; `build-prod.mjs` la usa por omisión) | Panel de Seenode, variable de build |
| `SWAGGER_ENABLED`                                                      | ausente o `false`                                                                  | Panel de Seenode                    |

Los comandos usan Bash desde la raíz del repositorio.

```bash
BASE=https://<servicio>.seenode.app
```

## Fase 0: repositorio listo (Claude)

1. Comprobar que no hay secretos ni datos reales: `node scripts/scan-secrets.mjs`.
2. Confirmar que la batería está en verde: `node scripts/run-tests.mjs` (14/14).
3. Confirmar que la versión a desplegar está en `main` con su tag.
4. Visibilidad del repositorio: hoy es **público** (`gh repo view --json isPrivate` da `false`). Es aceptable solo porque el repositorio no lleva secretos ni datos reales (los controla `scan-secrets.mjs` en la CI); los datos sensibles viven en la base y en Cloudinary. Si el owner prefiere un repositorio privado, hay que confirmar que Seenode lo despliega en su plan.

```bash
node scripts/scan-secrets.mjs
```

```bash
node scripts/run-tests.mjs
```

**Terminada cuando:** la batería da 14/14 y el escaneo no encuentra nada.

## Fase 1: validar los supuestos en el período de prueba (Vos)

El trial de 7 días de Seenode no pide tarjeta. Crear la cuenta, autorizar GitHub sobre el repositorio y crear **primero la base**; la aplicación se crea después.

| #   | Comprobación                                                                                                                                                | Resultado esperado                                                       | Si falla                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 1   | Al crear PostgreSQL, elegir versión 16                                                                                                                      | La versión 16 existe                                                     | Regla de corte 1                                            |
| 2   | Activar el acceso público a la base y ver si admite lista de IP o SSL obligatorio                                                                           | Control de origen disponible                                             | Regla de corte 2                                            |
| 3   | Desde tu máquina, con la cadena pública de la base **cargada en tu entorno, no en un archivo**: `node scripts/db-backup.mjs` (el script usa `DATABASE_URL`) | Termina en `OK` con restauración verificada                              | Regla de corte 2                                            |
| 4   | Cerrar el acceso público (o dejar solo tu IP) cuando termine                                                                                                | Sin acceso abierto a internet                                            | Dejar la base sin acceso público                            |
| 5   | Medir el build y el arranque del servicio Basic con la variante de un servicio (Build `npm run build`, Start `npm start`; anotar tiempo de build, disco medido con `du` y pico de memoria) | Compila sin quedarse sin memoria; el arranque no pasa de 750 MB de disco. Referencia **local** (Docker, no es Seenode): disco 540 MB (backend 171 + frontend 369), pico de 130 a 132 MiB de 512 | Regla de corte 3                                            |
| 6   | Medir un login y la carga del panel con 0,2 CPU (argon2); medir también los saltos de proxy de Seenode (`TRUST_PROXY`, fase 5 fila 6)                       | Respuestas de segundos, sin reinicios                                    | Regla de corte 3 (CPU); saltos distintos de 1: ajustar `TRUST_PROXY` en el panel |
| 7   | Ver en el panel cómo se redespliega un commit anterior                                                                                                      | Existe «redeploy» de un commit concreto                                  | Documentar la alternativa (PR de revert a `main`); no corta |
| 8   | Confirmar en la página de precios y en el panel que el trial no pide tarjeta y qué pasa al terminar                                                         | Sin tarjeta hasta cargar créditos                                        | Regla de corte 4                                            |
| 9   | Correr `npm run seed:prod` en la shell del servicio de Seenode (con la `DATABASE_URL` interna) | Crea el administrador sin `ts-node` y el login funciona | Si falla, corregir el seed antes de abrir la URL |

Los supuestos que solo esta fase puede cerrar: PostgreSQL 16 (fila 1), acceso externo con control de origen (2 y 3), 0,5 GB de RAM y 0,2 CPU (5 y 6) y reversión por redespliegue (7, con alternativa).

**Terminada cuando:** las filas 1 a 9 están resueltas y registradas en el Registro de la fase 1 (al final del documento), cada una con fecha y resultado.

## Fase 2: código de la variante de un servicio (Claude, tras la aprobación del owner)

Implementada por el cambio OpenSpec `single-service-deploy` (`openspec/changes/single-service-deploy/`, ya fusionado en `develop`; sale con la release 1.16.0, objetivo): supervisor `scripts/start-prod.mjs`, build `scripts/build-prod.mjs`, `package.json` de la raíz (`npm run build` / `npm start`), reescritura `/api/*` y cabeceras de seguridad en `frontend/next.config.mjs`, `connection_limit=5` y `TRUST_PROXY=1` por omisión. Reproducción local sin Seenode: `Dockerfile.single-service` y `node scripts/single-service-smoke.mjs <url>`.

**Terminada cuando:** la batería pasa y una corrida local del contenedor responde `/api/health` y `/` y devuelve `429` al sexto intento de login por minuto desde un mismo cliente (y no para otro). **Hecho en local** (Docker, 2026-11-18; ver `docs/testing.md` §6): `OK` con `TRUST_PROXY=1`; falla el caso esperado con `0` y con `2`.

## Fase 3: secretos (Vos)

Nunca pongas estos valores en un archivo versionado, en el repositorio ni en un chat. Se cargan en el panel de Seenode.

Seenode se maneja desde el panel web: la lista de variables de entorno del servicio muestra los nombres y oculta los valores.

**Terminada cuando:** la lista del panel muestra todos los nombres de la tabla de arriba y, tras el primer arranque, `/api/health/db` responde `200` (la API arrancó con una `DATABASE_URL` válida y con `JWT_*_EXPIRES_IN` correctos).

## Fase 4: primer despliegue (Claude, con tu confirmación)

1. Crear el Web Service desde la rama `main`: Root Directory = la raíz del repositorio, Build `npm run build`, Start `npm start`, puerto 3000, health check `/api/health` (pantallas en [`../deploy-seenode.md`](../deploy-seenode.md) §2).
2. Antes de la primera migración: respaldo verificado (fase 1, fila 3).
3. Dejar que el servicio arranque; el supervisor (`scripts/start-prod.mjs`) aplica `prisma migrate deploy`, arranca la API y después la web.

**Terminada cuando:** el panel muestra la URL y `curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/health` imprime `200`.

## Fase 5: verificación sin login (Claude)

| #   | Comprobación                                            | Resultado esperado                                                                                                                                                              |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | La web                                                  | `200`                                                                                                                                                                           |
| 2   | La base, vía `/api/health/db`                           | `200`                                                                                                                                                                           |
| 3   | Una ruta protegida sin sesión                           | `401`                                                                                                                                                                           |
| 4   | Swagger apagado                                         | `404`                                                                                                                                                                           |
| 5   | Cabeceras de seguridad de la web y de la API            | Presentes: `x-content-type-options`, `strict-transport-security` y la de marcos (`x-frame-options` o CSP). Si la web de Next no las envía, agregarlas en el cambio de la fase 2 |
| 6   | Límite de login por cliente detrás del proxy de Seenode | Con **dos redes distintas** (p. ej. tu conexión y un teléfono con datos móviles): el sexto intento de la red A da `429` y la red B no. Con una **cabecera falsificada** (`-H "X-Forwarded-For: 198.51.100.9"`) desde la red A ya bloqueada, sigue dando `429`. Si falla uno, ajustar `TRUST_PROXY` (saltos del proxy; pendiente de medir en la fase 1) |
| 7   | Superficies por omisión: URLs de vista previa y paneles | Seenode no deja una URL de vista previa pública sin decidirlo; el acceso público a la base está cerrado                                                                         |

```bash
curl -s -o /dev/null -w "%{http_code}\n" $BASE/
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/health/db
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/activities/me
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/docs
```

```bash
curl -sI $BASE/
```

El login de la fila 6 se prueba con un usuario ficticio y una contraseña incorrecta, para no depender de un acceso real. Desde la red A:

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"nadie@example.com","password":"incorrecta"}'; done
```

Esperado: `401` cinco veces y `429` la sexta. Justo después, desde la red B (misma instrucción, un solo intento): no da `429`. Y desde la red A, aún bloqueada, con la cabecera falsificada: sigue en `429`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -H "X-Forwarded-For: 198.51.100.9" -d '{"email":"nadie@example.com","password":"incorrecta"}'
```

Es la prueba de la parte de la plataforma (qué hace el borde de Seenode con `X-Forwarded-For`); la parte de Next la fija `node scripts/single-service-smoke.mjs` en local. Resultado de las dos redes en Seenode: **pendiente de medir en la fase 1** (anótalo en el Registro de la fase 1).

**Regla de corte:** si la 3, la 4, la 5 o la 6 no coinciden, parate (regla 6).

## Fase 6: servicios externos (Vos)

Cloudinary: crear el cloud en el plan gratuito y verificar una subida firmada. Orígenes: `CORS_ORIGIN` igual a la URL de la aplicación (en la variante de un servicio es el mismo origen).

Comprobación de CORS: con el navegador en `$BASE`, la subida de la foto de prueba no debe mostrar errores de CORS en la consola, y en una pestaña desde otro origen la API debe rechazar la petición.

**Terminada cuando:** una foto de prueba se sube y se ve en la actividad, y la consola del navegador no muestra errores de CORS.

## Fase 7: prueba con datos ficticios (Vos y Claude)

Solo datos inventados.

| #   | Prueba                                                                              | Resultado esperado                                        |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Crear un reto, inscribir dos participantes, subir una actividad con foto, validarla | Pasa de punta a punta                                     |
| 2   | Segundo dispositivo, otra cuenta                                                    | Ve solo lo suyo                                           |
| 3   | **Peor caso de carga:** cierre de reto con unas decenas de participantes            | Termina dentro de los límites de RAM y CPU, sin reinicios |
| 4   | Recargar y reiniciar el servicio desde el panel                                     | Los datos siguen                                          |

**Terminada cuando:** todas pasan. Borrá los datos ficticios antes de seguir.

## Fase 8: datos reales (Vos)

No hay una migración de datos desde otra plataforma: el proyecto parte de cero, así que esta fase no tiene comparación contra un origen. El administrador entra con `SEED_ADMIN_*`, cambia la contraseña y da de alta el primer reto real.

**Terminada cuando:** el primer respaldo con datos reales se guardó cifrado **fuera de Seenode** y se restauró en un entorno limpio.

## Publicar una actualización

1. Correr las pruebas y el build.
2. Si la versión trae migración (la 1.15.0 sí), correr `node scripts/db-backup.mjs` y confirmar `OK` **antes** de desplegar.
3. Flujo de ramas: `release/X.Y.Z` → PR a `main` (lo fusiona el owner) → el servicio despliega `main`. Esperar a que el panel muestre el despliegue terminado, comprobar que corre el commit del tag y repetir la fase 5.
4. Versionar: CHANGELOG, tag anotado `vX.Y.Z`, back-merge a `develop`.

Detalle y prueba de humo: [`../runbook-despliegue.md`](../runbook-despliegue.md) §2 y §3.

## Volver atrás

**Código.** Redesplegar desde el panel el commit del tag anterior (si la fase 1, fila 7, lo confirmó) o fusionar un PR de revert a `main`. No se mueve `main` a la fuerza, por el gitflow del proyecto. No revierte la base.

**Base de datos.** Las migraciones son aditivas: redesplegar la versión anterior sobre el esquema nuevo funciona. Si una migración no lo fuera: restaurar el `.dump` verificado, o el respaldo diario de Seenode (en el lugar, que **pierde los datos posteriores**, o en una base nueva, que obliga a cambiar `DATABASE_URL`). Antes de restaurar, tomá un respaldo del estado actual.

**Aplicación fuera de servicio.** Sin servicio no hay uso, pero los datos quedan en la base y las fotos en Cloudinary.

## Respaldos

| Respaldo                        | Cuándo                                   | Cubre                             | Límite                                                                         |
| ------------------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| Diario de Seenode (7 retenidos) | Automático                               | La base                           | Vive en la misma plataforma; no cuenta como respaldo verificado                |
| `node scripts/db-backup.mjs`    | Antes de cada migración y una vez al mes | La base, con restauración probada | Necesita acceso externo a la base; guardar el `.dump` cifrado fuera de Seenode |
| Cloudinary                      | Continuo                                 | Las fotos                         | Plan gratuito del proveedor                                                    |

Una vez por mes, restaurá un respaldo en un entorno limpio y comprobá que abre. Un respaldo que nunca se probó no cuenta. El procedimiento de restauración exacto (`pg_restore`) está en [`../runbook-despliegue.md`](../runbook-despliegue.md) §5.1.

## Límites del plan

Al agotarse los créditos, Seenode **detiene el servicio** (no hay plan gratuito permanente para servicios ni bases).

| Recurso                      | Límite           | Acción                                                                                    |
| ---------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| RAM / CPU del servicio Basic | 0,5 GB / 0,2 CPU | Si hay reinicios por memoria, pasar a Standard (7 USD): total 11 USD, reabrir la decisión. Topes de heap por omisión: API 224 MB, web 160 MB, build 400 MB (`API_MAX_OLD_SPACE_MB`, `WEB_MAX_OLD_SPACE_MB`, `BUILD_MAX_OLD_SPACE_MB`) |
| Disco del servicio           | 750 MB           | El build imprime tamaños por suma de archivos (140 + 337 MB); el disco real se mide con `du` (540 MB)                         |
| Conexiones a la base         | 20               | `connection_limit=5` en `DATABASE_URL`                                                    |

Mediciones del servicio único (cada una se anota en el Registro de la fase 1):

| Medición                         | Referencia local (Docker `--memory=512m --cpus=0.2`, 2026-11-18; **no es Seenode**) | En Seenode |
| -------------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| Disco (`backend/` + `frontend/`) | 540 MB: backend 171 + frontend 369                                                   | pendiente de medir en la fase 1 |
| Memoria en uso                   | pico de 130 a 132 MiB de 512 (118 MiB en reposo)                                      | pendiente de medir en la fase 1 |
| Tiempo de build                  | 231 s en la máquina del owner (no comparable con el builder de Seenode)              | pendiente de medir en la fase 1 |
| Login y panel con 0,2 CPU        | sin reinicios en la prueba de humo                                                   | pendiente de medir en la fase 1 |
| Saltos de proxy de Seenode       | 1 en local, con el script haciendo de borde                                          | pendiente de medir en la fase 1 |
| PostgreSQL 16                    | Postgres 16 local                                                                    | pendiente de medir en la fase 1 |
| Acceso externo a la base y `db-backup.mjs` `OK` | no aplica                                                             | pendiente de medir en la fase 1 |
| Redeploy de un commit anterior   | no aplica                                                                            | pendiente de medir en la fase 1 |
| `npm run seed:prod` en la shell del servicio | no aplica                                                                            | pendiente de medir en la fase 1 |
| Almacenamiento de la base    | 1 GB             | Revisar cada mes; Standard de base: 12 USD                                                |
| Saldo de créditos            | el que cargues   | Cargar con margen y revisar mensualmente                                                  |

## Mantenimiento

| Tarea                                               | Frecuencia                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Guardar y probar un respaldo (`db-backup.mjs`)      | Antes de cada migración y una vez al mes                               |
| Actualizar dependencias, en local primero           | Cada release                                                           |
| Revisar precios y planes de Seenode                 | Cada trimestre                                                         |
| Rotar `JWT_*` y la contraseña del administrador     | Cada 6 meses, o ante una sospecha                                      |
| Limpieza mensual del almacenamiento y acta del reto | Ver [`../runbook-despliegue.md`](../runbook-despliegue.md) §5.3 y §5.4 |

## Problemas frecuentes

| Síntoma                               | Causa probable                                        | Qué hacer                                                        |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Todos reciben `429` al iniciar sesión | `TRUST_PROXY` mal ajustado: la API ve la IP del proxy | Corregir el valor y repetir la fase 5, fila 6 |
| El servicio se reinicia solo          | Memoria agotada (0,5 GB)                              | Ver los registros del panel; reglas de corte 3                   |
| El build falla sin mensaje            | Falta de memoria al compilar                          | Ajustar `BUILD_MAX_OLD_SPACE_MB` (400 por omisión) o precompilar |
| `db-backup.mjs` no se conecta         | Acceso público apagado o tu IP cambió                 | Actualizar la lista de IP en el panel, correr, y volver a cerrar |
| Las fotos no suben                    | `CLOUDINARY_*` ausentes: el backend cae al modo local | Cargar las tres variables y redesplegar                          |

Para ver los errores de producción: pestaña de registros del Web Service en el panel de Seenode.

## Salir de Seenode

La salida es estándar: `pg_dump --format=custom` (lo que ya hace `db-backup.mjs`), Node 20 y los Dockerfile del repositorio (`Dockerfile.single-service` para el servicio único; `backend/Dockerfile` para la API sola). Se lleva la base, el repositorio y las fotos (en Cloudinary del owner); se pierde la URL `*.seenode.app` y hay que cambiar `CORS_ORIGIN`. El plan B es un VPS con Docker Compose: ver [DECISION-DESPLIEGUE.md](DECISION-DESPLIEGUE.md). Irreversible: borrar la base o la cuenta de Seenode sin una copia probada.

## Cierre del despliegue

- [ ] Fase 0: repositorio listo.
- [ ] Fase 1: los siete supuestos validados y registrados.
- [ ] Cambio OpenSpec de la variante aprobado y aplicado (fase 2).
- [ ] Fases 3 a 6 completas.
- [ ] Prueba con datos ficticios superada (fase 7).
- [ ] Datos reales cargados; primer respaldo guardado fuera de Seenode y restaurado.
- [ ] Recordatorio mensual de respaldo creado.

## Registro de la fase 1

| Fecha | Comprobación | Resultado |
| ----- | ------------ | --------- |
|       |              |           |
