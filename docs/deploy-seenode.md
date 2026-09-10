# Despliegue en Seenode (paso a paso)

Arquitectura objetivo: dos Web Services (API NestJS y frontend Next.js) + un
PostgreSQL administrado, todo en Seenode, con Cloudinary como servicio
complementario para imágenes.

```mermaid
flowchart LR
  user[Navegador] -->|HTTPS| feWeb[Seenode Web: Next.js]
  feWeb -->|"NEXT_PUBLIC_API_URL /api"| beWeb[Seenode Web: NestJS API]
  beWeb -->|red privada| pg[(Seenode PostgreSQL)]
  beWeb -->|uploads firmados| cloud[Cloudinary]
```

Notas de plataforma (importantes):
- Seenode soporta monorepos con el campo **Root Directory** (apuntar a `backend` o `frontend`).
- Seenode **no inyecta la variable `PORT`**: el puerto se fija en el campo "Port"
  del panel y la app debe escuchar en `0.0.0.0` en ese mismo puerto.
- HTTPS y URL pública salen automáticamente por cada Web Service.

## 0. Prerrequisitos

- Repo en GitHub: `Professional-and-Personal-Branding/reto-constancia-mvp` (ya está).
- Cuenta de Cloudinary con `cloud name`, `api key`, `api secret`.
- Cuenta en Seenode (https://seenode.com), GitHub autorizado.

## 1. Base de datos (PostgreSQL administrado)

1. Panel de Seenode → **Databases** → **Create database**.
2. Tipo **PostgreSQL**, elige versión y tier (Basic alcanza para empezar).
3. Al crearse, copia la **connection string** (usa la de **red privada** para la API).
   Será el valor de `DATABASE_URL`. Asegúrate de incluir `?schema=public` si el proveedor no lo agrega.

## 2. Web Service: API (NestJS)

1. **New** → **Web Service** → conecta el repo y elige la rama **`main`**.
2. **Root Directory**: `backend`
3. **Build Command**:
   ```
   npm install && npx prisma generate && npm run build
   ```
4. **Start Command** (corre migraciones y arranca):
   ```
   npx prisma migrate deploy && node dist/main.js
   ```
5. **Port**: `3000` (el backend escucha en `PORT` con default 3000, y enlaza 0.0.0.0).
6. **Environment Variables**:
   - `DATABASE_URL` = (connection string de red privada del paso 1)
   - `JWT_SECRET` = (secreto fuerte; ver abajo)
   - `JWT_REFRESH_SECRET` = (otro secreto fuerte, distinto)
   - `JWT_ACCESS_EXPIRES_IN` = `15m`
   - `JWT_REFRESH_EXPIRES_IN` = `7d`
   - `API_PREFIX` = `api`
   - `PORT` = `3000`
   - `CORS_ORIGIN` = (URL pública del frontend; se completa tras el paso 3)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `CLOUDINARY_FOLDER` = `reto-constancia`
   - `NODE_ENV` = `production` (**obligatorio**: activa las protecciones de producción)
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` (para el primer seed)
   - Opcionales para importar desde Google Sheets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
     `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_DEFAULT_RANGE` (ver `docs/import-template.md`)

   > **Sin `CLOUDINARY_*` la subida de archivos queda deshabilitada** en producción: el
   > simulador local no se activa (guardaría archivos en un disco efímero y expondría un
   > endpoint de subida). Sin `CORS_ORIGIN`, la API no acepta llamadas desde el navegador.
7. Crea el servicio. Anota su URL pública (p. ej. `https://reto-api.seenode.app`).
8. Verifica salud: abre `https://<api>/api/health` (debe responder `{"status":"ok"}`)
   y `https://<api>/api/health/db` (debe responder `db: "up"`).

## 3. Web Service: Frontend (Next.js)

1. **New** → **Web Service** → mismo repo, rama **`main`**.
2. **Root Directory**: `frontend`
3. **Build Command**:
   ```
   npm install && npm run build
   ```
4. **Start Command** (fija el puerto explícitamente, Seenode no provee `PORT`):
   ```
   npx next start -p 3000
   ```
5. **Port**: `3000`
6. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://<api-del-paso-2>/api`
7. Crea el servicio. Anota su URL pública (p. ej. `https://reto-app.seenode.app`).

## 4. Cerrar el círculo (CORS) y primer seed

1. Vuelve al Web Service de la **API** → Environment Variables.
2. Pon `CORS_ORIGIN` = URL pública del frontend (sin slash final), redeploy.
3. Primer seed del admin (solo una vez): abre una shell del servicio API y corre:
   ```
   npx prisma db seed
   ```
   Con `NODE_ENV=production` el seed **solo crea el admin** de `SEED_ADMIN_*` y falla si
   `SEED_ADMIN_PASSWORD` no está definido. Los datos de demo (participantes con contraseña
   conocida, reto y actividades de mayo) no se siembran salvo que pongas `SEED_DEMO=true`,
   cosa que no deberías hacer en producción. Cambia el password del admin tras el primer login.

## 4.bis Checklist previo a producción

Antes de anunciar el despliegue, confirma cada punto:

| # | Verificación | Cómo |
|---|---|---|
| 1 | `NODE_ENV=production` en la API | Variables del servicio |
| 2 | `JWT_SECRET` y `JWT_REFRESH_SECRET` distintos y generados al azar | Ver "Generar secretos" |
| 3 | `CORS_ORIGIN` = URL exacta del frontend, sin slash final | Abrir la app y comprobar que no hay errores de CORS en la consola |
| 4 | `CLOUDINARY_*` configurado | Subir una foto desde la app; si falta, la subida queda deshabilitada |
| 5 | `SEED_ADMIN_PASSWORD` fuerte y cambiado tras el primer login | Login del admin |
| 6 | Sin usuarios de demo en la base | `SELECT email FROM "User"` no debe traer `ana@reto.local` y compañía |
| 7 | Salud y base | `GET /api/health` y `GET /api/health/db` responden `ok` |
| 8 | Migraciones aplicadas | Los logs del arranque muestran `migrate deploy` sin pendientes |
| 9 | Batería automatizada en verde en el commit desplegado | `node scripts/run-tests.mjs` (ver `docs/testing.md`) |
| 10 | Recorridos manuales de la Parte 2 de `docs/test-cases.md` | Al menos los recorridos 1, 3, 4 y 5 contra el entorno desplegado |
| 11 | Estado de dependencias revisado | `npm audit --omit=dev` en ambos proyectos (ver `docs/security-owasp.md`) |

## 5. Verificación end-to-end

- Entra a la URL del frontend, login con el admin.
- Crea un reto, inscribe participantes, sube/valida una actividad.
- Prueba la importación masiva en `Dashboard → Importar` (ver `docs/import-template.md`).

## Generar secretos fuertes

```bash
# Linux/macOS
openssl rand -base64 48
# Cualquier máquina con Node
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Genera uno para `JWT_SECRET` y otro distinto para `JWT_REFRESH_SECRET`.

## Notas de mantenimiento

- Cada push a `main` puede redeployar (Seenode redeploya al recibir push en la rama).
- Las migraciones se aplican solas en el arranque (`prisma migrate deploy`).
- Si cambias el esquema: crea la migración localmente
  (`npx prisma migrate dev --name <desc>`), súbela vía PR; al desplegar `main`
  se aplicará con `migrate deploy`.
- Mantén `DATABASE_URL` apuntando a la red privada para menor latencia y mayor seguridad.
