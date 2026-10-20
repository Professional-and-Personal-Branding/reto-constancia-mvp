## Modelos por tipo de trabajo

- Diseño, specs, ADRs, decisiones y preguntas al owner → agente `arquitecto` (Claude Opus 5.5,
  `claude-opus-5-5`).
- Implementación, tests, archivado y cierre de PRs → agente `implementador` (Claude Sonnet 5.5,
  `claude-sonnet-5-5`).
- La sesión principal orquesta: reparte el trabajo, revisa diffs, resuelve conflictos e integra.
- Si una tarea mezcla ambos, primero `arquitecto` (spec y decisiones) y después `implementador`.
- Para cambiar de versión de modelo en el futuro, se actualiza el `model:` de ambos agentes y esta
  sección en el mismo PR.

## Evitar trabajo redundante y gasto de tokens

Cada petición vuelve a enviar toda la conversación: el costo crece con el número de turnos y con lo
que se repite.

- **No repetir lo ya establecido.** Una decisión del owner, el resultado de un comando o el contenido
  de un archivo ya leído no se vuelve a derivar, leer ni preguntar. Una decisión tomada no se reabre.
- **Una verificación que pasó no se repite** hasta que cambie el código. Durante la iteración se corre
  solo lo afectado (la prueba o el archivo tocado); la batería completa (`node scripts/run-tests.mjs`) y
  el validador del catálogo, una sola vez antes de abrir el PR.
- **Lecturas dirigidas:** grep/glob y rangos de líneas en vez de archivos enteros; no releer un archivo
  recién editado (la herramienta ya falla si el cambio no se aplicó); las búsquedas amplias en muchos
  archivos van a un agente `Explore`, que devuelve la conclusión y no los archivos.
- **Agrupar:** las llamadas independientes (lecturas, búsquedas, ediciones a archivos distintos) van en
  el mismo turno. Los comandos largos se lanzan una vez en segundo plano y se espera su aviso, sin
  sondear con `sleep`.
- **Salida acotada:** `| tail`, `--quiet` o `rtk`; nunca volcar logs completos al contexto.
- **Reutilizar agentes:** continuar uno ya lanzado con `SendMessage` en vez de crear otro con el mismo
  contexto repetido; no delegar lo que se resuelve con una lectura o una búsqueda directa.
- **Sin pasadas no pedidas:** nada de documentación extra, formateo de archivos antiguos, refactors ni
  changelogs que la tarea no pidió.
- **Recomendar, no listar:** ante varias salidas se da una recomendación con su porqué, no un
  inventario de opciones que no se van a seguir.
- Las herramientas de compresión (`rtk`, `headroom`) están en `docs/token-optimization.md`.

## Flujo de trabajo (OpenSpec + Gitflow)

Plataforma "Reto de Constancia": NestJS 11 + Prisma 5/Postgres (`backend/`), Next.js 15
(`frontend/`), Playwright (`e2e/`). Los artefactos de OpenSpec van en inglés; los mensajes de la API
visibles al usuario, la documentación y la guía, en español.

- **Spec primero.** Ningún código de una funcionalidad antes de que el owner apruebe la propuesta:
  `openspec/changes/<nombre>/` (proposal, design, specs, tasks) → `openspec validate --all --strict` →
  el owner aprueba → implementación → archivo. El estado vigente está en `openspec/specs/`; las
  decisiones pasadas, en `openspec/changes/archive/`.
- **Ramas** (ver `docs/gitflow.md`): `feature/*`, `fix/*` y `chore/*` salen de `develop` y vuelven a
  `develop` por PR; las releases son `release/X.Y.Z` → PR a `main`. Nunca commits directos a
  `main` ni a `develop`; sin `rebase` ni `push --force` (los conflictos se resuelven fusionando la
  rama base). Un PR = un cambio pequeño y revisable.
- **Commits** en inglés, Conventional Commits (`feat(scope):`, `fix:`, `test:`, `docs:`, `chore:`,
  `ci:`), terminados con la línea `Co-Authored-By` de la sesión. Descripciones de PR en español,
  terminadas con la línea "Generated with Claude Code".
- **El owner fusiona todos los PR.** Nadie fusiona ni activa el auto-merge por su cuenta. Antes de
  pedir la fusión, los 3 jobs de CI deben estar en verde: Backend, Frontend y E2E de UI. Si una
  corrida se cancela sin runner asignado, se reejecuta con `gh run rerun <id> --failed`.
- **Release** (cada una, en este orden):
  1. Rama `release/X.Y.Z` desde `develop`; se archivan los cambios fusionados con
     `openspec archive <cambio> -y` (y se reescribe el Purpose genérico "TBD" de un spec nuevo).
  2. Versión nueva: `npm version X.Y.Z --no-git-tag-version` en `backend/`, `frontend/` y `e2e/`,
     `.setVersion('X.Y.Z')` en `backend/src/main.ts`, etiqueta de la guía y versión de referencia del
     runbook, y la sección `## [X.Y.Z]` del CHANGELOG (sin migraciones: cómo volver a la anterior).
  3. `npm audit --omit=dev` en los tres paquetes: debe dar 0 avisos.
  4. Verificación (ver abajo) y registro en `docs/testing.md` §6.
  5. Fusionar `origin/main` en la rama (para que GitHub no la marque desactualizada) y abrir el PR a
     `main`. Tras la fusión: tag anotado `vX.Y.Z` sobre el commit de merge de `main`, PR de
     back-merge de la **misma** rama de release a `develop`, y republicar la guía y el runbook
     (`node scripts/build-guide-artifact.mjs` y `node scripts/build-runbook-artifact.mjs --ref origin/main`).

## Verificación y entorno de pruebas

- **Batería completa:** `node scripts/run-tests.mjs` debe dar **13/13** (escaneo de secretos, formato
  de archivos nuevos, lint, unitarias, build, migraciones, e2e de API, tipos, pruebas de la web, lint y
  build de la web, sesiones paralelas y recorridos de Playwright). Después, `node
  scripts/validate-test-cases.mjs` (catálogo de QA: debe terminar con "Pruebas sin caso: 0") y
  `openspec validate --all --strict`. **Reinicia la base entre la batería y el validador.**
- **Base de datos:** Postgres 16 (`docker compose up -d postgres`; en local escucha en el puerto 5433,
  base `reto_constancia`; en la CI es un servicio en el 5432). Reinicio de datos:
  `cd backend && out=$(npx prisma migrate reset --force 2>&1)` y solo contra una base local. Los
  scripts que borran datos de prueba (`scripts/lib/test-db.mjs`) se niegan a operar contra una base
  que no sea local. `backend/.env` no se versiona: parte de `backend/.env.example`.
- **Puertos:** API de pruebas en 3002, frontend en 3005. Playwright sirve los **builds ya compilados**:
  la batería recompila, pero si corres Playwright a mano, compila API y web antes. No compiles el
  frontend mientras corre `next dev`.
- **Login limitado a 5 intentos por minuto por IP:** no repitas scripts de login seguidos (429).
- **Local con `rtk`:** el tipado va con `rtk proxy npx tsc --noEmit -p .` (sin `rtk proxy` da un TS2882
  falso) y los comandos no se redirigen a `/dev/null`. En otros entornos basta `npx tsc --noEmit -p .`.
- **Formato:** `node scripts/format.mjs` exige Prettier solo a los archivos **nuevos**; el código
  existente nunca se formateó y no se reformatea. Los archivos mezclan CRLF y LF: al parchar, normaliza
  los saltos de línea antes de comparar.
- **Secretos:** `node scripts/scan-secrets.mjs` (`--staged` antes de commitear). Solo se versiona
  `.env.example`.
- **Heredocs largos con comillas mezcladas** rompen el shell: escribe los scripts de parche con la
  herramienta de escritura de archivos y ejecútalos desde un directorio temporal.

## Cloud y entornos limpios

- La rama por defecto es `main` (la última release); el trabajo nuevo parte de `develop`.
- El análisis de funcionalidades que originó el roadmap está en
  `docs/propuestas-features-2026-10-04.md`. Pendientes del roadmap: reenviar una
  actividad rechazada y renovación mensual del reto; cada uno necesita su propuesta y la aprobación del
  owner antes de escribir código.
- Producción (Seenode + Cloudinary) depende de las cuentas del owner; los pasos están en
  `docs/runbook-despliegue.md`. Nunca se usan credenciales reales en pruebas ni en el repositorio.
