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

## Estado de dependencias (revisión 2026-10-02)

Comando: `npm audit` (con y sin `--omit=dev`) en `backend/`, `frontend/` y `e2e/`.

| Proyecto | Estado | Cómo se llegó |
|---|---|---|
| Backend | **Sin vulnerabilidades** | NestJS 10 → **11.2.7** (Express 5, multer 2.4), `js-yaml` forzado a 5.4.2 con `overrides` y `xlsx` 0.20.3 desde el CDN oficial de SheetJS |
| Frontend | **Sin vulnerabilidades** | Next.js 15.5.x y `postcss` forzado a 8.5.x con `overrides` |
| E2E | **Sin vulnerabilidades** | — |

**Por qué NestJS 11 y no 12.** Las dos ramas traen las mismas dependencias corregidas (multer
2.4, Express 5.2), así que NestJS 11 cierra los 9 avisos de NestJS con un solo salto mayor y la
guía de migración oficial. NestJS 12 exige además TypeScript 6 (sus *schematics* no resuelven
con TypeScript 5), lo que suma un segundo cambio mayor sin ganancia de seguridad. Se comparó
resolviendo ambos árboles con `npm install --package-lock-only` y `npm audit` antes de tocar el
proyecto.

**`xlsx` desde el CDN de SheetJS.** SheetJS dejó de publicar en npm en la 0.18.5, que arrastra
las alertas de *prototype pollution* y ReDoS. La versión corregida (0.20.3) se instala desde
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, que es el canal oficial del fabricante;
`package-lock.json` guarda su hash de integridad, así que un archivo alterado no se instala.
Consecuencias:

- `npm audit` no conoce ese paquete: las alertas nuevas de SheetJS se siguen en
  <https://cdn.sheetjs.com/advisories/> y en cada release se revisa si hay una versión nueva.
- El servidor que instala dependencias (CI, Seenode) necesita salida a `cdn.sheetjs.com`.

**Cambio de comportamiento a tener en cuenta.** `@nestjs/jwt` 11 exige que `JWT_ACCESS_EXPIRES_IN`
y `JWT_REFRESH_EXPIRES_IN` sean duraciones válidas (`900`, `15m`, `12h`, `7d`). Un valor mal
escrito ahora hace fallar el arranque con un mensaje que nombra la variable, en vez de emitir
tokens con una vigencia inesperada.

**CI.** El paso `npm audit --omit=dev` falla desde nivel **moderado** en backend y frontend, para
que cualquier aviso nuevo aparezca en el PR que lo introduce.

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
