# Seguridad y OWASP (autenticación)

Resumen de los controles implementados, mapeados a principios de OWASP
(ASVS / Top 10 / Authentication Cheat Sheet) y dónde viven en el código.

## Controles implementados

- Hashing de contraseñas con Argon2 (no se guardan en claro):
  - `backend/src/auth/auth.service.ts` (`argon2.hash` / `argon2.verify`).
  - El hash nunca se devuelve al cliente (`sanitize()` quita `passwordHash`;
    además `SAFE_USER_SELECT` en `backend/src/users/users.service.ts`).
- Política de contraseñas (mínimo 8, letra + número, máximo 72):
  - `backend/src/auth/dto/register.dto.ts`.
- Rate limiting global y específico anti fuerza bruta:
  - Global: `ThrottlerModule` (100 req/min) en `backend/src/app.module.ts`.
  - Login/Register: 5 intentos/min; Refresh: 20/min en
    `backend/src/auth/auth.controller.ts` (`@Throttle`).
- Mensajes de error genéricos en login (no se revela si el correo existe o si
  la contraseña es la incorrecta): "Credenciales inválidas" en `auth.service.ts`.
- Tokens JWT con expiración corta y refresh separado:
  - Access token: `JWT_ACCESS_EXPIRES_IN` (default 15m) en
    `backend/src/auth/auth.module.ts`.
  - Refresh token: secreto distinto (`JWT_REFRESH_SECRET`) y
    `JWT_REFRESH_EXPIRES_IN` (default 7d) en `auth.service.ts`.
  - Verificación de firma y expiración del access token en
    `backend/src/auth/strategies/jwt.strategy.ts` (`ignoreExpiration: false`).
- Control de acceso por roles (RBAC):
  - `RolesGuard` + `@Roles(UserRole.ADMIN)` en endpoints sensibles
    (retos, validaciones, importación).
  - Verificado por test e2e (participante recibe 403 en rutas de admin).
- Usuarios deshabilitados no pueden autenticar (`active === false` -> 401)
  en `auth.service.ts` (login y refresh).
- Validación estricta de entrada (anti mass-assignment / payloads no esperados):
  - `ValidationPipe` con `whitelist` y `forbidNonWhitelisted` en
    `backend/src/main.ts` + DTOs con `class-validator`.
- Cabeceras de seguridad HTTP con Helmet (`app.use(helmet())` en `main.ts`).
- CORS restringido por entorno (`CORS_ORIGIN`) en `main.ts`.
- Secretos fuera del código, vía variables de entorno (`backend/.env.example`).
  En producción se generan fuertes: `openssl rand -base64 64`.
- Subidas de archivos a Cloudinary mediante firma temporal (el cliente no
  maneja el API secret): `backend/src/upload/`.

## Checklist de despliegue (revisar antes de producción)

- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` fuertes, distintos entre sí y por entorno.
- [ ] `CORS_ORIGIN` apuntando solo al dominio real del frontend (sin `*`).
- [ ] `DATABASE_URL` con SSL y credenciales propias del proveedor administrado.
- [ ] Cambiar/retirar el usuario admin de demo (`SEED_ADMIN_*`); no usar passwords de ejemplo.
- [ ] HTTPS forzado (lo provee la plataforma de hosting / Seenode).
- [ ] Variables de entorno gestionadas como secretos en el panel del hosting (no en el repo).
- [ ] Revisar logs para no exponer datos sensibles.

## Estado de dependencias (revisión 2026-09-08)

Comando: `npm audit --omit=dev` en `backend/` y `frontend/`.

| Proyecto | Estado | Detalle |
|---|---|---|
| Frontend | **Sin vulnerabilidades** | Next.js actualizado a 15.5.x (la línea 14 ya no recibe los parches de las alertas críticas) y `postcss` forzado a 8.5.x con `overrides` |
| Backend | **12 alertas abiertas** (5 altas) | 11 son transitivas de NestJS 10: se resuelven subiendo a NestJS 12, que es un cambio mayor y merece su propia iteración. La restante es `xlsx`, que no tiene versión corregida publicada en npm |

Notas de riesgo del backend:

- Las alertas de NestJS (`multer`, `lodash`, `js-yaml`, `body-parser`, `qs`) son de
  denegación de servicio o de utilidades internas. La superficie expuesta es pequeña: la
  única subida de archivos vía multer es la importación, restringida a administradores.
- `xlsx` (SheetJS) tiene alertas de *prototype pollution* y ReDoS sin corrección en npm; el
  proyecto publica versiones corregidas en su propio CDN. Solo procesa archivos que sube un
  administrador. Opciones a decidir: fijar la versión del CDN oficial o migrar a otra
  librería.
- Recomendación: planificar la subida a NestJS 12 y la decisión sobre `xlsx` como una
  iteración posterior al despliegue, y volver a correr `npm audit` en cada release.

## Protecciones específicas de producción

- **Subida de archivos**: el simulador local solo funciona fuera de producción. Con
  `NODE_ENV=production` y sin credenciales de Cloudinary, la subida queda deshabilitada en
  vez de exponer un endpoint de escritura en disco. Además `POST /upload/local` exige sesión.
- **CORS**: sin `CORS_ORIGIN` la API no habilita orígenes cruzados en producción (en
  desarrollo refleja el origen del navegador). Nunca se usa el comodín junto con credenciales.
- **Seed**: en producción solo crea el administrador, exige `SEED_ADMIN_PASSWORD` y omite
  los datos de demo salvo que se pida explícitamente con `SEED_DEMO=true`.

## Mejoras futuras (no bloqueantes)

- Rotación/invalidación de refresh tokens (lista de revocación o `jti` persistido).
- Verificación de correo y flujo de "olvidé mi contraseña".
- Bloqueo temporal de cuenta tras N fallos (complementa el rate limiting por IP).
- Cabecera CSP afinada en Helmet para el frontend.
