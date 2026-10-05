# Pruebas automatizadas — Reto de Constancia

Qué cubre la batería, cómo correrla y qué hacer cuando algo falla. Los casos de prueba están
catalogados y validados en [`qa/test-cases.md`](./qa/test-cases.md) (99 casos, cada uno con las
pruebas que lo validan); la preparación del entorno y los recorridos manuales, en
[`test-cases.md`](./test-cases.md).

## 1. Un solo comando

```bash
node scripts/run-tests.mjs
```

Corre, en orden: lint del backend, pruebas unitarias, build, migraciones, pruebas e2e,
tipos del frontend, lint, build, la prueba de sesiones paralelas y los recorridos de UI con
Playwright. Imprime un resumen y devuelve código distinto de cero si algo falla.

Si la API no está levantada, el corredor la arranca él mismo (usa el backend compilado) y la
apaga al terminar, así que **no hace falta preparar nada más que la base de datos**.

| Variante | Para qué |
|---|---|
| `node scripts/run-tests.mjs --quick` | Solo lo que no necesita Postgres (lint, unit, build, tipos). Ideal antes de cada commit |
| `node scripts/run-tests.mjs --skip-e2e` | Todo menos las pruebas contra base de datos |
| `node scripts/run-tests.mjs --skip-build` | Iteración rápida sin compilar |
| `node scripts/run-tests.mjs --skip-ui` | Sin los recorridos de navegador (Playwright) |
| `node scripts/run-tests.mjs --list` | Lista los pasos y sale |

Los pasos que necesitan Postgres **se saltan con aviso** si no está disponible, así el
comando sirve igual en una máquina recién clonada. Para que corran todos basta con la base:

```bash
docker compose up -d postgres                 # Postgres en el puerto 5433 del host
node scripts/run-tests.mjs                    # desde la raíz del repositorio
```

La primera vez, instala también el navegador de Playwright:
`cd e2e && npm install && npx playwright install chromium`.

## 2. Qué hay en cada suite

| Suite | Comando directo | Qué cubre | Necesita |
|---|---|---|---|
| Unitarias backend | `cd backend && npx jest` | Reglas puras y servicios con Prisma simulado: auth, ciclo de vida de retos, regla de FC, importación, finanzas, puntaje, CORS, modo de subida | — |
| E2E backend | `cd backend && npm run test:e2e` | Contratos HTTP reales contra Postgres: flujo principal, ciclo de vida, regla de FC, finanzas, puntaje, importación desde Sheets | Postgres |
| Unitarias web | `cd frontend && npm test` | Helpers de fechas (días calendario, fin de reto inclusivo) y tema: resolución, script previo a la hidratación y contraste de las paletas de `globals.css` | — |
| Tipos y lint | `npx tsc --noEmit -p .` / `npm run lint` | Tipos del frontend, reglas de estilo de ambos proyectos | — |
| Builds | `npm run build` (en cada proyecto) | Que compile lo que se despliega | — |
| Sesiones paralelas | `node scripts/parallel-session-test.mjs` | Recorrido funcional de punta a punta con dos sesiones simultáneas (admin y participante) sobre datos del seed | API + seed |
| Recorridos de UI | `cd e2e && npm test` | Navegador real sobre la app: sesión, renovación de tokens y rutas protegidas, subida de archivos con la regla de FC, validación con override, resumen financiero, selector de retos, reglas de puntaje e importación. Ver [`e2e-playwright.md`](./e2e-playwright.md) | API + frontend + seed |
| Capturas de la guía | `cd e2e && npx playwright test -c playwright.guide.config.ts` | Arma un reto de demostración, verifica cada pantalla y regenera `docs/guia-capturas/` | API + frontend + seed |
| Catálogo de casos | `node scripts/validate-test-cases.mjs` | Corre unitarias, e2e de API, UI, capturas y sesiones; cruza cada caso de `docs/qa/catalog.mjs` con sus pruebas y regenera el catálogo, el CSV y el reporte | Postgres + seed |

### Suites unitarias del backend (`backend/src/**/*.spec.ts`)

| Archivo | Cubre |
|---|---|
| `auth/auth.service.spec.ts` | Registro, login, hash Argon2, refresh |
| `challenges/challenges.service.spec.ts` | Activación (DRAFT→ACTIVE, idempotencia, 400 en cerrado), lista de activos, reto por defecto, marcado de pago |
| `challenges/results.service.spec.ts` | Ranking, ganadores, premiación manual, payout y reglas de puntaje configurables |
| `challenges/scoring.spec.ts` | Fórmula de puntaje, calificación y desempates (`DRAW`, `TOTAL_KM`, `SHARE_ALL`) |
| `challenges/finance.service.spec.ts` | Estados de pago, totales esperado/recaudado/pendiente, cobertura y reparto del premio |
| `activities/activities.service.spec.ts` | Regla de FC, derivación de la captura, override de validación, `heartRateCompliant` |
| `import/import.service.spec.ts` | Validación de filas, plantilla, advertencias de FC, lectura de hojas de cálculo |
| `import/sheets-auth.spec.ts` | Firma del JWT de cuenta de servicio, canje y caché del token |
| `import/sheets.client.spec.ts` | URLs de la API de Sheets y mapeo de errores (403/404/400) |
| `upload/upload.service.spec.ts` | Simulador local en dev y su bloqueo en producción |
| `common/cors.spec.ts` | Orígenes permitidos y bloqueo del comodín en producción |

### Suites e2e del backend (`backend/test/*.e2e-spec.ts`)

| Archivo | Cubre |
|---|---|
| `app.e2e-spec.ts` | Salud, registro, login, perfil, RBAC básico |
| `challenge-lifecycle.e2e-spec.ts` | Varios retos activos, lista de activos, reto por defecto, actividades por reto |
| `activity-heart-rate.e2e-spec.ts` | Rechazos por regla de FC, override con nota, reto sin regla |
| `challenge-finance.e2e-spec.ts` | Resumen financiero, estados de pago, payout, permisos |
| `challenge-scoring.e2e-spec.ts` | Puntaje configurable, mínimo para calificar, desempates, validación de configuración |
| `import-sheet.e2e-spec.ts` | Importación desde Google Sheets con un cliente falso (CI no habla con Google) |

Cada suite e2e crea sus propios datos con un año propio (2096 a 2201) y los borra al
terminar, así que se pueden correr muchas veces sobre la misma base sin ensuciarla.

## 3. Integración continua

`.github/workflows/ci.yml` corre en cada push y PR contra `main` y `develop`:

- **Backend**: `npm ci`, `prisma generate`, `prisma migrate deploy` sobre un Postgres de
  servicio, `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.
- **Frontend**: `npm ci`, `npm run lint`, `npm run build`.
- **E2E de UI**: Postgres de servicio, migraciones, seed, build de backend y frontend,
  Chromium y los recorridos de Playwright. Si falla, sube el informe HTML como artefacto.

Las ramas `main` y `develop` están protegidas: sin CI en verde no se puede mergear.

## 4. Cuando algo falla

| Síntoma | Causa habitual | Salida |
|---|---|---|
| `P1001: Can't reach database server` | Postgres apagado o puerto ocupado | `docker compose up -d postgres` (expone 5433) |
| E2E fallan con datos raros | Base con datos de una corrida interrumpida | `cd backend && npx prisma migrate reset` y luego `npm run prisma:seed` |
| `429 Too Many Requests` en scripts | Límite de 5 logins por minuto por IP | Espera un minuto; reutiliza el token en vez de re-loguear |
| El frontend sirve 404 de sus propios chunks | Se corrió `npm run build` con `next dev` abierto | Detén el dev server, borra `.next` y vuelve a arrancar |
| Sesiones paralelas se salta | No hay base de datos, así que el corredor no pudo levantar la API | `docker compose up -d postgres` |
| `webServer was not able to start` en Playwright | Falta compilar backend o frontend | `npm run build` en cada proyecto |

## 5. Cobertura actual y huecos conocidos

| Capa | Estado |
|---|---|
| Reglas de negocio del backend | Cubiertas por unitarias y e2e |
| Contratos HTTP y RBAC | Cubiertos por e2e |
| Recorrido funcional completo | Cubierto por `parallel-session-test.mjs` |
| Interfaz web | Cubierta por Playwright (`e2e/`): 56 recorridos (incluidos el modo claro/oscuro, los retos cerrados, el encabezado en escritorio y móvil, editar retos, retirar actividades, pagos parciales, el presupuesto automático y la privacidad de emails y pagos el código de soporte en los errores y los formatos de subida) y 18 pruebas de la suite de capturas, sobre navegador real |
| Trazabilidad | Los 122 casos de `docs/qa/` están enlazados a 516 pruebas; ninguna prueba queda sin caso |
| Componentes del frontend aislados | **Sin pruebas unitarias**: la UI se verifica de punta a punta, no por componente |
| Subida de archivos | Cubierta de punta a punta contra el simulador local; **la subida real a Cloudinary** requiere credenciales y se verifica manualmente |
| Lectura real de Google Sheets | **Sin cobertura automatizada**: e2e usa un cliente falso; el camino real requiere una cuenta de servicio |
| Avisos en dependencias de desarrollo | **Riesgo aceptado en el frontend:** 7 avisos altos de `braces` ≤ 3.0.3 (GHSA-vfj7-8cjw-p6xm) que llegan por Tailwind 3 (`chokidar`, `fast-glob`) y por `@next/eslint-plugin-next` (fija `fast-glob` 3.3.1 incluso en su última versión). No existe `braces` corregido, solo corre en máquinas de desarrollo y en la CI contra los patrones del propio repositorio, y producción tiene 0 avisos. Revisar cuando se publique un `braces` corregido, cuando el plugin de Next deje `fast-glob` o al migrar a Tailwind 4 junto con Next 16. Backend y e2e: 0 avisos |

Si en el futuro se agregan pruebas de componentes aislados, el lugar natural es Vitest más
Testing Library, y el corredor ya tiene dónde enchufarlas.

## 6. Registro de ejecuciones

Cada release se valida corriendo la batería completa en local antes de desplegar. Se anota
aquí la versión, la fecha, el entorno y el resultado por suite.

### 2026-10-05 · rama `feature/closed-challenge-freeze`, PR 1 (bloqueo y congelamiento)

Base reiniciada con `npx prisma migrate reset --force`.

**Batería:** 11 de 11 pasos en verde.

**Catálogo:** 122 de 122 casos aprobados (121 automatizados) con 516 pruebas y 0 fallidas:
- unitarias del backend: 242;
- unitarias de la web: 16;
- e2e de API: 112;
- recorridos de UI: 56, más la preparación;
- capturas de la guía: 18, más la preparación;
- sesiones paralelas: 70.

Casos nuevos: TC-CHAL-14 (actividades definitivas), TC-CHAL-15 (escrituras serializadas con el
cierre y 409 por bloqueo) y TC-IMP-12 (importación en un reto cerrado).

**Impacto funcional:** antes de agregar pruebas nuevas, todas las existentes pasaron sin cambios:
109 de API e2e, los recorridos de UI, las capturas y las sesiones. A los mocks unitarios solo se
les agregó soporte de transacción.

**Prueba determinista del 409:** otra transacción retiene `FOR UPDATE` sobre el reto y una
validación espera más de 5 s. Recibe 409 y la actividad no cambia.

### 2026-10-05 · v1.5.0 (rama `release/1.5.0`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **119 de 119 casos aprobados** con 493
pruebas ejecutadas y 0 fallidas.

**Dependencias:** producción sin avisos en backend, frontend y e2e. `npm audit` completo: backend
0, e2e 0 y frontend 7 altos de desarrollo (riesgo aceptado, ver §5). Sin migraciones nuevas.

**Pendiente en producción:** verificaciones V1 a V5 de subidas en la cuenta real de Cloudinary y
la prueba de la señal de apagado en el primer redespliegue (Linux).

### 2026-10-05 · rama `feature/upload-guardrails` (protección de subidas)

Base reiniciada con `npx prisma migrate reset --force`.

**Batería:** 11 de 11 pasos en verde.

**Catálogo:** 119 de 119 casos aprobados (118 automatizados) con 493 pruebas y 0 fallidas:
- unitarias del backend: 223;
- unitarias de la web: 16;
- e2e de API: 109;
- recorridos de UI: 56, más la preparación;
- capturas de la guía: 18, más la preparación;
- sesiones paralelas: 69.

Casos nuevos: TC-UP-04 (formatos por propósito), TC-UP-05 (solo evidencia propia) y TC-UP-06
(límite de firmas). Se actualizaron TC-UP-01 y TC-UP-02.

Las e2e de API corren en modo local por `backend/test/setup-e2e.ts`. La búsqueda de
`example.com`/`placehold.co` en pruebas y scripts solo encuentra dos usos intencionales: una
prueba negativa y una fila de importación, que no pasa por la regla.

**Observación:** en una primera corrida del validador, justo después de regenerar las capturas,
`import-sheet.e2e-spec.ts` falló en su `beforeAll` (la suite no llegó a correr). Repetida sola y
en una segunda corrida completa del validador, pasó.

Las verificaciones V1 a V5 contra la cuenta real de Cloudinary quedan pendientes del dueño.

### 2026-10-05 · rama `feature/ops-observability-baseline` (observabilidad básica)

Base reiniciada con `npx prisma migrate reset --force`. **Batería:** 11 de 11 pasos en verde.
**Catálogo:** 116 de 116 casos aprobados (115 automatizados) con 438 pruebas y 0 fallidas:
unitarias del backend 181, unitarias de la web 12, e2e de API 102, recorridos de UI 54 (más la
preparación), capturas de la guía 18 (más la preparación) y sesiones paralelas 69. Casos nuevos:
TC-HEALTH-03, 04 y 05, TC-SEC-12 y 13, y TC-UI-11.

**QA manual** sobre la API compilada:
- Con Postgres detenido, `/api/health/db` respondió 503 con una línea `ERROR [HTTP]` y su
  `requestId`, y `/api/health` siguió en 200. Al levantarlo, volvió a 200.
- Con `NODE_ENV=production`, `/api/docs` respondió 404.
- El JSON mal formado respondió 400 con `X-Request-Id` y una línea `WARN`.
- Al emitir SIGTERM dentro del proceso se registró "Conexión a la base cerrada". En Windows,
  `kill -TERM` termina el proceso sin entregar la señal, así que la prueba con la señal real
  queda para el primer redespliegue en Seenode (Linux).

### 2026-10-04 · v1.4.2 (rama `release/1.4.2`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **110 de 110 casos aprobados** con 401
pruebas ejecutadas y 0 fallidas.

**Dependencias:** producción sin avisos en backend, frontend y e2e. `npm audit` completo: backend
0, e2e 0 y frontend 7 altos de desarrollo (riesgo aceptado, ver §5). Sin migraciones nuevas.

### 2026-10-04 · rama `feature/participant-data-privacy` (privacidad de los participantes)

Base reiniciada con `npx prisma migrate reset --force`. **Batería:** 11 de 11 pasos en verde.
**Catálogo:** 110 de 110 casos aprobados (109 automatizados) con 401 pruebas y 0 fallidas:
unitarias del backend 154, unitarias de la web 12, e2e de API 93, recorridos de UI 53 (más la
preparación), capturas de la guía 18 (más la preparación) y sesiones paralelas 69. Casos nuevos:
TC-SEC-06 a TC-SEC-11. Las capturas del ranking se regeneraron sin emails.

### 2026-10-04 · v1.4.1 (rama `release/1.4.1`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **104 de 104 casos aprobados** con 368
pruebas ejecutadas y 0 fallidas.

**Dependencias:** producción sin avisos en backend, frontend y e2e. `npm audit` completo: backend
0, e2e 0 y frontend 7 altos de desarrollo (riesgo aceptado, ver §5). Sin migraciones nuevas.

### 2026-10-04 · rama `chore/upgrade-dev-tooling` (herramientas de desarrollo)

Jest 29 → 30, `@types/jest` 30, ts-jest 29.4, typescript-eslint 7 → 8 (sigue ESLint 8) y
ts-loader 9.6 en el backend; en el frontend solo `npm audit fix` sin saltos mayores. Base
reiniciada con `npx prisma migrate reset --force`. **Batería:** 11 de 11 pasos en verde, sin
ajustes de código ni de lint. **Catálogo:** 104 de 104 casos aprobados con 368 pruebas y 0
fallidas.

| `npm audit` | Antes | Después |
|---|---:|---:|
| backend (completo) | 37 altos | **0** |
| frontend (completo) | 8 altos | 7 altos (riesgo aceptado, ver §5) |
| e2e | 0 | 0 |
| producción (`--omit=dev`), los tres | 0 | 0 |

### 2026-10-03 · v1.4.0 (rama `release/1.4.0`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **104 de 104 casos aprobados** con 368
pruebas ejecutadas y 0 fallidas.

**Migración (ruta de actualización):** sobre una base creada con el esquema y el seed de la 1.3.0,
`prisma migrate deploy` de la 1.4.0 aplicó `challenge_budget_automatic`: el reto de mayo (600 =
5 × 120) pasó a automático, un reto con 900 fijado se conservó y uno con 0 pasó a automático.

**Dependencias:** producción sin avisos en backend, frontend y e2e. En las dependencias de
desarrollo apareció el 3 oct un advisory alto de `braces` ≤ 3.0.3 (llega por `micromatch` a Jest,
ESLint y Tailwind) sin versión corregida publicada; no afecta al servidor y queda para un cambio
aparte.

### 2026-10-03 · rama `feature/pot-from-collected` (pote recaudado y presupuesto automático)

Base reiniciada con `npx prisma migrate reset --force` (incluye la migración nueva del
presupuesto). **Batería:** 11 de 11 pasos en verde. **Catálogo:** 104 de 104 casos aprobados con
368 pruebas y 0 fallidas: unitarias del backend 139, unitarias de la web 12, e2e de API 87,
recorridos de UI 44 (más la preparación), capturas de la guía 18 (más la preparación) y sesiones
paralelas 66. Casos nuevos: TC-FIN-06 (presupuesto automático o ajustado) y TC-FIN-07 (los pagos
se cierran con el reto). La migración se probó sobre una base con datos: los presupuestos en 0 o
iguales a cuota × inscritos pasaron a automático y el resto se conservó como manual.

### 2026-10-02 · v1.3.0 (rama `release/1.3.0`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **102 de 102 casos aprobados** con 353
pruebas ejecutadas y 0 fallidas: unitarias del backend 128, unitarias de la web 12, e2e de API
85, recorridos de UI 43 (más la preparación), capturas de la guía 18 (más la preparación) y
sesiones paralelas 65.

**Dependencias:** `npm audit` sin avisos en backend, frontend y e2e.

### 2026-10-02 · rama `feature/web-api-only-actions` (acciones en la web y reto cerrado definitivo)

Base reiniciada con `npx prisma migrate reset --force`. **Batería:** 11 de 11 pasos en verde.
**Catálogo:** 102 de 102 casos aprobados con 353 pruebas y 0 fallidas: unitarias del backend
128, unitarias de la web 12, e2e de API 85, recorridos de UI 43 (más la preparación), capturas
de la guía 18 (más la preparación) y sesiones paralelas 65. Casos nuevos: TC-CHAL-13 (un reto
cerrado es definitivo) y TC-SEC-05 (vigencia de los tokens). Las suites de Playwright y el
script de sesiones se corrieron dos veces seguidas para comprobar que siguen siendo repetibles
ahora que no reabren retos cerrados.

### 2026-10-02 · v1.2.0 (rama `release/1.2.0`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **100 de 100 casos aprobados** con 333
pruebas ejecutadas y 0 fallidas: unitarias del backend 121, unitarias de la web 12, e2e de API
81, recorridos de UI 38 (más la preparación), capturas de la guía 15 (más la preparación) y
sesiones paralelas 64.

### 2026-10-02 · rama `fix/admin-header-overflow` (encabezado en escritorio y móvil)

Base reiniciada con `npx prisma migrate reset --force`. **Batería:** 11 de 11 pasos en verde.
**Catálogo:** 100 de 100 casos aprobados con 333 pruebas y 0 fallidas (recorridos de UI 38 más
la preparación). El caso nuevo TC-UI-10 protege el defecto DEF-06: su prueba falla con el
encabezado anterior (nombre del reto cortado y controles fuera de pantalla en móvil).

### 2026-10-02 · rama `feature/closed-challenge-results` (retos cerrados en el Ranking)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de validar.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **99 de 99 casos aprobados** con 329
pruebas ejecutadas y 0 fallidas: unitarias del backend 121, unitarias de la web 12, e2e de API
81, recorridos de UI 34 (más la preparación), capturas de la guía 15 (más la preparación) y
sesiones paralelas 64. TC-CHAL-12 pasó de limitación conocida a caso automatizado y la
observación OBS-01 quedó resuelta.

### 2026-10-02 · v1.1.0 (rama `release/1.1.0`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de cada corrida.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde.**

**Catálogo** (`node scripts/validate-test-cases.mjs`): **98 de 99 casos aprobados** con 322
pruebas ejecutadas y 0 fallidas: unitarias del backend 121, unitarias de la web 12, e2e de API
81, recorridos de UI 28 (más la preparación), capturas de la guía 14 (más la preparación) y
sesiones paralelas 64. El caso restante es la limitación conocida OBS-01.

### 2026-10-02 · rama `feature/web-light-theme` (modo claro)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de validar.

**Batería** (`node scripts/run-tests.mjs`): **11 de 11 pasos en verde** (el paso nuevo son las
unitarias de la web con `node:test`, 12 de 12). Unitarias del backend 121 de 121, e2e de API 81
de 81, sesiones paralelas 64 de 64 y recorridos de UI 28 de 28.

**Catálogo** (`node scripts/validate-test-cases.mjs`): **98 de 99 casos aprobados** con 322
pruebas ejecutadas y 0 fallidas, sin pruebas fuera del catálogo. El caso restante sigue siendo
la limitación conocida OBS-01. Los cuatro casos nuevos (TC-UI-06 a TC-UI-09) cubren el tema por
defecto, el interruptor, la ausencia de parpadeo y el contraste.

### 2026-10-01 · rama `docs/qa-catalog-and-screenshots` (catálogo de casos y capturas)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `npx prisma migrate reset --force` antes de validar.

**Batería** (`node scripts/run-tests.mjs`): **10 de 10 pasos en verde.**

| Suite | Resultado |
|---|---|
| Lint del backend (ESLint) | OK |
| Pruebas unitarias del backend (Jest) | 121 de 121 |
| Build del backend (`nest build`) | OK |
| Migraciones (`prisma migrate deploy`) | Sin pendientes |
| E2E de API (Jest, supertest, Postgres) | 81 de 81 |
| Tipos del frontend (`tsc --noEmit`) | OK |
| Lint del frontend (`next lint`) | OK, 1 aviso preexistente (`react-hooks/exhaustive-deps` en el ranking) |
| Build del frontend (`next build`) | OK |
| Sesiones paralelas (`parallel-session-test.mjs`) | 64 de 64 verificaciones |
| Recorridos de UI (Playwright) | 22 de 22 (más la preparación de sesiones) |

**Catálogo** (`node scripts/validate-test-cases.mjs`): **94 de 95 casos aprobados** con 303
pruebas ejecutadas y 0 fallidas (incluye las 13 pruebas de la suite de capturas). El caso
restante es la limitación conocida OBS-01. Detalle en
[`qa/validation-report.md`](./qa/validation-report.md).

Defectos encontrados y corregidos en esta rama: acentos en la importación CSV (DEF-01),
cierre de sesión ante un 429 y cupo compartido detrás del proxy (DEF-02), unidad del tope
en el ranking (DEF-03), sugerencia del panel de premiación (DEF-04) y cierre de sesión al
cambiar de página durante la renovación del token (DEF-05).

### 2026-10-01 · v1.0.0 (commit `ac4c6c0`, contenido idéntico en `develop`)

Entorno: Windows 11, Node 22.23.1, Postgres 16 en Docker (puerto 5433), Playwright 1.63 con
Chromium. Base reiniciada con `prisma migrate deploy` y `npm run prisma:seed` antes de correr.

Comando: `node scripts/run-tests.mjs`. Resultado: **10 de 10 pasos en verde, 0 fallidos, 0
sin ejecutar.**

| Suite | Resultado |
|---|---|
| Lint del backend (ESLint) | OK |
| Pruebas unitarias del backend (Jest) | 114 de 114 |
| Build del backend (`nest build`) | OK, salida en `dist/main.js` |
| Migraciones (`prisma migrate deploy`) | Sin pendientes |
| E2E de API (Jest, supertest, Postgres) | 51 de 51 |
| Tipos del frontend (`tsc --noEmit`) | OK |
| Lint del frontend (`next lint`) | OK, 1 aviso preexistente (`react-hooks/exhaustive-deps` en el ranking) |
| Build del frontend (`next build`) | OK, 13 rutas estáticas |
| Sesiones paralelas (`parallel-session-test.mjs`) | 64 de 64 verificaciones |
| Recorridos de UI (Playwright) | 19 de 19 |

Sin cobertura automatizada en esta corrida, por requerir credenciales reales: la subida a
Cloudinary y la lectura de una hoja real de Google Sheets.

### 2026-09-08 · rama `release/1.0.0` (antes del merge a `main`)

Mismo comando y mismo resultado: 10 de 10 pasos en verde. Los tres trabajos de CI del PR #17
también pasaron.

