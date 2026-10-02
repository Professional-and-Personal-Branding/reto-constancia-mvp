# Runbook de despliegue — Reto de Constancia

Procedimiento operativo para poner la plataforma en producción, publicar versiones nuevas,
revertir y atender incidentes. El detalle de cada pantalla de Seenode está en
[`deploy-seenode.md`](./deploy-seenode.md); aquí está el orden, los controles y las decisiones.

| | |
|---|---|
| **Versión de referencia** | `v1.2.0` (tag sobre `main`) |
| **Plataforma** | Seenode: 2 Web Services (API NestJS, web Next.js) + PostgreSQL administrado; Cloudinary para fotos |
| **Rama que se despliega** | `main` (solo llega por PR de `release/*`, ver `gitflow.md`) |
| **Duración estimada** | Primer despliegue: 60–90 min. Versión nueva: 15–20 min |
| **Quién** | Responsable del despliegue (ejecuta) y administrador del reto (verifica la app) |

> Las versiones que incluyen NestJS 11 (PR #30) instalan `xlsx` desde `cdn.sheetjs.com` y
> validan `JWT_*_EXPIRES_IN` al arrancar. Ambos puntos están cubiertos en los pasos de abajo.

---

## 0. Antes de empezar (todas las veces)

Sin estos puntos en verde **no se despliega**.

- [ ] El commit a desplegar es un tag `vX.Y.Z` sobre `main` y su CI está en verde
      (Backend, Frontend y E2E de UI).
- [ ] Batería local en verde sobre ese commit, desde una base reiniciada:
  ```bash
  cd backend && npx prisma migrate reset --force
  cd .. && node scripts/run-tests.mjs              # todos los pasos OK
  node scripts/validate-test-cases.mjs              # todos los casos aprobados
  ```
- [ ] `npm audit --omit=dev` sin avisos en `backend/` y `frontend/`.
- [ ] Leída la sección de la versión en `CHANGELOG.md`, en especial **Cambiado** y
      **Antes de desplegar** del PR de release: variables nuevas, migraciones, cambios de
      comportamiento.
- [ ] Hay ventana acordada con el administrador del reto (idealmente fuera del horario en que
      los participantes suben su actividad del día).
- [ ] Respaldo de la base reciente (ver §5.1) si la versión trae migraciones.

---

## 1. Primer despliegue (una sola vez)

### 1.1 Cuentas y secretos

- [ ] Cuenta de Seenode con GitHub autorizado sobre el repositorio.
- [ ] Cuenta de Cloudinary: `cloud name`, `api key`, `api secret`.
- [ ] Dos secretos JWT **distintos**, generados al azar:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- [ ] Contraseña fuerte para el administrador inicial (`SEED_ADMIN_PASSWORD`).
- [ ] Guarda todo en el gestor de secretos del equipo, nunca en el repositorio ni en chats.

### 1.2 Base de datos

1. Seenode → **Databases** → **Create database** → PostgreSQL.
2. Copia la connection string de **red privada**; termina en `?schema=public`.
3. Activa los respaldos automáticos del plan, si el tier los ofrece.

**Control:** la cadena apunta a la red privada, no a la pública.

### 1.3 API (Web Service `backend`)

| Campo | Valor |
|---|---|
| Rama | `main` |
| Root Directory | `backend` |
| Node | 20 o 22 (el proyecto exige `>=20 <23`) |
| Build Command | `npm install && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && node dist/main.js` |
| Port | `3000` |
| Health check | `/api/health` |

Variables (ver la referencia completa en §7):

- **Obligatorias:** `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`, `API_PREFIX=api`, `PORT=3000`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER=reto-constancia`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`.
- **`CORS_ORIGIN`:** se completa en 1.5, cuando exista la URL de la web.

**Controles:**

- [ ] El build termina sin errores. Si falla al instalar `xlsx`, el servidor de build no
      llega a `cdn.sheetjs.com` (ver §6).
- [ ] Los logs del arranque muestran `migrate deploy` sin migraciones pendientes y luego la
      API escuchando.
- [ ] `https://<api>/api/health` responde `{"status":"ok",…}`.
- [ ] `https://<api>/api/health/db` responde `"db":"up"`.

### 1.4 Web (Web Service `frontend`)

| Campo | Valor |
|---|---|
| Rama | `main` |
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Start Command | `npx next start -p 3000` |
| Port | `3000` |
| Variable | `NEXT_PUBLIC_API_URL=https://<api>/api` |

`NEXT_PUBLIC_API_URL` se incrusta en el build: si cambia, hay que **volver a compilar**; no
alcanza con reiniciar.

### 1.5 Conectar web y API

1. En la API: `CORS_ORIGIN=https://<web>` (sin barra final) → redeploy.
2. Shell del servicio API → crear el administrador:
   ```bash
   npx prisma db seed
   ```
   En producción el seed **solo** crea el administrador y falla si falta
   `SEED_ADMIN_PASSWORD`. Nunca uses `SEED_DEMO=true` en producción.
3. Entra a la web con el administrador y **cambia su contraseña**.

### 1.6 Verificación del primer despliegue

Haz la prueba de humo de §3 completa y además:

- [ ] Ningún usuario de demo en la base: `SELECT email FROM "User";` no trae `@reto.local`.
- [ ] Subir una foto desde "Subir actividad": si Cloudinary falta, la subida queda
      deshabilitada a propósito.
- [ ] Recorridos 1, 3, 4 y 5 de la Parte 2 de `docs/test-cases.md` contra el entorno real.

---

## 2. Publicar una versión nueva

Una versión llega a producción cuando su PR de release se fusiona en `main`. Seenode
redespliega al recibir el push.

1. **Preparación** (§0 completo sobre el tag nuevo).
2. **Variables primero:** si el CHANGELOG pide variables nuevas o distintas, cárgalas en
   Seenode **antes** de fusionar. Una variable faltante puede impedir el arranque.
3. **Fusionar** el PR `release/X.Y.Z` → `main` y crear el tag `vX.Y.Z` sobre el commit de merge.
4. **Orden de despliegue:**
   1. API primero. Espera a que `/api/health` y `/api/health/db` respondan `ok`.
   2. Web después. Así la web nueva nunca habla con una API vieja.
   Si Seenode despliega ambos a la vez, espera a que los dos terminen antes de verificar.
5. **Prueba de humo** (§3).
6. **Back-merge** `release/X.Y.Z` → `develop` y registro de la versión (§8).

**Migraciones:** se aplican solas en el arranque de la API (`prisma migrate deploy`). Son
solo hacia adelante. Si la versión trae alguna, toma el respaldo de §5.1 antes del paso 3.

---

## 3. Prueba de humo (5 minutos)

```bash
API=https://<api>/api
curl -s $API/health                     # {"status":"ok",...}
curl -s $API/health/db                  # {"status":"ok","db":"up"}
curl -s -o /dev/null -w "%{http_code}\n" $API/auth/me     # 401: sin sesión no entra
```

En la web, con el administrador:

- [ ] Login y logout (y que una ruta privada sin sesión redirija a `/login`).
- [ ] "Mi reto" muestra el reto activo, la cuenta regresiva y las métricas.
- [ ] Ranking del reto activo y, si existe, un reto cerrado desde "Retos cerrados".
- [ ] Retos, Participantes, Validar e Importar abren sin errores.
- [ ] El interruptor de modo claro/oscuro cambia el tema.
- [ ] La consola del navegador no muestra errores de CORS.
- [ ] Swagger en `https://<api>/api/docs` muestra la versión desplegada.

Si algo falla: §4 (revertir) o §6 (diagnóstico).

---

## 4. Revertir

**Cuándo:** la prueba de humo falla en algo que bloquea a los usuarios (login, subir
actividad, validar) y no se corrige en minutos.

1. En Seenode, vuelve a desplegar el **commit del tag anterior** en ambos servicios (API
   primero). Si la plataforma solo despliega desde la rama, crea un PR que revierta el merge
   en `main` (`git revert -m 1 <merge>`) y fusiónalo.
2. **Si la versión aplicó migraciones:** el código anterior puede no funcionar con el esquema
   nuevo. Opciones, en este orden:
   1. Si la migración solo **agrega** columnas o tablas, el código anterior suele funcionar:
      verifica con la prueba de humo.
   2. Si no, restaura el respaldo de §5.1 (se pierde lo escrito desde el respaldo) **y**
      despliega el código anterior.
3. Repite la prueba de humo sobre la versión anterior.
4. Avisa al administrador del reto y registra el incidente (§8).

Las versiones 1.0.0 → 1.2.0 no tienen migraciones nuevas entre sí, así que revertir entre
ellas es solo volver a desplegar el código.

---

## 5. Datos

### 5.1 Respaldo antes de migraciones

```bash
# Desde una máquina con acceso a la base (o la shell del servicio)
pg_dump "$DATABASE_URL" --format=custom --file=reto-$(date +%Y%m%d-%H%M).dump
```

Guarda el archivo fuera de Seenode. Restaurar:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" reto-AAAAMMDD-HHMM.dump
```

### 5.2 Nunca en producción

- `npx prisma migrate reset` (borra la base).
- `npx prisma migrate dev` (crea migraciones contra la base de producción).
- `SEED_DEMO=true` (crea usuarios con contraseña conocida).

---

## 6. Diagnóstico de incidentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El build de la API falla instalando `xlsx` | Sin salida a `cdn.sheetjs.com` | Permitir el dominio en el build; reintentar |
| La API no arranca: "`JWT_…_EXPIRES_IN` no es una duración válida" | Valor mal escrito | Usar `900`, `15m`, `12h` o `7d` y redeploy |
| La API no arranca: error de Prisma o `migrate deploy` | `DATABASE_URL` mal o base caída | Revisar la cadena (red privada) y `/api/health/db` |
| `/api/health` ok pero `/api/health/db` no | Base caída o sin red privada | Estado de la base en Seenode; reintentar conexión |
| La web carga pero toda llamada falla con CORS | `CORS_ORIGIN` distinto a la URL exacta de la web | Corregir (sin barra final) y redeploy de la API |
| La web llama a una API equivocada | `NEXT_PUBLIC_API_URL` mal en el **build** | Corregir y **recompilar** la web |
| Muchos usuarios reciben 429 a la vez | La API no ve la IP real: todos comparten el cupo | `TRUST_PROXY=1` (por defecto en producción); si hay dos proxies, `2` |
| "Subir actividad" deshabilitado | Faltan variables `CLOUDINARY_*` | Cargarlas y redeploy |
| Login responde 429 | 5 intentos por minuto por IP (protección anti fuerza bruta) | Esperar un minuto |
| La sesión se cierra sola | Refresh token rechazado (secretos JWT rotados) | Esperado tras rotar secretos: volver a iniciar sesión |
| Importar desde Google Sheets dice "no configurado" | Faltan `GOOGLE_*` | Opcional: ver `docs/import-template.md` |

Logs: panel de Seenode → servicio → Logs. Los errores 5xx de la API quedan registrados con
la ruta.

---

## 7. Variables de entorno

### API

| Variable | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| `NODE_ENV` | Sí | `production` | Activa las protecciones de producción |
| `DATABASE_URL` | Sí | `postgresql://…/reto?schema=public` | Red privada |
| `PORT` | Sí | `3000` | Igual al campo Port del servicio |
| `API_PREFIX` | Sí | `api` | |
| `CORS_ORIGIN` | Sí | `https://reto-app.seenode.app` | Sin barra final; admite varias separadas por coma |
| `JWT_SECRET` | Sí | (48 bytes aleatorios) | Distinto del de refresh |
| `JWT_REFRESH_SECRET` | Sí | (48 bytes aleatorios) | Rotarlo cierra todas las sesiones |
| `JWT_ACCESS_EXPIRES_IN` | Sí | `15m` | Duración válida o el arranque falla |
| `JWT_REFRESH_EXPIRES_IN` | Sí | `7d` | Ídem |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Sí | | Sin ellas no hay subida de fotos |
| `CLOUDINARY_FOLDER` | No | `reto-constancia` | |
| `SEED_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | Para el primer seed | | La contraseña se cambia tras el primer login |
| `TRUST_PROXY` | No | `1` | Por defecto 1 en producción; `false` si no hay proxy |
| `THROTTLE_LIMIT` / `THROTTLE_TTL_MS` | No | `100` / `60000` | Límite global por usuario |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEETS_DEFAULT_RANGE` | No | | Importación desde Google Sheets |

### Web

| Variable | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Sí | `https://reto-api.seenode.app/api` | Se fija al compilar |

---

## 8. Registro

Después de cada despliegue, anota en `docs/testing.md` (Registro de ejecuciones) o en el
canal del equipo:

- versión y commit desplegados, fecha y hora;
- resultado de la prueba de humo;
- incidencias y si hubo reversión.
